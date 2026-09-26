import { spawn, execSync, execFileSync, type ChildProcess } from 'child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { deriveKey, decryptJson } from '../scripts/lib/nodeCrypto';
import type { StaticManifest, StaticBoxSecret } from '../src/export/manifest';
import { decodePng, makePng, marginedSquare } from './customItemFixtures';

/**
 * Room Editor Phase 5 (docs/ROOM_EDITOR.md): "export end to end". Builds two REAL exports with the
 * real CLI — an edited room and an untouched baseline — and checks, in order:
 *   1. the files (what got baked, what must not be there, what is encrypted),
 *   2. the rendered site (the edits are really on screen, there is no edit mode, the cake still
 *      blows out, custom images load from relative paths, nothing off-origin is requested),
 *   3. the password wall and the multi-gift flow (including "Open in order") inside the export.
 * Nothing is mocked; the only shortcut is serving the parent folder with `serve` (the same way
 * export-subpath.spec.ts does) so the export is opened from a subpath.
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(REPO_ROOT, 'prisma', 'dev.db');
const PASSWORD = 'e2e-export-verification-strong-pw-2026';
const ROOM_HEIGHT = 760;

const GIFT_LABELS = ['SECRET-GIFT-LABEL-ALPHA', 'SECRET-GIFT-LABEL-BETA', 'SECRET-GIFT-LABEL-GAMMA'];
const GIFT_TAG = 'GIFT-TAG-LEAK-CHECK';
const GOODIE_TEXTS = ['SECRET-GOODIE-ALPHA', 'SECRET-GOODIE-BETA', 'SECRET-GOODIE-GAMMA'];
const SENDER = 'Export Multi Mia';
const SINGLE_NOTE = 'SECRET-SINGLE-GIFT-NOTE';
const SESSION = 'export-owner-session-SECRET-xyz';

const BOX_DESIGN = {
  shape: 'cube', pattern: 'hearts', baseColor: '#f4a6c1', accentColor: '#ff3d8b', ribbon: 'cross',
  ribbonColor: '#fff6d5', bow: 'big', tag: 'heart', tagText: 'OUTER-TAG-TEXT', sticker: 'none', topper: 'none',
};

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(full)));
    else out.push(full);
  }
  return out;
}
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const a = srv.address();
      if (a && typeof a === 'object') srv.close(() => resolve(a.port));
      else reject(new Error('no port'));
    });
  });
async function waitFor(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} did not come up`);
}
const sqlite = (sql: string) => {
  const out = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf-8' }).trim();
  return (out ? JSON.parse(out) : []) as Array<Record<string, string | number | null>>;
};

let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.33.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

type Api = import('@playwright/test').APIRequestContext;
async function objectsOf(request: Api, admin: string) {
  return (await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects as Array<{
    id: string; kind: string; x: number; y: number; scale: number; flipX: boolean; assetId: string | null; hidden: boolean;
  }>;
}
async function patchObject(request: Api, admin: string, id: string, data: Record<string, unknown>) {
  const res = await request.patch(`/api/rooms/${admin}/objects/${id}`, { data, headers: ip() });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test.describe.serial('static export, end to end', () => {
  let parentDir: string;
  let editedDir: string;
  let baselineDir: string;
  let server: ChildProcess | null = null;
  let baseUrl = '';
  let manifest: StaticManifest;
  let usedPng: Buffer;
  let ids: { used: string; unused: string; sofa: string; cake: string; windowId: string };
  let secrets: string[]; // every DB-side secret value that must not appear in the export
  let room: { admin: string; contribute: string; celebrate: string };

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    parentDir = await mkdtemp(path.join(os.tmpdir(), 'export-e2e-'));

    // ---------- the edited room ----------
    const seeded = await seedRoom(request, { celebrantName: 'ExportE2E', age: 9, eventAt: new Date(Date.now() - 60_000).toISOString() });
    room = { admin: tokenFromLink(seeded.links.admin), contribute: tokenFromLink(seeded.links.contribute), celebrate: tokenFromLink(seeded.links.celebrate) };
    const { admin, contribute } = room;
    const layout = await objectsOf(request, admin);
    const byKind = (kind: string) => layout.find((o) => o.kind === kind)!;

    // decorations: hide the window (must NOT be exported) and the wandering cat (in BOTH rooms, so
    // its random walk can't make screenshots flaky); restyle the cake
    await patchObject(request, admin, byKind('window').id, { hidden: true });
    await patchObject(request, admin, byKind('cat').id, { hidden: true });
    const cake = byKind('cake');
    await patchObject(request, admin, cake.id, {
      configJson: JSON.stringify({
        style: 'pixel-heart-cake', frostingColor: '#ff3d8b', spongeColor: '#5e3620', topper: 'sprinkles',
        text: 'HBD ALEX', candleMode: 'count', candleCount: 9,
      }),
    });
    // a catalog item, moved/scaled/flipped
    const sofaRes = await request.post(`/api/rooms/${admin}/objects`, {
      data: { kind: 'sofa', x: 880, y: 650, zone: 'floor', scale: 2, flipX: true }, headers: ip(),
    });
    expect(sofaRes.ok(), await sofaRes.text()).toBeTruthy();
    const sofa = (await sofaRes.json()).object as { id: string };

    // a contributor-owned object (so a real session hash exists in the DB), and non-default permissions
    await request.put(`/api/rooms/${admin}/permissions`, {
      data: { contributors: { canDecorate: 'any', canImport: true, canDraw: true, canMoveOwnPresents: true, maxItemsPerContributor: 7 }, celebrant: { canRearrange: false }, freezeLayout: false },
    });
    const owned = await request.post(`/api/rooms/${contribute}/objects`, {
      data: { kind: 'potted-plant', x: 300, y: 650, zone: 'floor' }, headers: { 'X-Contributor-Session': SESSION, ...ip() },
    });
    expect(owned.ok(), await owned.text()).toBeTruthy();

    // custom images: one PLACED (twice), one left unused in the library
    usedPng = await marginedSquare(12, 3);
    const upload = async (png: Buffer, name: string) => {
      const res = await request.post(`/api/rooms/${admin}/custom-items?source=import&name=${name}`, { data: png, headers: { 'Content-Type': 'image/png', ...ip() } });
      expect(res.ok(), await res.text()).toBeTruthy();
      return (await res.json()).item as { id: string };
    };
    const used = await upload(usedPng, 'used-sticker');
    const unused = await upload(await makePng(7, 7, () => [1, 2, 3, 255]), 'unused-PRIVATE-name');
    for (const x of [700, 780]) {
      const placed = await request.post(`/api/rooms/${admin}/objects`, {
        data: { kind: 'custom', assetId: used.id, x, y: 640, zone: 'anywhere', scale: 3 }, headers: ip(),
      });
      expect(placed.ok(), await placed.text()).toBeTruthy();
    }

    // presents: a 3-gift ordered box (resized, large, raised) and a plain single-gift box
    const goodiesFor = (i: number) => [{ type: 'note', text: GOODIE_TEXTS[i], sizeBytes: 20 }];
    const multi = await request.post(`/api/rooms/${contribute}/boxes`, {
      headers: { 'X-Contributor-Session': SESSION, ...ip() },
      data: {
        fromName: SENDER, design: { ...BOX_DESIGN, size: 'L' }, x: 400, y: 650, openInOrder: true,
        gifts: GIFT_LABELS.map((label, i) => ({ label, design: { ...BOX_DESIGN, shape: i === 1 ? 'tall' : 'cube', tagText: GIFT_TAG }, goodies: goodiesFor(i) })),
      },
    });
    expect(multi.ok(), await multi.text()).toBeTruthy();
    const multiId = (await multi.json()).id as string;
    const patched = await request.patch(`/api/rooms/${admin}/boxes/${multiId}`, { data: { scale: 1.5, z: 2 }, headers: ip() });
    expect(patched.ok(), await patched.text()).toBeTruthy();
    const single = await request.post(`/api/rooms/${contribute}/boxes`, {
      headers: ip(),
      data: { fromName: 'Single Sam', design: BOX_DESIGN, x: 1000, y: 650, goodies: [{ type: 'note', text: SINGLE_NOTE, sizeBytes: 20 }] },
    });
    expect(single.ok(), await single.text()).toBeTruthy();

    ids = { used: used.id, unused: unused.id, sofa: sofa.id, cake: cake.id, windowId: byKind('window').id };

    // everything the DB knows that an export must never reveal
    const dbRoom = sqlite(`SELECT adminTokenHash, contributeTokenHash, celebrateTokenHash, permissionsJson FROM "Room" WHERE id = '${seeded.roomId}';`)[0];
    const boxHashes = sqlite(`SELECT deleteTokenHash, createdBySessionHash FROM "Box" WHERE roomId = '${seeded.roomId}';`);
    const objHashes = sqlite(`SELECT createdBySessionHash FROM "RoomObject" WHERE roomId = '${seeded.roomId}' AND createdBySessionHash IS NOT NULL;`);
    secrets = [
      String(dbRoom.adminTokenHash), String(dbRoom.contributeTokenHash), String(dbRoom.celebrateTokenHash),
      ...boxHashes.flatMap((b) => [b.deleteTokenHash, b.createdBySessionHash]).filter(Boolean).map(String),
      ...objHashes.map((o) => String(o.createdBySessionHash)),
      admin, contribute, room.celebrate, SESSION,
    ];
    expect(secrets.every((s) => s.length >= 16)).toBe(true); // real values, not empty strings that match everything

    // ---------- the baseline room: same age/name, cat hidden, nothing else touched ----------
    const base = await seedRoom(request, { celebrantName: 'ExportE2E', age: 9, eventAt: new Date(Date.now() - 60_000).toISOString() });
    const baseAdmin = tokenFromLink(base.links.admin);
    await patchObject(request, baseAdmin, (await objectsOf(request, baseAdmin)).find((o) => o.kind === 'cat')!.id, { hidden: true });

    // ---------- export both with the real CLI ----------
    editedDir = path.join(parentDir, 'edited');
    baselineDir = path.join(parentDir, 'baseline');
    for (const [token, dir] of [[admin, editedDir], [baseAdmin, baselineDir]] as const) {
      execSync(`npx tsx scripts/export-gift.ts --admin ${token} --password "${PASSWORD}" --out "${dir}"`, { cwd: REPO_ROOT, stdio: 'pipe' });
    }
    manifest = JSON.parse(await readFile(path.join(editedDir, 'manifest.json'), 'utf-8'));

    const port = await freePort();
    server = spawn('npx', ['--yes', 'serve', '-l', String(port), parentDir], { stdio: 'pipe' });
    baseUrl = `http://localhost:${port}`;
    await waitFor(`${baseUrl}/edited/`);
  });

  test.afterAll(async () => {
    server?.kill();
    if (parentDir) await rm(parentDir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------ 1. files

  test('the manifest bakes the layout: positions, scale, flip, cake config; hidden objects are left out', async () => {
    const objects = manifest.objects!;
    expect(objects.length).toBeGreaterThan(30);
    expect(objects.find((o) => o.id === ids.windowId), 'a hidden object must not be exported').toBeUndefined();
    expect(objects.some((o) => o.kind === 'cat')).toBe(false);

    const sofa = objects.find((o) => o.id === ids.sofa)!;
    expect(sofa).toMatchObject({ kind: 'sofa', x: 880, y: 650, scale: 2, flipX: true, zone: 'floor' });
    const cake = objects.find((o) => o.id === ids.cake)!;
    expect(JSON.parse(cake.configJson)).toMatchObject({ style: 'pixel-heart-cake', text: 'HBD ALEX', topper: 'sprinkles', candleCount: 9 });

    // an explicit allow-list of fields — never the raw DB row
    const allowed = ['assetId', 'configJson', 'flipX', 'id', 'kind', 'rotation', 'scale', 'x', 'y', 'z', 'zone'];
    for (const o of objects) expect(Object.keys(o).sort(), `object ${o.id}`).toEqual(allowed);
    expect(JSON.stringify(manifest)).not.toMatch(/createdBy|SessionHash|TokenHash|permissions/i);
  });

  test('custom images ship as plaintext files — only the ones actually placed — and match the originals', async () => {
    expect(manifest.customItems).toHaveLength(1);
    const item = manifest.customItems![0];
    expect(item.id).toBe(ids.used);
    expect(item.file).toBe(`custom/${ids.used}.png`);
    expect(item.file.startsWith('/')).toBe(false); // relative, so it works from a subpath
    expect(item).toMatchObject({ mime: 'image/png', width: 18, height: 18 });

    const shipped = await readFile(path.join(editedDir, item.file));
    const a = await decodePng(shipped);
    const b = await decodePng(usedPng);
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    expect(a.data.equals(b.data)).toBe(true); // the same pixels, byte for byte after decoding

    // two objects reference it; the unused library item and its name never left the database
    expect(manifest.objects!.filter((o) => o.assetId === ids.used)).toHaveLength(2);
    const customFiles = await readdir(path.join(editedDir, 'custom'));
    expect(customFiles).toEqual([`${ids.used}.png`]);
    for (const file of await listFilesRecursive(editedDir)) {
      if ((await stat(file)).size > 5 * 1024 * 1024) continue;
      const text = await readFile(file, 'latin1');
      expect(text, path.relative(editedDir, file)).not.toContain(ids.unused);
      expect(text, path.relative(editedDir, file)).not.toContain('unused-PRIVATE-name');
    }
  });

  test('present placement is baked: scale, layer and the design size', async () => {
    const multi = manifest.boxes.find((b) => b.design.size === 'L')!;
    expect(multi).toMatchObject({ x: 400, y: 650, scale: 1.5, z: 2 });
    const singleMeta = manifest.boxes.find((b) => b.design.size === undefined)!;
    expect(singleMeta).toMatchObject({ x: 1000, scale: 1, z: 0 });
  });

  test('LEAK GREP: no secret, gift label, gift wrap text, token, hash or session value appears in any exported file', async () => {
    const files = await listFilesRecursive(editedDir);
    const needles = [
      ...GIFT_LABELS, ...GOODIE_TEXTS, GIFT_TAG, SINGLE_NOTE, SENDER, 'Single Sam', 'OUTER-TAG-TEXT',
      ...secrets,
    ];
    console.log(`\n--- leak grep over ${files.length} exported files, ${needles.length} needles ---`);
    for (const needle of needles) {
      let hit: string | null = null;
      for (const file of files) {
        if ((await stat(file)).size > 5 * 1024 * 1024) continue;
        if ((await readFile(file, 'latin1')).includes(needle)) {
          hit = path.relative(editedDir, file);
          break;
        }
      }
      console.log(hit ? `  LEAK: "${needle.slice(0, 26)}…" in ${hit}` : `  OK:   "${needle.slice(0, 26)}…"`);
      expect(hit, `"${needle}" leaked into ${hit}`).toBeNull();
    }
    console.log('--- end leak grep ---');

    // Positive control: prove the scan can actually FIND a string when one is there. Decoration text
    // (a cake's writing) and the celebrant's name are plaintext by design, so they must be found —
    // otherwise "nothing leaked" above could just mean "the scan reads nothing".
    for (const control of ['HBD ALEX', 'ExportE2E']) {
      let found = false;
      for (const file of files) if ((await readFile(file, 'latin1')).includes(control)) found = true;
      expect(found, `control "${control}" should be findable in the export`).toBe(true);
    }

    // the data files (everything except the JS/CSS bundle, where these words appear as source code)
    // must not even contain the KEY names of the secrets
    for (const file of files) {
      const rel = path.relative(editedDir, file);
      if (/\.(js|css|woff2?|png|enc)$/.test(rel) || rel.endsWith('.map')) continue;
      const text = await readFile(file, 'latin1');
      expect(text, rel).not.toMatch(/permissions_?json|permissionsJson|createdBySessionHash|deleteTokenHash|TokenHash/i);
    }
  });

  test('the gift structure is inside the encrypted blob and round-trips; the wrong password does not decrypt it', async () => {
    const meta = manifest.boxes.find((b) => b.design.size === 'L')!;
    const blob = await readFile(path.join(editedDir, meta.goodiesFile));
    const key = deriveKey(PASSWORD, Buffer.from(manifest.kdf.salt, 'base64'));
    const secret = decryptJson<StaticBoxSecret>(key, blob);
    expect(secret.fromName).toBe(SENDER);
    expect(secret.openInOrder).toBe(true);
    expect(secret.gifts!.map((g) => g.label)).toEqual(GIFT_LABELS);
    expect(secret.gifts![1].design).toMatchObject({ shape: 'tall', tagText: GIFT_TAG });
    expect(secret.gifts!.map((g) => g.goodieIds.length)).toEqual([1, 1, 1]);
    const flat = new Map(secret.goodies.map((g) => [g.id, g.text]));
    expect(secret.gifts!.map((g) => flat.get(g.goodieIds[0]))).toEqual(GOODIE_TEXTS);

    const wrong = deriveKey('definitely-the-wrong-password', Buffer.from(manifest.kdf.salt, 'base64'));
    expect(() => decryptJson(wrong, blob)).toThrow();

    // a single-gift box keeps the original shape: no gifts key at all
    const singleMeta = manifest.boxes.find((b) => b.design.size === undefined)!;
    const single = decryptJson<StaticBoxSecret>(key, await readFile(path.join(editedDir, singleMeta.goodiesFile)));
    expect(single.gifts).toBeUndefined();
    expect(single.goodies[0].text).toBe(SINGLE_NOTE);
  });

  // ------------------------------------------------------------------ 2. the rendered site

  async function openExport(page: Page, folder: string) {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/${folder}/`);
    await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(700); // textures decoded, first frames drawn
    const room = page.getByRole('application', { name: 'Party room' });
    const box = (await room.boundingBox())!;
    return { requests, errors, room, box, scale: box.height / ROOM_HEIGHT };
  }
  const clipOf = (v: { box: { x: number; y: number }; scale: number }, wx: number, wy: number, w: number, h: number) => ({
    x: v.box.x + wx * v.scale, y: v.box.y + wy * v.scale, width: w * v.scale, height: h * v.scale,
  });

  test('the edits are really on screen: each changed area differs from an untouched export, and the rest is identical', async ({ page }) => {
    test.setTimeout(90_000);
    const edited = await openExport(page, 'edited');
    const editedShots = new Map<string, Buffer>();
    const areas: Record<string, [number, number, number, number]> = {
      window: [1060, 100, 180, 180], // the hidden window
      sofa: [800, 520, 200, 140], // the flipped, doubled sofa
      custom: [660, 560, 160, 90], // two placed custom images
      cake: [1060, 380, 180, 190], // restyled cake (heart style, text, sprinkles)
      untouchedWall: [30, 330, 120, 80], // nothing was changed here
    };
    for (const [name, r] of Object.entries(areas)) editedShots.set(name, await page.screenshot({ clip: clipOf(edited, ...r) }));
    expect(edited.errors, 'the exported page threw').toEqual([]);

    await page.goto('about:blank');
    const baseline = await openExport(page, 'baseline');
    for (const [name, r] of Object.entries(areas)) {
      const same = (await page.screenshot({ clip: clipOf(baseline, ...r) })).equals(editedShots.get(name)!);
      if (name === 'untouchedWall') expect(same, 'an unedited area must render identically').toBe(true);
      else expect(same, `the edited "${name}" area should differ from the default layout`).toBe(false);
    }
  });

  test('read-only: no edit mode or add-present controls, custom images load from relative URLs, and only same-origin files are requested', async ({ page }) => {
    const v = await openExport(page, 'edited');
    await expect(page.getByRole('button', { name: 'Edit room' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add a present' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Presents|Draw & Import/ })).toHaveCount(0);

    const custom = v.requests.filter((u) => u.includes('/custom/'));
    expect(custom, 'the custom image was fetched').toEqual([`${baseUrl}/edited/custom/${ids.used}.png`]);
    const hosts = new Set(v.requests.filter((u) => u.startsWith('http')).map((u) => new URL(u).host));
    console.log(`\n--- hosts contacted by the edited export: ${[...hosts].join(', ')} ---`);
    expect([...hosts]).toEqual([new URL(baseUrl).host]);
    // and never a request to a live-app API route
    expect(v.requests.filter((u) => u.includes('/api/'))).toEqual([]);
  });

  test('interactions still work in the export: the restyled cake blows out and relights, and a frame opens', async ({ page }) => {
    const v = await openExport(page, 'edited');
    // the cake object sits at its default (1148, 566); its flames are above it. This cake has text on
    // it, which makes its (bottom-anchored) sprite taller, so the clip reaches well up to cover it.
    const clip = clipOf(v, 1148 - 85, 566 - 300, 170, 200);
    const lit = await page.screenshot({ clip });
    const click = { x: v.box.x + 1148 * v.scale, y: v.box.y + (566 - 90) * v.scale };
    await page.mouse.click(click.x, click.y);
    await page.waitForTimeout(300);
    const unlit = await page.screenshot({ clip });
    expect(lit.equals(unlit), 'clicking the cake should blow the candles out').toBe(false);
    await page.mouse.click(click.x, click.y);
    await page.waitForTimeout(300);
    expect((await page.screenshot({ clip })).equals(unlit), 'and clicking again should relight them').toBe(false);

    // and the picture frames still open their enlarged view (the mountain frame sits at world 160,120)
    await page.mouse.click(v.box.x + 200 * v.scale, v.box.y + 160 * v.scale);
    await expect(page.getByText('Mountain view')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByText('Mountain view')).toHaveCount(0);
    expect(v.errors).toEqual([]);
  });

  // ------------------------------------------------------------------ 3. password wall + gifts

  test('wrong password shows nothing; the right one opens the multi-gift box; "Open in order" is enforced inside the export', async ({ page }) => {
    test.setTimeout(90_000);
    const v = await openExport(page, 'edited');
    // the multi-gift present: base at (400,650), size L (x1.5) at scale 1.5 => 144px, centre 72 above the base
    await page.mouse.click(v.box.x + 400 * v.scale, v.box.y + (650 - 72) * v.scale);
    await expect(page.getByRole('heading', { name: 'Enter the password' })).toBeVisible({ timeout: 10_000 });

    await page.locator('input[type="password"]').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('Wrong password — nothing was unlocked. Try again.')).toBeVisible();
    for (const secret of [...GIFT_LABELS, ...GOODIE_TEXTS, SENDER.toUpperCase()]) await expect(page.getByText(secret)).toHaveCount(0);
    expect(await page.content()).not.toContain(GIFT_LABELS[0]);

    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByRole('button', { name: 'Tap to unwrap!' }).click({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Continue' }).click({ timeout: 10_000 });

    // the gifts float out with their (decrypted) labels; only the first can be opened yet
    const tiles = page.getByTestId('gift-tile');
    await expect(tiles).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(tiles.nth(i)).toContainText(GIFT_LABELS[i]);
    await expect(page.getByTestId('gifts-progress')).toHaveText('0 of 3 gifts opened');
    await expect(page.getByTestId('gifts-order-note')).toBeVisible();
    await expect(tiles.nth(0)).toBeEnabled();
    await expect(tiles.nth(1)).toBeDisabled();
    await expect(tiles.nth(2)).toBeDisabled();

    await tiles.nth(0).click();
    await page.getByRole('button', { name: 'Open everything at once' }).click();
    await expect(page.getByText(GOODIE_TEXTS[0])).toBeVisible();
    await expect(page.getByText(GOODIE_TEXTS[1])).toHaveCount(0);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('gifts-progress')).toHaveText('1 of 3 gifts opened');
    await expect(tiles.nth(1)).toBeEnabled();
    await expect(tiles.nth(2)).toBeDisabled();

    await page.getByRole('button', { name: 'Open everything', exact: true }).click();
    for (const text of GOODIE_TEXTS) await expect(page.getByText(text)).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('gifts-progress')).toHaveText('3 of 3 gifts opened');
    expect(v.errors).toEqual([]);
  });

  test('a single-gift box in the same export still opens straight to its goodies', async ({ page }) => {
    const v = await openExport(page, 'edited');
    await page.mouse.click(v.box.x + 1000 * v.scale, v.box.y + (650 - 32) * v.scale);
    await expect(page.getByRole('heading', { name: 'Enter the password' })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByRole('button', { name: 'Tap to unwrap!' }).click({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Continue' }).click({ timeout: 10_000 });
    await expect(page.getByTestId('gifts-progress')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open everything at once' }).click();
    await expect(page.getByText(SINGLE_NOTE)).toBeVisible();
  });
});
