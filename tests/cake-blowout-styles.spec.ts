import { test, expect, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

/**
 * Room Editor Phase 2 (docs/ROOM_EDITOR.md): "Blow-out-and-relight works for every style." Every
 * style shares the same click-to-toggle interaction (scene/interactions/cake.ts's attachCake) —
 * what differs per style is only the texture attachCake asks for (scene/objectSprites.ts's
 * cakeTextureFor) — so this proves the *interaction* survives every one of the 8 styles, rather
 * than re-testing move/click-target-follows-the-sprite (already covered for the cake specifically
 * by tests/room-objects-interaction-after-move.spec.ts).
 */

const ROOM_HEIGHT = 760;
// Matches src/server/defaultLayout.ts's cake row (TABLE_X + TABLE_TEX_W/2, TABLE_Y + 6) — same
// constant tests/room-objects-interaction-after-move.spec.ts uses, since this test never moves it.
const DEFAULT_CAKE_X = 1148;
const DEFAULT_CAKE_Y = 566;
const CAKE_CLICK_OFFSET_Y = -90;
// A generous clip around the cake's whole upper region — wide/tall enough to contain every
// style's candle+topper area (their anchors range from grid y=6 to y=20 — see sprites/cake.ts's
// BODY_BUILDERS) without needing a different clip box per style, the way
// room-objects-interaction-after-move.spec.ts's single-style CANDLE_CLIP does.
const CAKE_TOP_CLIP = { dxFromCenter: 85, yTop: -200, height: 160 };

const STYLES = [
  'tiered-classic',
  'chocolate-drip',
  'strawberry-shortcake',
  'rainbow-layer',
  'cheesecake',
  'ice-cream-cake',
  'cupcake-tower',
  'pixel-heart-cake',
];

async function toScreen(page: Page, box: { x: number; y: number; height: number }, worldX: number, worldY: number) {
  const scale = box.height / ROOM_HEIGHT;
  return { x: box.x + worldX * scale, y: box.y + worldY * scale, scale };
}

test('blow-out-and-relight works for every cake style', async ({ page, request }) => {
  test.setTimeout(90_000);

  const room = await seedRoom(request, { celebrantName: 'CakeStyleSuite', age: 6 });
  const admin = tokenFromLink(room.links.admin);
  const objectsRes = await request.get(`/api/rooms/${admin}/objects`);
  const cake = (await objectsRes.json()).objects.find((o: { kind: string }) => o.kind === 'cake');

  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  for (const style of STYLES) {
    await request.patch(`/api/rooms/${admin}/objects/${cake.id}`, {
      data: {
        configJson: JSON.stringify({
          style,
          frostingColor: '#fff8f0',
          spongeColor: '#c98a4b',
          topper: 'none',
          text: '',
          candleMode: 'count',
          candleCount: 6,
        }),
      },
    });

    await page.goto(`/r/${admin}`);
    await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
    const roomLocator = page.getByRole('application', { name: 'Party room' });
    const box = await roomLocator.boundingBox();
    if (!box) throw new Error('room canvas did not render');

    const clickPoint = await toScreen(page, box, DEFAULT_CAKE_X, DEFAULT_CAKE_Y + CAKE_CLICK_OFFSET_Y);
    const { scale } = clickPoint;
    const clipRegion = {
      x: box.x + (DEFAULT_CAKE_X - CAKE_TOP_CLIP.dxFromCenter) * scale,
      y: box.y + (DEFAULT_CAKE_Y + CAKE_TOP_CLIP.yTop) * scale,
      width: CAKE_TOP_CLIP.dxFromCenter * 2 * scale,
      height: CAKE_TOP_CLIP.height * scale,
    };

    const lit = await page.screenshot({ clip: clipRegion });
    // "Make a wish!" is rendered as Pixi canvas text (scene/interactions/label.ts), not a real DOM
    // node — getByText can never see it (confirmed: this is why the sibling move test screenshot-
    // diffs instead of asserting on that label). A lit->unlit->lit screenshot round-trip proves the
    // same thing a label assertion would: the click actually did something, for every style.
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await page.waitForTimeout(300);
    const unlit = await page.screenshot({ clip: clipRegion });
    expect(lit.equals(unlit), `style=${style}: blow-out should visibly change the candle/topper area`).toBe(false);

    await page.mouse.click(clickPoint.x, clickPoint.y);
    await page.waitForTimeout(300);
    const relit = await page.screenshot({ clip: clipRegion });
    expect(relit.equals(unlit), `style=${style}: relight should visibly change the candle/topper area again`).toBe(false);
  }

  expect(pageErrors, `no uncaught page errors across any style: ${pageErrors.join('; ')}`).toEqual([]);
});

test('the Cake editor UI actually changes the placed cake, not just its own preview', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'CakeEditorUiSuite', age: 4 });
  const admin = tokenFromLink(room.links.admin);

  await page.goto(`/r/${admin}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();

  await page.getByRole('button', { name: 'Edit room' }).click();
  // The panel sits over the right ~320px of the screen (see EditPanel.tsx) — DEFAULT_CAKE_X maps
  // to a screen point under it, so the click below would hit the panel, not the canvas, unless
  // it's collapsed first (same reason tests/room-objects-interaction-after-move.spec.ts does this).
  await page.getByRole('button', { name: 'Close edit panel' }).click();

  const roomLocator = page.getByRole('application', { name: 'Party room' });
  const box = await roomLocator.boundingBox();
  if (!box) throw new Error('room canvas did not render');
  const cakePoint = await toScreen(page, box, DEFAULT_CAKE_X, DEFAULT_CAKE_Y + CAKE_CLICK_OFFSET_Y);
  await page.mouse.click(cakePoint.x, cakePoint.y);
  // Bring the panel back to reach the Cake editor's controls (the pencil is now a 3-state toggle:
  // on-with-panel-collapsed -> on-with-panel, without leaving edit mode — see RoomCanvas.tsx).
  await page.getByRole('button', { name: 'Edit room' }).click();

  const styleSelect = page.locator('select').filter({ hasText: 'Tiered classic' });
  await expect(styleSelect).toBeVisible();
  await styleSelect.selectOption('pixel-heart-cake');

  // The debounced PATCH (300ms) needs to land server-side before the persisted config reflects it.
  await expect
    .poll(async () => {
      const res = await request.get(`/api/rooms/${admin}/objects`);
      const cake = (await res.json()).objects.find((o: { kind: string }) => o.kind === 'cake');
      return JSON.parse(cake.configJson).style;
    })
    .toBe('pixel-heart-cake');
});

test('a cake with garbage configJson (e.g. from a future/rolled-back client) still renders without crashing', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'CakeGarbageSuite', age: 5 });
  const admin = tokenFromLink(room.links.admin);
  const objectsRes = await request.get(`/api/rooms/${admin}/objects`);
  const cake = (await objectsRes.json()).objects.find((o: { kind: string }) => o.kind === 'cake');

  await request.patch(`/api/rooms/${admin}/objects/${cake.id}`, {
    data: { configJson: JSON.stringify({ style: 'not-a-real-style', candleMode: 12345, candleCount: 'ten', text: { nope: true } }) },
  });

  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(`/r/${admin}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.waitForTimeout(300);

  expect(pageErrors).toEqual([]);
});
