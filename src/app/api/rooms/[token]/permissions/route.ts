import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveRoomByToken } from '@/server/rooms';
import { prisma } from '@/server/db';
import { jsonError } from '@/server/http';
import { checkRateLimit, clientIp } from '@/server/rateLimit';
import { DEFAULT_PERMISSIONS, parsePermissions } from '@/server/permissions';

const PermissionsSchema = z.object({
  contributors: z.object({
    canDecorate: z.enum(['off', 'own', 'any']),
    canImport: z.boolean(),
    canDraw: z.boolean(),
    canMoveOwnPresents: z.boolean(),
    maxItemsPerContributor: z.number().int().min(0).max(1000),
  }),
  celebrant: z.object({
    canRearrange: z.boolean(),
  }),
  freezeLayout: z.boolean(),
});

/** Host-only, both directions — the Permissions tab (docs/ROOM_EDITOR.md 1d) is explicitly
 * host-only in the UI, and this route is where that's actually enforced. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  if (resolved.role !== 'admin') return jsonError(403, 'Only the host can view room permissions.');

  return NextResponse.json({ permissions: parsePermissions(resolved.room.permissionsJson) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveRoomByToken(token);
  if (!resolved) return jsonError(404, "This link doesn't exist (or was typed wrong).");
  if (resolved.role !== 'admin') return jsonError(403, 'Only the host can change room permissions.');

  if (!checkRateLimit(`permissions-update:${clientIp(req)}:${token}`, 20, 60_000)) {
    return jsonError(429, 'Too many changes — please slow down.');
  }

  const body = await req.json().catch(() => null);
  const parsed = PermissionsSchema.safeParse({ ...DEFAULT_PERMISSIONS, ...(body ?? {}) });
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid permissions.');
  }

  await prisma.room.update({
    where: { id: resolved.room.id },
    data: { permissionsJson: JSON.stringify(parsed.data) },
  });

  return NextResponse.json({ permissions: parsed.data });
}
