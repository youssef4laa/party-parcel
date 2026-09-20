import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

export type CatPose = 'idle' | 'walk0' | 'walk1' | 'hop' | 'sit';

/** Ginger tabby cat, side profile, in a handful of simple poses/frames. */
export function drawCat(pose: CatPose) {
  const unit = 4;
  const gridW = 26;
  const gridH = 18;
  const g = createPixelCanvas(gridW, gridH, unit);

  const bodyY = pose === 'sit' ? 8 : pose === 'hop' ? 6 : 9;
  const legLift = pose === 'walk1' ? 1 : 0;

  // tail
  g.px(1, bodyY - 2, 2, 6, p.catOrange);
  g.px(0, bodyY - 4, 2, 3, p.catOrange);

  // body
  g.px(4, bodyY, 14, 6, p.catOrange);
  // tabby stripes
  for (let x = 6; x < 16; x += 4) {
    g.px(x, bodyY, 1.4, 6, p.catOrangeDark);
  }
  // belly
  g.px(5, bodyY + 3.5, 12, 2.5, p.catCream);

  // head
  const headX = 16;
  g.px(headX, bodyY - 4, 8, 7, p.catOrange);
  g.px(headX + 1.5, bodyY - 1, 5, 3, p.catCream);
  // ears
  g.px(headX, bodyY - 6, 2.4, 3, p.catOrange);
  g.px(headX + 5, bodyY - 6, 2.4, 3, p.catOrange);
  // face
  g.px(headX + 1.5, bodyY - 2.5, 1.2, 1.2, p.outline);
  g.px(headX + 5, bodyY - 2.5, 1.2, 1.2, p.outline);
  g.px(headX + 3.2, bodyY - 1, 1, 1, '#c9536b');

  // legs
  const legY = bodyY + 6;
  g.px(5, legY, 2, 3 - legLift, p.catOrangeDark);
  g.px(9, legY, 2, 3 + legLift, p.catOrangeDark);
  g.px(13, legY, 2, 3 - legLift, p.catOrangeDark);
  g.px(17, legY, 2, 3 + legLift, p.catOrangeDark);

  return g.canvas;
}

export function drawMeowBubble() {
  const unit = 3;
  const gridW = 30;
  const gridH = 18;
  const g = createPixelCanvas(gridW, gridH, unit);
  g.px(0, 0, gridW, gridH - 5, '#fff6d5');
  g.pborder(0, 0, gridW, gridH - 5, p.outline);
  // tail
  g.px(2, gridH - 5, 3, 4, '#fff6d5');
  g.text(gridW / 2, 3, 'meow!', p.outline, `${5 * unit}px "Press Start 2P", monospace`, 'center');
  return g.canvas;
}
