import dns from 'dns/promises';
import net from 'net';

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type LinkPreview = { title?: string; image?: string; source?: string };

/**
 * Is this IP private, link-local, loopback, or otherwise not a legitimate public web target?
 * Blocks the classic SSRF targets: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 * 169.254.0.0/16 (link-local, notably cloud metadata endpoints), 0.0.0.0/8, multicast, and the
 * IPv6 equivalents (::1, fc00::/7 ULA, fe80::/10 link-local).
 */
function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return true; // fe80::/10 link-local
    }
    if (lower.startsWith('::ffff:')) return isBlockedIp(lower.slice(7)); // IPv4-mapped
    return false;
  }
  return true; // couldn't parse — refuse rather than risk it
}

async function assertSafeHost(hostname: string) {
  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) throw new Error('Could not resolve host');
  for (const { address } of records) {
    if (isBlockedIp(address)) throw new Error(`Refusing to fetch a private/link-local address (${address})`);
  }
}

/** Manual redirect loop so every hop (not just the first URL) gets the same private-IP check. */
async function safeFetch(startUrl: string): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = new URL(current);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed');
    await assertSafeHost(url.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'PartyParcelLinkPreview/1.0' },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return res;
        current = new URL(location, url).toString();
        continue;
      }
      return res;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Too many redirects');
}

function extractMeta(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return undefined;
}

function decodeHtmlEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/**
 * Fetches a news link's preview (title/image/source) server-side, at seal time (never at view
 * time — see section 5). SSRF-hardened: blocks private/link-local targets on every redirect hop,
 * times out, and caps the amount of HTML read. Falls back to a bare-bones preview (or none) if
 * anything goes wrong — the goodie still saves, just as a plain card.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  try {
    const res = await safeFetch(rawUrl);
    if (!res.ok || !res.body) return { source: safeHostname(rawUrl) };

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return { source: safeHostname(rawUrl) };

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf-8');

    const title = extractMeta(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]*)<\/title>/i,
    ]);
    const image = extractMeta(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i,
    ]);
    const source =
      extractMeta(html, [
        /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i,
        /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:site_name["']/i,
      ]) ?? safeHostname(rawUrl);

    return { title, image: image && isHttpUrl(image) ? image : undefined, source };
  } catch {
    return { source: safeHostname(rawUrl) };
  }
}

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function safeHostname(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return undefined;
  }
}
