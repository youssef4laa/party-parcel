import { z } from 'zod';
import { prisma } from './db';
import { isKnownKind, ROOM_ZONES } from '@/room/objectCatalog';
import { LIMITS } from '@/config/limits';
import { defaultLayout } from './defaultLayout';

const ROTATIONS = [0, 90, 180, 270] as const;

export const CreateObjectSchema = z.object({
  kind: z.string().refine(isKnownKind, { message: 'Unknown object kind' }),
  x: z.number().finite().min(-400).max(2800),
  y: z.number().finite().min(-200).max(900),
  z: z.number().int().min(0).max(100_000).optional(),
  scale: z.number().min(LIMITS.minObjectScale).max(LIMITS.maxObjectScale).optional(),
  flipX: z.boolean().optional(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  zone: z.enum(ROOM_ZONES as [string, ...string[]]),
  configJson: z.string().max(4000).optional(),
});
export type CreateObjectInput = z.infer<typeof CreateObjectSchema>;

export const UpdateObjectSchema = z
  .object({
    x: z.number().finite().min(-400).max(2800).optional(),
    y: z.number().finite().min(-200).max(900).optional(),
    z: z.number().int().min(0).max(100_000).optional(),
    scale: z.number().min(LIMITS.minObjectScale).max(LIMITS.maxObjectScale).optional(),
    flipX: z.boolean().optional(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    configJson: z.string().max(4000).optional(),
    /** The `updatedAt` the client last saw, for a last-write-wins staleness check — if it
     * doesn't match the row's current value, the write is rejected with 409 instead of silently
     * clobbering a change the client hasn't seen yet. */
    expectedUpdatedAt: z.string().optional(),
  })
  .refine((v) => ROTATIONS.includes((v.rotation ?? 0) as (typeof ROTATIONS)[number]), { message: 'Invalid rotation' });
export type UpdateObjectInput = z.infer<typeof UpdateObjectSchema>;

/**
 * Returns a room's placed objects, lazily seeding the default layout the first time anyone asks
 * (covers both brand-new rooms and pre-existing rooms migrated before this feature existed — see
 * docs/ROOM_EDITOR.md 1a). Wrapped in a transaction so two near-simultaneous first loads can't
 * double-seed — SQLite serializes writers, so this is enough for this app's traffic level.
 */
export async function resolveRoomObjects(roomId: string, age?: number | null) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.roomObject.count({ where: { roomId } });
    if (count === 0) {
      const seed = defaultLayout(age);
      await tx.roomObject.createMany({
        data: seed.map((item) => ({
          roomId,
          kind: item.kind,
          x: item.x,
          y: item.y,
          z: item.z,
          zone: item.zone,
          configJson: item.configJson ?? '{}',
          createdByRole: 'admin',
        })),
      });
    }
    return tx.roomObject.findMany({ where: { roomId }, orderBy: { createdAt: 'asc' } });
  });
}
