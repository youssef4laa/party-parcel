import sharp from 'sharp';

/** Raw RGBA -> PNG, built with sharp so tests never depend on checked-in binary fixtures. */
export async function makePng(width: number, height: number, paint?: (x: number, y: number) => [number, number, number, number]) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint ? paint(x, y) : [255, 0, 128, 255];
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export async function makeWebp(width: number, height: number) {
  return sharp({ create: { width, height, channels: 4, background: { r: 30, g: 200, b: 90, alpha: 1 } } }).webp({ lossless: true }).toBuffer();
}

export async function makeJpeg(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } }).jpeg().toBuffer();
}

/** A small opaque square with a 4px fully-transparent margin on every side. */
export function marginedSquare(inner: number, margin: number) {
  const size = inner + margin * 2;
  return makePng(size, size, (x, y) => {
    const inside = x >= margin && x < margin + inner && y >= margin && y < margin + inner;
    return inside ? [(x * 40) % 256, (y * 40) % 256, 90, 255] : [0, 0, 0, 0];
  });
}

/** Inserts a tEXt chunk right after IHDR — the kind of metadata a raw upload can carry. */
export function withTextChunk(png: Buffer, keyword: string, text: string) {
  const body = Buffer.concat([Buffer.from(keyword + '\0' + text, 'latin1')]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const type = Buffer.from('tEXt');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, body])) >>> 0);
  const chunk = Buffer.concat([len, type, body, crc]);
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // signature + IHDR chunk
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

/** Decodes a PNG's pixels back out (for asserting what the server actually stored). */
export async function decodePng(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** A lossless WebP carrying EXIF (and XMP-free) metadata, so tests can prove it gets stripped. */
export async function makeWebpWithExif(width: number, height: number, secret: string) {
  return sharp({ create: { width, height, channels: 4, background: { r: 30, g: 200, b: 90, alpha: 1 } } })
    .webp({ lossless: true })
    .withMetadata({ exif: { IFD0: { Copyright: secret } } })
    .toBuffer();
}
