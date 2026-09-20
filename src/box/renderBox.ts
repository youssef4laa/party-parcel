import { createPixelCanvas, type PixelCtx } from '../room/draw/pixelCanvas';
import { shadesFor, type Shades } from './colorUtils';
import type { BoxDesign, BoxPattern } from './types';

type Rect = { x: number; y: number; w: number; h: number };

const GRID = 32;
const UNIT = 8;

function boxRect(shape: BoxDesign['shape']): Rect {
  switch (shape) {
    case 'tall':
      return { x: 9, y: 5, w: 12, h: 23 };
    case 'flat':
      return { x: 4, y: 15, w: 22, h: 12 };
    case 'cube':
    default:
      return { x: 5, y: 9, w: 20, h: 18 };
  }
}

function hash2(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function patternHit(pattern: BoxPattern, lx: number, ly: number): boolean {
  switch (pattern) {
    case 'solid':
      return false;
    case 'stripes':
      return lx % 4 < 2;
    case 'checker':
      return (Math.floor(lx / 3) + Math.floor(ly / 3)) % 2 === 0;
    case 'gingham':
      return lx % 5 === 0 || ly % 5 === 0;
    case 'plaid':
      return lx % 6 < 1 || ly % 6 < 1 || lx % 6 === 3 || ly % 6 === 3;
    case 'polka': {
      const dx = (lx % 5) - 2;
      const dy = (ly % 5) - 2;
      return dx * dx + dy * dy <= 1.8;
    }
    case 'stars': {
      const sx = lx % 6;
      const sy = ly % 6;
      return (sx === 2 && Math.abs(sy - 2) <= 1) || (sy === 2 && Math.abs(sx - 2) <= 1);
    }
    case 'hearts': {
      const sx = lx % 6;
      const sy = ly % 6;
      if (sy === 1 && (sx === 1 || sx === 2 || sx === 3 || sx === 4)) return true;
      if (sy === 2 && sx >= 1 && sx <= 4) return true;
      if (sy === 3 && (sx === 2 || sx === 3)) return true;
      return false;
    }
    case 'sparkle':
      return hash2(lx, ly) < 0.08;
    default:
      return false;
  }
}

function applyPattern(g: PixelCtx, rect: Rect, pattern: BoxPattern, color: string) {
  if (pattern === 'solid') return;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      if (patternHit(pattern, x, y)) {
        g.px(rect.x + x, rect.y + y, 1, 1, color);
      }
    }
  }
}

function drawRibbon(g: PixelCtx, rect: Rect, design: BoxDesign, ribbon: Shades) {
  if (design.ribbon === 'none') return;
  const vw = Math.max(3, Math.round(rect.w * 0.16));
  const vx = rect.x + Math.floor((rect.w - vw) / 2);
  g.px(vx, rect.y, vw, rect.h, ribbon.base);
  g.px(vx, rect.y, 1, rect.h, ribbon.light);
  g.px(vx + vw - 1, rect.y, 1, rect.h, ribbon.dark);

  if (design.ribbon === 'cross') {
    const hh = Math.max(3, Math.round(rect.h * 0.16));
    const hy = rect.y + Math.floor((rect.h - hh) / 2);
    g.px(rect.x, hy, rect.w, hh, ribbon.base);
    g.px(rect.x, hy, rect.w, 1, ribbon.light);
    g.px(rect.x, hy + hh - 1, rect.w, 1, ribbon.dark);
  }
}

