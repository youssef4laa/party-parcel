import type { BoxDesign } from '@/box/types';
import type { GoodiePayload } from '@/goodies/schema';

export type GoodieType = GoodiePayload['type'];

export const GOODIE_LABELS: Record<GoodieType, string> = {
  note: 'Note',
  photo: 'Photo',
  song: 'Song',
  video: 'Video',
  gift: 'Gift',
  voice: 'Voice',
  drawing: 'Drawing',
  location: 'Location',
  coupon: 'Coupon',
  news: 'News',
};

export const GOODIE_ICONS: Record<GoodieType, string> = {
  note: '📝',
  photo: '📷',
  song: '🎵',
  video: '📼',
  gift: '🎁',
  voice: '🎙️',
  drawing: '🎨',
  location: '📍',
  coupon: '🎟️',
  news: '📰',
};

/** A goodie as it exists client-side while packing: the typed, validated payload plus a client
 * id (for list operations) and a size estimate (for the live counters). */
export type GoodieItem = { id: string; sizeBytes: number } & GoodiePayload;

/** One separately wrapped gift inside a multi-gift box. */
export type GiftContribution = { label: string; design: BoxDesign; goodies: GoodieItem[] };

export type BoxContribution = {
  fromName: string;
  letter: string;
  pictureCount: number;
  /** Every goodie in the box, in order — for a multi-gift box this is all gifts flattened, so
   * anything that only cares about the box total (counters, the demo backend) is unchanged. */
  goodies: GoodieItem[];
  design: BoxDesign;
  /** Present only when the box holds MORE than one gift; a single-gift box is just `goodies`. */
  gifts?: GiftContribution[];
  openInOrder?: boolean;
};

export type PlacedBox = {
  id: string;
  fromName: string;
  design: BoxDesign;
  x: number;
  y: number;
  placedAt: number;
  opened?: boolean;
  /** Placement scale and stacking (Phase 4a); absent in the demo/export, where presents are fixed. */
  scale?: number;
  z?: number;
  /** Display hint: this browser may move/resize it (host, or the contributor who packed it). */
  mine?: boolean;
};
