import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

/**
 * Room Editor (docs/ROOM_EDITOR.md, Phase 1) permission matrix. Every one of these has to hold
 * as a server-side rule, independent of what the UI shows — the pencil icon is hidden from a
 * role/room state that lacks 'objects:edit-mode' in its capabilities list, but that's a display
 * hint only (see src/server/permissions.ts's doc comment and src/room/api.ts's RoomInfo.capabilities
 * comment). These tests hit the API directly, bypassing the UI entirely, to prove hiding the
 * pencil is never the actual boundary.
 */

const FAR_FUTURE = new Date(Date.now() + 60 * 60_000).toISOString(); // stays locked all suite
const PAST = new Date(Date.now() - 60_000).toISOString(); // unlocked immediately

async function setPermissions(request: import('@playwright/test').APIRequestContext, admin: string, patch: Record<string, unknown>) {
  const current = await (await request.get(`/api/rooms/${admin}/permissions`)).json();
  const merged = { ...current.permissions, ...patch };
  const res = await request.put(`/api/rooms/${admin}/permissions`, { data: merged });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).permissions;
}

test.describe('room objects — create/decorate permission before unlock', () => {
  let admin: string;
  let contribute: string;
  let celebrate: string;

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PermSuiteA', eventAt: FAR_FUTURE });
    admin = tokenFromLink(room.links.admin);
    contribute = tokenFromLink(room.links.contribute);
    celebrate = tokenFromLink(room.links.celebrate);
  });

  test('celebrate token cannot create an object before unlock, even with canRearrange on', async ({ request }) => {
    await setPermissions(request, admin, { celebrant: { canRearrange: true } });
    const res = await request.post(`/api/rooms/${celebrate}/objects`, {
      data: { kind: 'sofa', x: 100, y: 650, zone: 'floor' },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/permission/i);
  });

  test('contribute token cannot create when canDecorate is off (the default)', async ({ request }) => {
    await setPermissions(request, admin, { contributors: { canDecorate: 'off', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 } });
    const res = await request.post(`/api/rooms/${contribute}/objects`, {
      headers: { 'X-Contributor-Session': 'sess-a' },
      data: { kind: 'sofa', x: 100, y: 650, zone: 'floor' },
    });
    expect(res.status()).toBe(403);
  });

  test('admin can always create, room stays locked', async ({ request }) => {
    const res = await request.post(`/api/rooms/${admin}/objects`, {
      data: { kind: 'sofa', x: 100, y: 650, zone: 'floor' },
    });
    expect(res.ok()).toBeTruthy();
  });
});

