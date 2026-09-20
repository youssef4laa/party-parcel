import 'dotenv/config';
import { mkdir, writeFile, readFile, cp, rm } from 'fs/promises';
import path from 'path';
import { createInterface } from 'readline/promises';
import { execSync } from 'child_process';
import { prisma } from '../src/server/db';
import { resolveRoomByToken } from '../src/server/rooms';
import { getStorageProvider } from '../src/server/storage';
import { generateSalt, deriveKey, encryptBuffer, encryptJson } from './lib/nodeCrypto';
import { checkPasswordStrength } from './lib/passwordStrength';
import { PBKDF2_ITERATIONS } from '../src/export/cryptoFormat';
import type { StaticManifest, StaticGoodie, StaticBoxSecret } from '../src/export/manifest';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    admin: get('--admin'),
    password: get('--password'),
    out: get('--out'),
  };
}

async function promptHidden(question: string): Promise<string> {
  // Minimal masking: readline doesn't support it natively without a TTY hack, and this is a
  // one-off local CLI tool run by the host on their own machine — not worth a dependency.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs();
  const admin = args.admin ?? (await promptHidden('Admin link token: '));
  const password =
    args.password ?? (await promptHidden('Password to lock this export (the celebrant will need it): '));

  if (!admin || !password) {
    console.error('Usage: npm run export:gift -- --admin <adminToken> --password <password> [--out <dir>]');
    process.exit(1);
  }
  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    console.error(strength.reason);
    process.exit(1);
  }

  const resolved = await resolveRoomByToken(admin);
  if (!resolved || resolved.role !== 'admin') {
    console.error("That doesn't look like a valid admin link.");
    process.exit(1);
  }
  const { room } = resolved;

  const outDir = path.resolve(args.out ?? `./export/${room.id}`);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  console.log(`Exporting "${room.title}" to ${outDir} ...`);

  const salt = generateSalt();
  const key = deriveKey(password, salt);
  const storage = getStorageProvider();

  const boxes = await prisma.box.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: 'asc' },
    include: { goodies: { orderBy: { sortOrder: 'asc' }, include: { redemption: true } }, assets: true },
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
          console.warn(`  ! missing asset ${assetKey} for goodie ${g.id} — skipping it`);
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

    const goodiesFile = `boxes/${box.id}/goodies.enc`;
    await writeFile(path.join(outDir, goodiesFile), encryptJson(key, secret));

    boxMetas.push({
      id: box.id,
      design: { ...design, tagText: '' },
      x: box.posX,
      y: box.posY,
      placedAt: box.createdAt.toISOString(),
      goodiesFile,
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
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Build the standalone static site (no Next.js runtime, no API routes) and merge it in.
  console.log('Building the static site bundle...');
  const siteRoot = path.resolve(__dirname, '..', 'export-site');
  execSync('npx vite build', { cwd: siteRoot, stdio: 'inherit' });
  await cp(path.join(siteRoot, 'dist'), outDir, { recursive: true });

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

  console.log(`\nDone! ${boxes.length} box(es) exported to:\n  ${outDir}\n`);
  console.log('Try it locally with, e.g.:');
  console.log(`  npx serve "${outDir}"`);
  console.log('\nRemember the password — it is the only way to unlock any box in this export.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
