import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto';
import { IV_BYTES, KEY_BYTES, PBKDF2_ITERATIONS, SALT_BYTES, TAG_BYTES } from '../../src/export/cryptoFormat';

export function generateSalt(): Buffer {
  return randomBytes(SALT_BYTES);
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_BYTES, 'sha256');
}

/** Produces `IV || ciphertext || authTag` — see cryptoFormat.ts for why that exact layout. */
export function encryptBuffer(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]);
}

export function encryptJson(key: Buffer, value: unknown): Buffer {
  return encryptBuffer(key, Buffer.from(JSON.stringify(value), 'utf-8'));
}

/** The Node-side counterpart to `encryptBuffer`, not used by the export script itself (which
 * only ever encrypts) — exists for tests that need to prove an exported blob round-trips
 * correctly without spinning up a browser for `src/export/browserCrypto.ts`'s Web Crypto path. */
export function decryptBuffer(key: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES, blob.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function decryptJson<T>(key: Buffer, blob: Buffer): T {
  return JSON.parse(decryptBuffer(key, blob).toString('utf-8')) as T;
}
