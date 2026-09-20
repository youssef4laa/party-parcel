import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

/** Small wall-hung picture frame. `subject` picks a simple placeholder scene. */
export function drawFrame(subject: 'mountain' | 'tulip') {
  const unit = 4;
  const gridW = 22;
  const gridH = 22;
  const g = createPixelCanvas(gridW, gridH, unit);

  g.px(0, 0, gridW, gridH, p.frameWood);
  g.px(2, 2, gridW - 4, gridH - 4, '#eef3f7');

  if (subject === 'mountain') {
    g.px(2, 2, gridW - 4, gridH - 4, '#bfe3f5');
    g.px(4, gridH - 9, 6, 7, '#7a8a9a');
    g.px(9, gridH - 12, 7, 10, '#8a97a5');
    g.px(11, gridH - 12, 3, 3, '#ffffff');
    g.pcircle(gridW - 6, 5, 2.2, '#ffe27a');
    g.px(2, gridH - 4, gridW - 4, 2, '#6a9e5a');
  } else {
    g.px(2, 2, gridW - 4, gridH - 4, '#eaf3ea');
    // tulip stem + flower
    const cx = gridW / 2;
    g.px(cx - 0.5, 10, 1, 8, '#4a8a3a');
    g.pcircle(cx, 8, 3, p.hotPink);
    g.px(cx - 3, 5, 2.4, 5, p.hotPink);
    g.px(cx + 0.6, 5, 2.4, 5, p.hotPink);
    g.px(cx - 4, 16, 3, 1.5, '#4a8a3a');
    g.px(cx + 1, 17, 3, 1.5, '#4a8a3a');
  }

  g.pborder(0, 0, gridW, gridH, p.wallWoodDark);
  return g.canvas;
}
