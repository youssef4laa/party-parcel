import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { generateToken, hashToken } from '@/server/tokens';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { MAX_BOXES_PER_ROOM } from '@/server/limits';
import { MAX_GOODIES, MAX_TOTAL_BYTES } from '@/contribute/types';

/** Boxes list is metadata only (sender + time), regardless of role — never goodie contents. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const boxes = await prisma.box.findMany({
    where: { roomId: resolved.room.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fromName: true, designJson: true, posX: true, posY: true, z: true, createdAt: true, openedAt: true },
  });

  return NextResponse.json({
    boxes: boxes.map((b) => ({
      id: b.id,
      fromName: b.fromName,
      design: JSON.parse(b.designJson),
      x: b.posX,
      y: b.posY,
      z: b.z,
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
  const goodies = Array.isArray(body.goodies) ? body.goodies : [];
  if (goodies.length > MAX_GOODIES) return jsonError(400, `Keep it to ${MAX_GOODIES} goodies.`);
  const totalBytes = goodies.reduce((sum: number, g: { sizeBytes?: number }) => sum + (g.sizeBytes ?? 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) return jsonError(400, 'Total attachment size is too large.');

  const existingCount = await prisma.box.count({ where: { roomId: resolved.room.id } });
  if (existingCount >= MAX_BOXES_PER_ROOM) {
    return jsonError(400, `This room already has the max of ${MAX_BOXES_PER_ROOM} presents.`);
  }

  const deleteToken = generateToken();

  const box = await prisma.box.create({
    data: {
      roomId: resolved.room.id,
      fromName: body.fromName.trim().slice(0, 80),
      designJson: JSON.stringify(body.design),
      posX: body.x,
      posY: body.y,
      deleteTokenHash: hashToken(deleteToken),
      goodies: {
        create: goodies.map((g: { type: string; summary?: string; sizeBytes?: number; payload?: unknown }, i: number) => ({
          type: g.type,
          sortOrder: i,
          payloadJson: JSON.stringify({ summary: g.summary ?? '', ...((g.payload as object) ?? {}) }),
          sizeBytes: g.sizeBytes ?? 0,
        })),
      },
    },
  });

  return NextResponse.json({ id: box.id, deleteToken });
}
