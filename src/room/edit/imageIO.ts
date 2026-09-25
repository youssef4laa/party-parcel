/**
 * Browser-only glue between files/URLs/canvases and pixelOps.ts's plain Bitmaps. Every import is
 * decoded to raw pixels and re-encoded as a fresh PNG through a canvas, which is what strips
 * EXIF/ICC/text metadata (docs/ROOM_EDITOR.md 3a: "Re-encode and strip metadata in the browser");
 * the server validates and rewrites again regardless (src/server/customItemImage.ts), so this is
 * the friendly first pass, not the security boundary.
 */
import { LIMITS } from '@/config/limits';
import { fitWithin, type Bitmap } from '../pixelOps';

export type ImportKind = 'png' | 'webp';

/** Reads the file's own leading bytes — the filename and `file.type` are user-controlled and are
 * never consulted, so a renamed .jpg or a spoofed extension is rejected the same as any wrong type. */
export async function sniffImportKind(blob: Blob): Promise<ImportKind | null> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const isPng = head.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b);
  if (isPng) return 'png';
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

export type LoadedImport = {
  bitmap: Bitmap;
  /** Set when the source was larger than the max and had to be shrunk (nearest-neighbor) to fit. */
  shrunkFrom?: { width: number; height: number };
};

/** Validates type and size, decodes to raw RGBA, and shrinks anything over the max dimensions. */
export async function loadImportFile(file: File): Promise<LoadedImport> {
  if (file.size > LIMITS.maxCustomItemBytes) {
    throw new Error(`That file is ${Math.round(file.size / 1024)} KB — the limit is ${Math.round(LIMITS.maxCustomItemBytes / 1024)} KB.`);
  }
  if (!(await sniffImportKind(file))) {
    throw new Error('Only PNG and WebP images can be imported (checked by file contents, not the name).');
  }
  const bitmap = await blobToBitmap(file);
  const fitted = fitWithin(bitmap, LIMITS.maxCustomItemPx);
  return fitted === bitmap ? { bitmap } : { bitmap: fitted, shrunkFrom: { width: bitmap.width, height: bitmap.height } };
}

function canvasFor(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function blobToBitmap(blob: Blob): Promise<Bitmap> {
  let img: ImageBitmap;
  try {
    // premultiplyAlpha:'none' keeps the RGB of semi-transparent pixels exact instead of rounding it
    // through premultiplication, which would subtly shift edge colors on every import/edit cycle.
    img = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch {
    throw new Error("That image couldn't be read — it may be corrupt.");
  }
  const canvas = canvasFor(img.width, img.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  img.close();
  return { width: canvas.width, height: canvas.height, data };
}

export async function urlToBitmap(url: string): Promise<Bitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load that item.');
  return blobToBitmap(await res.blob());
}

export function bitmapToCanvas(b: Bitmap, target?: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = target ?? canvasFor(b.width, b.height);
  canvas.width = b.width;
  canvas.height = b.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0);
  return canvas;
}

export function bitmapToPngBlob(b: Bitmap): Promise<Blob> {
  return new Promise((resolve, reject) => {
    bitmapToCanvas(b).toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), 'image/png');
  });
}
