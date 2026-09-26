/**
 * Server-side validation for Room Editor custom items: PNG and WebP
 * only, sniffed from magic bytes (never the filename or the client's Content-Type), with the real
 * pixel dimensions read from the file's own header. Pure functions over a Buffer — no Prisma, no
 * storage — so tests can exercise the exact bytes-in/verdict-out logic directly.
 *
 * The browser already re-encodes every import through a canvas (which strips all metadata) before
 * upload, but a client that skips that step can still send a raw file, so PNGs are also rewritten
 * here down to their critical chunks; that's cheap and deterministic. WebP has no cheap equivalent
 * without a native decoder (`sharp` isn't available on every runtime this app targets — see
 * imageReencode.ts), but a WebP is a RIFF container, so its EXIF / XMP / ICC-profile chunks can be
 * dropped by rewriting the container without touching the (still-compressed) image data.
 */
import { LIMITS } from '@/config/limits';

export type CustomItemMime = 'image/png' | 'image/webp';

export type CustomItemVerdict =
  | { ok: true; mime: CustomItemMime; width: number; height: number; bytes: Buffer }
  | { ok: false; status: 413 | 415 | 400; error: string };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Chunks a PNG needs to render at all; everything else (tEXt, iTXt, zTXt, eXIf, tIME, pHYs, ...) is
// ancillary metadata and gets dropped. tRNS carries transparency for palette/greyscale images, so
// it MUST stay; gAMA/cHRM/sRGB/iCCP affect color, but a pixel-art sticker drawn on a canvas has
// none of them, and dropping iCCP also removes an embedded-profile fingerprinting vector.
const KEEP_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

function tooBig(width: number, height: number): boolean {
  return width > LIMITS.maxCustomItemPx || height > LIMITS.maxCustomItemPx;
}

function readPng(buf: Buffer): CustomItemVerdict {
  if (buf.length < 33) return { ok: false, status: 415, error: 'That file is not a valid PNG.' };
  const kept: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawIhdr = false;
  let sawIdat = false;
  let sawIend = false;

  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('latin1');
    const end = offset + 12 + length;
    if (end > buf.length) return { ok: false, status: 415, error: 'That PNG is truncated or corrupt.' };

    if (!sawIhdr) {
      if (type !== 'IHDR' || length !== 13) return { ok: false, status: 415, error: 'That PNG is corrupt.' };
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
      sawIhdr = true;
      if (width < 1 || height < 1) return { ok: false, status: 415, error: 'That PNG has no pixels.' };
      if (tooBig(width, height)) {
        return {
          ok: false,
          status: 413,
          error: `Images can be at most ${LIMITS.maxCustomItemPx}×${LIMITS.maxCustomItemPx} pixels (this one is ${width}×${height}).`,
        };
      }
    }
    if (type === 'IDAT') sawIdat = true;
    if (KEEP_CHUNKS.has(type)) kept.push(buf.subarray(offset, end));
    offset = end;
    if (type === 'IEND') {
      sawIend = true;
      break; // anything after IEND is trailing junk (a classic place to smuggle a payload) — drop it
    }
  }

  if (!sawIhdr || !sawIdat || !sawIend) return { ok: false, status: 415, error: 'That PNG is incomplete or corrupt.' };
  return { ok: true, mime: 'image/png', width, height, bytes: Buffer.concat(kept) };
}

// VP8X feature-flag bits (WebP container spec): ICC profile, alpha, EXIF, XMP, animation.
const VP8X_ICC = 0x20;
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;
const VP8X_ANIMATION = 0x02;
const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ', 'ICCP']);

/** Rewrites a WebP without its metadata chunks (and without anything trailing the RIFF payload),
 * fixing the RIFF size and the VP8X flags to match. Returns null if the container is malformed. */
function stripWebpMetadata(buf: Buffer): Buffer | null {
  const riffEnd = 8 + buf.readUInt32LE(4);
  const parts: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= riffEnd) {
    const type = buf.subarray(offset, offset + 4).toString('latin1');
    const size = buf.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size & 1); // chunks are padded to an even length
    if (end > buf.length) return null;
    offset = end;
    if (WEBP_METADATA_CHUNKS.has(type)) continue;
    let chunk = buf.subarray(end - (8 + size + (size & 1)), end);
    if (type === 'VP8X') {
      chunk = Buffer.from(chunk);
      chunk[8] &= ~(VP8X_ICC | VP8X_EXIF | VP8X_XMP);
    }
    parts.push(chunk);
  }
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...parts]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function readWebp(buf: Buffer): CustomItemVerdict {
  // RIFF <size> WEBP <fourcc> ...
  const riffSize = buf.readUInt32LE(4);
  if (buf.length < 30 || riffSize + 8 > buf.length) {
    return { ok: false, status: 415, error: 'That WebP is truncated or corrupt.' };
  }
  const fourcc = buf.subarray(12, 16).toString('latin1');
  let width: number;
  let height: number;

  if (fourcc === 'VP8X') {
    if (buf[20] & VP8X_ANIMATION) return { ok: false, status: 415, error: "Animated WebP isn't supported — use a still image." };
    // 24-bit little-endian (canvas width - 1) and (canvas height - 1)
    width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
  } else if (fourcc === 'VP8L') {
    if (buf[20] !== 0x2f) return { ok: false, status: 415, error: 'That WebP is corrupt.' };
    const bits = buf.readUInt32LE(21);
    width = 1 + (bits & 0x3fff);
    height = 1 + ((bits >> 14) & 0x3fff);
  } else if (fourcc === 'VP8 ') {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) {
      return { ok: false, status: 415, error: 'That WebP is corrupt.' };
    }
    width = buf.readUInt16LE(26) & 0x3fff;
    height = buf.readUInt16LE(28) & 0x3fff;
  } else {
    return { ok: false, status: 415, error: 'That WebP is corrupt.' };
  }

  if (width < 1 || height < 1) return { ok: false, status: 415, error: 'That WebP has no pixels.' };
  if (tooBig(width, height)) {
    return {
      ok: false,
      status: 413,
      error: `Images can be at most ${LIMITS.maxCustomItemPx}×${LIMITS.maxCustomItemPx} pixels (this one is ${width}×${height}).`,
    };
  }
  const stripped = stripWebpMetadata(buf);
  if (!stripped) return { ok: false, status: 415, error: 'That WebP is truncated or corrupt.' };
  return { ok: true, mime: 'image/webp', width, height, bytes: stripped };
}

/** The whole verdict for an uploaded custom-item image: size, real type, real dimensions. */
export function validateCustomItemImage(buf: Buffer): CustomItemVerdict {
  if (buf.length === 0) return { ok: false, status: 400, error: 'No file was sent.' };
  if (buf.length > LIMITS.maxCustomItemBytes) {
    return {
      ok: false,
      status: 413,
      error: `Images can be at most ${Math.round(LIMITS.maxCustomItemBytes / 1024)} KB.`,
    };
  }
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return readPng(buf);
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return readWebp(buf);
  }
  return { ok: false, status: 415, error: 'Only PNG and WebP images can be imported.' };
}
