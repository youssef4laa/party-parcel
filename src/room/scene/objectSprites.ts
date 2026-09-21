import { getTexture } from '../manifest';
import { drawNeonSignText } from '../sprites/decor';
import { Texture } from 'pixi.js';

/** Catalog `kind` -> manifest registry key, for kinds whose sprite key differs from its catalog
 * key (mostly camelCase legacy keys vs. this project's kebab-case catalog keys — see
 * objectCatalog.ts). Kinds not listed here use their own key directly (key === manifest key). */
const MANIFEST_KEY_OVERRIDE: Record<string, string> = {
  'curtain-left': 'curtainLeft',
  'curtain-right': 'curtainRight',
  'frame-mountain': 'frameMountain',
  'frame-tulip': 'frameTulip',
  'cupcake-stand': 'cupcakeStand',
  'snack-bowl': 'snackBowl',
  cake: 'cakeLit', // Phase 1 baseline; Phase 2 renders per the object's own cake config instead
};

export function manifestKeyFor(kind: string): string {
  return MANIFEST_KEY_OVERRIDE[kind] ?? kind;
}

/** Anchor point (0-1 fraction of the sprite's own size) each kind renders from — matches what
 * the previous hardcoded scene builder used per sprite, so the default layout looks identical. */
const ANCHOR_OVERRIDE: Record<string, { x: number; y: number }> = {
  rug: { x: 0.5, y: 1 },
  camera: { x: 0.5, y: 0 },
  banner: { x: 0.5, y: 0 },
  lantern: { x: 0.5, y: 0 },
  'paper-lantern-decor': { x: 0.5, y: 0 },
};

const ZONE_DEFAULT_ANCHOR: Record<string, { x: number; y: number }> = {
  floor: { x: 0.5, y: 1 },
  wall: { x: 0, y: 0 },
  ceiling: { x: 0.5, y: 0 },
  tabletop: { x: 0.5, y: 1 },
  anywhere: { x: 0.5, y: 1 },
};

export function anchorFor(kind: string, zone: string): { x: number; y: number } {
  return ANCHOR_OVERRIDE[kind] ?? ZONE_DEFAULT_ANCHOR[zone] ?? { x: 0.5, y: 0.5 };
}

/** For kinds whose texture depends on the object's own configJson (a neon sign's custom text, a
 * balloon's color) rather than being a fixed manifest entry. Returns null for everything else,
 * meaning "use manifestKeyFor(kind) via getTexture() as normal". */
export function dynamicTextureFor(kind: string, config: Record<string, unknown>): Texture | null {
  if (kind === 'neon-sign' && typeof config.text === 'string' && config.text.trim()) {
    const cacheKey = `neon-sign:${config.text}`;
    return getOrBuildCached(cacheKey, () => drawNeonSignText(config.text as string));
  }
  return null;
}

const dynamicCache = new Map<string, Texture>();
function getOrBuildCached(key: string, draw: () => HTMLCanvasElement): Texture {
  const cached = dynamicCache.get(key);
  if (cached) return cached;
  const tex = Texture.from(draw());
  tex.source.scaleMode = 'nearest';
  dynamicCache.set(key, tex);
  return tex;
}

export { getTexture };
