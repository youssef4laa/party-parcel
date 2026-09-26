import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { hashToken } from '@/server/tokens';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { isRoomUnlocked } from '@/server/lock';
import { canMutateObjects, parsePermissions } from '@/server/permissions';
import { CreateObjectSchema, resolveRoomObjects } from '@/server/roomObjects';
import { LIMITS } from '@/config/limits';
import { OBJECT_CATALOG } from '@/room/objectCatalog';
import { inZone } from '@/room/zones';

/** Every room object mutation route hashes this the same way — a session's raw token is never
 * stored, only its hash, matching how a box's delete token works. */
function sessionHashFrom(req: NextRequest): string | undefined {
  const raw = req.headers.get('x-contributor-session');
  return raw ? hashToken(raw) : undefined;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const objects = await resolveRoomObjects(resolved.room.id, resolved.room.age);
  return NextResponse.json({ objects });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  const { room, role } = resolved;

  if (!checkRateLimit(`objects-create:${clientIp(req)}:${token}`, 40, 60_000)) {
    return jsonError(429, 'Too many changes — please slow down.');
  }

  const permissions = parsePermissions(room.permissionsJson);
  const unlocked = isRoomUnlocked(room);
  if (!canMutateObjects({ role, permissions, unlocked, action: 'create' })) {
    return jsonError(403, "You don't have permission to add items to this room.");
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateObjectSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid object.');
  }

  const sessionHash = sessionHashFrom(req);

  // Zones (docs/ROOM_EDITOR.md 1b): only the host may place an item outside its zone ("place
  // anywhere"). For everyone else the item's zone is the catalog's, NOT whatever the request claims
  // — otherwise asking for zone "anywhere" would make the limit meaningless — and its position must
  // fall inside it.
  const zone = role === 'admin' ? parsed.data.zone : (OBJECT_CATALOG[parsed.data.kind]?.defaultZone ?? 'anywhere');
  if (role !== 'admin' && !inZone(zone, parsed.data.x, parsed.data.y)) {
    return jsonError(400, `That spot isn't valid for a ${zone} item.`);
  }

  // A custom object must point at an item in THIS room's library — never another room's, and never
  // a made-up id (the FK alone would only catch the latter, and by throwing a 500).
  if (parsed.data.assetId) {
    const item = await prisma.customItem.findFirst({ where: { id: parsed.data.assetId, roomId: room.id } });
    if (!item) return jsonError(400, 'That item is not in this room\'s library.');
  }

  // MAX_OBJECTS_PER_ROOM, room-wide
  const total = await prisma.roomObject.count({ where: { roomId: room.id } });
  if (total >= LIMITS.maxObjectsPerRoom) {
    return jsonError(400, `This room already has the max of ${LIMITS.maxObjectsPerRoom} items.`);
  }

  // Per-contributor cap, only meaningful for the contribute role
  if (role === 'contribute') {
    if (!sessionHash) return jsonError(400, 'Missing contributor session.');
    const mine = await prisma.roomObject.count({ where: { roomId: room.id, createdBySessionHash: sessionHash } });
    if (mine >= permissions.contributors.maxItemsPerContributor) {
      return jsonError(400, `You've placed the max of ${permissions.contributors.maxItemsPerContributor} items in this room.`);
    }
  }

  const created = await prisma.roomObject.create({
    data: {
      roomId: room.id,
      kind: parsed.data.kind,
      x: parsed.data.x,
      y: parsed.data.y,
      z: parsed.data.z ?? 0,
      scale: parsed.data.scale ?? 1,
      flipX: parsed.data.flipX ?? false,
      rotation: parsed.data.rotation ?? 0,
      zone,
      configJson: parsed.data.configJson ?? '{}',
      assetId: parsed.data.assetId ?? null,
      createdByRole: role,
      createdBySessionHash: role === 'admin' ? null : (sessionHash ?? null),
    },
  });

  return NextResponse.json({ object: created });
}
