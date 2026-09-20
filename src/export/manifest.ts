import type { BoxDesign } from '@/box/types';

/** The static export's plaintext manifest — box *metadata* (design, sender, position) is
 * intentionally not encrypted, matching the live app (the room renders present piles before
 * unlock too); only goodie contents and media are behind the password. */
export type StaticManifest = {
  version: 1;
  exportedAt: string;
  kdf: { salt: string; iterations: number; hash: 'SHA-256' };
  room: {
    title: string;
    celebrantName: string;
    age: number | null;
    bannerText: string;
    eventAt: string;
    timezone: string;
    occasion: string;
  };
  boxes: StaticBoxMeta[];
};

/**
 * Plaintext box metadata. Deliberately does NOT include `fromName` or the design's `tagText` —
 * unlike the rest of `design` (shape/colors/pattern/ribbon/bow/sticker/topper, needed to render
 * the present pile before the password is entered), those two fields are sender-authored text,
 * not cosmetic appearance, so they live inside the encrypted `goodiesFile` blob instead (as
 * `StaticBoxSecret`) — see DECISIONS.md's Milestone 6 gift-readiness entry.
 */
export type StaticBoxMeta = {
  id: string;
  design: BoxDesign;
  x: number;
  y: number;
  placedAt: string;
  goodiesFile: string;
};

/** What a box's decrypted `goodies.enc` actually contains: the sender name and tag text that
 * `StaticBoxMeta` omits, plus the goodie list. */
export type StaticBoxSecret = {
  fromName: string;
  tagText: string;
  goodies: StaticGoodie[];
};

/** One goodie's shape inside the decrypted payload: the same fields the live API's contents
 * endpoint returns, minus signed URLs (assets are referenced by relative encrypted-file path + a
 * plaintext mime, resolved into blob: URLs client-side after decryption). */
export type StaticGoodie = Record<string, unknown> & {
  id: string;
  type: string;
  sortOrder: number;
  assetFiles: Array<{ path: string; mime: string }>;
};
