import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { resolveRoomByToken } from '@/server/rooms';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { getStorageProvider } from '@/server/storage';
import { sniffMime, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, ALLOWED_AUDIO_TYPES } from '@/server/mimeSniff';
import { MAX_ASSET_BYTES } from '@/server/limits';

const ALLOWED = new Set([...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  if (resolved.role !== 'contribute') return jsonError(403, 'Only the contribute link can upload files.');

  if (!checkRateLimit(`upload:${clientIp(req)}:${token}`, 40, 60_000)) {
    return jsonError(429, 'Too many uploads — please slow down.');
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || !(file instanceof File)) return jsonError(400, 'No file provided.');
  if (file.size > MAX_ASSET_BYTES) return jsonError(400, `File is larger than ${MAX_ASSET_BYTES / (1024 * 1024)} MB.`);

  let buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buffer);
  if (!mime || !ALLOWED.has(mime)) return jsonError(415, 'Unsupported or unrecognized file type.');

  if (ALLOWED_IMAGE_TYPES.includes(mime)) {
    // re-encoding drops EXIF/metadata and normalizes format regardless of what was uploaded
    buffer = await sharp(buffer).rotate().jpeg({ quality: 85 }).toBuffer();
  }

  const storage = getStorageProvider();
  const { storageKey, sha256 } = await storage.put(buffer, mime);
  const finalMime = ALLOWED_IMAGE_TYPES.includes(mime) ? 'image/jpeg' : mime;

  return NextResponse.json({ assetKey: storageKey, mime: finalMime, size: buffer.length, sha256 });
}
