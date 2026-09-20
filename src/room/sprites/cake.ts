import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

/** Tall tiered cake with candles. `lit` toggles flame vs. wisp-of-smoke tips. */
export function drawCake(lit: boolean) {
  const unit = 4;
  const gridW = 36;
  const gridH = 46;
  const g = createPixelCanvas(gridW, gridH, unit);

  // tiers, bottom to top, each narrower
  const tiers = [
    { y: 30, w: gridW, h: 12 },
    { y: 18, w: gridW - 10, h: 12 },
    { y: 8, w: gridW - 20, h: 10 },
  ];
  for (const t of tiers) {
    const x = (gridW - t.w) / 2;
    g.px(x, t.y, t.w, t.h, p.cakeWhite);
    g.px(x, t.y, t.w, 2, p.cakePink);
    // drip dots
    for (let dx = 2; dx < t.w - 2; dx += 4) {
      g.px(x + dx, t.y + 2, 1.6, 2, p.cakePink);
    }
  }

  // candles on top tier
  const topX = (gridW - tiers[2].w) / 2;
  const candleXs = [topX + 3, topX + tiers[2].w / 2, topX + tiers[2].w - 4];
  for (const cx of candleXs) {
    g.px(cx, 2, 1.4, 6, p.hotPink);
    if (lit) {
      g.pcircle(cx + 0.7, 1, 1.4, p.flame);
      g.pcircle(cx + 0.7, 0.6, 0.7, p.flameCore);
    } else {
      // small smoke wisp
      g.ctx.strokeStyle = p.smoke;
      g.ctx.lineWidth = unit * 0.6;
      g.ctx.beginPath();
      g.ctx.moveTo((cx + 0.7) * unit, 1.5 * unit);
      g.ctx.quadraticCurveTo((cx + 2) * unit, 0, (cx - 0.5) * unit, -1.5 * unit);
      g.ctx.stroke();
    }
  }

  return g.canvas;
}

export function drawSmokePuff() {
  const unit = 3;
  const size = 20;
  const g = createPixelCanvas(size, size, unit);
  g.pcircle(size / 2, size / 2, 6, 'rgba(201,194,194,0.85)');
  g.pcircle(size / 2 - 3, size / 2 + 2, 4, 'rgba(201,194,194,0.7)');
  g.pcircle(size / 2 + 3, size / 2 + 1, 4, 'rgba(201,194,194,0.7)');
  return g.canvas;
}
