import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { resolveRoomByToken } from '@/server/rooms';
import { isRoomUnlocked } from '@/server/lock';
import { jsonError } from '@/server/http';

/**
 * Coupon redemption is server-side and idempotent: redeeming twice (double-click, refresh,
 * retry) just returns the original timestamp rather than erroring or double-counting anything.
 * Only a valid celebrate token for the coupon's own room, room unlocked, can redeem.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boxId: string; goodieId: string }> },
) {
  const { boxId, goodieId } = await params;
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';

  const goodie = await prisma.goodie.findFirst({
    where: { id: goodieId, boxId },
    include: { box: true, redemption: true },
  });
  if (!goodie) return jsonError(404, 'Coupon not found.');
  if (goodie.type !== 'coupon') return jsonError(400, 'That goodie is not a coupon.');

  const resolved = await resolveRoomByToken(token);
  if (!resolved || resolved.role !== 'celebrate' || resolved.room.id !== goodie.box.roomId) {
    return jsonError(403, 'Not allowed.');
  }
  if (!isRoomUnlocked(resolved.room)) {
    return jsonError(403, `Opens on ${resolved.room.eventAt.toISOString()}.`);
  }

  if (goodie.redemption) {
    return NextResponse.json({ redeemedAt: goodie.redemption.redeemedAt, alreadyRedeemed: true });
  }

  const payload = JSON.parse(goodie.payloadJson) as { expiresAt?: string };
  if (payload.expiresAt && new Date(payload.expiresAt).getTime() < Date.now()) {
    return jsonError(410, 'This coupon has expired.');
  }

  const redemption = await prisma.couponRedemption.create({ data: { goodieId } });
  return NextResponse.json({ redeemedAt: redemption.redeemedAt, alreadyRedeemed: false });
}
