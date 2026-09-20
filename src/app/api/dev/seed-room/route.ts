import { NextRequest, NextResponse } from 'next/server';
import { createRoom } from '@/server/rooms';
import { jsonError } from '@/server/http';

/**
 * Dev-only helper that stands in for the real Host setup + payment flow (Milestone 7) so
 * Milestone 4's persistence/tokens/lock/celebrant-view can be built and tested against real
 * rooms right away. Disabled outside development.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return jsonError(404, 'Not found');

  const body = await req.json().catch(() => ({}));
  const eventAt = body.eventAt ? new Date(body.eventAt) : new Date(Date.now() + 5 * 60_000);

  const { room, tokens } = await createRoom({
    title: body.title ?? "Alex's Birthday Bash",
    celebrantName: body.celebrantName ?? 'Alex',
    age: body.age ?? 25,
    eventAt,
    timezone: body.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    bannerText: body.bannerText ?? 'HAPPY BIRTHDAY!',
    hostEmail: body.hostEmail ?? 'host@example.com',
  });

  return NextResponse.json({
    roomId: room.id,
    eventAt: room.eventAt,
    links: {
      admin: `/r/${tokens.admin}`,
      contribute: `/r/${tokens.contribute}`,
      celebrate: `/r/${tokens.celebrate}`,
    },
  });
}
