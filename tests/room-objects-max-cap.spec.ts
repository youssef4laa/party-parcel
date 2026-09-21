import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { LIMITS } from '../src/config/limits';

/**
 * Room Editor Phase 1b, standing test (b): "MAX_OBJECTS_PER_ROOM is refused at the cap" — see
 * src/app/api/rooms/[token]/objects/route.ts's POST handler, which counts existing rows and
 * refuses a create once the room already has LIMITS.maxObjectsPerRoom (default 300).
 *
 * Each request carries a distinct X-Forwarded-For value so none of them share the create route's
 * per-IP rate-limit bucket (`objects-create:<ip>:<token>`, 40/60s) — that limiter is a separate,
 * already-implied concern (it's what stops a single caller from hammering the create endpoint);
 * this test is specifically about the room-wide count check, which has to hold regardless of how
 * many different callers spread the creates across.
 */
test('a room refuses a new object once it already holds the max, and accepts again after one is deleted', async ({ request }) => {
  test.setTimeout(60_000);

  const room = await seedRoom(request, { celebrantName: 'CapSuite' });
  const admin = tokenFromLink(room.links.admin);

  // The default layout already seeds ~42 objects (lazy-seeded on first GET) — fetch first so the
  // loop below tops the room up to exactly the cap regardless of that starting count.
  const initial = await request.get(`/api/rooms/${admin}/objects`);
  const startingCount = (await initial.json()).objects.length;

  let lastCreatedId = '';
  for (let i = startingCount; i < LIMITS.maxObjectsPerRoom; i++) {
    const res = await request.post(`/api/rooms/${admin}/objects`, {
      headers: { 'X-Forwarded-For': `10.66.${Math.floor(i / 250)}.${i % 250}` },
      data: { kind: 'sofa', x: 10, y: 10, zone: 'anywhere' },
    });
    expect(res.ok(), `create #${i} should succeed while under the cap`).toBeTruthy();
    lastCreatedId = (await res.json()).object.id;
  }

  const countRes = await request.get(`/api/rooms/${admin}/objects`);
  expect((await countRes.json()).objects).toHaveLength(LIMITS.maxObjectsPerRoom);

  const overCap = await request.post(`/api/rooms/${admin}/objects`, {
    headers: { 'X-Forwarded-For': '10.66.99.99' },
    data: { kind: 'sofa', x: 20, y: 20, zone: 'anywhere' },
  });
  expect(overCap.status()).toBe(400);
  expect((await overCap.json()).error).toMatch(new RegExp(`max of ${LIMITS.maxObjectsPerRoom}`));

  // Deleting one frees a slot — proves this is a live count check, not a one-time gate.
  const del = await request.delete(`/api/rooms/${admin}/objects/${lastCreatedId}`);
  expect(del.ok()).toBeTruthy();

  const afterDelete = await request.post(`/api/rooms/${admin}/objects`, {
    headers: { 'X-Forwarded-For': '10.66.100.1' },
    data: { kind: 'sofa', x: 30, y: 30, zone: 'anywhere' },
  });
  expect(afterDelete.ok()).toBeTruthy();
});
