import type { PixelCtx } from '../draw/pixelCanvas';
import { createPixelCanvas, fitPixelFont } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';
import { DEFAULT_CAKE_CONFIG, CAKE_TEXT_MAX_LEN, type CakeConfig, type CakeStyle, type CakeTopper } from '../cakeConfig';

/**
 * Cake rendering (docs/ROOM_EDITOR.md Phase 2). `drawCake(lit, config)` draws the cake exactly as
 * its RoomObject's configJson describes it — style, colors, topper, text plaque, and candles — and
 * `lit` toggles flame vs. smoke-wisp on every candle style, so blow-out/relight (scene/interactions/
 * cake.ts) works uniformly no matter which style is selected (see scene/objectSprites.ts's
 * cakeTextureFor, which rebuilds this per config+lit combination and caches the result).
 *
 * Every style shares the same body geometry (40x46 grid, unit=4, bottom-anchored — matching the
 * original single-style cake's own dimensions exactly, since every placed cake's stored x/y and
 * every test's click-point math assumes it) so candles/topper placement is uniform — only the
 * "body" (the cake itself) differs per style, each returning where its own top surface is so
 * candles/toppers land on it correctly. The canvas only grows *below* that baseline, to 58 tall,
 * when `text` is non-empty — see the plaque comment at the bottom of `drawCake`. Growing it
 * unconditionally would silently shift every cake's bottom-anchored sprite upward relative to
 * where it sits on the table, since a Sprite's anchor is a fraction of its OWN texture's height —
 * exactly the regression a real interaction test (tests/cake-blowout-styles.spec.ts) caught the
 * first time this was written with a fixed, always-58-tall canvas.
 */

const unit = 4;
const GRID_W = 40;
const GRID_H_BASE = 46;
const GRID_H_WITH_TEXT = 58;
const CX = GRID_W / 2;

type BodyResult = {
  /** Where candles plant their base — the cake's own top surface, centered. */
  candleAnchor: { x: number; y: number };
  /** How wide a spread multiple candles/sparklers can fan across before looking crowded. */
  candleSpanW: number;
  /** The topmost frosted surface, for scatter-style toppers (sprinkles/berries). */
  topRect: { x: number; y: number; w: number };
};

function tierX(w: number) {
  return CX - w / 2;
}

// --- Style bodies -----------------------------------------------------------------------------

function bodyTieredClassic(g: PixelCtx, frosting: string, sponge: string): BodyResult {
  const tiers = [
    { y: 32, w: 34, h: 14 },
    { y: 20, w: 24, h: 13 },
    { y: 8, w: 15, h: 13 },
  ];
  for (const t of tiers) {
    const x = tierX(t.w);
    g.px(x, t.y, t.w, t.h, sponge);
    g.px(x, t.y, t.w, 2, frosting);
    for (let dx = 2; dx < t.w - 2; dx += 4) g.px(x + dx, t.y + 2, 1.6, 2, frosting);
  }
  const top = tiers[2];
  return { candleAnchor: { x: CX, y: top.y }, candleSpanW: top.w - 4, topRect: { x: tierX(top.w), y: top.y, w: top.w } };
}

function bodyChocolateDrip(g: PixelCtx, frosting: string, sponge: string): BodyResult {
  const tiers = [
    { y: 24, w: 36, h: 22 },
    { y: 8, w: 22, h: 17 },
  ];
  for (const t of tiers) {
    const x = tierX(t.w);
    g.px(x, t.y, t.w, t.h, sponge);
    g.px(x, t.y, t.w, 3, frosting);
    // drips: uneven-length vertical streaks hanging from the frosting cap's lower edge
    for (let dx = 1; dx < t.w - 1; dx += 2.4) {
      const dripLen = 2 + ((dx * 7) % 5);
      g.px(x + dx, t.y + 3, 1.3, dripLen, frosting);
    }
  }
  const top = tiers[1];
  return { candleAnchor: { x: CX, y: top.y }, candleSpanW: top.w - 6, topRect: { x: tierX(top.w), y: top.y, w: top.w } };
}

function bodyStrawberryShortcake(g: PixelCtx, frosting: string, sponge: string): BodyResult {
  const tiers = [
    { y: 26, w: 34, h: 18 },
    { y: 10, w: 24, h: 15 },
  ];
  for (const t of tiers) {
    const x = tierX(t.w);
    g.px(x, t.y, t.w, t.h, sponge);
    // whipped-cream stripe through the middle of each tier
    g.px(x, t.y + t.h / 2 - 1.5, t.w, 3, frosting);
  }
  const top = tiers[1];
  const topX = tierX(top.w);
  // strawberries scattered on the very top surface
  for (let x = topX + 2; x < topX + top.w - 2; x += 4) {
    g.pcircle(x, top.y + 1.6, 1.4, p.balloonRed);
    g.px(x - 0.3, top.y + 0.3, 0.6, 1, p.leafGreen);
  }
  return { candleAnchor: { x: CX, y: top.y }, candleSpanW: top.w - 6, topRect: { x: topX, y: top.y, w: top.w } };
}

