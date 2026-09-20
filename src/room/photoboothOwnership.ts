/**
 * "Shot owners can delete their own shot" (section 3) with no accounts: the server hands back a
 * one-time delete token at creation (same pattern as a box's `deleteToken`), and we remember it
 * here, in this browser's localStorage, keyed by room token + shot id, so the delete button still
 * works after a reload — unlike a box's delete token, which only needs to survive a 60s undo
 * window and is kept in memory.
 */
function storageKey(roomToken: string) {
  return `party-parcel-photobooth-owner:${roomToken}`;
}

function load(roomToken: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey(roomToken));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function rememberShotOwnership(roomToken: string, shotId: string, deleteToken: string) {
  try {
    const map = load(roomToken);
    map[shotId] = deleteToken;
    localStorage.setItem(storageKey(roomToken), JSON.stringify(map));
  } catch {
    // localStorage unavailable — the shot still saves, it just won't be deletable after a reload
  }
}

export function getShotDeleteToken(roomToken: string, shotId: string): string | undefined {
  return load(roomToken)[shotId];
}
