import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { jsonError } from '@/server/http';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  if (resolved.role !== 'admin') return jsonError(403, 'Only the host can unlock the room.');

  await prisma.room.update({ where: { id: resolved.room.id }, data: { unlockedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
