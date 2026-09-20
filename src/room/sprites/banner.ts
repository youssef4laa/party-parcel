import { createPixelCanvas } from '../draw/pixelCanvas';
import { palette as p } from '../draw/palette';

const LETTER_COLORS = [p.bannerA, p.bannerB, p.bannerC, p.bannerD];

/** Multicolor pixel-lettered banner with a heart pennant at each end. Draw AFTER the pixel font has loaded. */
export function drawBanner(text: string) {
  const unit = 3;
  const charW = 8; // grid units per letter flag
  const gridW = Math.max(40, text.length * charW + 24);
  const gridH = 22;
  const g = createPixelCanvas(gridW, gridH, unit);

  // pennant string
  g.px(0, 9, gridW, 1, p.frameWood);

  // heart pennants at each end (grid units)
  const heart = (cx: number) => {
    g.pcircle(cx - 1.5, 3, 1.6, p.heart);
    g.pcircle(cx + 1.5, 3, 1.6, p.heart);
    g.px(cx - 3, 3, 6, 2.5, p.heart);
    g.px(cx - 2, 5.2, 4, 1.6, p.heart);
    g.px(cx - 1, 6.4, 2, 1, p.heart);
  };
  heart(6);
  heart(gridW - 6);

  // colorful pixel-flag letters
  const startX = 14;
  const usableW = gridW - 28;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const t = text.length <= 1 ? 0.5 : i / (text.length - 1);
    const cx = startX + t * usableW; // grid units
    const color = LETTER_COLORS[i % LETTER_COLORS.length];
    g.px(cx - 3, 1, 6, 8, color);
    if (ch.trim().length > 0) {
      g.ctx.fillStyle = p.cream;
      g.ctx.textAlign = 'center';
      g.ctx.textBaseline = 'middle';
      g.ctx.font = `${7 * unit}px "Press Start 2P", monospace`;
      g.ctx.fillText(ch.toUpperCase(), cx * unit, 5 * unit);
    }
  }

  return g.canvas;
}
