/**
 * Shared constants + file-layout logic for the static export's encryption, used by both the
 * Node export script (encrypt, via `node:crypto`) and the browser bundle (decrypt, via
 * `crypto.subtle`). Kept dependency-free (just Uint8Array math) so it works unmodified in both.
 *
 * File format for every `.enc` blob: `IV (12 bytes) || ciphertext || authTag (16 bytes)`.
 * This is deliberately the exact byte layout `SubtleCrypto.decrypt('AES-GCM', ...)` expects for
 * its `data` argument (ciphertext with the tag appended) once the leading IV is split off — no
 * reformatting needed on the browser side.
 */
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32; // AES-256
export const PBKDF2_ITERATIONS = 600_000; // OWASP-recommended floor for PBKDF2-HMAC-SHA256 (2023+)
export const PBKDF2_HASH = 'SHA-256';
export const SALT_BYTES = 16;

export function splitEncryptedBlob(blob: Uint8Array): { iv: Uint8Array; ciphertextAndTag: Uint8Array } {
  return { iv: blob.subarray(0, IV_BYTES), ciphertextAndTag: blob.subarray(IV_BYTES) };
}

export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
