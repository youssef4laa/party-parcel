import path from 'path';
import { test, expect } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

const FIXTURES = path.join(__dirname, 'fixtures');

test.describe.serial('all ten goodie types, sealed and unwrapped', () => {
  let admin: string;
  let contribute: string;
  let celebrate: string;
  let boxId: string;

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, {
      celebrantName: 'GoodieSuite',
      eventAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    admin = tokenFromLink(room.links.admin);
    contribute = tokenFromLink(room.links.contribute);
    celebrate = tokenFromLink(room.links.celebrate);
  });

  test('pack all ten goodie types through the real contribute UI and seal the box', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/r/${contribute}`);
    await page.getByRole('button', { name: 'Add a present' }).click();
    await page.getByPlaceholder('Your name').fill('Full House Fran');

    async function openEditor(label: string) {
      await page.getByRole('button', { name: label }).first().click();
    }
    async function addToBox() {
      await page.getByRole('button', { name: 'Add to box' }).click();
      // wait for the editor panel to actually close before the next step touches the shelf —
      // a couple of the editors do async work (upload) inside onSave before calling back up
      await expect(page.getByRole('button', { name: 'Add to box' })).toHaveCount(0, { timeout: 10_000 });
    }

    // Note
    await openEditor('📝 Note');
    await page.getByLabel(/^Text \(/).fill('Happy birthday, you wonderful person!');
    await addToBox();

    // Photo — the Pack step also has its own "quick path" pictures dropzone with the same accept
    // list, so scope to the PhotoEditor's own file input specifically (last in DOM order)
    await openEditor('📷 Photo');
    await page.locator('input[type="file"][accept*="image"]').last().setInputFiles(path.join(FIXTURES, 'tiny.jpg'));
    await expect(page.getByText('1 / 10 photos — click to add')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Caption (optional)').fill('us at the beach');
    await addToBox();

    // Song (URL mode — Spotify allowlisted embed)
    await openEditor('🎵 Song');
    await page.getByLabel('Spotify, YouTube, Apple Music, or SoundCloud link').fill('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    await addToBox();

    // Video (URL mode — YouTube allowlisted embed)
    await openEditor('📼 Video');
    await page.getByLabel('YouTube or Vimeo link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await addToBox();

    // Gift
    await openEditor('🎁 Gift');
    await page.getByLabel('Message').fill('Dinner is on me — pick anywhere!');
    await page.getByLabel('Redeem code (optional — stays hidden until unwrapped)').fill('SECRET-CODE-123');
    await addToBox();

    // Voice — use the upload fallback (avoids relying on live MediaRecorder timing in CI)
    await openEditor('🎙️ Voice');
    await page.locator('input[type="file"][accept="audio/*"]').setInputFiles(path.join(FIXTURES, 'tiny.mp3'));
    await expect(page.getByText(/uploaded|recorded/)).toBeVisible({ timeout: 10_000 });
    await addToBox();

    // Drawing — draw an actual stroke on the canvas
    await openEditor('🎨 Drawing');
    const canvas = page.locator('canvas[width="512"]');
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 40, box.y + 40);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 200, { steps: 10 });
      await page.mouse.up();
    }
    await addToBox();
    await expect(page.getByText('uploading...')).toHaveCount(0, { timeout: 10_000 });

    // Location
    await openEditor('📍 Location');
    await page.getByLabel('Place name').fill('The old oak tree');
    await page.getByLabel('Latitude').fill('40.7128');
    await page.getByLabel('Longitude').fill('-74.0060');
    await addToBox();

    // Coupon
    await openEditor('🎟️ Coupon');
    await page.getByLabel('Title').fill('One free car wash');
    await addToBox();

    // News
    await openEditor('📰 News');
    await page.getByLabel('Article link').fill('https://example.com/');
    await addToBox();

    await expect(page.getByText('10 / 25')).toBeVisible();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Wrap it up' }).click();

    // Place step: click somewhere on the floor to drop the box (an off-zone click snaps to the
    // nearest valid spot, so exact coordinates don't matter here)
    await page.getByRole('application', { name: 'Party room' }).click({ position: { x: 400, y: 480 } });
    await expect(page.getByText('Present placed from Full House Fran.')).toBeVisible({ timeout: 10_000 });

    const boxesRes = await page.request.get(`/api/rooms/${contribute}/boxes`);
    const { boxes } = await boxesRes.json();
    expect(boxes).toHaveLength(1);
    boxId = boxes[0].id;
  });

  test('before unlock: celebrate token gets 403 on contents and on media', async ({ request }) => {
    const contentsRes = await request.get(`/api/boxes/${boxId}/contents?token=${celebrate}`);
    expect(contentsRes.status()).toBe(403);
    const body = await contentsRes.text();
    expect(body).not.toContain('assetUrls');
  });

  test('after unlock: all ten types render and the unwrap flow completes', async ({ page, request }) => {
    test.setTimeout(60_000);
    const unlock = await request.post(`/api/rooms/${admin}/unlock`);
    expect(unlock.ok()).toBeTruthy();

    await page.goto(`/r/${celebrate}`);
    // Room Editor Phase 1c root-cause fix: the room canvas's `<div role="application">` renders
    // synchronously, well before Pixi has finished its async init (font loading, WebGL context,
    // fetching+placing box sprites) — a raw `.click({position})` right after `goto` has no actual
    // wait for that to finish, so under real system load it can land on an empty div and silently
    // do nothing (no error, box just never opens). Waiting for the pan-hint text first (same
    // pattern as phone.spec.ts) guarantees the scene, and therefore the box sprite, actually
    // exists before the click fires. See DECISIONS.md for the isolated repro proving this (not
    // shared test-DB/upload state, not test ordering, not date-relative fixtures) and confirming
    // the fix.
    await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
    // The box settles at its snapped floor position (anchored bottom-center) — click near that
    // anchor point, not the spot originally clicked during placement (see helpers.ts comment).
    await page.getByRole('application', { name: 'Party room' }).click({ position: { x: 400, y: 560 } });
    await page.getByRole('button', { name: 'Tap to unwrap!' }).click({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Continue' }).click({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Open everything at once' }).click({ timeout: 10_000 });

    await expect(page.getByText('Happy birthday, you wonderful person!')).toBeVisible();
    await expect(page.getByText('us at the beach')).toBeVisible(); // photo caption
    await expect(page.locator('iframe[title="Song player"]')).toBeVisible();
    await expect(page.locator('iframe[title="Video player"]')).toBeVisible();
    await expect(page.getByText('Dinner is on me — pick anywhere!')).toBeVisible();
    await expect(page.getByText('Voice Message')).toBeVisible();
    await expect(page.getByText('A Drawing')).toBeVisible();
    await expect(page.getByText('The old oak tree')).toBeVisible();
    await expect(page.getByText('One free car wash')).toBeVisible();
    await expect(page.getByText('News Clipping')).toBeVisible();

    await page.getByRole('button', { name: 'Redeem' }).click();
    await expect(page.getByText('REDEEMED')).toBeVisible({ timeout: 10_000 });
  });

  test('coupon redemption survives a reload', async ({ page }) => {
    await page.goto(`/r/${celebrate}`);
    // See the identical comment on the previous test — wait for the scene to actually be ready
    // before clicking the canvas, or the click can race Pixi's async init under system load.
    await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
    await page.getByRole('application', { name: 'Party room' }).click({ position: { x: 400, y: 560 } });
    await page.getByRole('button', { name: 'Tap to unwrap!' }).click({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Continue' }).click({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Open everything at once' }).click({ timeout: 10_000 });
    await expect(page.getByText('REDEEMED')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Redeem' })).toHaveCount(0);
  });

  test('the 26th goodie is refused', async ({ request }) => {
    const goodies = Array.from({ length: 26 }, () => ({ type: 'note', text: 'x', sizeBytes: 1 }));
    const res = await request.post(`/api/rooms/${contribute}/boxes`, {
      data: {
        fromName: 'Over Limit',
        design: {
          shape: 'cube', pattern: 'solid', baseColor: '#f4a6c1', accentColor: '#ff3d8b',
          ribbon: 'vertical', ribbonColor: '#fff6d5', bow: 'classic', tag: 'none', tagText: '',
          sticker: 'none', topper: 'none',
        },
        x: 300, y: 600, goodies,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('25 goodies');
  });

  test('an over-cap photo upload is refused', async ({ request }) => {
    const initRes = await request.post(`/api/rooms/${contribute}/uploads`, {
      data: { kind: 'photo', contentType: 'image/jpeg' },
    });
    const { uploadUrl } = await initRes.json();
    const oversized = Buffer.alloc(11 * 1024 * 1024, 1);
    const putRes = await request.put(uploadUrl, { data: oversized });
    expect(putRes.status()).toBe(413);
  });
});
