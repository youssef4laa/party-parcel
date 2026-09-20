import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import type { StorageProvider } from './types';

// Deliberately outside `public/` so nothing here is reachable except through a signed URL.
const ROOT = path.join(process.cwd(), '.data', 'uploads');
const TMP_ROOT = path.join(process.cwd(), '.data', 'tmp-uploads');

function secret() {
  const s = process.env.ASSET_SIGNING_SECRET;
  if (!s) throw new Error('ASSET_SIGNING_SECRET is not set');
  return s;
}

function sign(parts: (string | number)[]) {
  return createHmac('sha256', secret()).update(parts.join('.')).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Verifies a signed asset GET URL's `exp`/`sig` query params. Used by /api/assets/[key]. */
export function verifyAssetSignature(storageKey: string, exp: number, sig: string) {
  if (Date.now() > exp) return false;
  return safeEqual(sig, sign([storageKey, exp]));
}

/** Verifies a signed local upload PUT's params. Used by /api/uploads/put/[key]. */
export function verifyUploadSignature(key: string, contentType: string, maxBytes: number, exp: number, sig: string) {
  if (Date.now() > exp) return false;
  return safeEqual(sig, sign(['upload', key, contentType, maxBytes, exp]));
}

async function pathFor(root: string, key: string) {
  await mkdir(root, { recursive: true });
  // keys are always our own randomBytes hex strings, never user input — a plain join is safe.
  return path.join(root, key);
}

export const localStorage: StorageProvider = {
  async createUploadTarget({ contentType, maxBytes }) {
    const key = randomBytes(16).toString('hex');
    const exp = Date.now() + 5 * 60_000;
    const sig = sign(['upload', key, contentType, maxBytes, exp]);
    const qs = new URLSearchParams({ ct: contentType, max: String(maxBytes), exp: String(exp), sig });
    return { uploadUrl: `/api/uploads/put/${key}?${qs.toString()}`, key };
  },

  async readUploadedObject(key) {
    try {
      return await readFile(await pathFor(TMP_ROOT, key));
    } catch {
      return undefined;
    }
  },

  async discardUpload(key) {
    try {
      await unlink(await pathFor(TMP_ROOT, key));
    } catch {
      // already gone — idempotent
    }
  },

  async put(buffer, _contentType) {
    void _contentType;
    const storageKey = randomBytes(16).toString('hex');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    await writeFile(await pathFor(ROOT, storageKey), buffer);
    return { storageKey, sha256 };
  },

  async get(storageKey) {
    try {
      return await readFile(await pathFor(ROOT, storageKey));
    } catch {
      return null;
    }
  },

  async delete(storageKey) {
    try {
      await unlink(await pathFor(ROOT, storageKey));
    } catch {
      // already gone — idempotent
    }
  },

  async signedGetUrl(storageKey, expiresInSeconds) {
    const exp = Date.now() + expiresInSeconds * 1000;
    const sig = sign([storageKey, exp]);
    return `/api/assets/${storageKey}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
  },
};

/** Used only by the local PUT route to write the raw uploaded bytes into the temp area. */
export async function writeTempUpload(key: string, buffer: Buffer) {
  await writeFile(await pathFor(TMP_ROOT, key), buffer);
}
