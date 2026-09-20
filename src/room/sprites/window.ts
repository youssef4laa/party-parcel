import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

/** Window with night sky, moon, and a village skyline baked in. Twinkling stars are drawn separately on top so they can animate. */
export function drawWindow() {
  const unit = 4;
  const gridW = 64;
  const gridH = 56;
  const g = createPixelCanvas(gridW, gridH, unit);

  // wooden frame
  g.px(0, 0, gridW, gridH, p.frameWood);
  const innerX = 4, innerY = 4, innerW = gridW - 8, innerH = gridH - 8;

  // sky
  g.px(innerX, innerY, innerW, innerH, p.nightSky);
  g.px(innerX, innerY, innerW, innerH * 0.3, p.nightSkyDeep);

  // moon (crescent: big circle + offset cutout circle)
  g.pcircle(innerX + innerW - 12, innerY + 10, 6, p.moon);
  g.pcircle(innerX + innerW - 9, innerY + 8, 6, p.nightSky);

  // village skyline silhouette
  const baseY = innerY + innerH - 10;
  let x = innerX + 2;
  let i = 0;
  while (x < innerX + innerW - 2) {
    const w = 4 + (i % 3);
    const h = 6 + ((i * 3) % 10);
    g.px(x, baseY - h, w, h, p.village);
    // lit window in the building
    if (h > 8) g.px(x + 1, baseY - h + 3, 1, 2, p.villageLight);
    x += w + 1;
    i++;
  }

  // muntins (cross bars)
  g.px(innerX + innerW / 2 - 1, innerY, 2, innerH, p.frameWood);
  g.px(innerX, innerY + innerH / 2 - 1, innerW, 2, p.frameWood);

  // outer frame highlight
  g.pborder(0, 0, gridW, gridH, p.wallWoodDark);

  return g.canvas;
}
