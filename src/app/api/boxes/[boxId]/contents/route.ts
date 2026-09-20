import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { resolveRoomByToken } from '@/server/rooms';
import { isRoomUnlocked } from '@/server/lock';
import { jsonError } from '@/server/http';
import { getStorageProvider } from '@/server/storage';

/**
 * The one place the birthday lock actually matters: no goodie payload or asset URL leaves the
 * server unless the caller holds a valid celebrate token for the box's own room AND the room is
 * unlocked. Everything else (box list, designs, positions) is safe to show early — only contents
 * are gated.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';

  const box = await prisma.box.findUnique({
    where: { id: boxId },
    include: { goodies: { orderBy: { sortOrder: 'asc' }, include: { redemption: true } } },
  });
  if (!box) return jsonError(404, 'Present not found.');

  const resolved = await resolveRoomByToken(token);
  if (!resolved || resolved.role !== 'celebrate' || resolved.room.id !== box.roomId) {
    return jsonError(403, 'Not allowed.');
  }
  if (!isRoomUnlocked(resolved.room)) {
    return jsonError(403, `Opens on ${resolved.room.eventAt.toISOString()}.`);
  }

  const storage = getStorageProvider();
  const goodies = await Promise.all(
    box.goodies.map(async (g) => {
      const payload = JSON.parse(g.payloadJson) as Record<string, unknown>;
      // Different goodie types reference assets under different field names (photo: assetKeys[],
      // song/video/voice/drawing: a single assetKey) — normalize both into one `assetUrls` list.
      const keys = [
        ...(Array.isArray(payload.assetKeys) ? (payload.assetKeys as string[]) : []),
        ...(typeof payload.assetKey === 'string' ? [payload.assetKey as string] : []),
      ];
      const assetUrls = await Promise.all(keys.map((k) => storage.signedGetUrl(k, 300)));
      return {
        id: g.id,
        type: g.type,
        sortOrder: g.sortOrder,
        ...payload,
        assetUrls,
        redeemedAt: g.redemption?.redeemedAt ?? null,
      };
    }),
  );

  if (!box.openedAt) {
    await prisma.box.update({ where: { id: box.id }, data: { openedAt: new Date() } });
  }

  return NextResponse.json({ fromName: box.fromName, design: JSON.parse(box.designJson), goodies });
}
