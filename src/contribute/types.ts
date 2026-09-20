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

export type BoxContribution = {
  fromName: string;
  letter: string;
  pictureCount: number;
  goodies: GoodieItem[];
  design: BoxDesign;
};

export type PlacedBox = {
  id: string;
  fromName: string;
  design: BoxDesign;
  x: number;
  y: number;
  placedAt: number;
  opened?: boolean;
};
