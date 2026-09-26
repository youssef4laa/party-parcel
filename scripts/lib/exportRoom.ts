import { mkdir, writeFile, readFile, cp, rm, access } from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../../src/server/db';
import { resolveRoomByToken } from '../../src/server/rooms';
import { getStorageProvider } from '../../src/server/storage';
import { generateSalt, deriveKey, encryptBuffer, encryptJson } from './nodeCrypto';
import { checkPasswordStrength } from './passwordStrength';
import { PBKDF2_ITERATIONS } from '../../src/export/cryptoFormat';
import { resolveRoomObjects } from '../../src/server/roomObjects';
import type {
  StaticManifest, StaticGoodie, StaticBoxSecret, StaticGift, StaticRoomObject, StaticCustomItem,
} from '../../src/export/manifest';

const run = promisify(execFile);

/** A problem the caller should show the user as-is (bad admin link, weak password, ...). */
export class ExportError extends Error {}

export type ExportOptions = {
  /** The room's admin link token. */
  admin: string;
  /** Locks the export; checked against the minimum-strength rules. */
  password: string;
  /** Folder to write the finished site into (it is wiped first). Defaults to ./export/<room id>. */
  outDir?: string;
  /** 'always' rebuilds the static site bundle first (the CLI, and dev, so it can never be stale);
   * 'if-missing' reuses an existing build (production, where it is built once at deploy time). */
  siteBuild?: 'always' | 'if-missing';
  /** Where progress lines go (the CLI prints them; the API route stays quiet). */
  log?: (line: string) => void;
  /** Let vite's own output through to the terminal (CLI only). */
  inheritBuildOutput?: boolean;
};

export type ExportSummary = { roomTitle: string; boxes: number; objects: number; customImages: number; outDir: string };

/** The repo root. `process.cwd()` rather than `__dirname` on purpose: this also runs inside the
 * Next.js server (the host-panel download), where `__dirname` points into a build folder — the same
 * reason the local storage provider anchors on cwd. */
const repoRoot = () => process.cwd();

let siteBuildQueue: Promise<unknown> = Promise.resolve();

/** Builds (or reuses) the standalone static site and returns its folder. Builds are serialized:
 * two exports at once must not both write `export-site/dist`. */
export async function ensureExportSite(mode: 'always' | 'if-missing', opts: { inherit?: boolean } = {}): Promise<string> {
  const siteRoot = path.join(repoRoot(), 'export-site');
  const dist = path.join(siteRoot, 'dist');
  const build = siteBuildQueue.then(async () => {
    const exists = await access(path.join(dist, 'index.html')).then(() => true, () => false);
    if (mode === 'if-missing' && exists) return;
    await run('npx', ['vite', 'build'], { cwd: siteRoot, maxBuffer: 64 * 1024 * 1024 }).then(
      (out) => {
        if (opts.inherit) process.stdout.write(out.stdout);
      },
      (err) => {
        throw new ExportError(`Could not build the static site (${(err as Error).message.split('\n')[0]}). Run "npm run build:export-site" and try again.`);
      },
    );
  });
  siteBuildQueue = build.catch(() => undefined);
  await build;
  return dist;
}

