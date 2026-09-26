import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

/**
 * Room Editor Phase 2 — API-level coverage for the cake's configJson: the
 * default candle count seeded from the room's age, that the Cake editor's PATCH channel (same
 * generic `updateRoomObject` every other configurable item uses) actually persists, that it's
 * gated by the same permission matrix as any other object update (nothing cake-specific bypasses
 * it — src/server/permissions.ts's canMutateObjects has no `kind` parameter at all), and that
 * "extra cakes can be added as items" really works.
 */

async function getCake(request: import('@playwright/test').APIRequestContext, token: string) {
  const res = await request.get(`/api/rooms/${token}/objects`);
  const { objects } = await res.json();
  return objects.find((o: { kind: string }) => o.kind === 'cake');
}

test('a fresh room seeds the cake with a candle count matching the celebrant age, clamped to 10', async ({ request }) => {
  const young = await seedRoom(request, { celebrantName: 'CakeAgeYoung', age: 3 });
  const cakeYoung = await getCake(request, tokenFromLink(young.links.admin));
  expect(JSON.parse(cakeYoung.configJson).candleCount).toBe(3);

  const old = await seedRoom(request, { celebrantName: 'CakeAgeOld', age: 45 });
  const cakeOld = await getCake(request, tokenFromLink(old.links.admin));
  expect(JSON.parse(cakeOld.configJson).candleCount).toBe(10);
});

test('the default cake config has the full Phase 2 shape and a sane candle mode', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CakeShapeCheck', age: 6 });
  const cake = await getCake(request, tokenFromLink(room.links.admin));
  const config = JSON.parse(cake.configJson);
  expect(config).toMatchObject({
    style: 'tiered-classic',
    topper: 'none',
    text: '',
    candleMode: 'count',
    candleCount: 6,
  });
  expect(typeof config.frostingColor).toBe('string');
  expect(typeof config.spongeColor).toBe('string');
});

test('admin can update the cake\'s configJson and it persists', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CakePatchSuite', age: 8 });
  const admin = tokenFromLink(room.links.admin);
  const cake = await getCake(request, admin);

  const newConfig = {
    style: 'rainbow-layer',
    frostingColor: '#ffe3ee',
    spongeColor: '#6bc06a',
    topper: 'berries',
    text: 'GO TEAM ALEX',
    candleMode: 'numbers',
    candleCount: 8,
  };
  const patchRes = await request.patch(`/api/rooms/${admin}/objects/${cake.id}`, {
    data: { configJson: JSON.stringify(newConfig), expectedUpdatedAt: cake.updatedAt },
  });
  expect(patchRes.ok()).toBeTruthy();

  const refetched = await getCake(request, admin);
  expect(JSON.parse(refetched.configJson)).toEqual(newConfig);
});

test('a text longer than 16 characters is stored as sent — truncation happens defensively at render time, not on write (matches the existing neon-sign convention)', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CakeTextSuite', age: 5 });
  const admin = tokenFromLink(room.links.admin);
  const cake = await getCake(request, admin);

  const longText = 'THIS TEXT IS DEFINITELY LONGER THAN SIXTEEN CHARACTERS';
  const patchRes = await request.patch(`/api/rooms/${admin}/objects/${cake.id}`, {
    data: { configJson: JSON.stringify({ ...JSON.parse(cake.configJson), text: longText }) },
  });
  expect(patchRes.ok()).toBeTruthy();
  const refetched = await getCake(request, admin);
  expect(JSON.parse(refetched.configJson).text).toBe(longText);
});

test.describe('cake config updates go through the same permission matrix as any other object update', () => {
  const FAR_FUTURE = new Date(Date.now() + 60 * 60_000).toISOString();

  test('contribute cannot edit the cake when canDecorate is off (the default)', async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'CakePermA', age: 5, eventAt: FAR_FUTURE });
    const admin = tokenFromLink(room.links.admin);
    const contribute = tokenFromLink(room.links.contribute);
    const cake = await getCake(request, admin);

    const res = await request.patch(`/api/rooms/${contribute}/objects/${cake.id}`, {
      headers: { 'X-Contributor-Session': 'cake-sess-a' },
      data: { configJson: JSON.stringify({ ...JSON.parse(cake.configJson), style: 'cheesecake' }) },
    });
    expect(res.status()).toBe(403);
  });

  test('celebrate cannot edit the cake before unlock, even with canRearrange on', async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'CakePermB', age: 5, eventAt: FAR_FUTURE });
    const admin = tokenFromLink(room.links.admin);
    const celebrate = tokenFromLink(room.links.celebrate);
    const cake = await getCake(request, admin);

    const permRes = await request.get(`/api/rooms/${admin}/permissions`);
    const current = (await permRes.json()).permissions;
    await request.put(`/api/rooms/${admin}/permissions`, {
      data: { ...current, celebrant: { canRearrange: true } },
    });

    const res = await request.patch(`/api/rooms/${celebrate}/objects/${cake.id}`, {
      data: { configJson: JSON.stringify({ ...JSON.parse(cake.configJson), style: 'cheesecake' }) },
    });
    expect(res.status()).toBe(403);
  });

  test('a locked cake refuses even an admin-permitted contributor', async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'CakePermC', age: 5, eventAt: FAR_FUTURE });
    const admin = tokenFromLink(room.links.admin);
    const contribute = tokenFromLink(room.links.contribute);
    const cake = await getCake(request, admin);

    const permRes = await request.get(`/api/rooms/${admin}/permissions`);
    const current = (await permRes.json()).permissions;
    await request.put(`/api/rooms/${admin}/permissions`, {
      data: { ...current, contributors: { ...current.contributors, canDecorate: 'any' } },
    });
    await request.patch(`/api/rooms/${admin}/objects/${cake.id}`, { data: { locked: true } });

    const res = await request.patch(`/api/rooms/${contribute}/objects/${cake.id}`, {
      headers: { 'X-Contributor-Session': 'cake-sess-c' },
      data: { configJson: JSON.stringify({ ...JSON.parse(cake.configJson), style: 'cheesecake' }) },
    });
    expect(res.status()).toBe(403);
  });
});

test('extra cakes can be added as items, independent of the default one', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CakeExtraSuite', age: 4 });
  const admin = tokenFromLink(room.links.admin);

  const before = await request.get(`/api/rooms/${admin}/objects`);
  const beforeCount = (await before.json()).objects.filter((o: { kind: string }) => o.kind === 'cake').length;
  expect(beforeCount).toBe(1);

  const createRes = await request.post(`/api/rooms/${admin}/objects`, {
    data: { kind: 'cake', x: 700, y: 650, zone: 'anywhere' },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = (await createRes.json()).object;
  expect(created.kind).toBe('cake');

  const after = await request.get(`/api/rooms/${admin}/objects`);
  const afterCakes = (await after.json()).objects.filter((o: { kind: string }) => o.kind === 'cake');
  expect(afterCakes.length).toBe(2);
  // The two cakes are independently editable — updating the new one must not touch the original.
  const original = afterCakes.find((c: { id: string }) => c.id !== created.id);
  const originalConfigBefore = original.configJson;
  await request.patch(`/api/rooms/${admin}/objects/${created.id}`, {
    data: { configJson: JSON.stringify({ style: 'cupcake-tower', frostingColor: '#fff', spongeColor: '#000', topper: 'none', text: '', candleMode: 'none', candleCount: 1 }) },
  });
  const relisted = await request.get(`/api/rooms/${admin}/objects`);
  const relistedOriginal = (await relisted.json()).objects.find((o: { id: string }) => o.id === original.id);
  expect(relistedOriginal.configJson).toBe(originalConfigBefore);
});
