import { test, expect } from '@playwright/test';
import {
  autoCrop, contentBounds, countColors, createBitmap, defaultPlacementScale, ellipsePoints, flipHorizontal,
  flipVertical, floodFill, getPixel, linePoints, pixelate, quantize, rectPoints, rotateClockwise, scaleNearest,
  scaleToWidth, setPixel, withMirror, bitmapsEqual, fitWithin, hardenAlpha, type Bitmap, type RGBA,
} from '../src/room/pixelOps';

/**
 * Room Editor Phase 3: the import pipeline and pixel editor share one pure module (pixelOps.ts), so
 * this exercises the actual functions the UI calls — no browser needed. Every assertion is on real
 * pixel data.
 */

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];

function paint(w: number, h: number, fn: (x: number, y: number) => RGBA): Bitmap {
  const b = createBitmap(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(b, x, y, fn(x, y));
  return b;
}
const colorsOf = (b: Bitmap) => {
  const s = new Set<string>();
  for (let i = 0; i < b.data.length; i += 4) s.add(`${b.data[i]},${b.data[i + 1]},${b.data[i + 2]},${b.data[i + 3]}`);
  return s;
};

test('autoCrop trims transparent margins to the exact content box, and leaves a tight image alone', () => {
  const b = createBitmap(20, 20);
  for (let y = 5; y < 9; y++) for (let x = 3; x < 12; x++) setPixel(b, x, y, RED);
  expect(contentBounds(b)).toEqual({ x: 3, y: 5, w: 9, h: 4 });
  const cropped = autoCrop(b);
  expect([cropped.width, cropped.height]).toEqual([9, 4]);
  expect(countColors(cropped)).toBe(1);
  expect(getPixel(cropped, 0, 0)).toEqual(RED);
  expect(autoCrop(cropped)).toBe(cropped); // already tight -> same object, no needless copy
  const empty = createBitmap(6, 6);
  expect(autoCrop(empty)).toBe(empty); // fully transparent -> nothing to keep, returned unchanged
});

test('scaling is strictly nearest-neighbor: no new colors are ever invented', () => {
  const src = paint(8, 8, (x, y) => ((x + y) % 2 === 0 ? RED : BLUE));
  for (const [w, h] of [[3, 3], [4, 4], [16, 16], [5, 7], [1, 1]]) {
    const out = scaleNearest(src, w, h);
    expect([out.width, out.height]).toEqual([w, h]);
    for (const c of colorsOf(out)) expect(['255,0,0,255', '0,0,255,255']).toContain(c);
  }
  // exact 2x upscale duplicates every pixel into a 2x2 block
  const up = scaleNearest(paint(2, 2, (x, y) => [x * 100, y * 100, 0, 255]), 4, 4);
  expect(getPixel(up, 0, 0)).toEqual(getPixel(up, 1, 1));
  expect(getPixel(up, 2, 0)).toEqual([100, 0, 0, 255]);
  expect(getPixel(up, 3, 3)).toEqual([100, 100, 0, 255]);
});

test('fitWithin shrinks only oversized images, keeping aspect ratio', () => {
  const big = createBitmap(1000, 500);
  const fit = fitWithin(big, 512);
  expect([fit.width, fit.height]).toEqual([512, 256]);
  const small = createBitmap(100, 50);
  expect(fitWithin(small, 512)).toBe(small);
});

test('pixelate downscales to the requested width, hardens alpha, and caps the palette at 16 or 32', () => {
  // a smooth gradient with a soft alpha edge: thousands of distinct colors
  const src = paint(256, 128, (x, y) => [x, y * 2, (x * y) % 256, x > 240 ? 90 : 255]);
  expect(countColors(src)).toBeGreaterThan(1000);

  const p16 = pixelate(src, { width: 32, colors: 16 });
  expect([p16.width, p16.height]).toEqual([32, 16]);
  expect(countColors(p16)).toBeLessThanOrEqual(16);
  const p32 = pixelate(src, { width: 64, colors: 32 });
  expect(p32.width).toBe(64);
  expect(countColors(p32)).toBeLessThanOrEqual(32);
  expect(countColors(p32)).toBeGreaterThan(16); // 32 really keeps more than 16

  for (let i = 3; i < p16.data.length; i += 4) expect([0, 255]).toContain(p16.data[i]);
  // never upscales: asking for wider than the source keeps the source width
  expect(scaleToWidth(createBitmap(20, 10), 128).width).toBe(20);
  // same input -> same output (deterministic, so the live preview never flickers between renders)
  expect(bitmapsEqual(pixelate(src, { width: 32, colors: 16 }), p16)).toBe(true);
});

test('quantize leaves transparent pixels transparent and does nothing to an image already under the limit', () => {
  const b = paint(4, 4, (x) => (x === 0 ? [0, 0, 0, 0] : x === 1 ? RED : BLUE));
  expect(quantize(b, 16)).toBe(b);
  const many = paint(16, 16, (x, y) => (x === 0 ? [0, 0, 0, 0] : [x * 16, y * 16, 128, 255]));
  const q = quantize(many, 4);
  expect(countColors(q)).toBeLessThanOrEqual(4);
  expect(getPixel(q, 0, 5)[3]).toBe(0);
  expect(getPixel(q, 5, 5)[3]).toBe(255);
});

test('hardenAlpha snaps every alpha to 0 or 255', () => {
  const b = paint(4, 1, (x) => [10, 10, 10, [0, 100, 128, 200][x]] as RGBA);
  const out = hardenAlpha(b);
  expect([0, 1, 2, 3].map((x) => getPixel(out, x, 0)[3])).toEqual([0, 0, 255, 255]);
});

test('floodFill fills only the connected region, and refuses a no-op fill', () => {
  const b = createBitmap(6, 6);
  for (let y = 0; y < 6; y++) setPixel(b, 3, y, BLUE); // a wall splitting the canvas
  expect(floodFill(b, 0, 0, RED)).toBe(true);
  expect(getPixel(b, 2, 5)).toEqual(RED);
  expect(getPixel(b, 3, 2)).toEqual(BLUE);
  expect(getPixel(b, 4, 0)).toEqual([0, 0, 0, 0]); // other side of the wall untouched
  expect(floodFill(b, 0, 0, RED)).toBe(false);
  expect(floodFill(b, -1, 0, RED)).toBe(false);
});

test('line, rectangle and ellipse produce exactly the expected cells', () => {
  expect(linePoints(0, 0, 4, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  expect(linePoints(2, 2, 2, 2)).toEqual([[2, 2]]);
  const diag = linePoints(0, 0, 3, 3);
  expect(diag).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
  // endpoints always included, regardless of direction
  const rev = linePoints(5, 1, 0, 3);
  expect(rev[0]).toEqual([5, 1]);
  expect(rev[rev.length - 1]).toEqual([0, 3]);

  expect(rectPoints(1, 1, 4, 3, true)).toHaveLength(12);
  expect(rectPoints(1, 1, 4, 3, false)).toHaveLength(10); // 4x3 minus the 2x1 hollow middle
  expect(rectPoints(4, 3, 1, 1, false)).toHaveLength(10); // corner order doesn't matter

  const filled = ellipsePoints(0, 0, 9, 9, true);
  const outline = ellipsePoints(0, 0, 9, 9, false);
  expect(filled.length).toBeGreaterThan(outline.length);
  expect(outline.length).toBeGreaterThan(20);
  // symmetric in both axes
  const key = new Set(outline.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of outline) {
    expect(key.has(`${9 - x},${y}`)).toBe(true);
    expect(key.has(`${x},${9 - y}`)).toBe(true);
  }
  // 1x1 and 2x2 ellipses still draw something (no empty-outline edge case)
  expect(ellipsePoints(3, 3, 3, 3, false)).toHaveLength(1);
  expect(ellipsePoints(0, 0, 1, 1, false).length).toBeGreaterThan(0);
});

test('mirror expands strokes around the canvas center, horizontally, vertically, or both', () => {
  const size = { width: 8, height: 8 };
  expect(withMirror([[1, 2]], size, { horizontal: false, vertical: false })).toEqual([[1, 2]]);
  expect(withMirror([[1, 2]], size, { horizontal: true, vertical: false })).toEqual([[1, 2], [6, 2]]);
  expect(withMirror([[1, 2]], size, { horizontal: false, vertical: true })).toEqual([[1, 2], [1, 5]]);
  expect(withMirror([[1, 2]], size, { horizontal: true, vertical: true })).toEqual([[1, 2], [6, 2], [1, 5], [6, 5]]);
});

test('flip and rotate are exact, and four rotations (or two flips) return the original', () => {
  const b = paint(5, 3, (x, y) => [x * 40, y * 80, (x + y) * 10, 255]);
  expect(bitmapsEqual(flipHorizontal(flipHorizontal(b)), b)).toBe(true);
  expect(bitmapsEqual(flipVertical(flipVertical(b)), b)).toBe(true);
  expect(getPixel(flipHorizontal(b), 0, 0)).toEqual(getPixel(b, 4, 0));
  expect(getPixel(flipVertical(b), 0, 0)).toEqual(getPixel(b, 0, 2));

  const r = rotateClockwise(b);
  expect([r.width, r.height]).toEqual([3, 5]); // non-square swaps
  expect(getPixel(r, 2, 0)).toEqual(getPixel(b, 0, 0)); // top-left goes to top-right
  expect(getPixel(r, 0, 4)).toEqual(getPixel(b, 4, 2)); // bottom-right goes to bottom-left
  expect(bitmapsEqual(rotateClockwise(rotateClockwise(rotateClockwise(r))), b)).toBe(true);
});

test('defaultPlacementScale keeps pixels crisp: whole numbers from 1x up, quarter steps below, clamped', () => {
  const bounds = { min: 0.25, max: 4 };
  expect(defaultPlacementScale(16, 16, bounds)).toBe(4); // 160/16 = 10 -> clamped to max
  expect(defaultPlacementScale(64, 64, bounds)).toBe(2); // 2.5 -> floor 2
  expect(defaultPlacementScale(128, 128, bounds)).toBe(1);
  expect(defaultPlacementScale(300, 300, bounds)).toBe(0.5);
  expect(defaultPlacementScale(512, 512, bounds)).toBe(0.25); // 0.3125 -> 0.25
  expect(defaultPlacementScale(4000, 4000, bounds)).toBe(0.25); // clamped to min
});
