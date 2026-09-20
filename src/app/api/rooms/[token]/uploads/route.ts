import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { getStorageProvider } from '@/server/storage';
import { UPLOAD_KINDS, type UploadKind } from '@/server/uploadKinds';

/**
 * Phase 1 of the presigned upload dance: issue a short-lived, size-bounded PUT target. The
 * browser PUTs bytes straight there (never through this route) — phase 2 is `finalize`, which
 * is the only place the bytes are actually trusted.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const body = await req.json().catch(() => null);
  const kind = body?.kind as UploadKind | undefined;
  const contentType = typeof body?.contentType === 'string' ? body.contentType : '';

  // Goodie uploads (photo/drawing/video/voice/song) are contribute-only, since only a
  // contributor packs a box. A photobooth shot isn't part of any box — it's a normal room
  // interaction like the cake or balloons, open to whoever has any link (admin/contribute/
  // celebrate), same as the rest of section 3's interaction table.
  if (resolved.role !== 'contribute' && kind !== 'photobooth') {
    return jsonError(403, 'Only the contribute link can upload files.');
  }

  if (!checkRateLimit(`upload-init:${clientIp(req)}:${token}`, 60, 60_000)) {
    return jsonError(429, 'Too many uploads — please slow down.');
  }

  const cfg = kind ? UPLOAD_KINDS[kind] : undefined;
  if (!cfg) return jsonError(400, 'Unknown upload kind.');
  if (!cfg.types.includes(contentType)) {
    return jsonError(400, `${kind} uploads must be one of: ${cfg.types.join(', ')}.`);
  }

  const storage = getStorageProvider();
  const { uploadUrl, key } = await storage.createUploadTarget({ contentType, maxBytes: cfg.maxBytes });
  return NextResponse.json({ uploadUrl, key, maxBytes: cfg.maxBytes });
}
