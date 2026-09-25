import { NextRequest, NextResponse } from 'next/server';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { jsonError } from '@/server/http';
import { getStorageProvider } from '@/server/storage';

/**
 * Streams a custom item's pixels. Deliberately NOT birthday-locked: custom items are decorations
 * placed in the room every link can already see (the import notice tells people this), unlike
 * gift media, which stays behind the lock. Gated only by knowing a valid room link.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; itemId: string }> }) {
  const { token, itemId } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");

  const item = await prisma.customItem.findFirst({ where: { id: itemId, roomId: resolved.room.id } });
  if (!item) return jsonError(404, 'Item not found.');
  const buffer = await getStorageProvider().get(item.storageKey);
  if (!buffer) return jsonError(404, 'Item not found.');

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': item.mime,
      // Safe to cache hard: the URL carries ?v=<storage key>, which changes on every edit.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
