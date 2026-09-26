/**
 * Pure pixel-art operations for the Room Editor's import + draw tools. Everything here works on a
 * plain `Bitmap` ({width, height, RGBA data}) — no canvas, no
 * DOM — so the import pipeline and pixel editor share one tested implementation and the specs can
 * import it straight into Node. Scaling is ALWAYS nearest-neighbor (never bilinear).
 */
export type Bitmap = { width: number; height: number; data: Uint8ClampedArray };

export function createBitmap(width: number, height: number): Bitmap {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneBitmap(b: Bitmap): Bitmap {
  return { width: b.width, height: b.height, data: new Uint8ClampedArray(b.data) };
}

export type RGBA = [number, number, number, number];

export function getPixel(b: Bitmap, x: number, y: number): RGBA {
  const i = (y * b.width + x) * 4;
  return [b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]];
}

export function setPixel(b: Bitmap, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return;
  const i = (y * b.width + x) * 4;
  b.data[i] = c[0];
  b.data[i + 1] = c[1];
  b.data[i + 2] = c[2];
  b.data[i + 3] = c[3];
}

export const TRANSPARENT: RGBA = [0, 0, 0, 0];

export function hexToRgba(hex: string): RGBA {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbaToHex(c: RGBA): string {
  return '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const sameColor = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

// --- Import pipeline ---

/** Smallest rectangle containing every pixel with any opacity, or null if fully transparent. */
export function contentBounds(b: Bitmap, alphaThreshold = 1): { x: number; y: number; w: number; h: number } | null {
  let minX = b.width;
  let minY = b.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      if (b.data[(y * b.width + x) * 4 + 3] >= alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function cropBitmap(b: Bitmap, x: number, y: number, w: number, h: number): Bitmap {
  const out = createBitmap(w, h);
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * b.width + x) * 4;
    out.data.set(b.data.subarray(srcStart, srcStart + w * 4), row * w * 4);
  }
  return out;
}

/** Trims fully-transparent margins. A wholly transparent image is returned unchanged (nothing to keep). */
export function autoCrop(b: Bitmap): Bitmap {
  const bounds = contentBounds(b);
  if (!bounds) return b;
  if (bounds.x === 0 && bounds.y === 0 && bounds.w === b.width && bounds.h === b.height) return b;
  return cropBitmap(b, bounds.x, bounds.y, bounds.w, bounds.h);
}

/** Nearest-neighbor resample to an exact size. Each destination pixel samples the CENTER of its
 * source footprint, so a 2x downscale picks a real source pixel rather than drifting to an edge. */
export function scaleNearest(b: Bitmap, width: number, height: number): Bitmap {
  const out = createBitmap(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(b.height - 1, Math.floor(((y + 0.5) * b.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(b.width - 1, Math.floor(((x + 0.5) * b.width) / width));
      const si = (sy * b.width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = b.data[si];
      out.data[di + 1] = b.data[si + 1];
      out.data[di + 2] = b.data[si + 2];
      out.data[di + 3] = b.data[si + 3];
    }
  }
  return out;
}

/** Downscales to `targetWidth` (height follows the aspect ratio, at least 1px). Never upscales. */
export function scaleToWidth(b: Bitmap, targetWidth: number): Bitmap {
  const w = Math.max(1, Math.min(targetWidth, b.width));
  const h = Math.max(1, Math.round((b.height * w) / b.width));
  return w === b.width && h === b.height ? b : scaleNearest(b, w, h);
}

/** Shrinks (nearest-neighbor) so neither side exceeds `max`, keeping the aspect ratio. */
export function fitWithin(b: Bitmap, max: number): Bitmap {
  if (b.width <= max && b.height <= max) return b;
  const ratio = max / Math.max(b.width, b.height);
  return scaleNearest(b, Math.max(1, Math.round(b.width * ratio)), Math.max(1, Math.round(b.height * ratio)));
}

/** Semi-transparent pixels don't exist in pixel art — snap alpha to fully on or fully off. */
export function hardenAlpha(b: Bitmap, threshold = 128): Bitmap {
  const out = cloneBitmap(b);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = out.data[i] >= threshold ? 255 : 0;
  return out;
}

/**
 * Reduces an image to at most `colors` colors with median cut, then remaps every opaque pixel to
 * its nearest palette entry. Transparent pixels stay transparent and don't take a palette slot.
 * Deterministic (no randomness), so the same input always gives the same live preview.
 */
export function quantize(b: Bitmap, colors: number): Bitmap {
  const pixels: RGBA[] = [];
  for (let i = 0; i < b.data.length; i += 4) {
    if (b.data[i + 3] > 0) pixels.push([b.data[i], b.data[i + 1], b.data[i + 2], 255]);
  }
  if (pixels.length === 0) return b;

  // Fold identical colors together first so a flat-color sprite doesn't waste palette slots.
  const counts = new Map<number, { c: RGBA; n: number }>();
  for (const p of pixels) {
    const key = (p[0] << 16) | (p[1] << 8) | p[2];
    const hit = counts.get(key);
    if (hit) hit.n++;
    else counts.set(key, { c: p, n: 1 });
  }
  if (counts.size <= colors) return b;

  type Box = { items: { c: RGBA; n: number }[] };
  const boxes: Box[] = [{ items: [...counts.values()] }];
  const range = (box: Box, ch: 0 | 1 | 2) => {
    let lo = 255;
    let hi = 0;
    for (const it of box.items) {
      lo = Math.min(lo, it.c[ch]);
      hi = Math.max(hi, it.c[ch]);
    }
    return hi - lo;
  };
  while (boxes.length < colors) {
    // split the box with the widest single-channel spread that still has more than one color
    let best = -1;
    let bestRange = 0;
    let bestCh: 0 | 1 | 2 = 0;
    boxes.forEach((box, idx) => {
      if (box.items.length < 2) return;
      for (const ch of [0, 1, 2] as const) {
        const r = range(box, ch);
        if (r > bestRange) {
          bestRange = r;
          best = idx;
          bestCh = ch;
        }
      }
    });
    if (best < 0) break;
    const box = boxes[best];
    box.items.sort((a, b2) => a.c[bestCh] - b2.c[bestCh] || a.c[0] - b2.c[0] || a.c[1] - b2.c[1] || a.c[2] - b2.c[2]);
    const total = box.items.reduce((s, it) => s + it.n, 0);
    let acc = 0;
    let splitAt = 1;
    for (let i = 0; i < box.items.length - 1; i++) {
      acc += box.items[i].n;
      splitAt = i + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(best, 1, { items: box.items.slice(0, splitAt) }, { items: box.items.slice(splitAt) });
  }

  const palette: RGBA[] = boxes.map((box) => {
    let r = 0;
    let g = 0;
    let bl = 0;
    let n = 0;
    for (const it of box.items) {
      r += it.c[0] * it.n;
      g += it.c[1] * it.n;
      bl += it.c[2] * it.n;
      n += it.n;
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n), 255];
  });

  const out = cloneBitmap(b);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const dr = out.data[i] - palette[p][0];
      const dg = out.data[i + 1] - palette[p][1];
      const db = out.data[i + 2] - palette[p][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = p;
      }
    }
    out.data[i] = palette[bestIdx][0];
    out.data[i + 1] = palette[bestIdx][1];
    out.data[i + 2] = palette[bestIdx][2];
    out.data[i + 3] = 255;
  }
  return out;
}

export function countColors(b: Bitmap): number {
  const seen = new Set<number>();
  for (let i = 0; i < b.data.length; i += 4) {
    if (b.data[i + 3] > 0) seen.add((b.data[i] << 16) | (b.data[i + 1] << 8) | b.data[i + 2]);
  }
  return seen.size;
}

export type PixelateOptions = { width: number; colors: 0 | 16 | 32 };

/** The "Pixelate to match room" tool: nearest-neighbor downscale to `width` (16-128px), harden
 * alpha, and optionally quantize to a 16- or 32-color palette. `colors: 0` means keep all colors. */
export function pixelate(b: Bitmap, opts: PixelateOptions): Bitmap {
  let out = hardenAlpha(scaleToWidth(b, opts.width));
  if (opts.colors) out = quantize(out, opts.colors);
  return out;
}

// --- Drawing tools ---

export function floodFill(b: Bitmap, x: number, y: number, color: RGBA): boolean {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return false;
  const target = getPixel(b, x, y);
  if (sameColor(target, color)) return false;
  const stack: number[] = [x, y];
  while (stack.length) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= b.width || cy >= b.height) continue;
    if (!sameColor(getPixel(b, cx, cy), target)) continue;
    setPixel(b, cx, cy, color);
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
  return true;
}

/** Bresenham — every pixel of the line, endpoints included, no anti-aliasing. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** Rectangle outline (or filled) spanning the two corner cells, inclusive. */
export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): [number, number][] {
  const lx = Math.min(x0, x1);
  const hx = Math.max(x0, x1);
  const ly = Math.min(y0, y1);
  const hy = Math.max(y0, y1);
  const pts: [number, number][] = [];
  for (let y = ly; y <= hy; y++) {
    for (let x = lx; x <= hx; x++) {
      if (filled || x === lx || x === hx || y === ly || y === hy) pts.push([x, y]);
    }
  }
  return pts;
}

/** Ellipse inscribed in the two corner cells' bounding box, as a 1px outline (or filled). Uses a
 * per-cell "inside the ellipse" test so the outline has no gaps at any size, including 1-2px wide. */
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): [number, number][] {
  const lx = Math.min(x0, x1);
  const hx = Math.max(x0, x1);
  const ly = Math.min(y0, y1);
  const hy = Math.max(y0, y1);
  const cx = (lx + hx) / 2;
  const cy = (ly + hy) / 2;
  const rx = (hx - lx + 1) / 2;
  const ry = (hy - ly + 1) / 2;
  const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const pts: [number, number][] = [];
  for (let y = ly; y <= hy; y++) {
    for (let x = lx; x <= hx; x++) {
      if (!inside(x, y)) continue;
      // An outline cell is an inside cell with at least one 4-neighbor outside the ellipse.
      if (filled || !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1)) pts.push([x, y]);
    }
  }
  return pts;
}

