/**
 * A minimum bar for the export password — the *only* real lock on an exported gift folder (see
 * scripts/export-gift.ts). Simple length/entropy heuristic rather than a
 * dependency like zxcvbn: this is a one-off local CLI check for a single-user threat model (a
 * friend or family member guessing at a shared link), not a general-purpose account system, and
 * a small heuristic is easy to read, test, and reason about without adding a ~800KB dependency to
 * a script that never ships to a browser bundle anyway.
 */
const MIN_LENGTH = 12;
const MIN_UNIQUE_CHARS = 6;
const MIN_ENTROPY_BITS = 40;

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd123',
  '12345678', '123456789', '1234567890', '0123456789',
  'qwertyuiop', 'qwerty1234', 'letmein123', 'iloveyou12',
  'admin12345', 'welcome123', 'happybirthday', 'birthday123',
  'changeme123', 'abc123456', 'trustno1234',
  '11111111', '00000000', 'aaaaaaaaaaaa',
]);

function estimatedCharsetSize(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += 32;
  return Math.max(size, 1);
}

export function checkPasswordStrength(password: string): { ok: true } | { ok: false; reason: string } {
  if (password.length < MIN_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_LENGTH} characters — it's the only real lock on this export.` };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, reason: 'That password is too common to be a real lock — pick something less guessable.' };
  }
  if (new Set(password).size < MIN_UNIQUE_CHARS) {
    return { ok: false, reason: 'That password repeats too few distinct characters — pick something less predictable.' };
  }
  const bits = password.length * Math.log2(estimatedCharsetSize(password));
  if (bits < MIN_ENTROPY_BITS) {
    return {
      ok: false,
      reason: 'That password is too predictable — mix in more variety (upper/lowercase, numbers, symbols), or make it longer.',
    };
  }
  return { ok: true };
}
