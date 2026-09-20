import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

/** Retro camera on a tripod with a ring light — the future photobooth trigger (static prop for now). */
export function drawCamera() {
  const unit = 4;
  const gridW = 26;
  const gridH = 40;
  const g = createPixelCanvas(gridW, gridH, unit);

  const cx = gridW / 2;
  // ring light behind the camera
  g.ctx.strokeStyle = '#ffe9a8';
  g.ctx.lineWidth = unit * 1.4;
  g.ctx.beginPath();
  g.ctx.arc(cx * unit, 10 * unit, 8 * unit, 0, Math.PI * 2);
  g.ctx.stroke();

  // camera body
  g.px(cx - 6, 7, 12, 8, '#e2712f');
  g.px(cx - 6, 6, 12, 1.5, '#c95c1f');
  g.pcircle(cx, 11, 3.4, '#3a3a3a');
  g.pcircle(cx, 11, 2, '#7fd0e0');
  g.px(cx + 3, 8, 2, 1.5, '#ffd166');

  // tripod column
  g.px(cx - 1, 15, 2, 12, p.metalDark);
  // tripod legs
  g.px(cx - 1, 26, 1.4, 12, p.metal);
  g.px(cx + 1, 26, 1.4, 12, p.metal);
  const legSpread = 7;
  g.px(cx - legSpread, 26, 1.4, 12, p.metal);
  g.px(cx + legSpread - 1, 26, 1.4, 12, p.metal);

  return g.canvas;
}
