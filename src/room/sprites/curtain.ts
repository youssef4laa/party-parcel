import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

/** Gingham curtain tied back with a bow. `side` mirrors the drape direction. */
export function drawCurtain(side: 'left' | 'right') {
  const unit = 4;
  const gridW = 22;
  const gridH = 60;
  const g = createPixelCanvas(gridW, gridH, unit);

  const drapeX = side === 'left' ? 0 : gridW - 14;
  // curtain panel, draped with a slight wave using varying width per row
  for (let y = 0; y < gridH - 14; y++) {
    const wave = Math.round(2 * Math.sin(y / 6));
    const w = 14 + wave;
    const x = side === 'left' ? drapeX : gridW - w;
    g.px(x, y, w, 1, y % 6 < 3 ? p.curtainPink : p.curtainPinkDark);
  }
  // gingham checks near the top
  for (let y = 0; y < 14; y += 4) {
    for (let x = 0; x < 14; x += 4) {
      const gx = side === 'left' ? x : gridW - 14 + x;
      g.px(gx, y, 2, 2, p.gingham);
    }
  }
  // tie-back bow where the curtain is bunched
  const bowY = gridH - 16;
  const bowX = side === 'left' ? 2 : gridW - 12;
  g.pcircle(bowX + 2, bowY + 2, 3, p.hotPink);
  g.pcircle(bowX + 7, bowY + 2, 3, p.hotPink);
  g.px(bowX + 3.5, bowY, 2, 4, p.hotPinkDark);
  // trailing tail below the tie
  g.px(bowX + 3, bowY + 3, 3, gridH - bowY - 3, p.curtainPink);

  return g.canvas;
}
