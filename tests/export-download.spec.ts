import { readFileSync } from 'fs';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { unzipSync } from 'fflate';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { deriveKey, decryptJson } from '../scripts/lib/nodeCrypto';
import type { StaticBoxSecret, StaticManifest } from '../src/export/manifest';

/**
 * The host panel's "Download sealed copy (.zip)" button (POST /api/rooms/[token]/export): who may
 * use it, the password rules, that the zip is a real sealed export (decrypts with the password, leaks
 * nothing without it), and that the button in the UI actually delivers it.
 */

const PASSWORD = 'download-button-verification-strong-pw-2026';
const SECRET_NOTE = 'SECRET-NOTE-FOR-THE-ZIP-TEST';
const SENDER = 'Zip Test Sender';
let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.4.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

async function roomWithBox(request: APIRequestContext, name: string) {
  const seeded = await seedRoom(request, { celebrantName: name });
  const admin = tokenFromLink(seeded.links.admin);
  const contribute = tokenFromLink(seeded.links.contribute);
  const res = await request.post(`/api/rooms/${contribute}/boxes`, {
    headers: ip(),
    data: {
      fromName: SENDER, x: 500, y: 650, goodies: [{ type: 'note', text: SECRET_NOTE, sizeBytes: 30 }],
      design: { shape: 'cube', pattern: 'solid', baseColor: '#f4a6c1', accentColor: '#ff3d8b', ribbon: 'vertical', ribbonColor: '#fff6d5', bow: 'classic', tag: 'none', tagText: '', sticker: 'none', topper: 'none' },
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return { admin, contribute, celebrate: tokenFromLink(seeded.links.celebrate) };
}
const post = (request: APIRequestContext, token: string, data: unknown) =>
  request.post(`/api/rooms/${token}/export`, { data, headers: ip(), timeout: 180_000 });

/** Reads a zip's files as { relative path -> bytes }. */
const files = (zip: Uint8Array) => unzipSync(zip);

async function assertSealedExport(zip: Uint8Array) {
  const entries = files(zip);
  const names = Object.keys(entries);
  expect(names.some((n) => n === 'party-parcel/index.html')).toBe(true);
  expect(names.some((n) => n === 'party-parcel/manifest.json')).toBe(true);
  expect(names.some((n) => n.endsWith('/goodies.enc'))).toBe(true);
  expect(names.some((n) => n === 'party-parcel/robots.txt')).toBe(true);

  // nothing sender-authored is readable without the password...
  for (const [name, bytes] of Object.entries(entries)) {
    const text = Buffer.from(bytes).toString('latin1');
    expect(text, name).not.toContain(SECRET_NOTE);
    expect(text, name).not.toContain(SENDER);
  }
  // ...and everything is recoverable WITH it
  const manifest = JSON.parse(Buffer.from(entries['party-parcel/manifest.json']).toString('utf-8')) as StaticManifest;
  const key = deriveKey(PASSWORD, Buffer.from(manifest.kdf.salt, 'base64'));
  const blob = Buffer.from(entries[`party-parcel/${manifest.boxes[0].goodiesFile}`]);
  const secret = decryptJson<StaticBoxSecret>(key, blob);
  expect(secret.fromName).toBe(SENDER);
  expect(secret.goodies[0].text).toBe(SECRET_NOTE);
  expect(() => decryptJson(deriveKey('definitely-the-wrong-password', Buffer.from(manifest.kdf.salt, 'base64')), blob)).toThrow();
  return manifest;
}

test('only the host link can export; everyone else and unknown links are refused', async ({ request }) => {
  const { contribute, celebrate } = await roomWithBox(request, 'ZipWho');
  for (const token of [contribute, celebrate]) {
    const res = await post(request, token, { password: PASSWORD });
    expect(res.status(), `token ${token.slice(0, 4)}…`).toBe(403);
    expect((await res.json()).error).toMatch(/host link/);
  }
  expect((await post(request, 'not-a-real-token', { password: PASSWORD })).status()).toBe(404);
});

test('the password is required and must be strong: weak, short and common passwords are refused with the reason', async ({ request }) => {
  const { admin } = await roomWithBox(request, 'ZipPassword');
  expect((await post(request, admin, {})).status()).toBe(400);
  expect((await post(request, admin, { password: '' })).status()).toBe(400);
  for (const weak of ['short', 'password123', 'aaaaaaaaaaaaaa', '12345678', 'happybirthday']) {
    const res = await post(request, admin, { password: weak });
    expect(res.status(), weak).toBe(400);
    expect((await res.json()).error, weak).toBeTruthy();
  }
});

test('a valid export downloads as a real zip: sealed without the password, recoverable with it', async ({ request }) => {
  test.setTimeout(240_000);
  const { admin } = await roomWithBox(request, 'ZipReal Room');
  const res = await post(request, admin, { password: PASSWORD });
  expect(res.status(), await res.text().catch(() => '')).toBe(200);
  expect(res.headers()['content-type']).toBe('application/zip');
  expect(res.headers()['content-disposition']).toBe('attachment; filename="party-parcel-zipreal-room.zip"');
  expect(res.headers()['cache-control']).toBe('no-store');
  const zip = new Uint8Array(await res.body());
  expect(zip.length).toBeGreaterThan(1000);
  expect(zip[0]).toBe(0x50); // "PK" — a zip
  expect(zip[1]).toBe(0x4b);
  await assertSealedExport(zip);
});

test('two exports at once: the second is told to wait rather than racing the first', async ({ request }) => {
  test.setTimeout(240_000);
  const { admin } = await roomWithBox(request, 'ZipBusy');
  const [a, b] = await Promise.all([post(request, admin, { password: PASSWORD }), post(request, admin, { password: PASSWORD })]);
  const statuses = [a.status(), b.status()].sort();
  expect(statuses).toEqual([200, 429]);
  const refused = a.status() === 429 ? a : b;
  expect((await refused.json()).error).toMatch(/already running/);
});

test('the host panel button downloads the zip; a weak password shows the reason and downloads nothing', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { admin } = await roomWithBox(request, 'ZipUi');
  await page.goto(`/r/${admin}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();

  const form = page.getByRole('form', { name: 'Export a sealed copy' });
  await expect(form).toBeVisible();
  await expect(form.getByText(/not\s+locked/i)).toBeVisible(); // says plainly that decorations aren't locked
  await expect(form.getByRole('button', { name: /Download sealed copy/ })).toBeDisabled(); // needs a password first

  await form.getByLabel(/Password/).fill('short');
  await form.getByRole('button', { name: /Download sealed copy/ }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  expect(await form.getByRole('alert').innerText()).toMatch(/\S/);

  await form.getByLabel(/Password/).fill(PASSWORD);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), form.getByRole('button', { name: /Download sealed copy/ }).click()]);
  expect(download.suggestedFilename()).toBe('party-parcel-zipui.zip');
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'zip-ui-'));
  const saved = path.join(tmp, 'export.zip');
  await download.saveAs(saved);
  await assertSealedExport(new Uint8Array(readFileSync(saved)));
  await rm(tmp, { recursive: true, force: true });

  await expect(form.getByText(/Downloaded party-parcel-zipui\.zip/)).toBeVisible();
  await expect(form.getByLabel(/Password/)).toHaveValue(''); // the password isn't kept once used
});

test('the CLI still works after the refactor (same library, same sealed result)', async ({ request }) => {
  test.setTimeout(240_000);
  const { admin } = await roomWithBox(request, 'ZipCli');
  const { execSync } = await import('child_process');
  const out = await mkdtemp(path.join(os.tmpdir(), 'zip-cli-'));
  try {
    const log = execSync(`npx tsx scripts/export-gift.ts --admin ${admin} --password "${PASSWORD}" --out "${out}"`, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
    });
    expect(log).toMatch(/Done! 1 box\(es\)/);
    const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf-8')) as StaticManifest;
    expect(manifest.boxes).toHaveLength(1);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
