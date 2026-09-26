import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { hashToken } from '@/server/tokens';
import { jsonError } from '@/server/http';
import { getStorageProvider } from '@/server/storage';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { canMovePresent, parsePermissions } from '@/server/permissions';
import { UpdatePresentSchema } from '@/server/boxes';
import { sessionHashFrom } from '@/server/customItems';

/**
 * Move, resize, or reorder a placed present. Only x/y/z/scale can
 * change — the schema is strict, so a body that also carries contents or a design is refused — and
 * nothing here reads or writes a goodie, so the contents stay sealed and the birthday lock is
 * untouched by construction.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string; boxId: string }> }) {
  const { token, boxId } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  const { room, role } = resolved;

  const box = await prisma.box.findFirst({ where: { id: boxId, roomId: room.id } });
  if (!box) return jsonError(404, 'Present not found.');

  const body = await req.json().catch(() => null);
  const parsed = UpdatePresentSchema.safeParse(body);

  // Ownership: the same browser session that packed it, or (fallback) the undo token the seal
  // returned. The host is never subject to it.
  const sessionHash = sessionHashFrom(req);
  const tokenOk = Boolean(parsed.success && parsed.data.deleteToken && hashToken(parsed.data.deleteToken) === box.deleteTokenHash);
  const isOwner = tokenOk || (Boolean(sessionHash) && box.createdBySessionHash === sessionHash);

  // Permission first, validation second: a caller with no right to touch this present learns
  // nothing about what a valid update looks like.
  if (!canMovePresent({ role, permissions: parsePermissions(room.permissionsJson), isOwner })) {
    return jsonError(403, "You don't have permission to move this present.");
  }
  if (!checkRateLimit(`box-update:${clientIp(req)}:${token}`, 60, 60_000)) {
    return jsonError(429, 'Too many changes — please slow down.');
  }
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid update.');

  const { deleteToken: _deleteToken, ...data } = parsed.data;
  void _deleteToken;
  const updated = await prisma.box.update({
    where: { id: box.id },
    data: { ...(data.x !== undefined && { posX: data.x }), ...(data.y !== undefined && { posY: data.y }), ...(data.z !== undefined && { z: data.z }), ...(data.scale !== undefined && { scale: data.scale }) },
    select: { id: true, posX: true, posY: true, z: true, scale: true },
  });
  return NextResponse.json({ box: { id: updated.id, x: updated.posX, y: updated.posY, z: updated.z, scale: updated.scale } });
}


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
