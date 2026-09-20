import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

// Blocky pixel-art star bitmap (7 wide x 6 tall), each cell drawn 2 grid-units chunky.
const STAR_BITMAP = [
  '0001000',
  '0011100',
  '1111111',
  '0111110',
  '0101010',
  '1001001',
];

/** A small pixel star dangling on a string, clickable for a sparkle. */
export function drawStar() {
  const unit = 3;
  const gridW = 20;
  const gridH = 30;
  const g = createPixelCanvas(gridW, gridH, unit);
  const cell = 2;

  // string
  g.px(gridW / 2 - 0.5, 0, 1, 10, p.wallWoodDark);

  const originX = (gridW - STAR_BITMAP[0].length * cell) / 2;
  const originY = 10;
  for (let row = 0; row < STAR_BITMAP.length; row++) {
    for (let col = 0; col < STAR_BITMAP[row].length; col++) {
      if (STAR_BITMAP[row][col] === '1') {
        g.px(originX + col * cell, originY + row * cell, cell, cell, p.star);
      }
    }
  }
  // bright core highlight
  g.px(originX + 5 * cell, originY + 2 * cell, cell, cell, '#fffef0');

  return g.canvas;
}

export function drawSparkle() {
  const unit = 3;
  const size = 16;
  const g = createPixelCanvas(size, size, unit);
  const cx = size / 2;
  const cy = size / 2;
  g.ctx.strokeStyle = p.star;
  g.ctx.lineWidth = unit;
  g.ctx.beginPath();
  g.ctx.moveTo(cx * unit, 0);
  g.ctx.lineTo(cx * unit, size * unit);
  g.ctx.moveTo(0, cy * unit);
  g.ctx.lineTo(size * unit, cy * unit);
  g.ctx.moveTo(1 * unit, 1 * unit);
  g.ctx.lineTo((size - 1) * unit, (size - 1) * unit);
  g.ctx.moveTo((size - 1) * unit, 1 * unit);
  g.ctx.lineTo(1 * unit, (size - 1) * unit);
  g.ctx.stroke();
  return g.canvas;
}
