import { test, expect, type APIRequestContext } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { LIMITS } from '../src/config/limits';
import { BOX_SIZE_FACTOR, sizeFactorOf } from '../src/box/types';

/**
 * Room Editor Phase 4a: placed presents get move + resize + stacking, gated
 * by canMoveOwnPresents or host. Only position, scale, and z may change; contents stay sealed and
 * the birthday lock is untouched. Every denial here is a real request the server refuses.
 */

const DESIGN = {
  shape: 'cube', pattern: 'solid', baseColor: '#f4a6c1', accentColor: '#ff3d8b', ribbon: 'vertical',
  ribbonColor: '#fff6d5', bow: 'classic', tag: 'none', tagText: '', sticker: 'none', topper: 'none',
};
let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.88.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

async function pack(request: APIRequestContext, token: string, opts: { session?: string; design?: object; text?: string } = {}) {
  const res = await request.post(`/api/rooms/${token}/boxes`, {
    headers: { ...(opts.session ? { 'X-Contributor-Session': opts.session } : {}), ...ip() },
    data: { fromName: 'Pat', design: opts.design ?? DESIGN, x: 500, y: 600, goodies: [{ type: 'note', text: opts.text ?? 'SEALED-NOTE-TEXT', sizeBytes: 20 }] },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string; deleteToken: string };
}

async function patch(request: APIRequestContext, token: string, boxId: string, data: unknown, session?: string) {
  return request.patch(`/api/rooms/${token}/boxes/${boxId}`, {
    data,
    headers: { ...(session ? { 'X-Contributor-Session': session } : {}), ...ip() },
  });
}

const listBoxes = async (request: APIRequestContext, token: string, session?: string) =>
  (await (await request.get(`/api/rooms/${token}/boxes`, { headers: session ? { 'X-Contributor-Session': session } : {} })).json()).boxes as Array<{
    id: string; x: number; y: number; z: number; scale: number; mine: boolean; design: { size?: string };
  }>;

async function setPermissions(request: APIRequestContext, admin: string, over: { canMoveOwnPresents?: boolean; freezeLayout?: boolean; canRearrange?: boolean }) {
  const res = await request.put(`/api/rooms/${admin}/permissions`, {
    data: {
      contributors: { canDecorate: 'off', canImport: false, canDraw: false, canMoveOwnPresents: over.canMoveOwnPresents ?? false, maxItemsPerContributor: 10 },
      celebrant: { canRearrange: over.canRearrange ?? false },
      freezeLayout: over.freezeLayout ?? false,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test('a new present starts at scale 1, layer 0; the host can move, resize and reorder it and it persists', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'PresentHost' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  const { id } = await pack(request, contribute);

  const [fresh] = await listBoxes(request, admin);
  expect(fresh).toMatchObject({ id, x: 500, y: 600, z: 0, scale: 1 });

  const res = await patch(request, admin, id, { x: 1200, y: 640, z: 3, scale: 2.5 });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).box).toEqual({ id, x: 1200, y: 640, z: 3, scale: 2.5 });
  expect(await listBoxes(request, admin)).toEqual([expect.objectContaining({ id, x: 1200, y: 640, z: 3, scale: 2.5 })]);

  // a partial update only touches what it names
  await patch(request, admin, id, { scale: 1 });
  expect(await listBoxes(request, admin)).toEqual([expect.objectContaining({ x: 1200, y: 640, z: 3, scale: 1 })]);
});

test('scale is bounded by MIN/MAX_PRESENT_SCALE and position by the room; nothing else may be sent', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'PresentBounds' });
  const admin = tokenFromLink(room.links.admin);
  const { id } = await pack(request, tokenFromLink(room.links.contribute));

  expect(LIMITS.minPresentScale).toBe(0.5);
  expect(LIMITS.maxPresentScale).toBe(3);
  expect((await patch(request, admin, id, { scale: LIMITS.minPresentScale })).status()).toBe(200);
  expect((await patch(request, admin, id, { scale: LIMITS.maxPresentScale })).status()).toBe(200);
  expect((await patch(request, admin, id, { scale: 0.49 })).status()).toBe(400);
  expect((await patch(request, admin, id, { scale: 3.01 })).status()).toBe(400);
  expect((await patch(request, admin, id, { scale: 0 })).status()).toBe(400);
  expect((await patch(request, admin, id, { scale: -1 })).status()).toBe(400);
  expect((await patch(request, admin, id, { scale: '2' })).status()).toBe(400);
  expect((await patch(request, admin, id, { x: -1 })).status()).toBe(400);
  expect((await patch(request, admin, id, { x: 2401 })).status()).toBe(400);
  expect((await patch(request, admin, id, { y: 761 })).status()).toBe(400);
  expect((await patch(request, admin, id, { z: 1.5 })).status()).toBe(400);
  expect((await patch(request, admin, id, { z: -1 })).status()).toBe(400);
  expect((await patch(request, admin, id, {})).status()).toBe(400);
  expect((await patch(request, admin, id, { x: 0, y: 0 })).status()).toBe(200); // the edges are in

  // "Only position, scale, and z can change": any other field is refused outright, not ignored
  for (const extra of [
    { fromName: 'Hacker' }, { design: DESIGN }, { goodies: [] }, { openInOrder: true },
    { roomId: 'other-room' }, { deleteTokenHash: 'x' }, { openedAt: '2020-01-01T00:00:00Z' }, { createdBySessionHash: 'x' },
  ]) {
    const res = await patch(request, admin, id, { scale: 1, ...extra });
    expect(res.status(), JSON.stringify(extra)).toBe(400);
  }
  const [after] = await listBoxes(request, admin);
  expect(after).toMatchObject({ x: 0, y: 0, scale: LIMITS.maxPresentScale });
});

