import { prisma } from './db';
import { generateToken, hashToken } from './tokens';
import type { Room } from '@/generated/prisma';

export type RoomRole = 'admin' | 'contribute' | 'celebrate';

export async function resolveRoomByToken(token: string): Promise<{ room: Room; role: RoomRole } | null> {
  if (!token) return null;
  const hash = hashToken(token);
  const room = await prisma.room.findFirst({
    where: {
      status: { not: 'deleted' },
      OR: [{ adminTokenHash: hash }, { contributeTokenHash: hash }, { celebrateTokenHash: hash }],
    },
  });
  if (!room) return null;
  const role: RoomRole =
    room.adminTokenHash === hash ? 'admin' : room.contributeTokenHash === hash ? 'contribute' : 'celebrate';
  return { room, role };
}

export type CreateRoomInput = {
  title: string;
  celebrantName: string;
  age?: number;
  occasion?: string;
  eventAt: Date;
  timezone: string;
  bannerText?: string;
  hostEmail: string;
};

export async function createRoom(input: CreateRoomInput) {
  const adminToken = generateToken();
  const contributeToken = generateToken();
  const celebrateToken = generateToken();

  const room = await prisma.room.create({
    data: {
      title: input.title,
      celebrantName: input.celebrantName,
      age: input.age,
      occasion: input.occasion ?? 'birthday',
      eventAt: input.eventAt,
      timezone: input.timezone,
      bannerText: input.bannerText ?? 'HAPPY BIRTHDAY!',
      hostEmail: input.hostEmail,
      adminTokenHash: hashToken(adminToken),
      contributeTokenHash: hashToken(contributeToken),
      celebrateTokenHash: hashToken(celebrateToken),
      status: 'live',
      paidAt: new Date(),
    },
  });

  return { room, tokens: { admin: adminToken, contribute: contributeToken, celebrate: celebrateToken } };
}
