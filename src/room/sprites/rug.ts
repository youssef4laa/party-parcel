import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

export function drawRug() {
  const unit = 5;
  const gridW = 90;
  const gridH = 26;
  const g = createPixelCanvas(gridW, gridH, unit);

  g.px(2, 2, gridW - 4, gridH - 4, p.rugBlue);
  // dotted cream border
  for (let x = 2; x < gridW - 2; x += 4) {
    g.px(x, 2, 2, 2, p.rugCream);
    g.px(x, gridH - 4, 2, 2, p.rugCream);
  }
  for (let y = 2; y < gridH - 2; y += 4) {
    g.px(2, y, 2, 2, p.rugCream);
    g.px(gridW - 4, y, 2, 2, p.rugCream);
  }
  // small heart in the center
  const cx = gridW / 2;
  const cy = gridH / 2;
  g.pcircle(cx - 2, cy - 1, 2.2, p.heart);
  g.pcircle(cx + 2, cy - 1, 2.2, p.heart);
  g.px(cx - 4, cy - 1, 8, 3, p.heart);
  g.px(cx - 3, cy + 2, 6, 1.5, p.heart);
  g.px(cx - 1.5, cy + 3.2, 3, 1.2, p.heart);

  return g.canvas;
}
