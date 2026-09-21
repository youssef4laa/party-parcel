/**
 * Contributors have no accounts, so "own item" permission checks need some stand-in for
 * identity. On first use of a room link, this browser gets a random token, kept in
 * localStorage; only its hash ever reaches the server (mirrors how a box's delete token works —
 * see src/server/tokens.ts). Sent as the `X-Contributor-Session` header on every room-object
 * mutation. Known limitation, stated plainly rather than hidden: clearing browser data loses
 * this browser's edit rights over its own items — the host can always still edit or delete them.
 */
const KEY_PREFIX = 'party-parcel-contributor-session:';

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getOrCreateSessionToken(roomToken: string): string {
  const key = KEY_PREFIX + roomToken;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const token = randomToken();
    localStorage.setItem(key, token);
    return token;
  } catch {
    // localStorage unavailable (private mode, quota) — an ephemeral token still lets this page
    // view create/edit its own items for the current session, it just won't be remembered
    return randomToken();
  }
}
