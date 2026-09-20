import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { getStorageProvider } from '@/server/storage';
import { sniffMime, ALLOWED_IMAGE_TYPES } from '@/server/mimeSniff';
import { UPLOAD_KINDS, type UploadKind } from '@/server/uploadKinds';
import { shouldReencodeWithSharp, reencodeImageWithSharp } from '@/server/imageReencode';

/**
 * Phase 2 of the presigned upload dance, and the only place the bytes are actually trusted:
 * read back what landed at `key` (regardless of what the client claimed), sniff the real
 * content type, enforce the size/type allowlist again, optionally re-encode, hash, and move to
 * permanent storage. Nothing from phase 1 is trusted on its own.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; key: string }> },
) {
  const { token, key } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  if (resolved.role !== 'contribute') return jsonError(403, 'Only the contribute link can upload files.');

  if (!checkRateLimit(`upload-finalize:${clientIp(req)}:${token}`, 60, 60_000)) {
    return jsonError(429, 'Too many uploads — please slow down.');
  }

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind as UploadKind | undefined;
  const cfg = kind ? UPLOAD_KINDS[kind] : undefined;
  if (!cfg) return jsonError(400, 'Unknown upload kind.');

  const storage = getStorageProvider();
  let buffer = await storage.readUploadedObject(key);
  if (!buffer) return jsonError(400, 'No upload found for that key (it may have expired).');

  if (buffer.length > cfg.maxBytes) {
    await storage.discardUpload(key);
    return jsonError(413, `File is larger than ${Math.round(cfg.maxBytes / (1024 * 1024))} MB.`);
  }

  const mime = sniffMime(buffer);
  if (!mime || !cfg.types.includes(mime)) {
    await storage.discardUpload(key);
    return jsonError(415, 'Unsupported or unrecognized file type.');
  }

  if (ALLOWED_IMAGE_TYPES.includes(mime) && mime !== 'image/png' && shouldReencodeWithSharp()) {
    buffer = await reencodeImageWithSharp(buffer);
  }
  const finalMime = ALLOWED_IMAGE_TYPES.includes(mime) && mime !== 'image/png' ? 'image/jpeg' : mime;

  const { storageKey, sha256 } = await storage.put(buffer, finalMime);
  await storage.discardUpload(key);

  return NextResponse.json({ assetKey: storageKey, mime: finalMime, size: buffer.length, sha256 });
}
