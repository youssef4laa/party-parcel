import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { hashToken } from '@/server/tokens';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { isRoomUnlocked } from '@/server/lock';
import { canMutateObjects, parsePermissions } from '@/server/permissions';
import { UpdateObjectSchema } from '@/server/roomObjects';

function sessionHashFrom(req: NextRequest): string | undefined {
  const raw = req.headers.get('x-contributor-session');
  return raw ? hashToken(raw) : undefined;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; objectId: string }> },
) {
  const { token, objectId } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  const { room, role } = resolved;

  if (!checkRateLimit(`objects-update:${clientIp(req)}:${token}`, 60, 60_000)) {
    return jsonError(429, 'Too many changes — please slow down.');
  }

  const existing = await prisma.roomObject.findFirst({ where: { id: objectId, roomId: room.id } });
  if (!existing) return jsonError(404, 'Item not found.');

  const permissions = parsePermissions(room.permissionsJson);
  const unlocked = isRoomUnlocked(room);
  const sessionHash = sessionHashFrom(req);
  const isOwner = Boolean(sessionHash) && existing.createdBySessionHash === sessionHash;

  if (!canMutateObjects({ role, permissions, unlocked, action: 'update', isOwner })) {
    return jsonError(403, "You don't have permission to edit this item.");
  }
  // A locked item can only be touched by the host, regardless of who owns it or what the room's
  // general decorate level allows — "lock" is per-item, "freeze" (checked above) is room-wide.
  if (existing.locked && role !== 'admin') {
    return jsonError(403, 'This item is locked.');
  }

  const body = await req.json().catch(() => null);
  const parsed = UpdateObjectSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid update.');
  }

  if (parsed.data.expectedUpdatedAt && parsed.data.expectedUpdatedAt !== existing.updatedAt.toISOString()) {
    return NextResponse.json(
      { error: 'Someone else changed this item — refetch and try again.', object: existing },
      { status: 409 },
    );
  }

  const { expectedUpdatedAt: _expectedUpdatedAt, ...data } = parsed.data;
  void _expectedUpdatedAt;
  const updated = await prisma.roomObject.update({ where: { id: existing.id }, data });

  return NextResponse.json({ object: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; objectId: string }> },
) {
  const { token, objectId } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  const { room, role } = resolved;

  if (!checkRateLimit(`objects-delete:${clientIp(req)}:${token}`, 60, 60_000)) {
    return jsonError(429, 'Too many changes — please slow down.');
  }

  const existing = await prisma.roomObject.findFirst({ where: { id: objectId, roomId: room.id } });
  if (!existing) return jsonError(404, 'Item not found.');

  const permissions = parsePermissions(room.permissionsJson);
  const unlocked = isRoomUnlocked(room);
  const sessionHash = sessionHashFrom(req);
  const isOwner = Boolean(sessionHash) && existing.createdBySessionHash === sessionHash;

  if (!canMutateObjects({ role, permissions, unlocked, action: 'delete', isOwner })) {
    return jsonError(403, "You don't have permission to delete this item.");
  }
  if (existing.locked && role !== 'admin') {
    return jsonError(403, 'This item is locked.');
  }

  await prisma.roomObject.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
