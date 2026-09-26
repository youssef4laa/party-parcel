import { z } from 'zod';
import { LIMITS } from '@/config/limits';
import { ROOM_HEIGHT, ROOM_WIDTH } from '@/room/constants';

/**
 * A placed present's editable fields: position, scale, and z —
 * nothing else. `.strict()` is what makes "contents stay sealed" a property of the schema rather
 * than of the route: a body that also tries to send goodies, fromName, design, openInOrder, or
 * anything else is refused outright, not silently ignored.
 */
export const UpdatePresentSchema = z
  .object({
    x: z.number().finite().min(0).max(ROOM_WIDTH).optional(),
    y: z.number().finite().min(0).max(ROOM_HEIGHT).optional(),
    z: z.number().int().min(0).max(100_000).optional(),
    scale: z.number().min(LIMITS.minPresentScale).max(LIMITS.maxPresentScale).optional(),
    /** Alternative ownership proof for a box packed before session hashes existed, or from a
     * browser whose session was cleared: the undo token the sealing response returned. */
    deleteToken: z.string().max(200).optional(),
  })
  .strict()
  .refine((v) => v.x !== undefined || v.y !== undefined || v.z !== undefined || v.scale !== undefined, {
    message: 'Nothing to update.',
  });

const LABEL_MAX = 40;
const GIFT_DESIGN_MAX_JSON = 2000;

export type GiftInput = { label: string; design: Record<string, unknown>; goodies: unknown[] };

/** Normalizes the `gifts` array a multi-gift box is sealed with. Returns an error string instead
 * of throwing so the route can answer with a plain 400. A single-gift box never reaches here (it
 * sends the legacy flat `goodies` list instead). */
export function parseGiftInputs(raw: unknown): { ok: true; gifts: GiftInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'gifts must be a list.' };
  if (raw.length < 1) return { ok: false, error: 'A box needs at least one gift.' };
  if (raw.length > LIMITS.maxGiftsPerBox) {
    return { ok: false, error: `A box can hold at most ${LIMITS.maxGiftsPerBox} gifts.` };
  }
  const gifts: GiftInput[] = [];
  for (const [i, g] of raw.entries()) {
    if (!g || typeof g !== 'object') return { ok: false, error: `Gift ${i + 1} is invalid.` };
    const { label, design, goodies } = g as Record<string, unknown>;
    if (label !== undefined && typeof label !== 'string') return { ok: false, error: `Gift ${i + 1}'s label must be text.` };
    if (!Array.isArray(goodies)) return { ok: false, error: `Gift ${i + 1} needs a goodies list.` };
    // A box with several gifts where one is empty would open to a blank — refuse it here so the
    // recipient never sees one, whatever the client did.
    if (raw.length > 1 && goodies.length === 0) return { ok: false, error: `Gift ${i + 1} is empty — put something in it or remove it.` };
    const designObj = design && typeof design === 'object' && !Array.isArray(design) ? (design as Record<string, unknown>) : {};
    if (JSON.stringify(designObj).length > GIFT_DESIGN_MAX_JSON) return { ok: false, error: `Gift ${i + 1}'s design is too large.` };
    gifts.push({ label: (label ?? '').trim().slice(0, LABEL_MAX), design: designObj, goodies });
  }
  return { ok: true, gifts };
}
