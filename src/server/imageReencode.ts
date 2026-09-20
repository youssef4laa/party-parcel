/**
 * `sharp` is a native Node addon and won't load on edge/Workers runtimes, so production is
 * expected to rely on the browser-side pass (`src/room/imageProcessing.ts`) instead. This stays
 * on by default for `next dev` as a belt-and-suspenders check, and off in production unless
 * explicitly forced — see ENABLE_SHARP_REENCODE in .env.example.
 */
export function shouldReencodeWithSharp(): boolean {
  const flag = process.env.ENABLE_SHARP_REENCODE;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/** Dynamically imported so environments that never set the flag never even try to load the native addon. */
export async function reencodeImageWithSharp(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(buffer).rotate().jpeg({ quality: 85 }).toBuffer();
}
