import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { hashToken } from '@/server/tokens';
import { jsonError } from '@/server/http';
import { getStorageProvider } from '@/server/storage';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; boxId: string }> },
) {
  const { token, boxId } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const box = await prisma.box.findFirst({ where: { id: boxId, roomId: resolved.room.id }, include: { assets: true } });
  if (!box) return jsonError(404, 'Present not found.');

  if (resolved.role === 'admin') {
    // host can remove any box
  } else if (resolved.role === 'contribute') {
    const body = await req.json().catch(() => ({}));
    const deleteToken = typeof body.deleteToken === 'string' ? body.deleteToken : '';
    if (!deleteToken || hashToken(deleteToken) !== box.deleteTokenHash) {
      return jsonError(403, 'That undo link has expired.');
    }
  } else {
    return jsonError(403, 'Not allowed.');
  }

  const storage = getStorageProvider();
  await Promise.all(box.assets.map((a) => storage.delete(a.storageKey)));
  await prisma.box.delete({ where: { id: box.id } });

  return NextResponse.json({ ok: true });
}
