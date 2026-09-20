/**
 * Tiny helper for drawing "pixel grid" placeholder art on an offscreen canvas.
 * Every draw call snaps to a grid cell (`unit` CSS px per grid cell) so shapes
 * come out blocky/retro even though we're using plain Canvas 2D primitives
 * instead of hand-authored pixel arrays. Swap a manifest entry's `draw` for a
 * real spritesheet URL later without touching call sites.
 */

export type PixelCtx = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  gridW: number;
  gridH: number;
  unit: number;
  /** Fill a rect in grid units. */
  px: (x: number, y: number, w: number, h: number, color: string) => void;
  /** Fill a blocky circle in grid units (cx, cy, radius, all in grid cells). */
  pcircle: (cx: number, cy: number, r: number, color: string) => void;
  /** Stroke-ish outline rect (1 grid unit thick) in grid units. */
  pborder: (x: number, y: number, w: number, h: number, color: string) => void;
  /** Draw text using a loaded font, in real (unscaled) canvas pixels relative to grid origin. */
  text: (x: number, y: number, str: string, color: string, font: string, align?: CanvasTextAlign) => void;
};

export function createPixelCanvas(gridW: number, gridH: number, unit = 4): PixelCtx {
  const canvas = document.createElement('canvas');
  canvas.width = gridW * unit;
  canvas.height = gridH * unit;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const px: PixelCtx['px'] = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * unit), Math.round(y * unit), Math.round(w * unit), Math.round(h * unit));
  };

  const pcircle: PixelCtx['pcircle'] = (cx, cy, r, color) => {
    ctx.fillStyle = color;
    for (let gy = Math.floor(cy - r); gy <= Math.ceil(cy + r); gy++) {
      for (let gx = Math.floor(cx - r); gx <= Math.ceil(cx + r); gx++) {
        const dx = gx + 0.5 - cx;
        const dy = gy + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) {
          ctx.fillRect(gx * unit, gy * unit, unit, unit);
        }
      }
    }
  };

  const pborder: PixelCtx['pborder'] = (x, y, w, h, color) => {
    px(x, y, w, 1, color);
    px(x, y + h - 1, w, 1, color);
    px(x, y, 1, h, color);
    px(x + w - 1, y, 1, h, color);
  };

  const text: PixelCtx['text'] = (x, y, str, color, font, align = 'left') => {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(str, x * unit, y * unit);
  };

  return { canvas, ctx, gridW, gridH, unit, px, pcircle, pborder, text };
}
