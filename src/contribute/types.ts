import type { BoxDesign } from '@/box/types';

/** All ten goodie types from section 5. Full type-specific editors land in Milestone 5 —
 * for now each goodie is a lightweight, generically-editable record so Pack/Design/Place
 * (Milestone 3) can be exercised end to end against a local stub backend. */
export type GoodieType =
  | 'note'
  | 'photo'
  | 'song'
  | 'video'
  | 'gift'
  | 'voice'
  | 'drawing'
  | 'location'
  | 'coupon'
  | 'news';

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

export type GoodieItem = {
  id: string;
  type: GoodieType;
  /** Free-form per-type payload; Milestone 5 replaces this with typed payloads per goodie. */
  summary: string;
  sizeBytes: number;
  /** Uploaded asset references (e.g. photo goodies), when running against the real API. */
  payload?: { assetKeys?: string[] };
};

export const MAX_GOODIES = 50;
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 180;

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