function drawBow(g: PixelCtx, cx: number, cy: number, design: BoxDesign, ribbon: Shades) {
  if (design.bow === 'none') return;

  const loop = (r: number, dx: number) => {
    g.pcircle(cx - dx, cy, r, ribbon.base);
    g.pcircle(cx + dx, cy, r, ribbon.base);
    g.pcircle(cx - dx, cy - r * 0.3, r * 0.45, ribbon.light);
    g.pcircle(cx + dx, cy - r * 0.3, r * 0.45, ribbon.light);
  };
  const knot = (r: number) => {
    g.pcircle(cx, cy, r, ribbon.dark);
  };

  switch (design.bow) {
    case 'classic':
      loop(2.6, 2.2);
      knot(1.3);
      break;
    case 'big':
      loop(4, 3.2);
      knot(2);
      break;
    case 'double':
      loop(3.4, 2.8);
      loop(1.9, 1.5);
      knot(1.2);
      break;
    case 'ruffle':
      for (let i = -2; i <= 2; i++) {
        g.pcircle(cx + i * 1.6, cy, 1.8, ribbon.base);
      }
      knot(1);
      break;
    case 'knot':
      g.pcircle(cx, cy, 2.4, ribbon.base);
      g.pcircle(cx, cy, 1.1, ribbon.dark);
      break;
  }
}

function drawTag(g: PixelCtx, rect: Rect, design: BoxDesign) {
  if (design.tag === 'none') return;
  const startX = rect.x + rect.w - 3;
  const startY = rect.y;
  const tx = Math.min(GRID - 4, rect.x + rect.w + 3);
  const ty = Math.max(1, rect.y - 5);

  g.ctx.strokeStyle = '#8a5a35';
  g.ctx.lineWidth = 1.5;
  g.ctx.beginPath();
  g.ctx.moveTo(startX * UNIT, startY * UNIT);
  g.ctx.lineTo(tx * UNIT, ty * UNIT);
  g.ctx.stroke();

  // card backing (always visible, even against a cream page background) + an icon for the chosen shape
  const cream = '#fff6d5';
  const outline = '#8a5a35';
  const icon = '#ff3d8b';
  g.pcircle(tx, ty, 3.2, cream);
  g.ctx.strokeStyle = outline;
  g.ctx.lineWidth = 1.5;
  g.ctx.beginPath();
  g.ctx.arc(tx * UNIT, ty * UNIT, 3.2 * UNIT, 0, Math.PI * 2);
  g.ctx.stroke();

  if (design.tag === 'round') {
    g.pcircle(tx, ty, 1.1, icon);
  } else if (design.tag === 'heart') {
    g.pcircle(tx - 0.7, ty - 0.4, 0.9, icon);
    g.pcircle(tx + 0.7, ty - 0.4, 0.9, icon);
    g.px(tx - 1.5, ty - 0.4, 3, 1.3, icon);
    g.px(tx - 1, ty + 0.8, 2, 0.9, icon);
  } else if (design.tag === 'star') {
    for (let r = 0; r <= 1.5; r++) {
      g.px(tx - r, ty - 1.5 + r, r * 2, 0.5, icon);
      g.px(tx - r, ty + 1.5 - r, r * 2, 0.5, icon);
    }
    g.px(tx - 1.5, ty, 3, 0.5, icon);
  }

  if (design.tagText.trim()) {
    g.ctx.fillStyle = '#5e3620';
    g.ctx.textAlign = 'center';
    g.ctx.textBaseline = 'middle';
    g.ctx.font = `${Math.floor(UNIT * 0.75)}px "Press Start 2P", monospace`;
    const label = design.tagText.slice(0, 12);
    g.ctx.save();
    g.ctx.translate(tx * UNIT, ty * UNIT);
    g.ctx.scale(Math.min(1, 5 / Math.max(1, label.length)), 1);
    g.ctx.fillText(label, 0, 0);
    g.ctx.restore();
  }
}

