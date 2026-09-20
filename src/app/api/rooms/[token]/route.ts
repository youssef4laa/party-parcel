import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { isRoomUnlocked } from '@/server/lock';
import { jsonError } from '@/server/http';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  const { room, role } = resolved;

  const base = {
    id: room.id,
    mode: room.mode,
    title: room.title,
    celebrantName: room.celebrantName,
    age: room.age,
    occasion: room.occasion,
    bannerText: room.bannerText,
    eventAt: room.eventAt,
    timezone: room.timezone,
    unlocked: isRoomUnlocked(room),
  };

  return NextResponse.json({
    role,
    room:
      role === 'admin'
        ? { ...base, hostEmail: room.hostEmail, status: room.status, unlockedAt: room.unlockedAt, createdAt: room.createdAt }
        : base,
  });
}
