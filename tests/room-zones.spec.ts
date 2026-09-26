import { test, expect } from '@playwright/test';
import { defaultLayout } from '../src/server/defaultLayout';
import { OBJECT_CATALOG } from '../src/room/objectCatalog';
import { clampToZone, defaultPositionFor, inZone, snapScale, snapToGrid, stepScale, zoneBounds, GRID_SIZE } from '../src/room/zones';

/** Room Editor Phase 5: the placement rules are one pure module, used by the editor's clamps and by
 * the server's enforcement, so they're tested directly (no browser needed). */

const opts = { free: false, min: 0.25, max: 4 };

test('every object in the real default layout sits inside its own zone (so enforcing zones never breaks a fresh room)', () => {
  const bad = defaultLayout(9).filter((o) => !inZone(o.zone, o.x, o.y)).map((o) => `${o.kind}(${o.zone}) at ${o.x},${o.y}`);
  expect(bad).toEqual([]);
});

test('every catalog kind has a sensible first position inside its own default zone', () => {
  for (const entry of Object.values(OBJECT_CATALOG)) {
    const p = defaultPositionFor(entry.defaultZone);
    expect(inZone(entry.defaultZone, p.x, p.y), `${entry.key} (${entry.defaultZone}) -> ${p.x},${p.y}`).toBe(true);
  }
});

test('zones clamp a point to the nearest allowed spot; "anywhere" never moves it', () => {
  expect(zoneBounds('anywhere')).toBeNull();
  expect(clampToZone('anywhere', -9999, 9999)).toEqual({ x: -9999, y: 9999 });
  // a rug dropped up on the wall goes back to the floor; a lamp dropped in mid-air lands on the floor line
  const floor = clampToZone('floor', 500, 100);
  expect(floor.x).toBe(500);
  expect(floor.y).toBe(zoneBounds('floor')!.yMin);
  expect(inZone('floor', floor.x, floor.y)).toBe(true);
  // a ceiling item can't be dragged down to the floor
  expect(clampToZone('ceiling', 900, 700).y).toBe(zoneBounds('ceiling')!.yMax);
  // a tabletop item stays over the table
  const t = clampToZone('tabletop', 50, 700);
  expect(inZone('tabletop', t.x, t.y)).toBe(true);
  expect(t.x).toBe(zoneBounds('tabletop')!.xMin);
  // points already inside come back untouched
  expect(clampToZone('wall', 300, 200)).toEqual({ x: 300, y: 200 });
  // unknown zone names are treated as unrestricted rather than throwing
  expect(inZone('not-a-zone', 1, 1)).toBe(true);
});

test('scale steps walk whole numbers by default (crisp pixels), quarter steps when free, and respect the bounds', () => {
  expect(stepScale(1, 1, opts)).toBe(2);
  expect(stepScale(2, 1, opts)).toBe(3);
  expect(stepScale(4, 1, opts)).toBe(4); // clamped at max
  expect(stepScale(1, -1, opts)).toBe(0.5);
  expect(stepScale(0.25, -1, opts)).toBe(0.25); // clamped at min
  expect(stepScale(1.25, 1, opts)).toBe(2); // an off-grid scale moves to the next crisp value
  expect(stepScale(1.25, -1, opts)).toBe(1);
  expect(stepScale(1, 1, { ...opts, free: true })).toBe(1.25);
  expect(stepScale(1, -1, { ...opts, free: true })).toBe(0.75);
  expect(stepScale(3.9, 1, { ...opts, free: true })).toBe(4);
  expect(stepScale(0.3, -1, { ...opts, free: true })).toBe(0.25);
  // bounds from env are honored, not hard-coded
  expect(stepScale(1, 1, { free: false, min: 0.25, max: 2 })).toBe(2);
  expect(stepScale(2, 1, { free: false, min: 0.25, max: 2 })).toBe(2);
});

test('a dragged/pinched scale snaps to the nearest crisp value unless free-scale is on', () => {
  expect(snapScale(2.4, opts)).toBe(2);
  expect(snapScale(2.6, opts)).toBe(3);
  expect(snapScale(0.4, opts)).toBe(0.5);
  expect(snapScale(9, opts)).toBe(4);
  expect(snapScale(0.01, opts)).toBe(0.25);
  expect(snapScale(2.437, { ...opts, free: true })).toBe(2.44);
  expect(snapScale(9, { ...opts, free: true })).toBe(4);
});

test('snap-to-grid rounds to the 16px grid', () => {
  expect(GRID_SIZE).toBe(16);
  expect(snapToGrid(0)).toBe(0);
  expect(snapToGrid(7)).toBe(0);
  expect(snapToGrid(8)).toBe(16);
  expect(snapToGrid(701)).toBe(704);
  expect(snapToGrid(-9)).toBe(-16);
});
