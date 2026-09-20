/** World-space layout constants for the party room scene (all in world px). */
export const ROOM_WIDTH = 2400;
export const ROOM_HEIGHT = 760;

/** Back wall band boundaries (y ranges), top to bottom. */
export const WALL_TOP = 0;
export const WAINSCOT_TOP = 430;
export const FLOOR_TOP = 600;
export const ROOM_BOTTOM = ROOM_HEIGHT;

/** How tall the viewport should treat the room (used to scale-to-fit vertically). */
export const VIEW_TARGET_HEIGHT = ROOM_HEIGHT;

/**
 * Table/window placement, hardcoded from the sprites' known native sizes (grid x unit) so both
 * the scene builder and the drop-zone validator agree without needing a texture loaded first.
 */
export const WINDOW_X = 1020;
const WINDOW_TEX_W = 64 * 4;
export const TABLE_TEX_W = 90 * 4;
export const TABLE_TEX_H = 30 * 4;
export const TABLE_X = WINDOW_X + WINDOW_TEX_W / 2 - TABLE_TEX_W / 2;
export const TABLE_Y = FLOOR_TOP - 40;

export type DropZone = { x: number; y: number; w: number; h: number };

/** Valid places a present can be dropped: the tabletop, and the floor (rug included). */
export function getDropZones(): DropZone[] {
  return [
    { x: TABLE_X, y: TABLE_Y - 6, w: TABLE_TEX_W, h: 16 },
    { x: 0, y: FLOOR_TOP, w: ROOM_WIDTH, h: ROOM_HEIGHT - FLOOR_TOP },
  ];
}

export function nearestPointInZones(x: number, y: number, zones: DropZone[]) {
  let best = { x, y };
  let bestDist = Infinity;
  for (const z of zones) {
    const cx = Math.max(z.x, Math.min(x, z.x + z.w));
    const cy = Math.max(z.y, Math.min(y, z.y + z.h));
    const dist = (cx - x) ** 2 + (cy - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = { x: cx, y: cy };
    }
  }
  return best;
}

export function isInsideZones(x: number, y: number, zones: DropZone[]) {
  return zones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
}
