import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { generateToken, hashToken } from '@/server/tokens';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { getStorageProvider } from '@/server/storage';
import { MAX_PHOTOBOOTH_SHOTS_PER_ROOM } from '@/server/limits';
import { formatPhotoboothCaption } from '@/photobooth/caption';

/**
 * Photobooth shots aren't part of the birthday lock (section 7 never mentions them, and section
 * 3 shows the photo wall as an always-visible part of the room, like the cake or balloons) — so
 * unlike box contents, this list is available to any role, always, with a normal short-lived
 * signed URL per shot.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const storage = getStorageProvider();
  const shots = await prisma.photoboothShot.findMany({
    where: { roomId: resolved.room.id },
    orderBy: { createdAt: 'asc' },
  });

  const withUrls = await Promise.all(
    shots.map(async (s) => ({
      id: s.id,
      caption: s.caption,
      createdAt: s.createdAt,
      url: await storage.signedGetUrl(s.storageKey, 3600),
    })),
  );

  return NextResponse.json({ shots: withUrls });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  if (!checkRateLimit(`photobooth-create:${clientIp(req)}:${token}`, 20, 60_000)) {
    return jsonError(429, 'Too many uploads — please slow down.');
  }

  const body = await req.json().catch(() => null);
  const assetKey = typeof body?.assetKey === 'string' ? body.assetKey : '';
  if (!assetKey) return jsonError(400, 'assetKey is required.');

  const existingCount = await prisma.photoboothShot.count({ where: { roomId: resolved.room.id } });
  if (existingCount >= MAX_PHOTOBOOTH_SHOTS_PER_ROOM) {
    return jsonError(400, `This room already has the max of ${MAX_PHOTOBOOTH_SHOTS_PER_ROOM} photobooth shots.`);
  }

  // Confirm the asset actually landed (finalize already sniffed/validated its content) before
  // recording a row for it — a bogus/expired key just gets a 400, not a shot with no photo.
  const storage = getStorageProvider();
  const bytes = await storage.get(assetKey);
  if (!bytes) return jsonError(400, "That photo wasn't found (the upload may have expired).");

  // The caption is always server-generated, never taken from the client, per the brief's fixed
  // "HAPPY BIRTHDAY · {date} · {name}" format — nothing for a sender to type or spoof here.
  const caption = formatPhotoboothCaption(resolved.room.celebrantName);
  const deleteToken = generateToken();

  const shot = await prisma.photoboothShot.create({
    data: {
      roomId: resolved.room.id,
      storageKey: assetKey,
      caption,
      deleteTokenHash: hashToken(deleteToken),
    },
  });

  const url = await storage.signedGetUrl(assetKey, 3600);
  return NextResponse.json({ id: shot.id, url, caption, createdAt: shot.createdAt, deleteToken });
}