function bodyRainbowLayer(g: PixelCtx, frosting: string, sponge: string): BodyResult {
  const w = 30;
  const x = tierX(w);
  const bodyTop = 10;
  const bodyBottom = 46;
  const bandColors = ['#e6566f', '#f0954a', '#f4d35e', '#6bc06a', '#6ec6ff', '#a679d6'];
  const bandH = (bodyBottom - bodyTop) / bandColors.length;
  bandColors.forEach((color, i) => g.px(x, bodyTop + i * bandH, w, bandH + 0.5, color));
  // frosting cap on top, sponge-colored crumb trim at the base — keeps both configurable colors
  // visible even though the bands themselves are a fixed rainbow.
  g.px(x, bodyTop, w, 3, frosting);
  g.px(x, bodyBottom - 3, w, 3, sponge);
  return { candleAnchor: { x: CX, y: bodyTop }, candleSpanW: w - 6, topRect: { x, y: bodyTop, w } };
}

function bodyCheesecake(g: PixelCtx, frosting: string, sponge: string): BodyResult {
  const w = 34;
  const x = tierX(w);
  const top = 20;
  const bottom = 46;
  g.px(x, top, w, bottom - top, sponge);
  // graham-cracker crust band at the base — a fixed crust brown regardless of sponge color, since
  // "crust" is a cheesecake-defining visual, not something the sponge swatch should override.
  g.px(x, bottom - 6, w, 6, p.chairWood);
  // glossy highlight near the top
  g.px(x + 2, top + 1, w - 4, 2, frosting);
  return { candleAnchor: { x: CX, y: top }, candleSpanW: w - 8, topRect: { x, y: top, w } };
}

function bodyIceCreamCake(g: PixelCtx, frosting: string, sponge: string): BodyResult {
  // Rounded "scoop" silhouettes (circle + rectangle = a capsule), soft-serve style.
  g.pcircle(CX, 34, 14, sponge);
  g.px(CX - 14, 34, 28, 12, sponge);
  g.pcircle(CX, 16, 9, frosting);
  g.px(CX - 9, 16, 18, 8, frosting);
  // a small curling swirl peak on top, same technique as the candle smoke wisp
  g.ctx.strokeStyle = frosting;
  g.ctx.lineWidth = unit * 0.8;
  g.ctx.beginPath();
  g.ctx.moveTo(CX * unit, 9 * unit);
  g.ctx.quadraticCurveTo((CX + 3) * unit, 6 * unit, CX * unit, 4 * unit);
  g.ctx.quadraticCurveTo((CX - 2) * unit, 2.5 * unit, (CX + 1) * unit, 1 * unit);
  g.ctx.stroke();
  return { candleAnchor: { x: CX, y: 6 }, candleSpanW: 12, topRect: { x: CX - 9, y: 9, w: 18 } };
}

function bodyCupcakeTower(g: PixelCtx, frosting: string, sponge: string): BodyResult {
  const cupcake = (cx: number, baseY: number, scale: number) => {
    const wrapperW = 12 * scale;
    const wrapperH = 8 * scale;
    const swirlR = 6 * scale;
    g.px(cx - wrapperW / 2, baseY - wrapperH, wrapperW, wrapperH, sponge);
    for (let dx = -wrapperW / 2 + 1; dx < wrapperW / 2 - 1; dx += 2.4 * scale) {
      g.px(cx + dx, baseY - wrapperH, 1.2 * scale, wrapperH, p.chairWood);
    }
    g.pcircle(cx, baseY - wrapperH - swirlR * 0.55, swirlR, frosting);
    g.pcircle(cx, baseY - wrapperH - swirlR * 1.1, swirlR * 0.6, frosting);
  };
  cupcake(12, 46, 1);
  cupcake(28, 46, 1);
  cupcake(CX, 30, 1);
  return { candleAnchor: { x: CX, y: 14 }, candleSpanW: 26, topRect: { x: CX - 8, y: 18, w: 16 } };
}

function bodyPixelHeartCake(g: PixelCtx, frosting: string, sponge: string): BodyResult {
  const drawHeart = (scale: number, color: string) => {
    const r = 8 * scale;
    const lobeY = 16;
    g.ctx.fillStyle = color;
    g.ctx.beginPath();
    g.ctx.moveTo((CX - 15 * scale) * unit, lobeY * unit);
    g.ctx.lineTo(CX * unit, 44 * unit);
    g.ctx.lineTo((CX + 15 * scale) * unit, lobeY * unit);
    g.ctx.closePath();
    g.ctx.fill();
    g.pcircle(CX - 7 * scale, lobeY, r, color);
    g.pcircle(CX + 7 * scale, lobeY, r, color);
  };
  drawHeart(1, sponge);
  drawHeart(0.78, frosting);
  return { candleAnchor: { x: CX, y: 8 }, candleSpanW: 20, topRect: { x: CX - 12, y: 8, w: 24 } };
}

