/**
 * Client-side image resize + re-encode, so production doesn't depend on a Node-only image
 * library (`sharp` can't run on edge/Workers runtimes). Re-encoding through a canvas naturally
 * drops EXIF/metadata as a side effect — the browser never round-trips it into the new blob.
 * The server still always sniffs the real bytes (never trusts this happened) and, in dev, can
 * additionally re-encode with `sharp` as a belt-and-suspenders pass — see `ENABLE_SHARP_REENCODE`.
 */
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

export async function processImageClientSide(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    // decoding failed client-side (unsupported format, corrupt file) — let the server's own
    // content-sniffing be the judge instead of blocking the upload here
    return file;
  }
}