function drawSticker(g: PixelCtx, rect: Rect, design: BoxDesign) {
  if (design.sticker === 'none') return;
  const cx = rect.x + rect.w - 4;
  const cy = rect.y + rect.h - 4;
  const color = '#fff6d5';
  switch (design.sticker) {
    case 'heart':
      g.pcircle(cx - 1, cy - 0.5, 1.4, color);
      g.pcircle(cx + 1, cy - 0.5, 1.4, color);
      g.px(cx - 2.4, cy - 0.5, 4.8, 2, color);
      g.px(cx - 1.6, cy + 1.2, 3.2, 1.4, color);
      break;
    case 'star':
      g.px(cx - 0.5, cy - 2.5, 1, 5, color);
      g.px(cx - 2.5, cy - 0.5, 5, 1, color);
      g.px(cx - 1.8, cy - 1.8, 3.6, 3.6, color);
      break;
    case 'sparkle':
      g.px(cx - 0.5, cy - 3, 1, 6, color);
      g.px(cx - 3, cy - 0.5, 6, 1, color);
      break;
    case 'paw':
      g.pcircle(cx, cy + 1, 1.8, color);
      g.pcircle(cx - 1.6, cy - 1.2, 0.9, color);
      g.pcircle(cx, cy - 1.8, 0.9, color);
      g.pcircle(cx + 1.6, cy - 1.2, 0.9, color);
      break;
  }
}

function drawTopper(g: PixelCtx, cx: number, topY: number, design: BoxDesign) {
  if (design.topper === 'none') return;
  switch (design.topper) {
    case 'flower':
      for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]] as const) {
        g.pcircle(cx + dx, topY + dy, 1.5, '#ff3d8b');
      }
      g.pcircle(cx, topY, 1.3, '#ffd166');
      break;
    case 'leaf':
      g.pcircle(cx, topY, 2.2, '#5a9e4a');
      g.px(cx - 0.3, topY, 0.6, 3, '#3f7a33');
      break;
    case 'candle':
      g.px(cx - 0.6, topY - 1, 1.2, 5, '#fff6d5');
      g.pcircle(cx + 0.3, topY - 2, 1.1, '#ffcb47');
      g.pcircle(cx + 0.3, topY - 2.4, 0.5, '#fff3b0');
      break;
  }
}

/**
 * Deterministic pixel-art box renderer: same `BoxDesign` (+ mode) always produces the same sprite.
 * `mode: 'open'` drops the lid/bow/topper/tag and shows a dark inset cavity, for the unwrap animation.
 */
export function renderBox(design: BoxDesign, mode: 'closed' | 'open' = 'closed'): HTMLCanvasElement {
  const g = createPixelCanvas(GRID, GRID, UNIT);
  const rect = boxRect(design.shape);
  const base = shadesFor(design.baseColor);
  const accent = shadesFor(design.accentColor);
  const ribbon = shadesFor(design.ribbonColor);
  const lidH = Math.max(3, Math.round(rect.h * 0.26));

  // body
  g.px(rect.x, rect.y, rect.w, rect.h, base.base);

  if (mode === 'closed') {
    g.px(rect.x, rect.y, rect.w, lidH, base.light);
    g.px(rect.x, rect.y + lidH, rect.w, 1, base.dark);
  } else {
    // open cavity where the lid used to be
    g.px(rect.x + 1, rect.y + 1, rect.w - 2, lidH, base.outline);
    g.px(rect.x + 1, rect.y + 1, rect.w - 2, 1, base.dark);
  }
  g.px(rect.x, rect.y, 1, rect.h, base.dark);
  g.px(rect.x, rect.y + rect.h - 1, rect.w, 1, base.dark);

  applyPattern(g, rect, design.pattern, accent.base);

  if (mode === 'closed') {
    drawRibbon(g, rect, design, ribbon);
    const bowCx = rect.x + rect.w / 2;
    const bowCy = rect.y + 1;
    drawTopper(g, bowCx, rect.y - 3.5, design);
    drawBow(g, bowCx, bowCy, design, ribbon);
    drawTag(g, rect, design);
  } else if (design.ribbon !== 'none') {
    // ribbon tails remain on the lower body once the lid/bow are gone
    const vw = Math.max(3, Math.round(rect.w * 0.16));
    const vx = rect.x + Math.floor((rect.w - vw) / 2);
    g.px(vx, rect.y + lidH + 1, vw, rect.h - lidH - 1, ribbon.base);
  }
  drawSticker(g, rect, design);

  g.pborder(rect.x, rect.y, rect.w, rect.h, base.outline);

  return g.canvas;
}
