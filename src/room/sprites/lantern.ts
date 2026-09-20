import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

/** A round glowing paper lantern hanging from a string. Glow pulse is layered separately at runtime. */
export function drawLantern() {
  const unit = 4;
  const gridW = 20;
  const gridH = 26;
  const g = createPixelCanvas(gridW, gridH, unit);

  // string
  g.px(gridW / 2 - 0.5, 0, 1, 6, p.wallWoodDark);
  // cap
  g.px(gridW / 2 - 3, 6, 6, 2, p.frameWood);
  // lantern body (round)
  g.pcircle(gridW / 2, 15, 7, p.lanternPaper);
  g.pcircle(gridW / 2, 15, 5.2, p.lanternGlow);
  // paper seams
  for (let a = -1; a <= 1; a++) {
    g.px(gridW / 2 + a * 4, 8, 0.6, 14, p.lanternPaper === p.lanternPaper ? '#e8b45f' : p.lanternPaper);
  }
  // bottom tassel
  g.px(gridW / 2 - 1, 22, 2, 4, p.frameWood);

  return g.canvas;
}

/** Separate soft glow disc, tinted additive-ish, scaled/faded by the ticker for a pulsing effect. */
export function drawGlow(radiusGrid = 26) {
  const unit = 3;
  const size = radiusGrid * 2;
  const g = createPixelCanvas(size, size, unit);
  const cx = size / 2;
  for (let r = radiusGrid; r > 0; r -= 2) {
    const alpha = (1 - r / radiusGrid) * 0.5;
    g.ctx.fillStyle = `rgba(255, 230, 150, ${alpha.toFixed(3)})`;
    g.ctx.beginPath();
    g.ctx.arc(cx * unit, cx * unit, r * unit, 0, Math.PI * 2);
    g.ctx.fill();
  }
  return g.canvas;
}
