import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { defaultLayout } from '@/server/defaultLayout';

/** "Reset to default layout" — host-only, unconditionally (see canMutateObjects: action 'reset'
 * is never available to contribute/celebrate, freeze or not). Deletes every current object and
 * reseeds the same default set a brand-new room gets. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  if (resolved.role !== 'admin') return jsonError(403, 'Only the host can reset the layout.');

  if (!checkRateLimit(`objects-reset:${clientIp(req)}:${token}`, 5, 60_000)) {
    return jsonError(429, 'Too many resets — please slow down.');
  }

  const seed = defaultLayout(resolved.room.age);
  await prisma.$transaction([
    prisma.roomObject.deleteMany({ where: { roomId: resolved.room.id } }),
    prisma.roomObject.createMany({
      data: seed.map((item) => ({
        roomId: resolved.room.id,
        kind: item.kind,
        x: item.x,
        y: item.y,
        z: item.z,
        zone: item.zone,
        configJson: item.configJson ?? '{}',
        createdByRole: 'admin',
      })),
    }),
  ]);

  const objects = await prisma.roomObject.findMany({ where: { roomId: resolved.room.id }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ objects });
}
