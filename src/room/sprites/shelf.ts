import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

export function drawShelf() {
  const unit = 4;
  const gridW = 40;
  const gridH = 28;
  const g = createPixelCanvas(gridW, gridH, unit);

  // shelf board + bracket
  g.px(2, 18, gridW - 4, 2, p.frameWood);
  g.px(3, 20, 1.5, 4, p.wallWoodDark);
  g.px(gridW - 4.5, 20, 1.5, 4, p.wallWoodDark);

  // potted plant
  const potX = 6;
  g.px(potX, 12, 6, 6, '#c0703f');
  g.px(potX - 0.5, 11, 7, 1.5, '#a8592f');
  g.pcircle(potX + 3, 8, 3, p.leafGreen);
  g.pcircle(potX + 1, 6, 2.4, p.leafGreen);
  g.pcircle(potX + 5, 6.5, 2.4, p.leafGreen);

  // small lantern
  const lx = gridW - 12;
  g.px(lx + 3, 8, 0.6, 3, p.wallWoodDark);
  g.pcircle(lx + 3.2, 14, 4.2, p.lanternPaper);
  g.pcircle(lx + 3.2, 14, 2.8, p.lanternGlow);

  return g.canvas;
}
