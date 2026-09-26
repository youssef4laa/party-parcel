import { spawn, execSync, type ChildProcess } from 'child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

const FIXTURES = path.join(__dirname, 'fixtures');

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFilesRecursive(full)));
    else files.push(full);
  }
  return files;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error('could not find a free port'));
      }
    });
  });
}

async function waitForServer(url: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server at ${url} did not come up in time`);
}

/**
 * Gift-readiness: the exported folder must work from *any* path, not just a domain root — a host
 * might put it at `example.com/my-export/`, not `example.com/`. Verifies this by literally doing
 * that: serving the PARENT of a real export output and opening it at a subpath, under a real
 * phone-sized WebKit browser (the `mobile` project — see playwright.config.ts), covering every
 * goodie type, the photobooth (browser-storage only, no server), and a full network-request audit.
 */
test.describe('static export served from a subpath', () => {
  test('wrong password reveals nothing, right password unlocks everything, no disallowed network requests', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    // --- 1. Seed a room and pack one box with all ten goodie types + real uploaded assets ---
    const room = await seedRoom(request, {
      celebrantName: 'SubpathCheck',
      eventAt: new Date(Date.now() - 60_000).toISOString(), // already unlocked, not relevant to the export's own password lock
    });
    const admin = tokenFromLink(room.links.admin);
    const contribute = tokenFromLink(room.links.contribute);

    async function uploadAsset(kind: string, fixtureFile: string, contentType: string) {
      const bytes = await readFile(path.join(FIXTURES, fixtureFile));
      const init = await request.post(`/api/rooms/${contribute}/uploads`, { data: { kind, contentType } });
      const { uploadUrl, key } = await init.json();
      const put = await request.put(uploadUrl, { data: bytes, headers: { 'Content-Type': contentType } });
      expect(put.ok()).toBeTruthy();
      const final = await request.post(`/api/rooms/${contribute}/uploads/${key}/finalize`, { data: { kind } });
      const { assetKey } = await final.json();
      return assetKey as string;
    }

    const photoKey = await uploadAsset('photo', 'tiny.jpg', 'image/jpeg');
    const drawingKey = await uploadAsset('drawing', 'tiny.png', 'image/png');
    const voiceKey = await uploadAsset('voice', 'tiny.mp3', 'audio/mpeg');

    const boxRes = await request.post(`/api/rooms/${contribute}/boxes`, {
      data: {
        fromName: 'Subpath E2E Sender',
        design: {
          shape: 'cube', pattern: 'hearts', baseColor: '#f4a6c1', accentColor: '#ff3d8b',
          ribbon: 'cross', ribbonColor: '#fff6d5', bow: 'big', tag: 'star', tagText: 'SEALED TAG',
          sticker: 'heart', topper: 'flower',
        },
        // Deliberately near the left edge (world x=150, not the 500+ a real placement UI might
        // pick) — at a phone-width viewport most of the 2400px-wide room is off-screen at the
        // start (see tests/phone.spec.ts's DECISIONS.md note), so this keeps the box reachable
        // without needing to pan first.
        x: 150,
        y: 600,
        goodies: [
          { type: 'note', text: 'Subpath e2e note content', sizeBytes: 40 },
          { type: 'photo', assetKeys: [photoKey], caption: 'subpath e2e caption', sizeBytes: 500 },
          { type: 'song', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', sizeBytes: 10 },
          { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', sizeBytes: 10 },
          { type: 'gift', message: 'Subpath e2e gift message', redeemCode: 'SUBPATH-E2E-CODE', sizeBytes: 20 },
          { type: 'voice', assetKey: voiceKey, durationSeconds: 3, sizeBytes: 500 },
          { type: 'drawing', assetKey: drawingKey, sizeBytes: 100 },
          { type: 'location', placeName: 'Subpath e2e landmark', lat: 40.7128, lng: -74.006, sizeBytes: 10 },
          { type: 'coupon', title: 'Subpath e2e coupon title', finePrint: 'no expiry', sizeBytes: 10 },
          { type: 'news', url: 'https://example.com/', sizeBytes: 10 },
        ],
      },
    });
    expect(boxRes.ok()).toBeTruthy();

    // --- 1b. Room Editor content that must survive the export: a restyled cake, a placed custom
    // image (a plaintext asset — the one exported file that isn't encrypted or JSON), and a
    // multi-gift box whose labels/wraps/goodies must stay encrypted. Placed off to the side so the
    // ten-goodie box above stays the one the phone-sized clicks below reach. ---
    const layout = (await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects as Array<{ id: string; kind: string }>;
    const cakeId = layout.find((o) => o.kind === 'cake')!.id;
    const cakeRes = await request.patch(`/api/rooms/${admin}/objects/${cakeId}`, {
      data: { configJson: JSON.stringify({ style: 'rainbow-layer', text: 'SUBPATH CAKE', candleMode: 'numbers', candleCount: 7 }) },
    });
    expect(cakeRes.ok(), await cakeRes.text()).toBeTruthy();
    const customUpload = await request.post(`/api/rooms/${admin}/custom-items?source=import&name=subpath-custom`, {
      data: await readFile(path.join(FIXTURES, 'tiny.png')),
      headers: { 'Content-Type': 'image/png' },
    });
    expect(customUpload.ok(), await customUpload.text()).toBeTruthy();
    const customId = (await customUpload.json()).item.id as string;
    const customPlaced = await request.post(`/api/rooms/${admin}/objects`, {
      data: { kind: 'custom', assetId: customId, x: 260, y: 640, zone: 'anywhere', scale: 4 },
    });
    expect(customPlaced.ok(), await customPlaced.text()).toBeTruthy();
    const giftBox = await request.post(`/api/rooms/${contribute}/boxes`, {
      data: {
        fromName: 'Subpath Gift Sender',
        design: { shape: 'flat', pattern: 'solid', baseColor: '#a679d6', accentColor: '#fff6d5', ribbon: 'cross', ribbonColor: '#ffd166', bow: 'classic', tag: 'none', tagText: '', sticker: 'none', topper: 'none', size: 'S' },
        x: 100, y: 650, openInOrder: true,
        gifts: [
          { label: 'SUBPATH-GIFT-LABEL-ONE', design: { shape: 'tall', tagText: 'SUBPATH-GIFT-TAG' }, goodies: [{ type: 'note', text: 'SUBPATH-GIFT-GOODIE-ONE', sizeBytes: 10 }] },
          { label: 'SUBPATH-GIFT-LABEL-TWO', design: {}, goodies: [{ type: 'note', text: 'SUBPATH-GIFT-GOODIE-TWO', sizeBytes: 10 }] },
        ],
      },
    });
    expect(giftBox.ok(), await giftBox.text()).toBeTruthy();

    // --- 2. Export it ---
    const parentDir = await mkdtemp(path.join(os.tmpdir(), 'export-subpath-'));
    const exportFolderName = 'my-party-parcel';
    const exportDir = path.join(parentDir, exportFolderName);
    const repoRoot = path.resolve(__dirname, '..');
    const exportPassword = 'subpath-verification-strong-pw-2026';
    execSync(
      `npx tsx scripts/export-gift.ts --admin ${admin} --password "${exportPassword}" --out "${exportDir}"`,
      { cwd: repoRoot, stdio: 'pipe' },
    );

    // --- 2b. Leak grep: every sender-authored secret must be absent from every exported file ---
    console.log(`\n--- leak grep: ${exportDir} ---`);
    const secrets = [
      'Subpath e2e note content', 'subpath e2e caption', 'Subpath e2e gift message',
      'SUBPATH-E2E-CODE', 'Subpath e2e landmark', 'Subpath e2e coupon title',
      'Subpath E2E Sender', 'SEALED TAG',
      'SUBPATH-GIFT-LABEL-ONE', 'SUBPATH-GIFT-LABEL-TWO', 'SUBPATH-GIFT-TAG', 'SUBPATH-GIFT-GOODIE-ONE',
      'SUBPATH-GIFT-GOODIE-TWO', 'Subpath Gift Sender', 'subpath-custom', // the custom image's library NAME never ships
    ];
    const exportedFiles = await listFilesRecursive(exportDir);
    for (const secret of secrets) {
      let foundIn: string | null = null;
      for (const file of exportedFiles) {
        const info = await stat(file);
        if (info.size > 5 * 1024 * 1024) continue;
        const contents = await readFile(file, 'latin1');
        if (contents.includes(secret)) {
          foundIn = path.relative(exportDir, file);
          break;
        }
      }
      const line = foundIn ? `LEAK: "${secret}" found in ${foundIn}` : `OK:   "${secret}" not found in any of ${exportedFiles.length} files`;
      console.log(' ', line);
      expect(foundIn, line).toBeNull();
    }
    console.log('--- end leak grep ---\n');

    // --- 3. Serve the PARENT of the export folder (not the folder itself) ---
    const port = await findFreePort();
    let serveProc: ChildProcess | null = null;
    const requestLog: string[] = [];

    try {
      serveProc = spawn('npx', ['--yes', 'serve', '-l', String(port), parentDir], { stdio: 'pipe' });
      const baseUrl = `http://localhost:${port}/${exportFolderName}/`;
      await waitForServer(baseUrl);

      page.on('request', (req) => requestLog.push(req.url()));

      // --- 4. Open at the subpath, wrong password first ---
      await page.goto(baseUrl);
      const roomEl = page.getByRole('application', { name: 'Party room' });
      await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible({ timeout: 10_000 });
      // Mobile WebKit's viewport (URL bar collapse/expand) can settle to its final height
      // *after* Pixi's camera already computed its world<->screen scale from an earlier, taller-
      // chrome measurement — force a recompute against the now-settled size before doing any
      // coordinate-based clicks below (confirmed necessary: without this, a click computed from
      // the current boundingBox() misses real sprites by tens of px).
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      const box = await roomEl.boundingBox();
      if (!box) throw new Error('room canvas did not render');
      const ROOM_HEIGHT = 760;
      const scale = box.height / ROOM_HEIGHT;
      // The baked custom image was fetched from a RELATIVE path under the subfolder, and the page
      // never asked a live-app route for anything.
      const customRequests = requestLog.filter((u) => u.includes(`/${exportFolderName}/custom/`));
      expect(customRequests, 'the placed custom image should load from <subfolder>/custom/').toEqual([
        `${baseUrl}custom/${customId}.png`,
      ]);
      expect(requestLog.filter((u) => u.includes('/api/'))).toEqual([]);
      console.log(`CHECK 0 (custom image): loaded ${customRequests[0].replace(baseUrl, './')} from the subfolder, no /api/ requests — PASS`);

      // The box was created at world (150, 600), anchored bottom-center — click just above its
      // base, comfortably inside its footprint.
      await roomEl.click({ position: { x: 150 * scale, y: 580 * scale } });
      await expect(page.getByRole('heading', { name: 'Enter the password' })).toBeVisible({ timeout: 10_000 });

      await page.locator('input[type="password"]').fill('definitely-the-wrong-password');
      await page.getByRole('button', { name: 'Unlock' }).click();
      await expect(page.getByText('Wrong password — nothing was unlocked. Try again.')).toBeVisible();
      // Nothing sender-authored ever rendered:
      await expect(page.getByText('Subpath e2e note content')).toHaveCount(0);
      await expect(page.getByText('SubpathE2E Sender')).toHaveCount(0);
      console.log('CHECK 1 (wrong password): "Wrong password" shown, nothing sender-authored rendered — PASS');

      // --- 5. Right password ---
      await page.locator('input[type="password"]').fill(exportPassword);
      await page.getByRole('button', { name: 'Unlock' }).click();
      await expect(page.getByRole('button', { name: 'Tap to unwrap!' })).toBeVisible({ timeout: 10_000 });
      // The real sender name only appears now, post-decryption:
      await expect(page.getByText('A PRESENT FROM SUBPATH E2E SENDER')).toBeVisible();
      console.log('CHECK 2 (right password): box unlocked, real sender name decrypted and shown — PASS');
      await page.getByRole('button', { name: 'Tap to unwrap!' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Open everything at once' }).click();

      // --- 6. Every goodie type actually rendered ---
      await expect(page.getByText('Subpath e2e note content')).toBeVisible();
      console.log('  note: rendered');
      await expect(page.getByText('subpath e2e caption')).toBeVisible();
      console.log('  photo: rendered');
      await expect(page.locator('iframe[title="Song player"]')).toBeVisible();
      console.log('  song: rendered');
      await expect(page.locator('iframe[title="Video player"]')).toBeVisible();
      console.log('  video: rendered');
      await expect(page.getByText('Subpath e2e gift message')).toBeVisible();
      console.log('  gift: rendered');
      await expect(page.getByText('Voice Message')).toBeVisible();
      console.log('  voice: rendered');
      await expect(page.getByText('A Drawing')).toBeVisible();
      console.log('  drawing: rendered');
      await expect(page.getByText('Subpath e2e landmark')).toBeVisible();
      console.log('  location: rendered');
      await expect(page.getByText('Subpath e2e coupon title')).toBeVisible();
      console.log('  coupon: rendered');
      await expect(page.getByText('News Clipping')).toBeVisible();
      console.log('  news: rendered');
      await page.locator('iframe[title="Map"]').scrollIntoViewIfNeeded();
      await expect(page.locator('iframe[title="Map"]')).toBeVisible();
      await page.getByRole('button', { name: 'Redeem' }).click();
      await expect(page.getByText('REDEEMED')).toBeVisible({ timeout: 10_000 });
      console.log('  coupon redeemed and REDEEMED stamp shown');
      console.log('CHECK 3 (all ten goodie types): every type rendered real decrypted content — PASS');
      await page.getByRole('button', { name: 'Done' }).click();

      // --- 7. Photobooth: capture stays in browser storage only, no network round-trip ---
      // The camera prop (world x=470) sits just past what's visible at a phone-width viewport
      // without panning first (same finding as tests/phone.spec.ts) — pan right by a modest,
      // known amount (a plain drag; this test isn't re-proving touch panning, phone.spec.ts
      // already does) rather than guessing its exact post-pan screen position.
      const midY = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width - 20, midY);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 140, midY, { steps: 8 });
      await page.mouse.up();

      const preShotRequestCount = requestLog.length;
      await roomEl.click({ position: { x: (470 * scale) - 120, y: 344 * scale } });
      await expect(page.getByRole('heading', { name: 'PHOTOBOOTH' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Turn on camera' }).click();
      await expect(page.getByRole('button', { name: 'TAKE PHOTO' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'TAKE PHOTO' }).click();
      await expect(page.getByRole('button', { name: 'Save to photo wall' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'Save to photo wall' }).click();
      await expect(page.getByRole('heading', { name: 'PHOTOBOOTH' })).toHaveCount(0, { timeout: 10_000 });

      const localShots = await page.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.startsWith('party-parcel-photobooth:')),
      );
      expect(localShots.length).toBeGreaterThan(0);
      const shotCount = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]').length, localShots[0]);
      expect(shotCount).toBe(1);
      console.log(
        `CHECK 4 (photobooth): shot saved to localStorage key "${localShots[0]}" (${shotCount} shot) — PASS`,
      );

      // No REAL network request was made during the capture+save — camera capture is entirely
      // local getUserMedia + canvas, and the saved shot is a data: URL in localStorage, never
      // uploaded anywhere. `data:`/`blob:` "requests" are the browser's own local resource
      // loads (e.g. the `<img>` that renders the saved shot back from its data: URL) — logged by
      // Playwright's request instrumentation but never touching the network, so they're excluded
      // here rather than treated as a host to check.
      const postShotRequests = requestLog.slice(preShotRequestCount).filter((u) => u.startsWith('http'));
      const postShotHosts = new Set(postShotRequests.map((u) => new URL(u).host));
      for (const h of postShotHosts) {
        expect(h, `photobooth capture made a real network request to ${h}`).toBe(`localhost:${port}`);
      }

      // --- 8. Full network-request audit for the whole session (http/https only — see above) ---
      // Google Fonts is deliberately NOT in this allowlist — the export self-hosts its pixel
      // fonts (export-site/src/fonts.css) specifically so nothing is requested just to render
      // text. If fonts.googleapis.com/fonts.gstatic.com ever show up again, that's a real
      // regression, not an accepted exception — see DECISIONS.md.
      const allowedHosts = new Set([
        `localhost:${port}`, // the export's own static files, served from the subpath
        'open.spotify.com', // song embed (this box's song goodie)
        'www.youtube.com', // video embed
        'www.openstreetmap.org', // location embed
      ]);
      const httpRequests = requestLog.filter((u) => u.startsWith('http'));
      const seenHosts = [...new Set(httpRequests.map((u) => new URL(u).host))].sort();
      const disallowed = seenHosts.filter((h) => !allowedHosts.has(h));

      await writeFile(
        path.join(os.tmpdir(), 'export-subpath-network-log.txt'),
        requestLog.map((u) => u).join('\n'),
      );

      console.log(
        `\n--- network hosts contacted this session (${httpRequests.length} http(s) requests, ` +
          `${requestLog.length - httpRequests.length} local data:/blob: resource loads excluded) ---`,
      );
      for (const h of seenHosts) console.log(' -', h);
      console.log('--- end host list ---\n');

      expect(disallowed, `unexpected hosts contacted: ${disallowed.join(', ')}`).toEqual([]);
    } finally {
      serveProc?.kill();
      await rm(parentDir, { recursive: true, force: true });
    }
  });
});
