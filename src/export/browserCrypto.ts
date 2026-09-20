import { PBKDF2_ITERATIONS, PBKDF2_HASH, splitEncryptedBlob, fromBase64 } from './cryptoFormat';

/** Derives the AES-256-GCM key from the celebrant's password + the export's stored salt. Never
 * cached to disk/localStorage — only ever held in memory for the current page session. */
export async function deriveKey(password: string, saltB64: string): Promise<CryptoKey> {
  const salt = fromBase64(saltB64);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

/** Throws if the password was wrong (AES-GCM's auth tag check fails) — callers should treat any
 * rejection here as "wrong password," never partially trust the result. */
export async function decryptBlob(key: CryptoKey, blob: ArrayBuffer): Promise<ArrayBuffer> {
  const { iv, ciphertextAndTag } = splitEncryptedBlob(new Uint8Array(blob));
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertextAndTag as BufferSource);
}

export async function decryptJson<T>(key: CryptoKey, blob: ArrayBuffer): Promise<T> {
  const plain = await decryptBlob(key, blob);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
