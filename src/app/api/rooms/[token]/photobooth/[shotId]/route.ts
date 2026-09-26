import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { hashToken } from '@/server/tokens';
import { jsonError } from '@/server/http';
import { getStorageProvider } from '@/server/storage';

/** "Shot owners can delete their own shot" — the delete token itself is the authorization, the
 * same no-accounts pattern a box's contributor delete token uses. Any role holding the right
 * token can delete; there's no separate host-moderation override here (a "Report" control
 * exists only for boxes, not photobooth shots). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; shotId: string }> },
) {
  const { token, shotId } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const shot = await prisma.photoboothShot.findFirst({ where: { id: shotId, roomId: resolved.room.id } });
  if (!shot) return jsonError(404, 'Shot not found.');

  const body = await req.json().catch(() => ({}));
  const deleteToken = typeof body?.deleteToken === 'string' ? body.deleteToken : '';
  if (!deleteToken || hashToken(deleteToken) !== shot.deleteTokenHash) {
    return jsonError(403, "That's not your shot to delete.");
  }

  await getStorageProvider().delete(shot.storageKey);
  await prisma.photoboothShot.delete({ where: { id: shot.id } });

  return NextResponse.json({ ok: true });
}
