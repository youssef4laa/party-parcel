import type { RoomZone } from '@/room/objectCatalog';

/** One row of the seeded default layout, minus the fields Prisma fills in itself. */
export type DefaultLayoutItem = {
  kind: string;
  x: number;
  y: number;
  z: number;
  zone: RoomZone;
  configJson?: string;
};

const ROOM_WIDTH = 2400;
const ROOM_HEIGHT = 760;
const WINDOW_X = 1020;
const WINDOW_TEX_W = 64 * 4;
const TABLE_TEX_W = 90 * 4;
const TABLE_X = WINDOW_X + WINDOW_TEX_W / 2 - TABLE_TEX_W / 2;
const TABLE_Y = 600 - 40; // FLOOR_TOP - 40
const GARLAND_TEX_W = 60 * 4;

/**
 * Positions copied directly from the previous hardcoded scene builder (src/room/scene/
 * buildScene.ts, before this migration) — see DECISIONS.md's Room Editor entry. A fresh room
 * (or an existing room with zero RoomObject rows — see resolveRoomObjects()) gets exactly this
 * set, so the default look is unchanged; every value here is now just a starting point the host
 * can move, resize, hide, or delete.
 */
export function defaultLayout(): DefaultLayoutItem[] {
  const items: DefaultLayoutItem[] = [];

  items.push({ kind: 'rug', x: ROOM_WIDTH / 2, y: ROOM_HEIGHT - 4, z: 0, zone: 'floor' });

  items.push({ kind: 'frame-mountain', x: 160, y: 120, z: 10, zone: 'wall' });
  items.push({ kind: 'frame-tulip', x: 320, y: 150, z: 20, zone: 'wall' });
  items.push({ kind: 'camera', x: 470, y: 300, z: 30, zone: 'wall' });

  items.push({ kind: 'window', x: WINDOW_X, y: 60, z: 40, zone: 'wall' });
  items.push({ kind: 'curtain-left', x: WINDOW_X - 78, y: 40, z: 50, zone: 'wall' });
  items.push({ kind: 'curtain-right', x: WINDOW_X + WINDOW_TEX_W - 10, y: 40, z: 60, zone: 'wall' });

  items.push({
    kind: 'banner',
    x: WINDOW_X + WINDOW_TEX_W / 2,
    y: 8,
    z: 70,
    zone: 'ceiling',
    configJson: JSON.stringify({ text: 'HAPPY BIRTHDAY!' }),
  });

  let gz = 80;
  for (let gx = -40; gx < ROOM_WIDTH; gx += GARLAND_TEX_W - 4) {
    items.push({ kind: 'garland', x: gx, y: 0, z: gz++, zone: 'ceiling' });
  }

  items.push({ kind: 'lantern', x: WINDOW_X + WINDOW_TEX_W / 2, y: 0, z: 200, zone: 'ceiling' });

  const starPositions = [560, 760, 1320, 1520, 1780, 2020];
  starPositions.forEach((x, i) => items.push({ kind: 'star', x, y: 0, z: 210 + i, zone: 'ceiling' }));

  items.push({ kind: 'table', x: TABLE_X, y: TABLE_Y, z: 0, zone: 'floor' });
  items.push({ kind: 'chair', x: TABLE_X - 60, y: TABLE_Y - 20, z: 0, zone: 'floor' });
  items.push({ kind: 'chair', x: TABLE_X + TABLE_TEX_W - 30, y: TABLE_Y - 20, z: 0, zone: 'floor' });

  items.push({
    kind: 'cake',
    x: TABLE_X + TABLE_TEX_W / 2,
    y: TABLE_Y + 6,
    z: 10,
    zone: 'tabletop',
    configJson: JSON.stringify({
      style: 'tiered-classic',
      frostingColor: '#fff8f0',
      spongeColor: '#c98a4b',
      topper: 'none',
      text: '',
      candles: 'small',
    }),
  });
  items.push({ kind: 'cupcake-stand', x: TABLE_X + 20, y: TABLE_Y - 24, z: 20, zone: 'tabletop' });
  items.push({ kind: 'vase', x: TABLE_X + TABLE_TEX_W - 70, y: TABLE_Y - 30, z: 30, zone: 'tabletop' });
  items.push({ kind: 'snack-bowl', x: TABLE_X + TABLE_TEX_W - 130, y: TABLE_Y - 12, z: 40, zone: 'tabletop' });
  items.push({ kind: 'cups', x: TABLE_X + 40, y: TABLE_Y - 8, z: 50, zone: 'tabletop' });

  items.push({ kind: 'shelf', x: 1780, y: 130, z: 220, zone: 'wall' });

  const balloonColors = ['purple', 'red', 'green', 'yellow', 'orange', 'pink'];
  const balloonBaseX = [1980, 2050, 2120, 2190, 2260, 2330];
  const balloonBaseY = [180, 235, 190, 160, 225, 195];
  balloonColors.forEach((color, i) =>
    items.push({
      kind: 'balloon',
      x: balloonBaseX[i],
      y: balloonBaseY[i],
      z: 230 + i,
      zone: 'ceiling',
      configJson: JSON.stringify({ color }),
    }),
  );

  items.push({ kind: 'cat', x: 400, y: 600, z: 0, zone: 'floor' });

  return items;
}