test('moving a present never touches its sealed contents, and the birthday lock still holds', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'PresentSealed', eventAt: new Date(Date.now() + 60 * 60_000).toISOString() });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  const celebrate = tokenFromLink(room.links.celebrate);
  const { id } = await pack(request, contribute, { text: 'STILL-SEALED-TEXT' });

  await patch(request, admin, id, { x: 900, y: 650, z: 5, scale: 2 });

  // still locked for every token, and nothing about the contents leaked into the public list
  for (const t of [celebrate, admin, contribute]) expect((await request.get(`/api/boxes/${id}/contents?token=${t}`)).status()).toBe(403);
  expect(JSON.stringify(await listBoxes(request, admin))).not.toContain('STILL-SEALED-TEXT');

  // after unlock the contents are exactly what was packed (moving did not alter them)
  expect((await request.post(`/api/rooms/${admin}/unlock`)).ok()).toBeTruthy();
  const contents = await (await request.get(`/api/boxes/${id}/contents?token=${celebrate}`)).json();
  expect(contents.goodies).toHaveLength(1);
  expect(contents.goodies[0]).toMatchObject({ type: 'note', text: 'STILL-SEALED-TEXT' });
  expect(contents.fromName).toBe('Pat');
});

test('contributors move only their own presents, only when canMoveOwnPresents is on', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'PresentOwn' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  const mine = await pack(request, contribute, { session: 'owner-A' });
  const theirs = await pack(request, contribute, { session: 'someone-B' });

  // default: off — nobody but the host moves anything
  expect((await patch(request, contribute, mine.id, { scale: 2 }, 'owner-A')).status()).toBe(403);

  await setPermissions(request, admin, { canMoveOwnPresents: true });
  const ok = await patch(request, contribute, mine.id, { scale: 2, x: 800 }, 'owner-A');
  expect(ok.status(), await ok.text()).toBe(200);
  expect((await patch(request, contribute, theirs.id, { scale: 2 }, 'owner-A')).status()).toBe(403); // someone else's
  expect((await patch(request, contribute, mine.id, { scale: 2 })).status()).toBe(403); // no session at all
  expect((await patch(request, contribute, mine.id, { scale: 2 }, 'wrong-session')).status()).toBe(403);

  // a wrong/stale undo token proves nothing; the right one proves ownership even with no session
  const wrong = await patch(request, contribute, mine.id, { scale: 1.5, deleteToken: 'not-the-token' });
  expect(wrong.status()).toBe(403);
  const viaToken = await patch(request, contribute, mine.id, { scale: 1.5, deleteToken: mine.deleteToken });
  expect(viaToken.status(), await viaToken.text()).toBe(200);
  // ...but only for THAT present
  expect((await patch(request, contribute, theirs.id, { scale: 1.5, deleteToken: mine.deleteToken })).status()).toBe(403);

  const boxes = await listBoxes(request, admin);
  expect(boxes.find((b) => b.id === mine.id)).toMatchObject({ scale: 1.5, x: 800 });
  expect(boxes.find((b) => b.id === theirs.id)).toMatchObject({ scale: 1, x: 500 }); // untouched by every refusal
});

