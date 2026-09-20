import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

const COLORS = [p.garlandA, p.garlandB, p.garlandC, p.garlandD];

/** A swagged garland of pastel paper triangles strung along a line, tiled repeatedly across the ceiling. */
export function drawGarland(widthGrid = 60) {
  const unit = 4;
  const gridW = widthGrid;
  const gridH = 14;
  const g = createPixelCanvas(gridW, gridH, unit);

  // sagging string: a shallow arc
  const sag = (x: number) => 2 + 6 * Math.sin((Math.PI * x) / gridW);
  for (let x = 0; x < gridW; x++) {
    g.px(x, sag(x), 1, 1, p.wallWoodDark);
  }

  let i = 0;
  for (let x = 2; x < gridW - 3; x += 5) {
    const y = sag(x);
    g.px(x, y, 3, 1, COLORS[i % COLORS.length]); // string hitch
    // pennant triangle hanging down
    const color = COLORS[(i + 1) % COLORS.length];
    for (let row = 0; row < 4; row++) {
      const w = 4 - row;
      g.px(x + row / 2, y + 1 + row, w, 1, color);
    }
    i++;
  }

  return g.canvas;
}