const BODY_BUILDERS: Record<CakeStyle, (g: PixelCtx, frosting: string, sponge: string) => BodyResult> = {
  'tiered-classic': bodyTieredClassic,
  'chocolate-drip': bodyChocolateDrip,
  'strawberry-shortcake': bodyStrawberryShortcake,
  'rainbow-layer': bodyRainbowLayer,
  cheesecake: bodyCheesecake,
  'ice-cream-cake': bodyIceCreamCake,
  'cupcake-tower': bodyCupcakeTower,
  'pixel-heart-cake': bodyPixelHeartCake,
};

// --- Candles ------------------------------------------------------------------------------------

function drawSmokeWisp(g: PixelCtx, x: number, y: number) {
  g.ctx.strokeStyle = p.smoke;
  g.ctx.lineWidth = unit * 0.6;
  g.ctx.beginPath();
  g.ctx.moveTo(x * unit, y * unit);
  g.ctx.quadraticCurveTo((x + 1.5) * unit, (y - 2) * unit, (x - 0.5) * unit, (y - 3.5) * unit);
  g.ctx.stroke();
}

function drawSmallCandles(g: PixelCtx, anchorX: number, surfaceY: number, spanW: number, count: number, lit: boolean) {
  const n = Math.max(1, Math.min(10, Math.round(count)));
  const startX = anchorX - spanW / 2;
  const step = n > 1 ? spanW / (n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const cx = n === 1 ? anchorX : startX + step * i;
    g.px(cx - 0.7, surfaceY - 6, 1.4, 6, p.hotPink);
    if (lit) {
      g.pcircle(cx + 0.2, surfaceY - 7, 1.3, p.flame);
      g.pcircle(cx + 0.2, surfaceY - 7.4, 0.65, p.flameCore);
    } else {
      drawSmokeWisp(g, cx + 0.2, surfaceY - 6);
    }
  }
}

const DIGIT_GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

function drawNumberCandles(g: PixelCtx, anchorX: number, surfaceY: number, count: number, lit: boolean) {
  const digits = String(Math.max(1, Math.min(99, Math.round(count)))).split('');
  const cell = 1.4;
  const digitW = 3 * cell;
  const digitH = 5 * cell;
  const gap = 2;
  const totalW = digits.length * digitW + (digits.length - 1) * gap;
  let x = anchorX - totalW / 2;
  for (const d of digits) {
    const glyph = DIGIT_GLYPHS[d] ?? DIGIT_GLYPHS['0'];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row][col] === '1') g.px(x + col * cell, surfaceY - digitH + row * cell, cell, cell, p.hotPink);
      }
    }
    const flameCx = x + digitW / 2;
    const flameTopY = surfaceY - digitH;
    if (lit) {
      g.pcircle(flameCx, flameTopY - 1.5, 1.2, p.flame);
      g.pcircle(flameCx, flameTopY - 1.9, 0.6, p.flameCore);
    } else {
      drawSmokeWisp(g, flameCx, flameTopY);
    }
    x += digitW + gap;
  }
}

function drawSparklerCandles(g: PixelCtx, anchorX: number, surfaceY: number, spanW: number, lit: boolean) {
  const positions = spanW > 14 ? [anchorX - spanW / 3, anchorX, anchorX + spanW / 3] : [anchorX - spanW / 4, anchorX + spanW / 4];
  for (const cx of positions) {
    g.px(cx - 0.5, surfaceY - 9, 1, 9, p.metal);
    if (lit) {
      const sparks: Array<[number, number]> = [
        [-2, -2],
        [2, -2],
        [-2.6, 0],
        [2.6, 0],
        [0, -3.4],
        [-1.2, -3.8],
        [1.2, -3.8],
      ];
      for (const [dx, dy] of sparks) g.pcircle(cx + dx, surfaceY - 9 + dy, 0.5, '#fff3b0');
      g.pcircle(cx, surfaceY - 9, 1, p.flameCore);
    } else {
      g.pcircle(cx, surfaceY - 9, 0.8, p.smoke);
    }
  }
}

// --- Topper -------------------------------------------------------------------------------------

