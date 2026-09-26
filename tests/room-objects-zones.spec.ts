import { test, expect, type APIRequestContext } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { makePng } from './customItemFixtures';

/**
 * Room Editor Phase 5 (docs/ROOM_EDITOR.md 1b): "Each item has a zone ... that limits placement;
 * the host can toggle place anywhere." The limit is enforced by the server for everyone but the host
 * — a zone the client alone respected would be decoration, not a rule.
 */

let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.22.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

async function setup(request: APIRequestContext, name: string) {
  const room = await seedRoom(request, { celebrantName: name, eventAt: new Date(Date.now() - 60_000).toISOString() });
  const admin = tokenFromLink(room.links.admin);
  await request.put(`/api/rooms/${admin}/permissions`, {
    data: { contributors: { canDecorate: 'any', canImport: true, canDraw: true, canMoveOwnPresents: false, maxItemsPerContributor: 50 }, celebrant: { canRearrange: true }, freezeLayout: false },
  });
  return { admin, contribute: tokenFromLink(room.links.contribute), celebrate: tokenFromLink(room.links.celebrate) };
}
const create = (request: APIRequestContext, token: string, data: Record<string, unknown>, session = 'zone-session') =>
  request.post(`/api/rooms/${token}/objects`, { data, headers: { 'X-Contributor-Session': session, ...ip() } });
const move = (request: APIRequestContext, token: string, id: string, data: Record<string, unknown>, session = 'zone-session') =>
  request.patch(`/api/rooms/${token}/objects/${id}`, { data, headers: { 'X-Contributor-Session': session, ...ip() } });

test('a contributor can place a floor item on the floor, but not up on the wall or ceiling', async ({ request }) => {
  const { contribute } = await setup(request, 'ZoneFloor');
  const ok = await create(request, contribute, { kind: 'sofa', x: 700, y: 650, zone: 'floor' });
  expect(ok.status(), await ok.text()).toBe(200);
  expect((await ok.json()).object.zone).toBe('floor');

  for (const y of [0, 100, 429]) {
    const res = await create(request, contribute, { kind: 'sofa', x: 700, y, zone: 'floor' });
    expect(res.status(), `y=${y}`).toBe(400);
    expect((await res.json()).error).toMatch(/isn't valid for a floor item/);
  }
});

test('claiming zone "anywhere" does not escape the limit: a non-host always gets the catalog zone', async ({ request }) => {
  const { contribute, celebrate } = await setup(request, 'ZoneClaim');
  // asked for "anywhere", up on the ceiling: still a floor item, so refused
  const escape = await create(request, contribute, { kind: 'sofa', x: 700, y: 60, zone: 'anywhere' });
  expect(escape.status()).toBe(400);
  // asked for "anywhere" but placed legitimately: created, and stored as a FLOOR item (not anywhere)
  const stored = await create(request, contribute, { kind: 'sofa', x: 700, y: 650, zone: 'anywhere' });
  expect(stored.status(), await stored.text()).toBe(200);
  expect((await stored.json()).object.zone).toBe('floor');
  // the celebrant can only rearrange (never create), so this is about updates below — but creating is refused regardless
  expect((await create(request, celebrate, { kind: 'sofa', x: 700, y: 650, zone: 'anywhere' })).status()).toBe(403);
});

test('each zone is enforced for the kinds that live in it: wall, ceiling, tabletop', async ({ request }) => {
  const { contribute } = await setup(request, 'ZoneKinds');
  // wall item (bookshelf): fine on the wall, not on the floor
  expect((await create(request, contribute, { kind: 'bookshelf', x: 500, y: 200, zone: 'wall' })).status()).toBe(200);
  expect((await create(request, contribute, { kind: 'bookshelf', x: 500, y: 700, zone: 'wall' })).status()).toBe(400);
  // ceiling item (streamers): fine at the top, not lower down
  expect((await create(request, contribute, { kind: 'streamers', x: 500, y: 40, zone: 'ceiling' })).status()).toBe(200);
  expect((await create(request, contribute, { kind: 'streamers', x: 500, y: 500, zone: 'ceiling' })).status()).toBe(400);
  // tabletop item (table lamp): only over the party table
  expect((await create(request, contribute, { kind: 'table-lamp', x: 1150, y: 566, zone: 'tabletop' })).status()).toBe(200);
  expect((await create(request, contribute, { kind: 'table-lamp', x: 200, y: 566, zone: 'tabletop' })).status()).toBe(400);
  // "anywhere" kinds (a potted plant) are unrestricted
  expect((await create(request, contribute, { kind: 'potted-plant', x: 100, y: 30, zone: 'anywhere' })).status()).toBe(200);
});

test('moving an item out of its zone is refused for everyone but the host; moving within it is fine', async ({ request }) => {
  const { admin, contribute, celebrate } = await setup(request, 'ZoneMove');
  await request.post(`/api/rooms/${admin}/unlock`);
  const made = await create(request, contribute, { kind: 'sofa', x: 700, y: 650, zone: 'floor' });
  const id = (await made.json()).object.id as string;

  expect((await move(request, contribute, id, { x: 1500, y: 700 })).status()).toBe(200); // still on the floor
  const up = await move(request, contribute, id, { y: 100 }); // dragged up the wall
  expect(up.status()).toBe(400);
  expect((await up.json()).error).toMatch(/isn't valid for a floor item/);
  expect((await move(request, contribute, id, { x: 50, y: 20 })).status()).toBe(400);
  // the celebrant (canRearrange) is held to the same limit
  expect((await move(request, celebrate, id, { y: 100 }, 'celeb')).status()).toBe(400);
  expect((await move(request, celebrate, id, { x: 900, y: 660 }, 'celeb')).status()).toBe(200);
  // non-positional edits are unaffected
  expect((await move(request, contribute, id, { flipX: true, scale: 2 })).status()).toBe(200);

  const stillThere = (await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects.find((o: { id: string }) => o.id === id);
  expect(stillThere).toMatchObject({ x: 900, y: 660, flipX: true, scale: 2, zone: 'floor' });
});

test('the host can place anywhere: no zone limit on create or move', async ({ request }) => {
  const { admin } = await setup(request, 'ZoneHost');
  const up = await create(request, admin, { kind: 'sofa', x: 700, y: 50, zone: 'floor' });
  expect(up.status(), await up.text()).toBe(200);
  const id = (await up.json()).object.id as string;
  expect((await move(request, admin, id, { x: -300, y: 890 })).status()).toBe(200);
  // and the host may choose a different zone for an item outright
  const any = await create(request, admin, { kind: 'sofa', x: 100, y: 100, zone: 'anywhere' });
  expect((await any.json()).object.zone).toBe('anywhere');
});

test('custom items are placeable anywhere by a contributor (they have no zone of their own)', async ({ request }) => {
  const { contribute } = await setup(request, 'ZoneCustom');
  const up = await request.post(`/api/rooms/${contribute}/custom-items?source=import&name=z`, {
    data: await makePng(6, 6), headers: { 'Content-Type': 'image/png', 'X-Contributor-Session': 'zone-session', ...ip() },
  });
  expect(up.ok(), await up.text()).toBeTruthy();
  const assetId = (await up.json()).item.id as string;
  for (const [x, y] of [[100, 30], [900, 400], [1500, 700]]) {
    const res = await create(request, contribute, { kind: 'custom', assetId, x, y, zone: 'floor' });
    expect(res.status(), `${x},${y}: ${await res.text()}`).toBe(200);
    expect((await res.json()).object.zone).toBe('anywhere'); // a client-claimed zone is ignored here too
  }
});
