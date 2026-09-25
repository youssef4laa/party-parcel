import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { canManageCustomItems, parsePermissions } from '@/server/permissions';
import { validateCustomItemImage } from '@/server/customItemImage';
import { sessionHashFrom, toCustomItemApi } from '@/server/customItems';
import { getStorageProvider } from '@/server/storage';
import { LIMITS } from '@/config/limits';

const NAME_MAX = 40;

/** The room's "My items" library — readable by any link (the art is placed in a room every role
 * can already see), so no permission gate here; only creating/editing/deleting is gated. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const sessionHash = sessionHashFrom(req);
  const items = await prisma.customItem.findMany({ where: { roomId: resolved.room.id }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({
    items: items.map((i) =>
      toCustomItemApi(i, token, resolved.role === 'admin' || (Boolean(sessionHash) && i.createdBySessionHash === sessionHash)),
    ),
  });
}

/**
 * Body is the raw image bytes (not multipart, not the presigned two-phase dance goodies use —
 * a custom item is capped at 512 KB, small enough to send in one request), `?source=import|drawing`
 * and `?name=` in the query. The server trusts nothing about the file except its own bytes: real
 * type sniffed from magic bytes, real dimensions read from the header, size re-checked.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  const { room, role } = resolved;

  const source = req.nextUrl.searchParams.get('source') === 'drawing' ? 'drawing' : 'import';
  const permissions = parsePermissions(room.permissionsJson);
  if (!canManageCustomItems({ role, permissions, action: 'create', source })) {
    return jsonError(403, source === 'drawing' ? "You don't have permission to draw items for this room." : "You don't have permission to import items into this room.");
  }

  if (!checkRateLimit(`custom-items-create:${clientIp(req)}:${token}`, 20, 60_000)) {
    return jsonError(429, 'Too many uploads — please slow down.');
  }

  // Cheap early refusal before buffering a body the size check below would reject anyway.
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > LIMITS.maxCustomItemBytes) {
    return jsonError(413, `Images can be at most ${Math.round(LIMITS.maxCustomItemBytes / 1024)} KB.`);
  }

  const count = await prisma.customItem.count({ where: { roomId: room.id } });
  if (count >= LIMITS.maxCustomItemsPerRoom) {
    return jsonError(400, `This room's library is full (${LIMITS.maxCustomItemsPerRoom} items) — delete one to add another.`);
  }

  const verdict = validateCustomItemImage(Buffer.from(await req.arrayBuffer()));
  if (!verdict.ok) return jsonError(verdict.status, verdict.error);

  const name = (req.nextUrl.searchParams.get('name') ?? '').trim().slice(0, NAME_MAX);
  const { storageKey } = await getStorageProvider().put(verdict.bytes, verdict.mime);
  const sessionHash = sessionHashFrom(req);

  const item = await prisma.customItem.create({
    data: {
      roomId: room.id,
      storageKey,
      mime: verdict.mime,
      width: verdict.width,
      height: verdict.height,
      size: verdict.bytes.length,
      source,
      name,
      createdByRole: role,
      createdBySessionHash: role === 'admin' ? null : (sessionHash ?? null),
    },
  });
  return NextResponse.json({ item: toCustomItemApi(item, token, true) });
}
