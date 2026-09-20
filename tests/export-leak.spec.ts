import { execSync } from 'child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises';
import path from 'path';
import os from 'os';
import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { deriveKey, decryptJson } from '../scripts/lib/nodeCrypto';
import type { StaticManifest, StaticBoxSecret } from '../src/export/manifest';

const SECRET_NOTE = 'This is the SECRET birthday message nobody else should read.';
const SECRET_COUPON_TITLE = 'SECRET COUPON TITLE';
const SECRET_COUPON_FINE_PRINT = 'redeem with grandma only';
const SECRET_GIFT_MESSAGE = 'TOP SECRET gift message';
const SECRET_REDEEM_CODE = 'HIDDEN-CODE-999';
const SENDER_NAME = 'Secret Agent Sam';
const TAG_TEXT = 'UR SPECIAL';
const EXPORT_PASSWORD = 'correct-horse-battery-staple-9000';

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

/**
 * Regression coverage for the gift-readiness "export leak audit": every sender-authored text
 * field (goodie contents, sender name, tag text) must be unreadable anywhere in an exported
 * bundle's files without the password. Runs the real `scripts/export-gift.ts` CLI end to end (no
 * mocking) and inspects the actual files it writes — same method used to find and verify the fix
 * for the fromName/tagText leak (see DECISIONS.md's Milestone 6 gift-readiness entry).
 */
test.describe('static export: no plaintext leaks', () => {
  let admin: string;
  let outDir: string;
  let manifest: StaticManifest;

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'ExportLeakSuite' });
    admin = tokenFromLink(room.links.admin);
    const contribute = tokenFromLink(room.links.contribute);

    const res = await request.post(`/api/rooms/${contribute}/boxes`, {
      data: {
        fromName: SENDER_NAME,
        design: {
          shape: 'cube', pattern: 'solid', baseColor: '#f4a6c1', accentColor: '#ff3d8b',
          ribbon: 'vertical', ribbonColor: '#fff6d5', bow: 'classic',
          tag: 'heart', tagText: TAG_TEXT, sticker: 'none', topper: 'none',
        },
        x: 500, y: 600,
        goodies: [
          { type: 'note', text: SECRET_NOTE, sizeBytes: 60 },
          { type: 'coupon', title: SECRET_COUPON_TITLE, finePrint: SECRET_COUPON_FINE_PRINT, sizeBytes: 40 },
          { type: 'gift', message: SECRET_GIFT_MESSAGE, redeemCode: SECRET_REDEEM_CODE, sizeBytes: 40 },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();

    outDir = await mkdtemp(path.join(os.tmpdir(), 'export-leak-test-'));
    const repoRoot = path.resolve(__dirname, '..');
    execSync(
      `npx tsx scripts/export-gift.ts --admin ${admin} --password "${EXPORT_PASSWORD}" --out "${outDir}"`,
      { cwd: repoRoot, stdio: 'pipe' },
    );
    manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf-8'));
  });

  test.afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  test('none of the sender-authored secrets appear in any exported file', async () => {
    const files = await listFilesRecursive(outDir);
    expect(files.length).toBeGreaterThan(0);

    const secrets = [
      SECRET_NOTE, SECRET_COUPON_TITLE, SECRET_COUPON_FINE_PRINT,
      SECRET_GIFT_MESSAGE, SECRET_REDEEM_CODE, SENDER_NAME, TAG_TEXT,
    ];

    for (const file of files) {
      const info = await stat(file);
      if (info.size > 5 * 1024 * 1024) continue; // skip huge binaries, nothing sensitive is that large
      const contents = await readFile(file, 'latin1'); // byte-safe for both text and binary/encrypted files
      for (const secret of secrets) {
        expect(contents, `${secret.slice(0, 20)}... leaked into ${path.relative(outDir, file)}`).not.toContain(secret);
      }
    }
  });

  test('manifest has no fromName field at all, and tagText is blanked', async () => {
    expect(manifest.boxes).toHaveLength(1);
    const box = manifest.boxes[0];
    expect(box).not.toHaveProperty('fromName');
    expect(box.design.tagText).toBe('');
  });

  test('the real values are recoverable with the right password (round trip, not just "no leak")', async () => {
    const box = manifest.boxes[0];
    const salt = Buffer.from(manifest.kdf.salt, 'base64');
    const key = deriveKey(EXPORT_PASSWORD, salt);
    const blob = await readFile(path.join(outDir, box.goodiesFile));
    const secret = decryptJson<StaticBoxSecret>(key, blob);

    expect(secret.fromName).toBe(SENDER_NAME);
    expect(secret.tagText).toBe(TAG_TEXT);
    expect(secret.goodies.map((g) => g.type).sort()).toEqual(['coupon', 'gift', 'note']);
    const note = secret.goodies.find((g) => g.type === 'note');
    expect(note?.text).toBe(SECRET_NOTE);
    const coupon = secret.goodies.find((g) => g.type === 'coupon');
    expect(coupon?.title).toBe(SECRET_COUPON_TITLE);
    const gift = secret.goodies.find((g) => g.type === 'gift');
    expect(gift?.redeemCode).toBe(SECRET_REDEEM_CODE);
  });

  test('the wrong password fails to decrypt (auth tag check, not silent garbage)', async () => {
    const box = manifest.boxes[0];
    const wrongKey = deriveKey('definitely-the-wrong-password', Buffer.from(manifest.kdf.salt, 'base64'));
    const blob = await readFile(path.join(outDir, box.goodiesFile));
    expect(() => decryptJson(wrongKey, blob)).toThrow();
  });
});
