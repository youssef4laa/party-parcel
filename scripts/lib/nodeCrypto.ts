import { randomBytes, pbkdf2Sync, createCipheriv } from 'crypto';
import { IV_BYTES, KEY_BYTES, PBKDF2_ITERATIONS, SALT_BYTES } from '../../src/export/cryptoFormat';

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
