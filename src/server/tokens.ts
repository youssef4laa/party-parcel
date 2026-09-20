import { randomBytes, createHash } from 'crypto';

/** A fresh random link token: base64url, ~192 bits — comfortably over the 128-bit minimum. */
export function generateToken() {
  return randomBytes(24).toString('base64url');
}

/** Only the hash is ever stored server-side; the raw token lives solely in the link we hand out. */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
