export type BoxShape = 'cube' | 'tall' | 'flat';
export type BoxPattern =
  | 'solid'
  | 'gingham'
  | 'polka'
  | 'stars'
  | 'hearts'
  | 'stripes'
  | 'checker'
  | 'plaid'
  | 'sparkle';
export type RibbonStyle = 'none' | 'vertical' | 'cross';
export type BowStyle = 'none' | 'classic' | 'big' | 'double' | 'ruffle' | 'knot';
export type TagShape = 'none' | 'heart' | 'star' | 'round';
export type StickerShape = 'none' | 'heart' | 'star' | 'sparkle' | 'paw';
export type TopperShape = 'none' | 'flower' | 'leaf' | 'candle';
/** How big the present sits in the room before any placement scaling. */
export type BoxSize = 'S' | 'M' | 'L';

/** World-size multiplier per BoxSize. M is exactly the original fixed 64px footprint, so every
 * design saved before this property existed (no `size`) renders unchanged. */
export const BOX_SIZE_FACTOR: Record<BoxSize, number> = { S: 0.75, M: 1, L: 1.5 };

export function sizeFactorOf(design: { size?: BoxSize }): number {
  return BOX_SIZE_FACTOR[design.size ?? 'M'] ?? 1;
}

export type BoxDesign = {
  shape: BoxShape;
  pattern: BoxPattern;
  baseColor: string;
  accentColor: string;
  ribbon: RibbonStyle;
  ribbonColor: string;
  bow: BowStyle;
  tag: TagShape;
  tagText: string;
  sticker: StickerShape;
  topper: TopperShape;
  /** Optional so designs saved before sizes existed stay valid — absent means 'M'. */
  size?: BoxSize;
};

/** 12 curated swatches, warm/cozy/pastel to match the room's palette. Shared across base/accent/ribbon pickers. */
export const SWATCHES: readonly string[] = [
  '#ff3d8b', // hot pink
  '#f7b8cf', // gingham pink
  '#f4a6c1', // blush
  '#ffd166', // marigold
  '#f4d35e', // butter yellow
  '#9be08d', // mint green
  '#6ec6ff', // sky blue
  '#a679d6', // lavender
  '#f0954a', // orange
  '#fff6d5', // cream
  '#5e3620', // cocoa brown
  '#2b1a1a', // near-black outline tone
] as const;

export const DEFAULT_DESIGN: BoxDesign = {
  shape: 'cube',
  pattern: 'solid',
  baseColor: '#f4a6c1',
  accentColor: '#ff3d8b',
  ribbon: 'vertical',
  ribbonColor: '#fff6d5',
  bow: 'classic',
  tag: 'round',
  tagText: '',
  sticker: 'none',
  topper: 'none',
};

export type BoxPreset = { name: string; design: BoxDesign };

export const BOX_PRESETS: BoxPreset[] = [
  {
    name: 'Pink Hearts',
    design: {
      shape: 'cube',
      pattern: 'hearts',
      baseColor: '#f4a6c1',
      accentColor: '#ff3d8b',
      ribbon: 'cross',
      ribbonColor: '#fff6d5',
      bow: 'classic',
      tag: 'heart',
      tagText: '',
      sticker: 'none',
      topper: 'none',
    },
  },
  {
    name: 'Blue Polka',
    design: {
      shape: 'tall',
      pattern: 'polka',
      baseColor: '#6ec6ff',
      accentColor: '#fff6d5',
      ribbon: 'vertical',
      ribbonColor: '#ffd166',
      bow: 'big',
      tag: 'round',
      tagText: '',
      sticker: 'none',
      topper: 'none',
    },
  },
  {
    name: 'Lavender Stars',
    design: {
      shape: 'cube',
      pattern: 'stars',
      baseColor: '#a679d6',
      accentColor: '#fff6d5',
      ribbon: 'cross',
      ribbonColor: '#f4d35e',
      bow: 'double',
      tag: 'star',
      tagText: '',
      sticker: 'sparkle',
      topper: 'none',
    },
  },
  {
    name: 'Pink Gingham',
    design: {
      shape: 'flat',
      pattern: 'gingham',
      baseColor: '#f7b8cf',
      accentColor: '#ff3d8b',
      ribbon: 'vertical',
      ribbonColor: '#ff3d8b',
      bow: 'ruffle',
      tag: 'round',
      tagText: '',
      sticker: 'none',
      topper: 'flower',
    },
  },
  {
    name: 'Black Dots',
    design: {
      shape: 'cube',
      pattern: 'polka',
      baseColor: '#2b1a1a',
      accentColor: '#fff6d5',
      ribbon: 'cross',
      ribbonColor: '#ff3d8b',
      bow: 'knot',
      tag: 'round',
      tagText: '',
      sticker: 'none',
      topper: 'none',
    },
  },
];
