/** What a goodie looks like once it comes back from /api/boxes/[id]/contents: the validated
 * payload fields spread flat, plus resolved asset URLs and (for coupons) redemption state. */
export type ViewerGoodie = Record<string, unknown> & {
  id: string;
  type: string;
  assetUrls: string[];
  redeemedAt: string | null;
};

export const SAFE_LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Minimal-privilege sandbox for third-party embeds — scripts+same-origin+presentation are what
 * Spotify/YouTube/Apple Music/SoundCloud/Vimeo's own players need to actually play; nothing else. */
export const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';
