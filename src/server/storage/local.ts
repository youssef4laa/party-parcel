import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import type { StorageProvider } from './types';

// Deliberately outside `public/` so nothing here is reachable except through the signed-URL route.
const ROOT = path.join(process.cwd(), '.data', 'uploads');

function secret() {
  const s = process.env.ASSET_SIGNING_SECRET;
  if (!s) throw new Error('ASSET_SIGNING_SECRET is not set');
  return s;
}

function sign(storageKey: string, exp: number) {
  return createHmac('sha256', secret()).update(`${storageKey}.${exp}`).digest('base64url');
}

/** Verifies a signed asset URL's `exp`/`sig` query params. Used by the /api/assets/[key] route. */
export function verifyAssetSignature(storageKey: string, exp: number, sig: string) {
  if (Date.now() > exp) return false;
  const expected = sign(storageKey, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function keyPath(storageKey: string) {
  await mkdir(ROOT, { recursive: true });
  // storageKey is always our own generated hex string — never derived from user input — so a
  // plain join is safe here (no path traversal surface).
  return path.join(ROOT, storageKey);
}

export const localStorage: StorageProvider = {
  async put(buffer, _contentType) {
    void _contentType;
    const storageKey = randomBytes(16).toString('hex');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    await writeFile(await keyPath(storageKey), buffer);
    return { storageKey, sha256 };
  },

  async get(storageKey) {
    try {
      return await readFile(await keyPath(storageKey));
    } catch {
      return null;
    }
  },

  async delete(storageKey) {
    try {
      await unlink(await keyPath(storageKey));
    } catch {
      // already gone — deleting is idempotent
    }
  },

  async signedGetUrl(storageKey, expiresInSeconds) {
    const exp = Date.now() + expiresInSeconds * 1000;
    const sig = sign(storageKey, exp);
    return `/api/assets/${storageKey}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
  },
};
