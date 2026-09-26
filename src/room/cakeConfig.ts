/**
 * Cake config shape + defaults — a plain, framework-agnostic module
 * (no Pixi/DOM/Prisma imports) so it's safe to import from both the server (defaultLayout.ts, for
 * the seeded default) and the client (the cake draw function, the Cake editor UI). Matches the
 * defensive-parse convention every other RoomObject `configJson` reader already follows (see
 * scene/objectConfig.ts's doc comment) — nothing here is enforced server-side beyond configJson's
 * overall byte length (src/server/roomObjects.ts), so `parseCakeConfig` never trusts its input.
 */

export type CakeStyle =
  | 'tiered-classic'
  | 'chocolate-drip'
  | 'strawberry-shortcake'
  | 'rainbow-layer'
  | 'cheesecake'
  | 'ice-cream-cake'
  | 'cupcake-tower'
  | 'pixel-heart-cake';

export const CAKE_STYLES: { key: CakeStyle; label: string }[] = [
  { key: 'tiered-classic', label: 'Tiered classic' },
  { key: 'chocolate-drip', label: 'Chocolate drip' },
  { key: 'strawberry-shortcake', label: 'Strawberry shortcake' },
  { key: 'rainbow-layer', label: 'Rainbow layer' },
  { key: 'cheesecake', label: 'Cheesecake' },
  { key: 'ice-cream-cake', label: 'Ice-cream cake' },
  { key: 'cupcake-tower', label: 'Cupcake tower' },
  { key: 'pixel-heart-cake', label: 'Pixel-heart cake' },
];

export type CakeTopper = 'none' | 'flowers' | 'sprinkles' | 'berries' | 'sparkler';

export const CAKE_TOPPERS: { key: CakeTopper; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'flowers', label: 'Flowers' },
  { key: 'sprinkles', label: 'Sprinkles' },
  { key: 'berries', label: 'Berries' },
  { key: 'sparkler', label: 'Sparkler' },
];

/** "count" = small candles, one per candleCount (up to 10) — the "count matching the
 * age" option. "numbers" = the age's own digits rendered as candle-numerals. */
export type CandleMode = 'count' | 'numbers' | 'sparklers' | 'none';

export const CANDLE_MODES: { key: CandleMode; label: string }[] = [
  { key: 'count', label: 'Small candles' },
  { key: 'numbers', label: 'Number candles' },
  { key: 'sparklers', label: 'Sparklers' },
  { key: 'none', label: 'None' },
];

export const CAKE_TEXT_MAX_LEN = 16;
export const CAKE_MIN_CANDLES = 1;
export const CAKE_MAX_CANDLES = 10;

/** A compact swatch set for frosting/sponge color pickers — warm/cozy palette entries plus a
 * handful of extra cake-relevant hues, matching this project's "12ish swatches" convention (see
 * the box designer). */
export const CAKE_COLOR_SWATCHES = [
  '#fff8f0',
  '#ffe3ee',
  '#ffd1e6',
  '#ffb6d1',
  '#f4a6c1',
  '#c98a4b',
  '#8a5a3c',
  '#5e3620',
  '#ffe08a',
  '#6bc06a',
  '#a6d8f4',
  '#3a1a4a',
] as const;

export type CakeConfig = {
  style: CakeStyle;
  frostingColor: string;
  spongeColor: string;
  topper: CakeTopper;
  /** Up to CAKE_TEXT_MAX_LEN characters, rendered on the cake's front plaque. Empty = no plaque. */
  text: string;
  candleMode: CandleMode;
  /** Used by candleMode 'count' (how many small candles) and 'numbers' (which number to render as
   * numeral candles) — 1-10 either way. Ignored by 'sparklers'/'none'. */
  candleCount: number;
};

export const DEFAULT_CAKE_CONFIG: CakeConfig = {
  style: 'tiered-classic',
  frostingColor: '#fff8f0',
  spongeColor: '#c98a4b',
  topper: 'none',
  text: '',
  candleMode: 'count',
  candleCount: 5,
};

/** "count matching the age (up to 10 small candles)" — clamped so an unset/huge/zero age still
 * produces a sane candle count instead of an empty or absurd cake. */
export function defaultCandleCount(age: number | null | undefined): number {
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 1) return DEFAULT_CAKE_CONFIG.candleCount;
  return Math.max(CAKE_MIN_CANDLES, Math.min(CAKE_MAX_CANDLES, Math.round(age)));
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isCakeStyle(v: unknown): v is CakeStyle {
  return typeof v === 'string' && CAKE_STYLES.some((s) => s.key === v);
}
function isCakeTopper(v: unknown): v is CakeTopper {
  return typeof v === 'string' && CAKE_TOPPERS.some((t) => t.key === v);
}
function isCandleMode(v: unknown): v is CandleMode {
  return typeof v === 'string' && CANDLE_MODES.some((m) => m.key === v);
}

/** Every RoomObject's configJson is untrusted (see scene/objectConfig.ts) — this never assumes
 * `raw` has the shape a CakeConfig expects, and always returns a fully-populated, in-range value. */
export function parseCakeConfig(raw: unknown): CakeConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const style = isCakeStyle(obj.style) ? obj.style : DEFAULT_CAKE_CONFIG.style;
  const topper = isCakeTopper(obj.topper) ? obj.topper : DEFAULT_CAKE_CONFIG.topper;
  const candleMode = isCandleMode(obj.candleMode) ? obj.candleMode : DEFAULT_CAKE_CONFIG.candleMode;
  const frostingColor = typeof obj.frostingColor === 'string' && HEX_COLOR.test(obj.frostingColor) ? obj.frostingColor : DEFAULT_CAKE_CONFIG.frostingColor;
  const spongeColor = typeof obj.spongeColor === 'string' && HEX_COLOR.test(obj.spongeColor) ? obj.spongeColor : DEFAULT_CAKE_CONFIG.spongeColor;
  const text = typeof obj.text === 'string' ? obj.text.slice(0, CAKE_TEXT_MAX_LEN) : DEFAULT_CAKE_CONFIG.text;
  const rawCount = typeof obj.candleCount === 'number' && Number.isFinite(obj.candleCount) ? obj.candleCount : DEFAULT_CAKE_CONFIG.candleCount;
  const candleCount = Math.max(CAKE_MIN_CANDLES, Math.min(CAKE_MAX_CANDLES, Math.round(rawCount)));
  return { style, frostingColor, spongeColor, topper, text, candleMode, candleCount };
}
