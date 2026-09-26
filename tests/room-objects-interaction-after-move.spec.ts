import { test, expect, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

const ROOM_HEIGHT = 760;
// Matches src/server/defaultLayout.ts's cake row (TABLE_X + TABLE_TEX_W/2, TABLE_Y + 6).
const DEFAULT_CAKE_X = 1148;
const DEFAULT_CAKE_Y = 566;
// The cake texture is 144x184 (36x46 grid at unit=4), bottom-anchored at (x, y) — this point is
// well inside its body, clear of any neighboring sprite, good for both a drag handle and a tap.
const CAKE_CLICK_OFFSET_Y = -90;
// A tight box around just the candles (top of the sprite) — the only part of the texture that
// actually changes between lit/unlit — so a before/after screenshot diff isn't polluted by any
// other independently-animated scenery (stars/balloons) elsewhere in the room.
const CANDLE_CLIP = { dxFromCenter: 75, yTop: -184, height: 50 };

async function toScreen(page: Page, box: { x: number; y: number; height: number }, worldX: number, worldY: number) {
  const scale = box.height / ROOM_HEIGHT;
  return { x: box.x + worldX * scale, y: box.y + worldY * scale, scale };
}

/**
 * Room Editor Phase 1b, standing test (c): "after moving a converted element, its interaction
 * still works (move the cake, click it, candles go out)." This is the one legacy-element
 * conversion that is load-bearing for the cake options, so it gets an end-to-end browser
 * test, not just an API-level check — the whole point is that the *click target* has to follow
 * the sprite after a real drag, which only a real pointer gesture against the actual canvas can
 * prove.
 */
test('dragging the cake to a new position keeps its click-to-blow-out-candles interaction working there', async ({ page, request }) => {
  test.setTimeout(45_000);

  const room = await seedRoom(request, { celebrantName: 'CakeMoveSuite' });
  const admin = tokenFromLink(room.links.admin);

  await page.goto(`/r/${admin}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  const roomLocator = page.getByRole('application', { name: 'Party room' });
  const box = await roomLocator.boundingBox();
  if (!box) throw new Error('room canvas did not render');

  // Enter edit mode, then collapse the panel (it sits over the right ~320px of the screen) so
  // the whole canvas is free to drag on — same interaction sequence a real host uses.
  await page.getByRole('button', { name: 'Edit room' }).click();
  await page.getByRole('button', { name: 'Close edit panel' }).click();

  const start = await toScreen(page, box, DEFAULT_CAKE_X, DEFAULT_CAKE_Y + CAKE_CLICK_OFFSET_Y);
  const targetWorldX = 600;
  const targetWorldY = DEFAULT_CAKE_Y + CAKE_CLICK_OFFSET_Y - 60;
  const end = await toScreen(page, box, targetWorldX, targetWorldY);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Several intermediate moves — matches how the app's own drag handler expects real pointermove
  // events (a single down→up with no moves in between wouldn't exercise the drag path at all).
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(start.x + ((end.x - start.x) * i) / 6, start.y + ((end.y - start.y) * i) / 6);
  }
  await page.mouse.up();

  // Wait for the drag's PATCH to actually land server-side before continuing — the drag itself is
  // synchronous in the browser, but persisting it is not.
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/rooms/${admin}/objects`);
        const cake = (await res.json()).objects.find((o: { kind: string }) => o.kind === 'cake');
        return cake?.x;
      },
      { timeout: 10_000 },
    )
    .not.toBe(DEFAULT_CAKE_X);

  const objectsRes = await request.get(`/api/rooms/${admin}/objects`);
  const cake = (await objectsRes.json()).objects.find((o: { kind: string }) => o.kind === 'cake');
  expect(cake.x).not.toBeCloseTo(DEFAULT_CAKE_X, 0);
  expect(cake.y).not.toBeCloseTo(DEFAULT_CAKE_Y, 0);

  // Exit edit mode entirely (pencil once reopens the collapsed panel, a second click exits with
  // it showing) — the interactive, animated legacy scene (with the click-to-toggle handler) only
  // renders outside edit mode.
  await page.getByRole('button', { name: 'Edit room' }).click();
  await page.getByRole('button', { name: 'Exit edit mode' }).click();

  const { scale } = await toScreen(page, box, 0, 0);
  const candleScreen = {
    x: box.x + (cake.x - CANDLE_CLIP.dxFromCenter) * scale,
    y: box.y + (cake.y + CANDLE_CLIP.yTop) * scale,
    width: CANDLE_CLIP.dxFromCenter * 2 * scale,
    height: CANDLE_CLIP.height * scale,
  };

  const before = await page.screenshot({ clip: candleScreen });

  const clickPoint = await toScreen(page, box, cake.x, cake.y + CAKE_CLICK_OFFSET_Y);
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.waitForTimeout(300); // texture swap + smoke/label spawn are synchronous with the tap, this just lets the frame render

  const after = await page.screenshot({ clip: candleScreen });

  expect(before.equals(after), 'the candle region should look different after clicking the moved cake (lit -> unlit)').toBe(false);
});
