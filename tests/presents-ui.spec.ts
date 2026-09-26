import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

/**
 * Room Editor Phase 4a through the real UI: select a present in edit mode, resize it with the
 * toolbar, reorder it, and drag it — as the host (free) and as a contributor with
 * canMoveOwnPresents (own presents only, dropped back onto the table/floor). The server is what
 * actually decides; these tests check both that the UI offers the right controls and that what it
 * sends is what got stored.
 */

const ROOM_HEIGHT = 760;
const DESIGN = {
  shape: 'cube', pattern: 'solid', baseColor: '#f4a6c1', accentColor: '#ff3d8b', ribbon: 'vertical',
  ribbonColor: '#fff6d5', bow: 'classic', tag: 'none', tagText: '', sticker: 'none', topper: 'none',
};
let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.55.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

async function pack(request: APIRequestContext, token: string, fromName: string, x: number, y: number, session?: string) {
  const res = await request.post(`/api/rooms/${token}/boxes`, {
    headers: { ...(session ? { 'X-Contributor-Session': session } : {}), ...ip() },
    data: { fromName, design: DESIGN, x, y, goodies: [{ type: 'note', text: 'hi', sizeBytes: 2 }] },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).id as string;
}
const boxOf = async (request: APIRequestContext, token: string, id: string) =>
  (await (await request.get(`/api/rooms/${token}/boxes`)).json()).boxes.find((b: { id: string }) => b.id === id) as {
    x: number; y: number; z: number; scale: number;
  };

async function setPermissions(request: APIRequestContext, admin: string, over: Record<string, unknown> = {}) {
  const res = await request.put(`/api/rooms/${admin}/permissions`, {
    data: {
      contributors: { canDecorate: 'off', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 },
      celebrant: { canRearrange: false },
      freezeLayout: false,
      ...over,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function roomBox(page: Page) {
  const box = await page.getByRole('application', { name: 'Party room' }).boundingBox();
  if (!box) throw new Error('room canvas did not render');
  return { ...box, scale: box.height / ROOM_HEIGHT };
}
/** Screen point at the middle of a size-M present whose base sits at world (x, y). */
async function presentPoint(page: Page, x: number, y: number) {
  const r = await roomBox(page);
  return { x: r.x + x * r.scale, y: r.y + (y - 32) * r.scale, scale: r.scale };
}

async function openEditMode(page: Page, token: string, session?: string) {
  if (session) await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`party-parcel-contributor-session:${token}`, session]);
  await page.goto(`/r/${token}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit room' }).click();
}

test('host: select a present, resize it within 0.5x-3x, reorder it, and drag it — each saved server-side', async ({ page, request }) => {
  test.setTimeout(60_000);
  const room = await seedRoom(request, { celebrantName: 'PresentUiHost' });
  const admin = tokenFromLink(room.links.admin);
  const id = await pack(request, tokenFromLink(room.links.contribute), 'Pat', 500, 650);

  await openEditMode(page, admin);
  await page.getByRole('button', { name: 'Presents' }).click();
  await expect(page.getByTestId('present-toolbar')).toHaveCount(0); // nothing selected yet

  // select it by clicking the present in the room (in edit mode that selects instead of opening)
  const p = await presentPoint(page, 500, 650);
  const clip = { x: p.x - 120 * p.scale, y: p.y - 150 * p.scale, width: 240 * p.scale, height: 190 * p.scale };
  const unselected = await page.screenshot({ clip });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('present-toolbar')).toBeVisible();
  await page.waitForTimeout(200);
  expect((await page.screenshot({ clip })).equals(unselected), 'a selected present should be outlined in the room').toBe(false);
  await expect(page.getByTestId('present-readout')).toHaveText('size M · scale 1× · layer 0');

  // resize: each click is +0.25x, saved, and the room sprite actually grows
  await page.getByRole('button', { name: 'Close edit panel' }).click(); // panel is over the right side only, but keep the canvas clear
  await page.getByRole('button', { name: 'Edit room' }).click();
  await page.getByRole('button', { name: 'Presents' }).click();
  const before = await page.screenshot({ clip });
  await page.getByRole('button', { name: 'Scale +', exact: true }).click();
  await expect(page.getByTestId('present-readout')).toContainText('scale 1.25×');
  expect((await boxOf(request, admin, id)).scale).toBe(1.25);
  await page.waitForTimeout(300);
  expect((await page.screenshot({ clip })).equals(before), 'the present should visibly grow').toBe(false);

  // clamp at the max: Scale + is disabled at 3x and the server never sees more
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Scale +', exact: true }).click();
  await expect(page.getByTestId('present-readout')).toContainText('scale 3×');
  await expect(page.getByRole('button', { name: 'Scale +', exact: true })).toBeDisabled();
  expect((await boxOf(request, admin, id)).scale).toBe(3);
  // ...and at the min
  for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Scale −', exact: true }).click();
  await expect(page.getByTestId('present-readout')).toContainText('scale 0.5×');
  await expect(page.getByRole('button', { name: 'Scale −', exact: true })).toBeDisabled();
  expect((await boxOf(request, admin, id)).scale).toBe(0.5);

  // reorder
  await page.getByRole('button', { name: 'Forward' }).click();
  await expect(page.getByTestId('present-readout')).toContainText('layer 1');
  expect((await boxOf(request, admin, id)).z).toBe(1);
  await page.getByRole('button', { name: 'Backward' }).click();
  await expect(page.getByTestId('present-readout')).toContainText('layer 0');
  await expect(page.getByRole('button', { name: 'Backward' })).toBeDisabled();

  // drag it 200 screen px right and 40 up: the host is free of the table/floor snap
  await page.getByRole('button', { name: 'Close edit panel' }).click();
  const from = await presentPoint(page, 500, 650);
  const r = await roomBox(page);
  // scale 0.5 now: the sprite is 32 world px, its centre 16 above the base
  const grab = { x: from.x, y: r.y + (650 - 16) * r.scale };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 100, grab.y - 20, { steps: 5 });
  await page.mouse.move(grab.x + 200, grab.y - 40, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await boxOf(request, admin, id)).x).toBeGreaterThan(500 + 150 / r.scale);
  const moved = await boxOf(request, admin, id);
  expect(moved.x).toBeCloseTo(500 + 200 / r.scale, -1);
  expect(moved.y).toBeCloseTo(650 - 40 / r.scale, -1);

  // it all survives a reload
  await page.reload();
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  const reloaded = await boxOf(request, admin, id);
  expect(reloaded).toMatchObject({ scale: 0.5, z: 0 });
});

test('contributor with canMoveOwnPresents: sees only the Presents tab, moves their own, and cannot touch anyone else\'s', async ({ page, request }) => {
  test.setTimeout(60_000);
  const room = await seedRoom(request, { celebrantName: 'PresentUiOwn' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  await setPermissions(request, admin, { contributors: { canDecorate: 'off', canImport: false, canDraw: false, canMoveOwnPresents: true, maxItemsPerContributor: 10 } });
  const mine = await pack(request, contribute, 'Mine Mo', 400, 650, 'ui-owner');
  const theirs = await pack(request, contribute, 'Theirs Tia', 900, 650, 'ui-other');

  await openEditMode(page, contribute, 'ui-owner');
  // no room-object rights -> no catalog, library, or layers to fumble with; just the presents
  await expect(page.getByRole('button', { name: 'Presents' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Items', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Draw & Import' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Layers' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Permissions' })).toHaveCount(0);
  await expect(page.getByTestId('presents-tab')).toBeVisible();

  // own present: full controls
  await page.getByRole('button', { name: '🎁 From Mine Mo' }).click();
  await expect(page.getByTestId('present-readout')).toContainText('scale 1×');
  await page.getByRole('button', { name: 'Scale +', exact: true }).click();
  await expect(page.getByTestId('present-readout')).toContainText('scale 1.25×');
  expect((await boxOf(request, admin, mine)).scale).toBe(1.25);

  // someone else's present: listed as locked, controls disabled, nothing sent
  await expect(page.getByRole('button', { name: /From Theirs Tia/ })).toContainText('(locked)');
  await page.getByRole('button', { name: /From Theirs Tia/ }).click();
  await expect(page.getByText("This present isn't yours to move.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scale +', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Forward' })).toBeDisabled();

  // dragging their OWN present works and drops it back onto the table/floor rather than mid-air
  const ownPt = await presentPoint(page, 400, 650);
  const r = await roomBox(page);
  const ownSize = 64 * 1.25; // scaled up a moment ago
  const grab = { x: ownPt.x, y: r.y + (650 - ownSize / 2) * r.scale };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 60, grab.y - 120, { steps: 5 });
  await page.mouse.move(grab.x + 120, grab.y - 240, { steps: 5 }); // released well up the wall
  await page.mouse.up();
  await expect.poll(async () => (await boxOf(request, admin, mine)).x).not.toBe(400);
  const dropped = await boxOf(request, admin, mine);
  // ...but snapped to a resting zone: never floating up on the wall (table top is y>=554, floor y>=600)
  expect(dropped.y).toBeGreaterThanOrEqual(554);
  expect(dropped.y).toBeLessThanOrEqual(760);

  // dragging someone else's present in the room does nothing to it (the drag never starts; it just
  // pans the camera like any background drag). This goes last because the pan moves the scene.
  const theirPt = await presentPoint(page, 900, 650);
  await page.mouse.move(theirPt.x, theirPt.y);
  await page.mouse.down();
  await page.mouse.move(theirPt.x - 150, theirPt.y - 100, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await boxOf(request, admin, theirs)).toMatchObject({ x: 900, y: 650, scale: 1 });
});

test('a contributor without canMoveOwnPresents (or the celebrant) gets no edit mode at all', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'PresentUiNone' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  const celebrate = tokenFromLink(room.links.celebrate);
  await pack(request, contribute, 'Mo', 400, 650, 'ui-none');
  await request.post(`/api/rooms/${admin}/unlock`);
  // celebrant even has canRearrange on: that covers room objects, never presents
  await setPermissions(request, admin, { celebrant: { canRearrange: true } });

  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [`party-parcel-contributor-session:${contribute}`, 'ui-none']);
  await page.goto(`/r/${contribute}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit room' })).toHaveCount(0);

  await page.goto(`/r/${celebrate}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  // celebrant with canRearrange gets the pencil (for room objects) but NO way to move presents
  await page.getByRole('button', { name: 'Edit room' }).click();
  await page.getByRole('button', { name: 'Presents' }).click();
  await page.getByRole('button', { name: /From Mo/ }).click();
  await expect(page.getByText("This present isn't yours to move.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scale +', exact: true })).toBeDisabled();
});

test('the designer offers Small / Medium / Large and the choice is saved with the present', async ({ page, request }) => {
  test.setTimeout(60_000);
  const room = await seedRoom(request, { celebrantName: 'PresentUiSize' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  await page.goto(`/r/${contribute}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.getByRole('button', { name: 'Add a present' }).click();
  await page.getByPlaceholder('Your name').fill('Sizey Sam');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Small', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Medium', exact: true })).toHaveAttribute('aria-pressed', 'true'); // default
  await page.getByRole('button', { name: 'Large', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Large', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // choosing a preset must not throw away the chosen size
  await page.getByRole('button', { name: 'Pink Hearts' }).click();
  await expect(page.getByRole('button', { name: 'Large', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Wrap it up' }).click();
  await page.getByRole('application', { name: 'Party room' }).click({ position: { x: 400, y: 480 } });
  await expect(page.getByText('Present placed from Sizey Sam.')).toBeVisible({ timeout: 10_000 });

  const boxes = (await (await request.get(`/api/rooms/${admin}/boxes`)).json()).boxes;
  expect(boxes).toHaveLength(1);
  expect(boxes[0].design).toMatchObject({ size: 'L', pattern: 'hearts' });
  expect(boxes[0].scale).toBe(1);
});