function drawTopper(g: PixelCtx, topper: CakeTopper, anchorX: number, surfaceY: number, topRect: BodyResult['topRect']) {
  if (topper === 'none') return;
  if (topper === 'flowers') {
    const daisy = (cx: number, cy: number) => {
      for (const [dx, dy] of [
        [0, -1.6],
        [0, 1.6],
        [-1.6, 0],
        [1.6, 0],
      ] as const) {
        g.pcircle(cx + dx, cy + dy, 1, p.daisyWhite);
      }
      g.pcircle(cx, cy, 1, p.daisyCenter);
    };
    daisy(anchorX - topRect.w / 3, topRect.y + 2);
    daisy(anchorX + topRect.w / 3, topRect.y + 3);
    return;
  }
  if (topper === 'sprinkles') {
    const colors = [p.hotPink, p.bannerB, p.bannerC, p.bannerD, '#ffffff'];
    let i = 0;
    for (let x = topRect.x + 1; x < topRect.x + topRect.w - 1; x += 2.3) {
      const y = topRect.y + 1 + (i % 3) * 1.2;
      g.px(x, y, 1, 0.8, colors[i % colors.length]);
      i++;
    }
    return;
  }
  if (topper === 'berries') {
    let i = 0;
    for (let x = topRect.x + 2; x < topRect.x + topRect.w - 2; x += 3.5) {
      g.pcircle(x, topRect.y + 2 + (i % 2) * 1.2, 1.3, p.balloonRed);
      i++;
    }
    return;
  }
  if (topper === 'sparkler') {
    const cx = anchorX;
    const topY = surfaceY - 14;
    g.px(cx - 0.5, topY, 1, 10, p.metal);
    const sparks: Array<[number, number]> = [
      [0, -3],
      [2.2, -1.6],
      [-2.2, -1.6],
      [2.6, 0.8],
      [-2.6, 0.8],
      [1.4, 2.6],
      [-1.4, 2.6],
    ];
    for (const [dx, dy] of sparks) g.pcircle(cx + dx, topY + dy, 0.6, '#fff3b0');
    g.pcircle(cx, topY, 1.1, p.flameCore);
  }
}

// --- Public API -----------------------------------------------------------------------------------

/** `lit` toggles flame vs. wisp-of-smoke on every candle style. `config` defaults to the plain
 * baseline look — used by the manifest's `cakeLit`/`cakeUnlit` catalog-preview entries (see
 * manifest.ts) — real placed cakes always pass their own parsed configJson (see
 * scene/objectSprites.ts's cakeTextureFor). */
export function drawCake(lit: boolean, config: CakeConfig = DEFAULT_CAKE_CONFIG): HTMLCanvasElement {
  const hasText = Boolean(config.text.trim());
  const g = createPixelCanvas(GRID_W, hasText ? GRID_H_WITH_TEXT : GRID_H_BASE, unit);
  const build = BODY_BUILDERS[config.style] ?? bodyTieredClassic;
  const built = build(g, config.frostingColor, config.spongeColor);

  drawTopper(g, config.topper, built.candleAnchor.x, built.candleAnchor.y, built.topRect);

  if (config.candleMode === 'count') {
    drawSmallCandles(g, built.candleAnchor.x, built.candleAnchor.y, built.candleSpanW, config.candleCount, lit);
  } else if (config.candleMode === 'numbers') {
    drawNumberCandles(g, built.candleAnchor.x, built.candleAnchor.y, config.candleCount, lit);
  } else if (config.candleMode === 'sparklers') {
    drawSparklerCandles(g, built.candleAnchor.x, built.candleAnchor.y, built.candleSpanW, lit);
  }

  if (hasText) {
    const plaqueY = 48;
    g.px(2, plaqueY, GRID_W - 4, 8, p.cream);
    g.pborder(2, plaqueY, GRID_W - 4, 8, p.outline);
    const words = config.text.slice(0, CAKE_TEXT_MAX_LEN).toUpperCase();
    // Sized to the plaque (36 x 8 art pixels): 16 characters still fit at an 8px glyph, a short
    // word gets bigger. It used to be a fixed 3px font, too small to read at any length.
    const fs = fitPixelFont(words.length, (GRID_W - 6) * unit, 5 * unit);
    g.text(CX, plaqueY + (8 * unit - fs) / 2 / unit, words, p.hotPinkDark, `${fs}px "Press Start 2P", monospace`, 'center');
  }

  return g.canvas;
}

export function drawSmokePuff() {
  const gUnit = 3;
  const size = 20;
  const g = createPixelCanvas(size, size, gUnit);
  g.pcircle(size / 2, size / 2, 6, 'rgba(201,194,194,0.85)');
  g.pcircle(size / 2 - 3, size / 2 + 2, 4, 'rgba(201,194,194,0.7)');
  g.pcircle(size / 2 + 3, size / 2 + 1, 4, 'rgba(201,194,194,0.7)');
  return g.canvas;
}
