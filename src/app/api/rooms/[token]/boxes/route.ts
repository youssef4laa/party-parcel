import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { generateToken, hashToken } from '@/server/tokens';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { MAX_BOXES_PER_ROOM } from '@/server/limits';
import { LIMITS } from '@/config/limits';
import { GoodiePayloadSchema } from '@/goodies/schema';
import { fetchLinkPreview } from '@/server/linkPreview';
import { getStorageProvider } from '@/server/storage';
import { sniffMime } from '@/server/mimeSniff';
import { parseGiftInputs, type GiftInput } from '@/server/boxes';
import { sessionHashFrom } from '@/server/customItems';

/** Boxes list is metadata only (sender + time + placement), regardless of role — never goodie
 * contents, and never anything about the gifts inside (their count, labels, and wrap designs are
 * inner data, gated by the birthday lock exactly like the goodies — see boxes/[boxId]/contents). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const boxes = await prisma.box.findMany({
    where: { roomId: resolved.room.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, fromName: true, designJson: true, posX: true, posY: true, z: true, scale: true,
      createdBySessionHash: true, createdAt: true, openedAt: true,
    },
  });
  const sessionHash = sessionHashFrom(req);

  return NextResponse.json({
    boxes: boxes.map((b) => ({
      id: b.id,
      fromName: b.fromName,
      design: JSON.parse(b.designJson),
      x: b.posX,
      y: b.posY,
      z: b.z,
      scale: b.scale,
      // A display hint only (does this browser get move/resize controls) — PATCH re-checks the
      // real rule. The hash itself never leaves the server.
      mine: resolved.role === 'admin' || (Boolean(sessionHash) && b.createdBySessionHash === sessionHash),
      placedAt: b.createdAt,
      opened: b.openedAt !== null,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  if (resolved.role !== 'contribute') return jsonError(403, 'Only the contribute link can place presents.');

  if (!checkRateLimit(`create-box:${clientIp(req)}:${token}`, 20, 60_000)) {
    return jsonError(429, 'Too many requests — please slow down.');
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.fromName !== 'string' || !body.fromName.trim()) {
    return jsonError(400, 'fromName is required.');
  }
  if (!body.design || typeof body.x !== 'number' || typeof body.y !== 'number') {
    return jsonError(400, 'design, x, and y are required.');
  }

  // Two wire shapes: the original flat `goodies` list (a single-gift box — also what every older
  // client and test sends), or `gifts` for a box holding several separately wrapped gifts. A flat
  // list is just one default gift with no wrap design of its own.
  let giftInputs: GiftInput[];
  if (body.gifts !== undefined) {
    const parsedGifts = parseGiftInputs(body.gifts);
    if (!parsedGifts.ok) return jsonError(400, parsedGifts.error);
    giftInputs = parsedGifts.gifts;
  } else {
    giftInputs = [{ label: '', design: {}, goodies: Array.isArray(body.goodies) ? body.goodies : [] }];
  }
  const rawGoodies = giftInputs.flatMap((g) => g.goodies);
  // Per-box goodie and byte limits apply to the box TOTAL across all its gifts, not per gift.
  if (rawGoodies.length > LIMITS.maxGoodiesPerBox) {
    return jsonError(400, `Keep it to ${LIMITS.maxGoodiesPerBox} goodies.`);
  }

  // Validate every payload server-side against its type's schema — never trust the client shape.
  const validated: Array<{ sizeBytes: number; payload: Record<string, unknown> }> = [];
  for (const raw of rawGoodies) {
    const { sizeBytes, ...rest } = (raw ?? {}) as Record<string, unknown>;
    const parsed = GoodiePayloadSchema.safeParse(rest);
    if (!parsed.success) {
      return jsonError(400, `Invalid ${rest?.type ?? 'goodie'}: ${parsed.error.issues[0]?.message ?? 'invalid payload'}`);
    }
    validated.push({ sizeBytes: typeof sizeBytes === 'number' && sizeBytes >= 0 ? sizeBytes : 0, payload: parsed.data });
  }

  const boxBytes = validated.reduce((sum, g) => sum + g.sizeBytes, 0);
  if (boxBytes > LIMITS.maxBytesPerBox) {
    return jsonError(400, `Keep this box under ${Math.round(LIMITS.maxBytesPerBox / (1024 * 1024))} MB total.`);
  }

  const existingCount = await prisma.box.count({ where: { roomId: resolved.room.id } });
  if (existingCount >= MAX_BOXES_PER_ROOM) {
    return jsonError(400, `This room already has the max of ${MAX_BOXES_PER_ROOM} presents.`);
  }

  const roomUsage = await prisma.goodie.aggregate({
    where: { box: { roomId: resolved.room.id } },
    _sum: { sizeBytes: true },
  });
  if ((roomUsage._sum.sizeBytes ?? 0) + boxBytes > LIMITS.maxBytesPerRoom) {
    return jsonError(400, `This room is out of storage (${Math.round(LIMITS.maxBytesPerRoom / (1024 * 1024))} MB total).`);
  }

  // News: fetch + store the link preview now, at seal time — never re-fetched at view time.
  for (const g of validated) {
    if (g.payload.type === 'news' && typeof g.payload.url === 'string') {
      g.payload.preview = await fetchLinkPreview(g.payload.url);
    }
  }

  // Uploads happen during Pack, before any box exists, so this is the first point a Box row
  // exists to attach an Asset to. Re-derive each referenced asset's mime/size/hash from its
  // actual stored bytes here (never trust whatever the client remembers from upload time) — the
  // static export (and anything else that needs an asset's real content type later) depends on
  // this row existing, not just the goodie payload's bare storage key.
  const storage = getStorageProvider();
  const assetKeys = new Set<string>();
  for (const g of validated) {
    if (Array.isArray(g.payload.assetKeys)) (g.payload.assetKeys as string[]).forEach((k) => assetKeys.add(k));
    if (typeof g.payload.assetKey === 'string') assetKeys.add(g.payload.assetKey as string);
  }
  const assetRows: Array<{ storageKey: string; mime: string; size: number; sha256: string }> = [];
  for (const storageKey of assetKeys) {
    const bytes = await storage.get(storageKey);
    if (!bytes) continue; // asset expired/was never finalized — the goodie just won't have a mime on export
    assetRows.push({
      storageKey,
      mime: sniffMime(bytes) ?? 'application/octet-stream',
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }

  const deleteToken = generateToken();
  const sessionHash = sessionHashFrom(req);

  const boxId = await prisma.$transaction(async (tx) => {
    const box = await tx.box.create({
      data: {
        roomId: resolved.room.id,
        fromName: body.fromName.trim().slice(0, 80),
        designJson: JSON.stringify(body.design),
        posX: body.x,
        posY: body.y,
        openInOrder: giftInputs.length > 1 && body.openInOrder === true,
        createdBySessionHash: sessionHash ?? null,
        deleteTokenHash: hashToken(deleteToken),
        assets: { create: assetRows },
      },
    });
    // Goodies keep ONE box-wide sortOrder (gift 1's goodies, then gift 2's, ...) so every existing
    // reader that just orders a box's goodies — the flat `goodies` list the contents route still
    // returns, the static export — keeps working unchanged.
    let next = 0;
    for (const [i, g] of giftInputs.entries()) {
      const gift = await tx.gift.create({
        data: { boxId: box.id, sortOrder: i, label: g.label, designJson: JSON.stringify(g.design) },
      });
      const mine = validated.slice(next, next + g.goodies.length);
      await tx.goodie.createMany({
        data: mine.map((v, j) => ({
          boxId: box.id,
          giftId: gift.id,
          type: v.payload.type as string,
          sortOrder: next + j,
          payloadJson: JSON.stringify(v.payload),
          sizeBytes: v.sizeBytes,
        })),
      });
      next += g.goodies.length;
    }
    return box.id;
  });

  return NextResponse.json({ id: boxId, deleteToken });
}