export async function exportRoom(opts: ExportOptions): Promise<ExportSummary> {
  const { admin, password } = opts;
  const log = opts.log ?? (() => {});

  const strength = checkPasswordStrength(password);
  if (!strength.ok) throw new ExportError(strength.reason);

  const resolved = await resolveRoomByToken(admin);
  if (!resolved || resolved.role !== 'admin') throw new ExportError("That doesn't look like a valid admin link.");
  const { room } = resolved;
  // The API route always passes an explicit temp folder; the ./export/<id> default is CLI-only, so it
  // must not make the bundler trace the whole project into the server build.
  const outDir = path.resolve(/*turbopackIgnore: true*/ opts.outDir ?? `./export/${room.id}`);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  log(`Exporting "${room.title}" to ${outDir} ...`);

  const salt = generateSalt();
  const key = deriveKey(password, salt);
  const storage = getStorageProvider();

  const boxes = await prisma.box.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: 'asc' },
    include: {
      goodies: { orderBy: { sortOrder: 'asc' }, include: { redemption: true } },
      gifts: { orderBy: { sortOrder: 'asc' } },
      assets: true,
    },
  });

  const boxMetas: StaticManifest['boxes'] = [];

  for (const box of boxes) {
    const boxDir = path.join(outDir, 'boxes', box.id);
    const assetsDir = path.join(boxDir, 'assets');
    await mkdir(assetsDir, { recursive: true });

    const staticGoodies: StaticGoodie[] = [];
    for (const g of box.goodies) {
      const payload = JSON.parse(g.payloadJson) as Record<string, unknown>;
      const keys = [
        ...(Array.isArray(payload.assetKeys) ? (payload.assetKeys as string[]) : []),
        ...(typeof payload.assetKey === 'string' ? [payload.assetKey as string] : []),
      ];

      const assetFiles: StaticGoodie['assetFiles'] = [];
      for (const assetKey of keys) {
        const bytes = await storage.get(assetKey);
        if (!bytes) {
          log(`  ! missing asset ${assetKey} for goodie ${g.id} — skipping it`);
          continue;
        }
        // mime isn't stored on Asset in every code path (uploads write it into Goodie.payloadJson
        // indirectly via the finalize route's response, not persisted separately) — sniff isn't
        // available here without re-reading storage/mimeSniff, so infer from the Asset table
        // when present, falling back to a generic type the browser can still play/display.
        const assetRow = box.assets.find((a) => a.storageKey === assetKey);
        const mime = assetRow?.mime ?? 'application/octet-stream';
        const fileName = `${assetKey}.enc`;
        await writeFile(path.join(assetsDir, fileName), encryptBuffer(key, bytes));
        assetFiles.push({ path: `boxes/${box.id}/assets/${fileName}`, mime });
      }

      staticGoodies.push({
        id: g.id,
        type: g.type,
        sortOrder: g.sortOrder,
        ...payload,
        assetFiles,
        redeemedAt: g.redemption?.redeemedAt.toISOString() ?? null,
      });
    }

    const design = JSON.parse(box.designJson) as StaticManifest['boxes'][number]['design'];
    const tagText = design.tagText ?? '';
    // fromName and tagText are sender-authored text, not cosmetic design — they go in the
    // encrypted blob with the goodies, not the plaintext manifest (see manifest.ts).
    const secret: StaticBoxSecret = { fromName: box.fromName, tagText, goodies: staticGoodies };
    // A box with several gifts keeps its structure (labels, wrap designs, order, which goodies are
    // in which gift, "open in order") INSIDE this encrypted blob. A single-gift box — every box that
    // predates gifts — exports exactly as it always did, with no `gifts` key at all.
    if (box.gifts.length > 1) {
      const gifts: StaticGift[] = box.gifts.map((gift) => {
        let giftDesign: StaticGift['design'] = {};
        try {
          giftDesign = JSON.parse(gift.designJson);
        } catch {
          // a malformed stored design just means the default wrap
        }
        return {
          id: gift.id,
          label: gift.label,
          design: giftDesign,
          sortOrder: gift.sortOrder,
          goodieIds: box.goodies.filter((g) => g.giftId === gift.id).map((g) => g.id),
        };
      });
      secret.gifts = gifts;
      secret.openInOrder = box.openInOrder;
    }

    const goodiesFile = `boxes/${box.id}/goodies.enc`;
    await writeFile(path.join(outDir, goodiesFile), encryptJson(key, secret));

    boxMetas.push({
      id: box.id,
      design: { ...design, tagText: '' },
      x: box.posX,
      y: box.posY,
      placedAt: box.createdAt.toISOString(),
      goodiesFile,
      scale: box.scale,
      z: box.z,
    });
  }

  // --- The decoration layout + the custom images it uses (plaintext by design) ---
  // resolveRoomObjects lazily seeds the default layout, so exporting a room nobody has opened in
  // the browser yet still bakes a real scene rather than an empty one.
  const allObjects = await resolveRoomObjects(room.id, room.age);
  const customDir = path.join(outDir, 'custom');
  const customItems: StaticCustomItem[] = [];
  const objects: StaticRoomObject[] = [];
  for (const o of allObjects) {
    if (o.hidden) continue; // hidden objects aren't part of what the room looks like
    if (o.kind === 'custom') {
      const item = o.assetId ? await prisma.customItem.findUnique({ where: { id: o.assetId } }) : null;
      const bytes = item ? await storage.get(item.storageKey) : null;
      if (!item || !bytes) {
        log(`  ! custom object ${o.id} has no image — skipping it`);
        continue;
      }
      if (!customItems.some((c) => c.id === item.id)) {
        await mkdir(customDir, { recursive: true });
        const ext = item.mime === 'image/webp' ? 'webp' : 'png';
        await writeFile(path.join(customDir, `${item.id}.${ext}`), bytes);
        customItems.push({ id: item.id, file: `custom/${item.id}.${ext}`, mime: item.mime, width: item.width, height: item.height });
      }
    }
    objects.push({
      id: o.id, kind: o.kind, x: o.x, y: o.y, z: o.z, scale: o.scale, flipX: o.flipX, rotation: o.rotation,
      zone: o.zone, configJson: o.configJson, assetId: o.kind === 'custom' ? o.assetId : null,
    });
  }

  const manifest: StaticManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    kdf: { salt: salt.toString('base64'), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    room: {
      title: room.title,
      celebrantName: room.celebrantName,
      age: room.age,
      bannerText: room.bannerText,
      eventAt: room.eventAt.toISOString(),
      timezone: room.timezone,
      occasion: room.occasion,
    },
    boxes: boxMetas,
    objects,
    customItems,
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Build the standalone static site (no Next.js runtime, no API routes) and merge it in.
  log('Building the static site bundle...');
  const dist = await ensureExportSite(opts.siteBuild ?? 'always', { inherit: opts.inheritBuildOutput });
  await cp(dist, outDir, { recursive: true });

  await writeFile(path.join(outDir, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  // Tells GitHub Pages (and anything else that honors the convention) to serve files/folders
  // starting with an underscore as-is, rather than silently dropping them via Jekyll processing.
  // Harmless on hosts that don't look for it (Cloudflare Pages, S3, a plain file server, ...).
  await writeFile(path.join(outDir, '.nojekyll'), '');

  const indexPath = path.join(outDir, 'index.html');
  let html = await readFile(indexPath, 'utf-8');
  if (!html.includes('name="robots"')) {
    html = html.replace('<head>', '<head>\n    <meta name="robots" content="noindex, nofollow" />');
    await writeFile(indexPath, html);
  }

  return { roomTitle: room.title, boxes: boxes.length, objects: objects.length, customImages: customItems.length, outDir };
}
