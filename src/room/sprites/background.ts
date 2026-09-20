import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';
import { ROOM_WIDTH, ROOM_HEIGHT, WAINSCOT_TOP, FLOOR_TOP } from '../constants';

/** The static back wall + wainscot + floor plank canvas. Everything else is a separate sprite on top. */
export function drawBackground() {
  const unit = 4;
  const gridW = Math.ceil(ROOM_WIDTH / unit);
  const gridH = Math.ceil(ROOM_HEIGHT / unit);
  const g = createPixelCanvas(gridW, gridH, unit);
  const wainscotG = WAINSCOT_TOP / unit;
  const floorG = FLOOR_TOP / unit;

  // Plaster upper wall
  g.px(0, 0, gridW, wainscotG, p.wallPlaster);
  // subtle plaster shading bands
  for (let x = 0; x < gridW; x += 40) {
    g.px(x, 0, 2, wainscotG, p.wallPlasterShade);
  }

  // Wood wainscot band
  g.px(0, wainscotG, gridW, floorG - wainscotG, p.wallWood);
  // wainscot plank seams
  for (let x = 0; x < gridW; x += 18) {
    g.px(x, wainscotG, 1, floorG - wainscotG, p.wallWoodDark);
  }
  // wainscot cap rail
  g.px(0, wainscotG - 3, gridW, 3, p.wallWoodLight);
  // skirting board at the floor line
  g.px(0, floorG - 4, gridW, 4, p.wallWoodDark);

  // Floor planks
  g.px(0, floorG, gridW, gridH - floorG, p.floorPlank);
  for (let x = 0; x < gridW; x += 22) {
    g.px(x, floorG, 1, gridH - floorG, p.floorPlankDark);
  }
  for (let y = floorG; y < gridH; y += 10) {
    g.px(0, y, gridW, 1, p.floorPlankLight);
  }

  return g.canvas;
}