test.describe('room objects — contributor ownership isolation (own-only mode)', () => {
  let admin: string;
  let contribute: string;
  let objectId: string;
  const sessionA = 'contributor-session-a';
  const sessionB = 'contributor-session-b';

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PermSuiteB', eventAt: FAR_FUTURE });
    admin = tokenFromLink(room.links.admin);
    contribute = tokenFromLink(room.links.contribute);
    await setPermissions(request, admin, {
      contributors: { canDecorate: 'own', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 },
    });

    const created = await request.post(`/api/rooms/${contribute}/objects`, {
      headers: { 'X-Contributor-Session': sessionA },
      data: { kind: 'sofa', x: 200, y: 650, zone: 'floor' },
    });
    expect(created.ok()).toBeTruthy();
    objectId = (await created.json()).object.id;
  });

  test('contributor B cannot update an item placed by contributor A', async ({ request }) => {
    const res = await request.patch(`/api/rooms/${contribute}/objects/${objectId}`, {
      headers: { 'X-Contributor-Session': sessionB },
      data: { x: 999 },
    });
    expect(res.status()).toBe(403);
  });

  test('contributor B cannot delete an item placed by contributor A', async ({ request }) => {
    const res = await request.delete(`/api/rooms/${contribute}/objects/${objectId}`, {
      headers: { 'X-Contributor-Session': sessionB },
    });
    expect(res.status()).toBe(403);
  });

  test('contributor A can update their own item', async ({ request }) => {
    const res = await request.patch(`/api/rooms/${contribute}/objects/${objectId}`, {
      headers: { 'X-Contributor-Session': sessionA },
      data: { x: 321 },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).object.x).toBe(321);
  });

  test('a contributor session with no prior items cannot create without a session header', async ({ request }) => {
    const res = await request.post(`/api/rooms/${contribute}/objects`, {
      data: { kind: 'sofa', x: 10, y: 650, zone: 'floor' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('room objects — freeze layout, locking, and staleness', () => {
  let admin: string;
  let contribute: string;
  let objectId: string;

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PermSuiteC', eventAt: FAR_FUTURE });
    admin = tokenFromLink(room.links.admin);
    contribute = tokenFromLink(room.links.contribute);
    await setPermissions(request, admin, {
      contributors: { canDecorate: 'any', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 },
    });
    const created = await request.post(`/api/rooms/${contribute}/objects`, {
      headers: { 'X-Contributor-Session': 'freeze-test-session' },
      data: { kind: 'sofa', x: 50, y: 650, zone: 'floor' },
    });
    objectId = (await created.json()).object.id;
  });

  test('freeze layout blocks a contributor with canDecorate=any', async ({ request }) => {
    await setPermissions(request, admin, { freezeLayout: true });
    const res = await request.patch(`/api/rooms/${contribute}/objects/${objectId}`, {
      headers: { 'X-Contributor-Session': 'freeze-test-session' },
      data: { x: 60 },
    });
    expect(res.status()).toBe(403);
  });

  test('freeze layout does not block the host', async ({ request }) => {
    const res = await request.patch(`/api/rooms/${admin}/objects/${objectId}`, { data: { x: 70 } });
    expect(res.ok()).toBeTruthy();
    await setPermissions(request, admin, { freezeLayout: false }); // unfreeze for the rest of this describe block
  });

  test('a locked item blocks a contributor with canDecorate=any, but not the host', async ({ request }) => {
    const lock = await request.patch(`/api/rooms/${admin}/objects/${objectId}`, { data: { locked: true } });
    expect(lock.ok()).toBeTruthy();

    const blocked = await request.patch(`/api/rooms/${contribute}/objects/${objectId}`, {
      headers: { 'X-Contributor-Session': 'freeze-test-session' },
      data: { x: 80 },
    });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).error).toMatch(/locked/i);

    const unlock = await request.patch(`/api/rooms/${admin}/objects/${objectId}`, { data: { locked: false } });
    expect(unlock.ok()).toBeTruthy();
  });

  test('a stale expectedUpdatedAt gets a 409 with the current object, correct value succeeds', async ({ request }) => {
    const current = await request.get(`/api/rooms/${admin}/objects`);
    const obj = (await current.json()).objects.find((o: { id: string }) => o.id === objectId);

    const stale = await request.patch(`/api/rooms/${admin}/objects/${objectId}`, {
      data: { x: 1, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' },
    });
    expect(stale.status()).toBe(409);
    const staleBody = await stale.json();
    expect(staleBody.object.id).toBe(objectId);

    const fresh = await request.patch(`/api/rooms/${admin}/objects/${objectId}`, {
      data: { x: 2, expectedUpdatedAt: obj.updatedAt },
    });
    expect(fresh.ok()).toBeTruthy();
    expect((await fresh.json()).object.x).toBe(2);
  });
});

test.describe('room objects — celebrant rearrange gate and reset-to-default', () => {
  let admin: string;
  let celebrate: string;
  let objectId: string;

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PermSuiteD', eventAt: PAST });
    admin = tokenFromLink(room.links.admin);
    celebrate = tokenFromLink(room.links.celebrate);
    const created = await request.post(`/api/rooms/${admin}/objects`, {
      data: { kind: 'sofa', x: 10, y: 650, zone: 'floor' },
    });
    objectId = (await created.json()).object.id;
  });

  test('celebrate cannot update even after unlock unless canRearrange is on', async ({ request }) => {
    await setPermissions(request, admin, { celebrant: { canRearrange: false } });
    const res = await request.patch(`/api/rooms/${celebrate}/objects/${objectId}`, { data: { x: 20 } });
    expect(res.status()).toBe(403);
  });

  test('celebrate can update (only update, never create) once unlocked and canRearrange is on', async ({ request }) => {
    await setPermissions(request, admin, { celebrant: { canRearrange: true } });

    const update = await request.patch(`/api/rooms/${celebrate}/objects/${objectId}`, { data: { x: 30 } });
    expect(update.ok()).toBeTruthy();

    const create = await request.post(`/api/rooms/${celebrate}/objects`, {
      data: { kind: 'sofa', x: 40, y: 650, zone: 'floor' },
    });
    expect(create.status()).toBe(403);
  });

  test('reset-to-default is host-only', async ({ request }) => {
    const asCelebrate = await request.post(`/api/rooms/${celebrate}/objects/reset`);
    expect(asCelebrate.status()).toBe(403);

    const asAdmin = await request.post(`/api/rooms/${admin}/objects/reset`);
    expect(asAdmin.ok()).toBeTruthy();
    const body = await asAdmin.json();
    expect(body.objects.length).toBeGreaterThan(0);
    expect(body.objects.find((o: { id: string }) => o.id === objectId)).toBeUndefined(); // reset wipes prior objects
  });
});

test.describe('room objects — per-contributor item cap', () => {
  test('a contributor is blocked once they hit maxItemsPerContributor', async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PermSuiteE', eventAt: FAR_FUTURE });
    const admin = tokenFromLink(room.links.admin);
    const contribute = tokenFromLink(room.links.contribute);
    await setPermissions(request, admin, {
      contributors: { canDecorate: 'any', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 2 },
    });

    const session = 'cap-test-session';
    for (let i = 0; i < 2; i++) {
      const res = await request.post(`/api/rooms/${contribute}/objects`, {
        headers: { 'X-Contributor-Session': session },
        data: { kind: 'sofa', x: i, y: 650, zone: 'floor' },
      });
      expect(res.ok()).toBeTruthy();
    }

    const third = await request.post(`/api/rooms/${contribute}/objects`, {
      headers: { 'X-Contributor-Session': session },
      data: { kind: 'sofa', x: 99, y: 650, zone: 'floor' },
    });
    expect(third.status()).toBe(400);
    expect((await third.json()).error).toMatch(/max of 2/);
  });
});

test.describe('room objects — permissions tab is host-only', () => {
  test('contribute and celebrate tokens cannot read or write room permissions', async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PermSuiteF' });
    const contribute = tokenFromLink(room.links.contribute);
    const celebrate = tokenFromLink(room.links.celebrate);

    for (const token of [contribute, celebrate]) {
      const get = await request.get(`/api/rooms/${token}/permissions`);
      expect(get.status()).toBe(403);
      const put = await request.put(`/api/rooms/${token}/permissions`, { data: { freezeLayout: true } });
      expect(put.status()).toBe(403);
    }
  });
});

test.describe('room objects — lazy-seed and idempotency', () => {
  test('GET seeds the default layout once and is stable across repeated calls', async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PermSuiteG' });
    const admin = tokenFromLink(room.links.admin);

    const first = await request.get(`/api/rooms/${admin}/objects`);
    const firstBody = await first.json();
    expect(firstBody.objects.length).toBeGreaterThan(0);

    const second = await request.get(`/api/rooms/${admin}/objects`);
    const secondBody = await second.json();
    expect(secondBody.objects.length).toBe(firstBody.objects.length);
  });
});