test('the celebrant can never move a present, even unlocked with canRearrange on; freeze stops everyone but the host', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'PresentCelebrant' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  const celebrate = tokenFromLink(room.links.celebrate);
  const { id } = await pack(request, contribute, { session: 'freezer' });

  await request.post(`/api/rooms/${admin}/unlock`);
  await setPermissions(request, admin, { canMoveOwnPresents: true, canRearrange: true });
  expect((await patch(request, celebrate, id, { scale: 2 })).status()).toBe(403);
  expect((await patch(request, celebrate, id, { scale: 2 }, 'freezer')).status()).toBe(403);

  // contributor is fine until the host freezes the layout
  expect((await patch(request, contribute, id, { scale: 2 }, 'freezer')).status()).toBe(200);
  await setPermissions(request, admin, { canMoveOwnPresents: true, freezeLayout: true });
  expect((await patch(request, contribute, id, { scale: 1 }, 'freezer')).status()).toBe(403);
  expect((await patch(request, admin, id, { scale: 1 })).status()).toBe(200); // host unaffected
});

test('a present is only reachable through its own room, and unknown ids are 404', async ({ request }) => {
  const a = await seedRoom(request, { celebrantName: 'PresentIsoA' });
  const b = await seedRoom(request, { celebrantName: 'PresentIsoB' });
  const { id } = await pack(request, tokenFromLink(a.links.contribute));
  expect((await patch(request, tokenFromLink(b.links.admin), id, { scale: 2 })).status()).toBe(404);
  expect((await patch(request, tokenFromLink(a.links.admin), 'no-such-box', { scale: 2 })).status()).toBe(404);
  expect((await patch(request, 'not-a-token', id, { scale: 2 })).status()).toBe(404);
  expect((await listBoxes(request, tokenFromLink(a.links.admin)))[0].scale).toBe(1);
});

test('"mine" tells each browser which presents it packed (host: all), without exposing the session hash', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'PresentMine' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  const a = await pack(request, contribute, { session: 'sess-a' });
  const b = await pack(request, contribute, { session: 'sess-b' });
  const legacy = await pack(request, contribute); // no session header: nobody but the host owns it

  const asA = await listBoxes(request, contribute, 'sess-a');
  expect(Object.fromEntries(asA.map((x) => [x.id, x.mine]))).toEqual({ [a.id]: true, [b.id]: false, [legacy.id]: false });
  const asHost = await listBoxes(request, admin);
  expect(asHost.every((x) => x.mine)).toBe(true);
  const raw = await (await request.get(`/api/rooms/${contribute}/boxes`, { headers: { 'X-Contributor-Session': 'sess-a' } })).text();
  expect(raw).not.toContain('createdBySessionHash');
  expect(raw).not.toContain('sess-a');
});

test('S/M/L: a design\'s size round-trips, and M (or no size) is exactly the original footprint', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'PresentSize' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  for (const size of ['S', 'M', 'L']) await pack(request, contribute, { design: { ...DESIGN, size } });
  await pack(request, contribute); // an older design with no size at all
  const sizes = (await listBoxes(request, admin)).map((b) => b.design.size);
  expect(sizes).toEqual(['S', 'M', 'L', undefined]);

  expect(BOX_SIZE_FACTOR).toEqual({ S: 0.75, M: 1, L: 1.5 });
  expect(sizeFactorOf({})).toBe(1); // no size == M, so old presents render unchanged
  expect(sizeFactorOf({ size: 'S' })).toBeLessThan(sizeFactorOf({ size: 'M' }));
  expect(sizeFactorOf({ size: 'L' })).toBeGreaterThan(sizeFactorOf({ size: 'M' }));
});
