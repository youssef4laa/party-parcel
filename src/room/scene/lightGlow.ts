import { Sprite, Texture } from 'pixi.js';

/**
 * Lights cast a soft additive glow that respects z-order (docs/ROOM_EDITOR.md 1c). The glow is a
 * CHILD of its light's own node, so it inherits that node's position, scale, rotation, flip AND
 * zIndex — a lamp standing behind a sofa is drawn behind it, glow included, instead of the halo
 * floating over everything. The blend mode is additive, so it brightens what's behind it (the wall,
 * the floor) rather than covering it.
 *
 * Positions are fractions of the light's own sprite (0,0 = its top-left, 1,1 = its bottom-right, so
 * a value can sit outside it — a spotlight's pool of light lands below the lamp). `radius` is in
 * world px at scale 1.
 */
export type GlowSpec = { color: number; radius: number; fx: number; fy: number; alpha: number };

const WARM = 0xffd98e;
const LAMP = 0xffe9a8;

export const LIGHT_GLOWS: Record<string, GlowSpec[]> = {
  'string-lights': [
    { color: 0xff9ec8, radius: 46, fx: 0.16, fy: 0.55, alpha: 0.28 },
    { color: 0xffe28a, radius: 46, fx: 0.5, fy: 0.6, alpha: 0.28 },
    { color: 0x8ad4ff, radius: 46, fx: 0.84, fy: 0.55, alpha: 0.28 },
  ],
  'paper-lantern-decor': [{ color: WARM, radius: 90, fx: 0.5, fy: 0.5, alpha: 0.55 }],
  'floor-lamp': [{ color: LAMP, radius: 110, fx: 0.5, fy: 0.18, alpha: 0.5 }],
  'table-lamp': [{ color: 0xffd9a0, radius: 80, fx: 0.5, fy: 0.3, alpha: 0.5 }],
  'disco-ball': [{ color: 0xdfe6ff, radius: 80, fx: 0.5, fy: 0.5, alpha: 0.32 }],
  'neon-sign': [{ color: 0xff4fd8, radius: 120, fx: 0.5, fy: 0.5, alpha: 0.4 }],
  candles: [{ color: 0xffb347, radius: 56, fx: 0.5, fy: 0.3, alpha: 0.5 }],
  spotlight: [
    { color: 0xfff2b0, radius: 46, fx: 0.5, fy: 0.4, alpha: 0.5 },
    { color: 0xfff2b0, radius: 110, fx: 0.5, fy: 1.55, alpha: 0.24 }, // the pool of light it throws
  ],
};

export function hasGlow(kind: string): boolean {
  return kind in LIGHT_GLOWS;
}

const GLOW_TEXTURE_PX = 128;
let glowTexture: Texture | null = null;

/** One shared radial-gradient texture (white -> transparent); each glow tints and scales it. */
function getGlowTexture(): Texture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = GLOW_TEXTURE_PX;
  canvas.height = GLOW_TEXTURE_PX;
  const ctx = canvas.getContext('2d')!;
  const r = GLOW_TEXTURE_PX / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GLOW_TEXTURE_PX, GLOW_TEXTURE_PX);
  glowTexture = Texture.from(canvas); // smooth (linear) scaling on purpose — it's a soft gradient, not pixel art
  return glowTexture;
}

function place(glow: Sprite, spec: GlowSpec, sprite: Sprite) {
  glow.position.set((spec.fx - sprite.anchor.x) * sprite.width, (spec.fy - sprite.anchor.y) * sprite.height);
}

/** The glow sprites for a light, positioned in its node's local space. Empty for non-lights. */
export function buildGlows(kind: string, sprite: Sprite): Sprite[] {
  const specs = LIGHT_GLOWS[kind];
  if (!specs) return [];
  return specs.map((spec) => {
    const glow = new Sprite(getGlowTexture());
    glow.anchor.set(0.5);
    glow.tint = spec.color;
    glow.alpha = spec.alpha;
    glow.blendMode = 'add';
    glow.width = spec.radius * 2;
    glow.height = spec.radius * 2;
    glow.eventMode = 'none'; // a halo must never intercept a click meant for the object or what's behind it
    place(glow, spec, sprite);
    return glow;
  });
}

/** Re-centres a light's glows after its sprite changed size (a neon sign whose text was edited). */
export function relayoutGlows(kind: string, sprite: Sprite, glows: Sprite[]) {
  const specs = LIGHT_GLOWS[kind];
  if (!specs) return;
  glows.forEach((glow, i) => specs[i] && place(glow, specs[i], sprite));
}