export type MirrorMode = { horizontal: boolean; vertical: boolean };

/** Expands a set of drawn cells into their mirror images around the canvas center. */
export function withMirror(pts: [number, number][], size: { width: number; height: number }, mirror: MirrorMode): [number, number][] {
  if (!mirror.horizontal && !mirror.vertical) return pts;
  const out: [number, number][] = [];
  for (const [x, y] of pts) {
    out.push([x, y]);
    if (mirror.horizontal) out.push([size.width - 1 - x, y]);
    if (mirror.vertical) out.push([x, size.height - 1 - y]);
    if (mirror.horizontal && mirror.vertical) out.push([size.width - 1 - x, size.height - 1 - y]);
  }
  return out;
}

export function flipHorizontal(b: Bitmap): Bitmap {
  const out = createBitmap(b.width, b.height);
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) setPixel(out, b.width - 1 - x, y, getPixel(b, x, y));
  return out;
}

export function flipVertical(b: Bitmap): Bitmap {
  const out = createBitmap(b.width, b.height);
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) setPixel(out, x, b.height - 1 - y, getPixel(b, x, y));
  return out;
}

/** 90° clockwise. Width and height swap (a non-square imported image stays non-square). */
export function rotateClockwise(b: Bitmap): Bitmap {
  const out = createBitmap(b.height, b.width);
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) setPixel(out, b.height - 1 - y, x, getPixel(b, x, y));
  return out;
}

export function bitmapsEqual(a: Bitmap, b: Bitmap): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

/** Distinct opaque colors used, most-frequent first — feeds the editor's "colors in this image". */
export function usedColors(b: Bitmap, limit = 16): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < b.data.length; i += 4) {
    if (b.data[i + 3] === 0) continue;
    const hex = rgbaToHex([b.data[i], b.data[i + 1], b.data[i + 2], 255]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, limit).map(([hex]) => hex);
}

/**
 * A sensible first scale for a freshly placed custom item: about `targetPx` world pixels on its
 * long side, snapped to a whole number when it's 1x or bigger (so pixels stay crisp — the room's
 * own sprites are drawn at 4 world px per art pixel) and to quarter steps below that. Clamped to
 * the room's allowed object scale range.
 */
export function defaultPlacementScale(width: number, height: number, bounds: { min: number; max: number }, targetPx = 160): number {
  const raw = targetPx / Math.max(width, height);
  const snapped = raw >= 1 ? Math.floor(raw) : Math.round(raw * 4) / 4;
  return Math.min(bounds.max, Math.max(bounds.min, snapped));
}
