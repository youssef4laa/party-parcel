/** The static export has no server, so "store coupon redemptions ... in the browser only" means
 * exactly that — keyed by goodie id, in this browser's localStorage, forever (until cleared). */
const PREFIX = 'party-parcel-export:redeemed:';

export function getLocalRedemption(goodieId: string): string | null {
  try {
    return localStorage.getItem(PREFIX + goodieId);
  } catch {
    return null;
  }
}

export function setLocalRedemption(goodieId: string): string {
  const timestamp = new Date().toISOString();
  try {
    localStorage.setItem(PREFIX + goodieId, timestamp);
  } catch {
    // localStorage unavailable (private browsing, quota) — redemption still "succeeds" for this
    // view, it just won't survive a reload; nothing server-side to fall back to in this export
  }
  return timestamp;
}
