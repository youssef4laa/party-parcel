import { test, expect } from '@playwright/test';
import { createBoxWithPhoto, parseAssetUrl, seedRoom, signAssetUrl, tokenFromLink } from './helpers';

/**
 * Part A, item 3 of the Milestone 5 brief: the media lock. A box's goodie contents (and the
 * signed media URLs inside them) must only ever be handed out to a valid celebrate token AND
 * only once the server's own clock says the room is unlocked — never client time, never any
 * other token.
 */
test.describe('media lock', () => {
  let admin: string;
  let contribute: string;
  let celebrate: string;
  let boxId: string;

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, {
      celebrantName: 'LockSuite',
      eventAt: new Date(Date.now() + 60 * 60_000).toISOString(), // 1 hour out — stays locked for the whole suite
    });
    admin = tokenFromLink(room.links.admin);
    contribute = tokenFromLink(room.links.contribute);
    celebrate = tokenFromLink(room.links.celebrate);
    const box = await createBoxWithPhoto(request, contribute, 'Lock Test Sender');
    boxId = box.id;
  });

  test('(a) valid celebrate token, before unlock -> refused, no content leaked', async ({ request }) => {
    const res = await request.get(`/api/boxes/${boxId}/contents?token=${celebrate}`);
    expect(res.status()).toBe(403);
    const body = await res.text();
    expect(body).not.toContain('assetUrls');
    expect(body).not.toContain('/api/assets/');
  });

  test('(b) no token, before unlock -> refused', async ({ request }) => {
    const res = await request.get(`/api/boxes/${boxId}/contents`);
    expect(res.status()).toBe(403);
  });

  test('(c) admin token -> refused (before and after unlock)', async ({ request }) => {
    const before = await request.get(`/api/boxes/${boxId}/contents?token=${admin}`);
    expect(before.status()).toBe(403);
  });

  test('(c) contribute token -> refused (before and after unlock)', async ({ request }) => {
    const before = await request.get(`/api/boxes/${boxId}/contents?token=${contribute}`);
    expect(before.status()).toBe(403);
  });

  test('(d) valid celebrate token, after unlock -> succeeds and media is fetchable', async ({ request }) => {
    const unlock = await request.post(`/api/rooms/${admin}/unlock`);
    expect(unlock.ok()).toBeTruthy();

    const res = await request.get(`/api/boxes/${boxId}/contents?token=${celebrate}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.goodies).toHaveLength(1);
    expect(body.goodies[0].assetUrls).toHaveLength(1);

    const assetUrl = body.goodies[0].assetUrls[0] as string;
    const mediaRes = await request.get(assetUrl);
    expect(mediaRes.status()).toBe(200);
    expect(mediaRes.headers()['content-type']).toBe('image/jpeg');

    // admin/contribute tokens must STILL be refused even after unlock
    const stillAdmin = await request.get(`/api/boxes/${boxId}/contents?token=${admin}`);
    expect(stillAdmin.status()).toBe(403);
    const stillContribute = await request.get(`/api/boxes/${boxId}/contents?token=${contribute}`);
    expect(stillContribute.status()).toBe(403);
  });

  test('(e) expired signed media URL -> refused even with a correct signature', async ({ request }) => {
    // fetch a real signed URL first (room is unlocked from the previous test)
    const res = await request.get(`/api/boxes/${boxId}/contents?token=${celebrate}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    const { key } = parseAssetUrl(body.goodies[0].assetUrls[0]);

    const expiredUrl = signAssetUrl(key, Date.now() - 60_000); // correctly signed, but 60s in the past
    const expiredRes = await request.get(expiredUrl);
    expect(expiredRes.status()).toBe(403);
  });
});
