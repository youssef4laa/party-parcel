/**
 * In-memory sliding-window rate limiter, keyed by caller (IP + token). Good enough for a
 * single-instance deployment; a real multi-instance deployment should swap this for a shared
 * store (e.g. Redis/Upstash) behind the same `checkRateLimit` signature.
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
