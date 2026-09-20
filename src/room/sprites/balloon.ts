import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

export type BalloonColor = 'purple' | 'red' | 'green' | 'yellow' | 'orange' | 'pink';

const COLOR_MAP: Record<BalloonColor, string> = {
  purple: p.balloonPurple,
  red: p.balloonRed,
  green: p.balloonGreen,
  yellow: p.balloonYellow,
  orange: p.balloonOrange,
  pink: p.balloonPink,
};

export function drawBalloon(color: BalloonColor, heart = false) {
  const unit = 4;
  const gridW = 18;
  const gridH = 34;
  const g = createPixelCanvas(gridW, gridH, unit);
  const c = COLOR_MAP[color];
  const cx = gridW / 2;

  if (heart) {
    g.pcircle(cx - 2.2, 8, 3.6, c);
    g.pcircle(cx + 2.2, 8, 3.6, c);
    g.px(cx - 5.6, 8, 11.2, 5, c);
    g.px(cx - 4.5, 13, 9, 3.4, c);
    g.px(cx - 2.5, 16, 5, 2, c);
    g.px(cx - 1, 17.6, 2, 1.6, c);
  } else {
    g.pcircle(cx, 9, 8, c);
    g.px(cx - 2, 16, 4, 2, c);
  }
  // shine highlight
  g.pcircle(cx - 3, 6, 1.6, 'rgba(255,255,255,0.6)');
  // knot + string
  g.px(cx - 0.7, 18.5, 1.4, 1.6, c);
  g.ctx.strokeStyle = '#ffffff88';
  g.ctx.lineWidth = unit * 0.5;
  g.ctx.beginPath();
  g.ctx.moveTo(cx * unit, 20 * unit);
  for (let y = 20; y < gridH; y += 2) {
    g.ctx.lineTo((cx + Math.sin(y / 2) * 1.5) * unit, y * unit);
  }
  g.ctx.stroke();

  return g.canvas;
}

export function drawBalloonPop() {
  const unit = 3;
  const size = 24;
  const g = createPixelCanvas(size, size, unit);
  const cx = size / 2;
  const colors = ['#ffffff', p.hotPink, p.bannerC, p.bannerB];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 7;
    g.pcircle(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 1.4, colors[i % colors.length]);
  }
  return g.canvas;
}
