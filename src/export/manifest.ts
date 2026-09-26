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
  /** The room's decoration layout, baked: every visible object's
   * position, scale, layer, flip and rotation, plus per-kind config (cake style/text/candles,
   * banner and neon-sign text, balloon color). Decorations are deliberately PLAINTEXT — they are
   * the room, and the import notice already tells people that. Optional so an export made before
   * the Room Editor still loads (it falls back to the default layout). */
  objects?: StaticRoomObject[];
  /** Imported PNGs and drawings that placed objects use — plaintext image files in `custom/`. Only
   * items actually placed in the room are exported; unused library items never ship. */
  customItems?: StaticCustomItem[];
};

/** A baked room object. An explicit allow-list of fields — never a spread of the database row —
 * so nothing like an owner's session hash, `createdBy*`, the room id, or lock state can leak. */
export type StaticRoomObject = {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  flipX: boolean;
  rotation: number;
  zone: string;
  configJson: string;
  /** Set only for kind "custom": the StaticCustomItem this object renders. */
  assetId: string | null;
};

export type StaticCustomItem = {
  id: string;
  /** Path relative to the export root (never root-absolute: the folder may be served from a subpath). */
  file: string;
  mime: string;
  width: number;
  height: number;
};

/**
 * Plaintext box metadata. Deliberately does NOT include `fromName` or the design's `tagText` —
 * unlike the rest of `design` (shape/colors/pattern/ribbon/bow/sticker/topper, needed to render
 * the present pile before the password is entered), those two fields are sender-authored text,
 * not cosmetic appearance, so they live inside the encrypted `goodiesFile` blob instead (as
 * `StaticBoxSecret`).
 */
export type StaticBoxMeta = {
  id: string;
  design: BoxDesign;
  x: number;
  y: number;
  placedAt: string;
  goodiesFile: string;
  /** Present placement. Optional: older exports omit them (1 / 0). */
  scale?: number;
  z?: number;
};

/** What a box's decrypted `goodies.enc` actually contains: the sender name and tag text that
 * `StaticBoxMeta` omits, plus the goodie list. */
export type StaticBoxSecret = {
  fromName: string;
  tagText: string;
  goodies: StaticGoodie[];
  /** Phase 4b: present only for a box with MORE than one gift. Gift labels, wrap designs, order
   * and which goodies each holds are inner data, so they live here, encrypted with everything else
   * — never in the plaintext manifest. `goodies` above stays the flat, ordered list. */
  gifts?: StaticGift[];
  openInOrder?: boolean;
};

export type StaticGift = {
  id: string;
  label: string;
  design: Partial<BoxDesign>;
  sortOrder: number;
  /** Ids of the goodies (in `StaticBoxSecret.goodies`) wrapped in this gift, in order. */
  goodieIds: string[];
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
