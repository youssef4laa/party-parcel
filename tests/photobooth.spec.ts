import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

const ROOM_HEIGHT = 760;

/**
 * Milestone 6, section 3. The camera prop opens a modal, a real (fake-device) webcam capture
 * goes through countdown/flash/review, the shot lands on the in-room photo wall, and the shot's
 * owner can delete it. Also checks the role-openness decision (any room link, not just
 * contribute) and that the shared upload route's broadened gate didn't accidentally open up
 * goodie uploads to non-contribute roles too. Runs under both `chromium` (Chromium's
 * fake-device flags) and `safari` (real WebKit, whose own built-in mock capture devices need no
 * special flags) — gift-readiness pass, "Chrome and Safari/iOS".
 */
test.describe('photobooth', () => {
  let admin: string;
  let contribute: string;
  let celebrate: string;

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PhotoboothSuite' });
    admin = tokenFromLink(room.links.admin);
    contribute = tokenFromLink(room.links.contribute);
    celebrate = tokenFromLink(room.links.celebrate);
  });

  test('take a photo on the celebrate link, see it on the wall, then delete it', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`/r/${celebrate}`);
    // The canvas's role="application" div renders before Pixi's async init (fonts, WebGL, the
    // camera prop's sprite) finishes — waiting for the pan-hint text first, same as phone.spec.ts,
    // guarantees the click below actually has something to land on (see DECISIONS.md's Room
    // Editor Phase 1c entry, which root-caused an identical race in goodies-e2e.spec.ts).
    await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();

    const room = page.getByRole('application', { name: 'Party room' });
    const box = await room.boundingBox();
    if (!box) throw new Error('room canvas did not render');
    const scale = box.height / ROOM_HEIGHT;

    // camera prop sits at world (470, 300..460); click near its lens
    await room.click({ position: { x: 470 * scale, y: 344 * scale } });
    // not getByText('PHOTOBOOTH') — the room's own "{name}'s Nth birthday!" caption contains the
    // same substring case-insensitively, so it's an ambiguous match (see HANDOFF.md gotchas)
    await expect(page.getByRole('heading', { name: 'PHOTOBOOTH' })).toBeVisible();

    await page.getByRole('button', { name: 'Turn on camera' }).click();
    await expect(page.getByRole('button', { name: 'TAKE PHOTO' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'TAKE PHOTO' }).click();
    await expect(page.getByRole('button', { name: 'Save to photo wall' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/visible to anyone with the room link/)).toBeVisible();

    await page.getByRole('button', { name: 'Save to photo wall' }).click();
    await expect(page.getByRole('heading', { name: 'PHOTOBOOTH' })).toHaveCount(0, { timeout: 10_000 });

    // confirm it actually landed server-side, with the fixed caption format, celebrant name, and
    // a signed (not raw storage-key) URL — not just that the modal closed without error
    const shotsRes = await page.request.get(`/api/rooms/${celebrate}/photobooth`);
    expect(shotsRes.ok()).toBeTruthy();
    const { shots } = await shotsRes.json();
    expect(shots).toHaveLength(1);
    expect(shots[0].caption).toMatch(/^HAPPY BIRTHDAY · .+ · PhotoboothSuite$/);
    expect(shots[0].url).toContain('/api/assets/');

    // click the print on the wall (first slot, near the booth) — proves the photo wall actually
    // rendered a real, clickable sprite for this shot, not just that the API call succeeded
    await room.click({ position: { x: 642 * scale, y: 126 * scale } });
    await expect(page.getByRole('dialog', { name: 'Photobooth print' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(shots[0].caption)).toBeVisible();

    await page.getByRole('button', { name: 'Delete my shot' }).click();
    await expect(page.getByRole('dialog', { name: 'Photobooth print' })).toHaveCount(0, { timeout: 10_000 });

    const afterDelete = await page.request.get(`/api/rooms/${celebrate}/photobooth`);
    expect((await afterDelete.json()).shots).toHaveLength(0);
  });

  test('any role can list and post photobooth shots (not contribute-only, unlike goodie uploads)', async ({ request }) => {
    for (const token of [admin, contribute, celebrate]) {
      const res = await request.get(`/api/rooms/${token}/photobooth`);
      expect(res.status()).toBe(200);
    }

    const init = await request.post(`/api/rooms/${admin}/uploads`, {
      data: { kind: 'photobooth', contentType: 'image/jpeg' },
    });
    expect(init.ok()).toBeTruthy();
  });

  test('goodie uploads are still contribute-only after broadening the shared upload route', async ({ request }) => {
    const asAdmin = await request.post(`/api/rooms/${admin}/uploads`, {
      data: { kind: 'photo', contentType: 'image/jpeg' },
    });
    expect(asAdmin.status()).toBe(403);

    const asCelebrate = await request.post(`/api/rooms/${celebrate}/uploads`, {
      data: { kind: 'photo', contentType: 'image/jpeg' },
    });
    expect(asCelebrate.status()).toBe(403);
  });

  test('a shot cannot be deleted without the right delete token', async ({ request }) => {
    const init = await request.post(`/api/rooms/${celebrate}/uploads`, {
      data: { kind: 'photobooth', contentType: 'image/jpeg' },
    });
    const { uploadUrl, key } = await init.json();
    const tinyJpeg = Buffer.from(
      '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCeALU9/9k=',
      'base64',
    );
    await request.put(uploadUrl, { data: tinyJpeg, headers: { 'Content-Type': 'image/jpeg' } });
    const final = await request.post(`/api/rooms/${celebrate}/uploads/${key}/finalize`, { data: { kind: 'photobooth' } });
    const { assetKey } = await final.json();

    const created = await request.post(`/api/rooms/${celebrate}/photobooth`, { data: { assetKey } });
    const shot = await created.json();

    const wrongToken = await request.delete(`/api/rooms/${celebrate}/photobooth/${shot.id}`, {
      data: { deleteToken: 'not-the-real-token' },
    });
    expect(wrongToken.status()).toBe(403);

    const rightToken = await request.delete(`/api/rooms/${celebrate}/photobooth/${shot.id}`, {
      data: { deleteToken: shot.deleteToken },
    });
    expect(rightToken.ok()).toBeTruthy();
  });
});
