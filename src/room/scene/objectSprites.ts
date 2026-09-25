import { getTexture } from '../manifest';
import { drawNeonSignText } from '../sprites/decor';
import { drawCake } from '../sprites/cake';
import { parseCakeConfig } from '../cakeConfig';
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
  // Defensive fallback only — dynamicTextureFor/cakeTextureFor below always handles 'cake' kind
  // for real placed objects (docs/ROOM_EDITOR.md Phase 2). This key is only ever reached if a
  // future call site looks up a cake texture through manifestKeyFor directly instead.
  cake: 'cakeLit',
  // Edit mode's static representation (EditableObjectsLayer) always shows the idle pose — the
  // interactive view-mode render (buildScene.ts, via CatController) manages its own live
  // walk/sit/hop texture switching independently and never goes through this lookup.
  cat: 'cat_idle',
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
  // These five legacy kinds all draw from their own top-left origin (matching the original
  // hardcoded buildScene.ts, which never passed an anchor option for them) — their own zone's
  // default anchor (see ZONE_DEFAULT_ANCHOR below) would otherwise reposition them incorrectly.
  garland: { x: 0, y: 0 },
  table: { x: 0, y: 0 },
  chair: { x: 0, y: 0 },
  'cupcake-stand': { x: 0, y: 0 },
  vase: { x: 0, y: 0 },
  'snack-bowl': { x: 0, y: 0 },
  cups: { x: 0, y: 0 },
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
export function dynamicTextureFor(kind: string, config: Record<string, unknown>, assetId?: string | null): Texture | null {
  if (kind === 'neon-sign' && typeof config.text === 'string' && config.text.trim()) {
    const cacheKey = `neon-sign:${config.text}`;
    return getOrBuildCached(cacheKey, () => drawNeonSignText(config.text as string));
  }
  // A balloon's color is per-instance data, not a fixed manifest entry (manifestKeyFor can't
  // express it — there's one shared 'balloon' catalog key but six colored textures).
  if (kind === 'balloon') {
    const color = typeof config.color === 'string' ? config.color : 'purple';
    return getTexture(`balloon_${color}`);
  }
  // A cake's entire look (style/colors/topper/text/candles) is per-instance data — always shown
  // lit here, since edit mode's static representation never toggles (see cakeTextureFor for the
  // lit/unlit variant view mode's blow-out interaction actually swaps between).
  if (kind === 'cake') {
    return cakeTextureFor(parseCakeConfig(config), true);
  }
  // A custom item's pixels live in the room's library (a CustomItem row), fetched over the network
  // — not drawn procedurally — so this only ever returns what loadCustomTexture() already cached.
  // Null until then; RoomCanvas holds a custom object back from the scene until it's ready.
  if (kind === 'custom') {
    return assetId ? customTextureFor(assetId) : null;
  }
  return null;
}

// --- Custom items (docs/ROOM_EDITOR.md Phase 3) ---
const customTextures = new Map<string, { url: string; texture: Texture }>();

export function customTextureFor(assetId: string): Texture | null {
  return customTextures.get(assetId)?.texture ?? null;
}

/** Fetches a library item's image once per URL (the URL carries a version param that changes when
 * the pixels do, so a changed URL means "reload"). Nearest-neighbor, like every other sprite. */
export async function loadCustomTexture(assetId: string, url: string): Promise<void> {
  if (customTextures.get(assetId)?.url === url) return;
  const img = new Image();
  img.src = url;
  await img.decode();
  const texture = Texture.from(img);
  texture.source.scaleMode = 'nearest';
  customTextures.set(assetId, { url, texture });
}

export function forgetCustomTexture(assetId: string) {
  customTextures.delete(assetId);
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

/** The cake's own lit/unlit texture pair for a given config — used by both edit mode's static
 * preview (always `lit: true`, via dynamicTextureFor above) and view mode's blow-out interaction
 * (buildScene.ts/interactions/cake.ts), which needs to swap between both variants of the SAME
 * config on every tap. Cached per config+lit combination so repeated taps don't redraw the canvas. */
export function cakeTextureFor(config: ReturnType<typeof parseCakeConfig>, lit: boolean): Texture {
  const key = `cake:${JSON.stringify(config)}:${lit}`;
  return getOrBuildCached(key, () => drawCake(lit, config));
}

export { getTexture };
