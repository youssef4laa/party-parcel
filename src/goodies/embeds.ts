/**
 * Section 5: "allowlist Spotify, YouTube, Apple Music, and SoundCloud for [song] embeds; any
 * other URL becomes a plain link card" — same idea for Video (YouTube/Vimeo). This module is the
 * allowlist: it never trusts the URL enough to embed it unless it matches a known, safe pattern
 * for a known provider's *own* embed domain, and always returns a `sandbox`-able iframe src.
 */
export type ResolvedEmbed = { kind: 'embed'; provider: string; embedSrc: string } | { kind: 'link'; url: string };

function tryUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function resolveSongEmbed(raw: string): ResolvedEmbed {
  const url = tryUrl(raw);
  if (!url) return { kind: 'link', url: raw };
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'open.spotify.com') {
    const m = url.pathname.match(/^\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
    if (m) return { kind: 'embed', provider: 'spotify', embedSrc: `https://open.spotify.com/embed/${m[1]}/${m[2]}` };
  }
  if (host === 'music.apple.com') {
    // Apple Music's embed player lives on embed.music.apple.com with the same path/query.
    return { kind: 'embed', provider: 'apple-music', embedSrc: `https://embed.music.apple.com${url.pathname}${url.search}` };
  }
  if (host === 'soundcloud.com') {
    return {
      kind: 'embed',
      provider: 'soundcloud',
      embedSrc: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&auto_play=false`,
    };
  }
  const youtubeId = extractYouTubeId(url, host);
  if (youtubeId) return { kind: 'embed', provider: 'youtube', embedSrc: `https://www.youtube.com/embed/${youtubeId}` };

  return { kind: 'link', url: raw };
}

export function resolveVideoEmbed(raw: string): ResolvedEmbed {
  const url = tryUrl(raw);
  if (!url) return { kind: 'link', url: raw };
  const host = url.hostname.replace(/^www\./, '');

  const youtubeId = extractYouTubeId(url, host);
  if (youtubeId) return { kind: 'embed', provider: 'youtube', embedSrc: `https://www.youtube.com/embed/${youtubeId}` };

  if (host === 'vimeo.com') {
    const m = url.pathname.match(/^\/(\d+)/);
    if (m) return { kind: 'embed', provider: 'vimeo', embedSrc: `https://player.vimeo.com/video/${m[1]}` };
  }

  return { kind: 'link', url: raw };
}

function extractYouTubeId(url: URL, host: string): string | null {
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const shorts = url.pathname.match(/^\/shorts\/([\w-]+)/);
    if (shorts) return shorts[1];
    const embed = url.pathname.match(/^\/embed\/([\w-]+)/);
    if (embed) return embed[1];
  }
  if (host === 'youtu.be') {
    const m = url.pathname.match(/^\/([\w-]+)/);
    if (m) return m[1];
  }
  return null;
}
