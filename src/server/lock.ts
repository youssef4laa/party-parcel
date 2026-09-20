import type { Room } from '@/generated/prisma';

/** Server-side birthday lock: never trust a client's clock or UI state for this. */
export function isRoomUnlocked(room: Pick<Room, 'eventAt' | 'unlockedAt'>) {
  return Date.now() >= room.eventAt.getTime() || room.unlockedAt !== null;
}
