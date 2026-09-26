import { FLOOR_TOP, ROOM_HEIGHT, ROOM_WIDTH, TABLE_TEX_W, TABLE_X, TABLE_Y, WAINSCOT_TOP } from './constants';
import type { RoomZone } from './objectCatalog';

/**
 * Where each placement zone allows an object's anchor point to be. Each item has a zone (floor,
 * wall, ceiling, tabletop, anywhere) that limits where it can be placed, and the host can switch on
 * "place anywhere" to ignore it. This module is framework-agnostic, so the server enforces exactly
 * the rule the editor clamps to. Bounds are deliberately generous — they exist to stop a rug on the ceiling or a
 * chandelier on the floor, not to police pixel positions — and every position in the default
 * layout must satisfy them (tests/room-zones.spec.ts proves that against the real seed).
 */
export type ZoneBounds = { xMin: number; xMax: number; yMin: number; yMax: number };

const BOUNDS: Record<Exclude<RoomZone, 'anywhere'>, ZoneBounds> = {
  // Anything standing on the floor: from the wainscot line (so tall things reach up the wall) down.
  floor: { xMin: 0, xMax: ROOM_WIDTH, yMin: WAINSCOT_TOP, yMax: ROOM_HEIGHT },
  // Hung on the wall: anywhere between the ceiling line and where the floor starts.
  wall: { xMin: -200, xMax: ROOM_WIDTH + 200, yMin: 0, yMax: FLOOR_TOP },
  // Hung from the ceiling: the top band of the room.
  ceiling: { xMin: -200, xMax: ROOM_WIDTH + 200, yMin: 0, yMax: 320 },
  // Standing on the party table: only over the table's width, and near its surface.
  tabletop: { xMin: TABLE_X - 40, xMax: TABLE_X + TABLE_TEX_W + 40, yMin: TABLE_Y - 150, yMax: TABLE_Y + 50 },
};

export function zoneBounds(zone: string): ZoneBounds | null {
  return zone in BOUNDS ? BOUNDS[zone as keyof typeof BOUNDS] : null; // 'anywhere' (or unknown) = unrestricted
}

export function inZone(zone: string, x: number, y: number): boolean {
  const b = zoneBounds(zone);
  return !b || (x >= b.xMin && x <= b.xMax && y >= b.yMin && y <= b.yMax);
}

/** The nearest allowed point (a plain clamp). Unrestricted zones return the point unchanged. */
export function clampToZone(zone: string, x: number, y: number): { x: number; y: number } {
  const b = zoneBounds(zone);
  if (!b) return { x, y };
  return { x: Math.min(b.xMax, Math.max(b.xMin, x)), y: Math.min(b.yMax, Math.max(b.yMin, y)) };
}

/** Where a newly added item of this zone first appears — inside its zone, and in open space. */
export function defaultPositionFor(zone: string): { x: number; y: number } {
  switch (zone) {
    case 'wall':
      return { x: 700, y: 200 };
    case 'ceiling':
      return { x: 700, y: 60 };
    case 'tabletop':
      return { x: TABLE_X + TABLE_TEX_W / 2, y: TABLE_Y + 6 };
    default:
      return { x: 700, y: 650 }; // floor / anywhere: the open floor between the wall props and the present pile
  }
}

/** Grid the "snap to grid" toggle uses: 16 world px = 4 art pixels of the room's 4px unit. */
export const GRID_SIZE = 16;
export function snapToGrid(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

/** Scale values kept crisp: whole numbers from 1× up, halves and quarters below. */
export const CRISP_SCALES = [0.25, 0.5, 1, 2, 3, 4];

/**
 * The next scale up or down. By default it walks CRISP_SCALES (integer steps, so pixels stay crisp);
 * with `free` on it moves in 0.25 steps. Always clamped to [min, max].
 */
export function stepScale(current: number, dir: 1 | -1, opts: { free: boolean; min: number; max: number }): number {
  let next: number;
  if (opts.free) {
    next = Math.round((current + dir * 0.25) * 100) / 100;
  } else if (dir === 1) {
    next = CRISP_SCALES.find((s) => s > current + 1e-9) ?? current;
  } else {
    next = [...CRISP_SCALES].reverse().find((s) => s < current - 1e-9) ?? current;
  }
  return Math.min(opts.max, Math.max(opts.min, next));
}

/** Snap a freely dragged scale (handle drag / pinch) to the nearest crisp value unless `free`. */
export function snapScale(raw: number, opts: { free: boolean; min: number; max: number }): number {
  const clamped = Math.min(opts.max, Math.max(opts.min, raw));
  if (opts.free) return Math.round(clamped * 100) / 100;
  let best = CRISP_SCALES[0];
  for (const s of CRISP_SCALES) if (Math.abs(s - clamped) < Math.abs(best - clamped)) best = s;
  return Math.min(opts.max, Math.max(opts.min, best));
}
