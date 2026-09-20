import { test, expect, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

const ROOM_HEIGHT = 760;

/**
 * Section 13: "One finger on the background pans, and one finger on a box drags it." Runs only
 * under the `mobile` Playwright project (`devices['iPhone 13']`), which sets `hasTouch`/
 * `isMobile` — a narrow desktop-Chrome *window* is not the same test, since our code branches on
 * `PointerEvent.pointerType`, and a plain mouse drag at a narrow viewport would silently take the
 * mouse code path instead of exercising the touch-only drag logic in `placement.ts`.
 *
 * Real touch hardware isn't available here, so gestures are synthesized as `PointerEvent`s with
 * `pointerType: 'touch'` dispatched directly on the room's canvas — the same event shape a real
 * touchscreen produces, and exactly what our `pointerType` branches check for. This is a stronger
 * check than trusting the code by inspection: it proves the touch-specific branch actually runs
 * and produces the right result, not just that it typechecks.
 */
async function touchPointer(page: Page, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) {
  await page.evaluate(
    ({ type, x, y }) => {
      const canvas = document.querySelector('div[role="application"] canvas');
      if (!canvas) throw new Error('room canvas not found');
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerType: 'touch',
          pointerId: 1,
          isPrimary: true,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { type, x, y },
  );
}

async function touchDrag(page: Page, fromX: number, fromY: number, toX: number, toY: number, steps = 8) {
  await touchPointer(page, 'pointerdown', fromX, fromY);
  for (let i = 1; i <= steps; i++) {
    const x = fromX + ((toX - fromX) * i) / steps;
    const y = fromY + ((toY - fromY) * i) / steps;
    await touchPointer(page, 'pointermove', x, y);
  }
  await touchPointer(page, 'pointerup', toX, toY);
}

test.describe('touch input (mobile viewport)', () => {
  let celebrate: string;
  let contribute: string;

  test.beforeAll(async ({ request }) => {
    const room = await seedRoom(request, { celebrantName: 'PhoneSuite' });
    celebrate = tokenFromLink(room.links.celebrate);
    contribute = tokenFromLink(room.links.contribute);
  });

  test('one-finger touch drag pans the camera', async ({ page }) => {
    await page.goto(`/r/${celebrate}`);
    const room = page.getByRole('application', { name: 'Party room' });
    // Wait for the scene to actually be ready (the pan hint only renders once RoomCanvas has
    // finished its async Pixi init) — page.mouse.click below is a raw, non-auto-waiting click
    // (needed so its coordinates match touchDrag's, which also targets raw page coordinates),
    // so this replaces the actionability wait a locator.click() would otherwise give for free.
    await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
    const box = await room.boundingBox();
    if (!box) throw new Error('room canvas did not render');
    const scale = box.height / ROOM_HEIGHT;
    // At a phone-width viewport the room (2400 world px wide) is nowhere near fully visible at
    // once — a wall frame (world x=160) is comfortably in view at the start (camera starts fully
    // left-clamped, world.x=0), giving a stable "is this point on screen" reference to pan away
    // from, rather than predicting some new element's post-pan screen position.
    const frameX = box.x + 160 * scale + 20;
    const frameY = box.y + 120 * scale + 20;

    await page.mouse.click(frameX, frameY); // baseline: ordinary taps work pre-pan
    await expect(page.getByRole('heading', { name: 'Mountain view' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    // Repeated one-finger right-to-left touch drags pan the camera rightward through the world
    // (the only direction with room to move — it starts already left-clamped). Drag far more
    // than enough to guarantee real movement, verified visually beforehand (a screenshot
    // confirmed the balloons on the far right side of the room scroll into view).
    const midY = box.y + box.height / 2;
    for (let i = 0; i < 10; i++) {
      await touchDrag(page, box.x + box.width - 20, midY, box.x + 20, midY, 6);
    }

    // The SAME screen position no longer hits the frame — it has scrolled off to the left,
    // proving the one-finger touch drag actually moved the camera.
    await page.mouse.click(frameX, frameY);
    await expect(page.getByRole('heading', { name: 'Mountain view' })).toHaveCount(0);
  });

  test('one-finger touch drag places a box during Pack → Design → Place', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto(`/r/${contribute}`);
    await page.getByRole('button', { name: 'Add a present' }).click();
    await page.getByPlaceholder('Your name').fill('Touchy Feely');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Wrap it up' }).click();

    const room = page.getByRole('application', { name: 'Party room' });
    const box = await room.boundingBox();
    if (!box) throw new Error('room canvas did not render');

    // Drag with one continuous touch gesture from the box's floating start point to a specific
    // spot on the floor — proves the *drag itself* (not just a tap-to-drop-at-default) placed it.
    const dropX = box.x + box.width * 0.25;
    const dropY = box.y + box.height * 0.85;
    await touchDrag(page, box.x + box.width / 2, box.y + box.height / 2, dropX, dropY, 12);

    await expect(page.getByText('Present placed from Touchy Feely.')).toBeVisible({ timeout: 10_000 });

    const boxesRes = await page.request.get(`/api/rooms/${contribute}/boxes`);
    const { boxes } = await boxesRes.json();
    const placed = boxes.find((b: { fromName: string }) => b.fromName === 'Touchy Feely');
    expect(placed).toBeTruthy();
    // The floor drop zone starts at world y = FLOOR_TOP (600); a box dropped near the bottom of
    // the touch-emulated viewport should land well into the floor, not at some default center.
    expect(placed.y).toBeGreaterThan(400);
  });
});
