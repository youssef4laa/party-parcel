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

type Ctx = { params: Promise<{ token: string; itemId: string }> };

/** Replace an item's pixels (or rename it) — "edit later", including touching up an imported PNG.
 * Every placed copy picks up the new pixels, since they all reference this one row. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { token, itemId } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  const { room, role } = resolved;

  const existing = await prisma.customItem.findFirst({ where: { id: itemId, roomId: room.id } });
  if (!existing) return jsonError(404, 'Item not found.');

  const sessionHash = sessionHashFrom(req);
  const isOwner = Boolean(sessionHash) && existing.createdBySessionHash === sessionHash;
  // What the item *becomes* decides which flag gates the edit: touching up an import in the pixel
  // editor is drawing, so it needs canDraw even though the row started life as an import.
  const source = req.nextUrl.searchParams.get('source') === 'drawing' ? 'drawing' : (existing.source as 'import' | 'drawing');
  if (!canManageCustomItems({ role, permissions: parsePermissions(room.permissionsJson), action: 'update', source, isOwner })) {
    return jsonError(403, "You don't have permission to edit this item.");
  }
  if (!checkRateLimit(`custom-items-update:${clientIp(req)}:${token}`, 30, 60_000)) {
    return jsonError(429, 'Too many changes — please slow down.');
  }

  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > LIMITS.maxCustomItemBytes) {
    return jsonError(413, `Images can be at most ${Math.round(LIMITS.maxCustomItemBytes / 1024)} KB.`);
  }
  const verdict = validateCustomItemImage(Buffer.from(await req.arrayBuffer()));
  if (!verdict.ok) return jsonError(verdict.status, verdict.error);

  const nameParam = req.nextUrl.searchParams.get('name');
  const storage = getStorageProvider();
  const { storageKey } = await storage.put(verdict.bytes, verdict.mime);
  const item = await prisma.customItem.update({
    where: { id: existing.id },
    data: {
      storageKey,
      mime: verdict.mime,
      width: verdict.width,
      height: verdict.height,
      size: verdict.bytes.length,
      source,
      ...(nameParam !== null ? { name: nameParam.trim().slice(0, 40) } : {}),
    },
  });
  await storage.delete(existing.storageKey);
  return NextResponse.json({ item: toCustomItemApi(item, token, true) });
}

/** Removes the item AND every placed copy of it (the client asks the user to confirm first — see
 * MyItems.tsx). RoomObject.assetId is `onDelete: SetNull` in the schema, which would strand blank
 * placeholder objects, so the copies are deleted explicitly, in the same transaction. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { token, itemId } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  const { room, role } = resolved;

  const existing = await prisma.customItem.findFirst({ where: { id: itemId, roomId: room.id } });
  if (!existing) return jsonError(404, 'Item not found.');

  const sessionHash = sessionHashFrom(req);
  const isOwner = Boolean(sessionHash) && existing.createdBySessionHash === sessionHash;
  if (!canManageCustomItems({ role, permissions: parsePermissions(room.permissionsJson), action: 'delete', source: existing.source as 'import' | 'drawing', isOwner })) {
    return jsonError(403, "You don't have permission to delete this item.");
  }
  if (!checkRateLimit(`custom-items-delete:${clientIp(req)}:${token}`, 30, 60_000)) {
    return jsonError(429, 'Too many changes — please slow down.');
  }

  const removed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.roomObject.deleteMany({ where: { roomId: room.id, assetId: existing.id } });
    await tx.customItem.delete({ where: { id: existing.id } });
    return count;
  });
  await getStorageProvider().delete(existing.storageKey);
  return NextResponse.json({ ok: true, removedObjects: removed });
}
