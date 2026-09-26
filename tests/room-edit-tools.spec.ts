import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { makePng } from './customItemFixtures';

/**
 * Room Editor Phase 5 (docs/ROOM_EDITOR.md 1b): the edit-mode tools — move, resize (buttons, corner
 * handles, touch pinch), undo/redo, keyboard, duplicate, snap-to-grid, and zones with the host's
 * "place anywhere". Everything is driven through real mouse/keyboard/touch input, and every claim
 * is checked against what the SERVER stored, not against what the editor's own UI says.
 */

const ROOM_HEIGHT = 760;
const SOFA_W = 120; // sprite is 30x16 art pixels at 4 world px each, anchored bottom-centre
const SOFA_H = 64;
const FLOOR_MIN_Y = 430; // src/room/zones.ts: the top of the floor zone
let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.11.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

type Obj = { id: string; kind: string; x: number; y: number; scale: number; zone: string; assetId: string | null; flipX: boolean };
const objectsOf = async (request: APIRequestContext, token: string) =>
  (await (await request.get(`/api/rooms/${token}/objects`)).json()).objects as Obj[];
const sofas = async (request: APIRequestContext, token: string) => (await objectsOf(request, token)).filter((o) => o.kind === 'sofa');

async function room(page: Page) {
  const box = (await page.getByRole('application', { name: 'Party room' }).boundingBox())!;
  return { ...box, scale: box.height / ROOM_HEIGHT };
}
/** Screen point for world (x, y). */
async function at(page: Page, x: number, y: number) {
  const r = await room(page);
  return { x: r.x + x * r.scale, y: r.y + y * r.scale, s: r.scale };
}

async function editMode(page: Page, token: string, session?: string) {
  if (session) await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [`party-parcel-contributor-session:${token}`, session]);
  await page.goto(`/r/${token}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit room' }).click();
}
const addSofa = async (page: Page) => {
  await page.getByRole('button', { name: '+ Sofa' }).click();
  await expect(page.getByTestId('object-toolbar')).toBeVisible();
};
const readout = (page: Page) => page.getByTestId('object-readout');
const undoBtn = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true });
const redoBtn = (page: Page) => page.getByRole('button', { name: 'Redo', exact: true });

/** Drag from a screen point to another with real mouse events (a few steps, like a hand). */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function newRoom(request: APIRequestContext, name: string) {
  const seeded = await seedRoom(request, { celebrantName: name, eventAt: new Date(Date.now() - 60_000).toISOString() });
  return {
    admin: tokenFromLink(seeded.links.admin),
    contribute: tokenFromLink(seeded.links.contribute),
    celebrate: tokenFromLink(seeded.links.celebrate),
  };
}

test('adding an item puts it inside its own zone (a wall item on the wall, a ceiling item at the top)', async ({ page, request }) => {
  const { admin } = await newRoom(request, 'ToolsZonesAdd');
  await editMode(page, admin);
  await page.getByRole('button', { name: '+ Sofa' }).click();
  await page.getByRole('button', { name: '+ Bookshelf' }).click();
  await page.getByRole('button', { name: '+ Streamers' }).click();
  await expect.poll(async () => (await objectsOf(request, admin)).filter((o) => ['sofa', 'bookshelf', 'streamers'].includes(o.kind)).length).toBe(3);
  const byKind = Object.fromEntries((await objectsOf(request, admin)).map((o) => [o.kind, o]));
  expect(byKind.sofa).toMatchObject({ zone: 'floor', y: 650 });
  expect(byKind.bookshelf).toMatchObject({ zone: 'wall', y: 200 });
  expect(byKind.streamers).toMatchObject({ zone: 'ceiling', y: 60 });
});

test('drag to move, then undo and redo it — with the buttons and with Ctrl/Cmd+Z', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { admin } = await newRoom(request, 'ToolsMoveUndo');
  await editMode(page, admin);
  await addSofa(page);
  const start = (await sofas(request, admin))[0];
  expect(start).toMatchObject({ x: 700, y: 650, scale: 1 });
  await expect(undoBtn(page)).toBeEnabled(); // adding it is itself undoable

  const grab = await at(page, 700, 650 - SOFA_H / 2);
  await drag(page, grab, { x: grab.x - 200, y: grab.y });
  await expect.poll(async () => (await sofas(request, admin))[0].x).not.toBe(700);
  const moved = (await sofas(request, admin))[0];
  expect(moved.x).toBeCloseTo(700 - 200 / grab.s, -1);
  expect(moved.y).toBe(650);

  await undoBtn(page).click();
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(700);
  await redoBtn(page).click();
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(moved.x);

  // keyboard: Ctrl+Z undoes, Ctrl+Shift+Z redoes (Meta on macOS, Control elsewhere — the app accepts both)
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(700);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(moved.x);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z'); // the second one undoes the ADD: the sofa disappears entirely
  await expect.poll(async () => (await sofas(request, admin)).length).toBe(0);
  await expect(undoBtn(page)).toBeDisabled();
  await page.keyboard.press('Control+Shift+z'); // ...and redo brings it back
  await expect.poll(async () => (await sofas(request, admin)).length).toBe(1);
});

test('resize with the toolbar: whole-number steps by default, quarter steps with Free scale, bounded', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { admin } = await newRoom(request, 'ToolsScale');
  await editMode(page, admin);
  await addSofa(page);
  const scale = async () => (await sofas(request, admin))[0].scale;

  await page.getByRole('button', { name: 'Scale +', exact: true }).click();
  await expect.poll(scale).toBe(2); // 1 -> 2, not 1.25: pixels stay crisp
  await page.getByRole('button', { name: 'Scale +', exact: true }).click();
  await expect.poll(scale).toBe(3);
  await page.getByRole('button', { name: 'Scale +', exact: true }).click();
  await expect.poll(scale).toBe(4);
  await expect(page.getByRole('button', { name: 'Scale +', exact: true })).toBeDisabled(); // MAX_OBJECT_SCALE
  await expect(readout(page)).toContainText('scale 4×');

  await page.getByRole('button', { name: 'Free scale' }).click();
  await expect(page.getByRole('button', { name: 'Free scale' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Scale −', exact: true }).click();
  await expect.poll(scale).toBe(3.75);

  await page.getByRole('button', { name: 'Free scale' }).click(); // back to crisp steps: 3.75 -> next lower whole step
  await page.getByRole('button', { name: 'Scale −', exact: true }).click();
  await expect.poll(scale).toBe(3);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Scale −', exact: true }).click();
  await expect.poll(scale).toBe(0.25);
  await expect(page.getByRole('button', { name: 'Scale −', exact: true })).toBeDisabled(); // MIN_OBJECT_SCALE
});

test('resize by dragging a corner handle: it follows the pointer, snaps to a crisp size on release, and is undoable', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { admin } = await newRoom(request, 'ToolsHandles');
  await editMode(page, admin);
  await addSofa(page);
  const scale = async () => (await sofas(request, admin))[0].scale;

  // bottom-right corner of the sofa at scale 1: (700 + 60, 650); drag outward to 2.17x the distance
  const corner = await at(page, 700 + SOFA_W / 2, 650);
  await drag(page, corner, await at(page, 700 + 130, 650));
  await expect.poll(scale).toBe(2); // 2.17 snapped to the nearest crisp step

  // and a real inward drag (top-left corner of the now-2x sofa) shrinks it back
  const topLeft = await at(page, 700 - SOFA_W, 650 - SOFA_H * 2);
  const origin = await at(page, 700, 650);
  const midway = { x: origin.x + (topLeft.x - origin.x) * 0.5, y: origin.y + (topLeft.y - origin.y) * 0.5 };
  await drag(page, topLeft, midway);
  await expect.poll(scale).toBe(1);

  await undoBtn(page).click();
  await expect.poll(scale).toBe(2);

  // with Free scale on the drag is not snapped: ~2.5x
  await page.getByRole('button', { name: 'Free scale' }).click();
  const corner2 = await at(page, 700 + SOFA_W, 650); // bottom-right of the 2x sofa
  await drag(page, corner2, await at(page, 700 + SOFA_W * 1.25, 650));
  await expect.poll(scale).toBeGreaterThan(2.3);
  expect(await scale()).toBeCloseTo(2.5, 0);
  expect(await scale()).not.toBe(3);
});

test('keyboard: arrows nudge (one undo step per burst), Shift moves 10, Delete removes, Ctrl+Z restores, Escape deselects', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { admin } = await newRoom(request, 'ToolsKeys');
  await editMode(page, admin);
  await addSofa(page);
  const first = (await sofas(request, admin))[0];

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(703); // 3 presses = one saved move of 3
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await sofas(request, admin))[0].y).toBe(660);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(702);

  // each burst was ONE history entry: three undos walk back left-nudge, shift-nudge, right-nudges
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(703);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await sofas(request, admin))[0].y).toBe(650);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(700);

  // Delete removes the selected item; undo re-creates it with the same properties
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await sofas(request, admin)).length).toBe(0);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await sofas(request, admin)).length).toBe(1);
  const restored = (await sofas(request, admin))[0];
  expect(restored).toMatchObject({ x: first.x, y: first.y, scale: first.scale, zone: 'floor', kind: 'sofa' });
  expect(restored.id).not.toBe(first.id); // a new row; the history still found it

  // typing in a text field must NOT trigger shortcuts
  await page.getByPlaceholder('Search items…').fill('sofa');
  await page.getByPlaceholder('Search items…').press('Backspace');
  await page.getByPlaceholder('Search items…').press('Control+z');
  expect((await sofas(request, admin)).length).toBe(1);

  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('object-toolbar')).toHaveCount(0);
});

test('duplicate copies an item (button and Ctrl/Cmd+D), offset from the original, and the copy is selected', async ({ page, request }) => {
  const { admin } = await newRoom(request, 'ToolsDuplicate');
  await editMode(page, admin);
  await addSofa(page);
  await page.getByRole('button', { name: 'Scale +', exact: true }).click();
  await page.getByRole('button', { name: 'Flip', exact: true }).click();
  await expect.poll(async () => (await sofas(request, admin))[0].flipX).toBe(true);

  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect.poll(async () => (await sofas(request, admin)).length).toBe(2);
  const [orig, copy] = await sofas(request, admin);
  expect(copy).toMatchObject({ scale: 2, flipX: true, zone: 'floor', kind: 'sofa' });
  expect(copy.x).toBe(orig.x + 32);
  expect(copy.y).toBe(orig.y + 16);
  await expect(readout(page)).toContainText(`x ${copy.x}, y ${copy.y}`); // the copy is the selected one

  await page.keyboard.press('Control+d');
  await expect.poll(async () => (await sofas(request, admin)).length).toBe(3);
  await undoBtn(page).click(); // undo removes the last copy only
  await expect.poll(async () => (await sofas(request, admin)).length).toBe(2);
});

test('snap to grid: with it on, drags and nudges land on the 16px grid', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { admin } = await newRoom(request, 'ToolsSnap');
  await editMode(page, admin);
  await addSofa(page);
  await page.getByRole('button', { name: 'Snap to grid' }).click();
  await expect(page.getByRole('button', { name: 'Snap to grid' })).toHaveAttribute('aria-pressed', 'true');

  const grab = await at(page, 700, 650 - SOFA_H / 2);
  await drag(page, grab, { x: grab.x - 137, y: grab.y + 11 }); // an awkward, off-grid drop
  await expect.poll(async () => (await sofas(request, admin))[0].x).not.toBe(700);
  const s = (await sofas(request, admin))[0];
  expect(s.x % 16, `x=${s.x}`).toBe(0);
  expect(s.y % 16, `y=${s.y}`).toBe(0);

  await page.keyboard.press('ArrowRight'); // with snapping on a nudge is one grid cell
  await expect.poll(async () => (await sofas(request, admin))[0].x).toBe(s.x + 16);
});

test('zones: the host is held to the floor until "Place anywhere" is switched on; a contributor never gets the switch', async ({ page, request }) => {
  test.setTimeout(90_000);
  const { admin, contribute } = await newRoom(request, 'ToolsZonesUi');
  await editMode(page, admin);
  await addSofa(page);

  // drag it up the wall: clamped to the top of the floor zone
  const grab = await at(page, 700, 650 - SOFA_H / 2);
  await drag(page, grab, { x: grab.x, y: grab.y - 400 });
  await expect.poll(async () => (await sofas(request, admin))[0].y).toBeLessThan(650);
  expect((await sofas(request, admin))[0].y).toBe(FLOOR_MIN_Y);

  // host turns on Place anywhere: the same drag now goes where it's dropped
  await page.getByRole('button', { name: 'Place anywhere' }).click();
  await expect(page.getByRole('button', { name: 'Place anywhere' })).toHaveAttribute('aria-pressed', 'true');
  const now = await at(page, 700, FLOOR_MIN_Y - SOFA_H / 2);
  await drag(page, now, { x: now.x, y: now.y - 200 });
  await expect.poll(async () => (await sofas(request, admin))[0].y).toBeLessThan(FLOOR_MIN_Y);

  // a contributor with decorating rights: same clamp, and no Place-anywhere switch at all
  await request.put(`/api/rooms/${admin}/permissions`, {
    data: { contributors: { canDecorate: 'own', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 }, celebrant: { canRearrange: false }, freezeLayout: false },
  });
  const page2 = await page.context().newPage();
  await editMode(page2, contribute, 'tools-zone-contrib');
  await expect(page2.getByRole('button', { name: 'Place anywhere' })).toHaveCount(0);
  await addSofa(page2);
  const mine = (await sofas(request, admin)).find((o) => o.zone === 'floor' && o.y === 650)!;
  const g2 = await at(page2, mine.x, mine.y - SOFA_H / 2);
  await drag(page2, g2, { x: g2.x, y: g2.y - 400 });
  await expect.poll(async () => (await sofas(request, admin)).find((o) => o.id === mine.id)!.y).toBe(FLOOR_MIN_Y);
});

test('undo covers presents too: a resized present goes back and forth through history', async ({ page, request }) => {
  const { admin, contribute } = await newRoom(request, 'ToolsPresentUndo');
  const made = await request.post(`/api/rooms/${contribute}/boxes`, {
    headers: ip(),
    data: {
      fromName: 'Undo Una', x: 500, y: 650, goodies: [{ type: 'note', text: 'n', sizeBytes: 1 }],
      design: { shape: 'cube', pattern: 'solid', baseColor: '#f4a6c1', accentColor: '#ff3d8b', ribbon: 'vertical', ribbonColor: '#fff6d5', bow: 'classic', tag: 'none', tagText: '', sticker: 'none', topper: 'none' },
    },
  });
  const boxId = (await made.json()).id as string;
  const scale = async () =>
    (await (await request.get(`/api/rooms/${admin}/boxes`)).json()).boxes.find((b: { id: string }) => b.id === boxId).scale as number;

  await editMode(page, admin);
  await page.getByRole('button', { name: 'Presents' }).click();
  await page.getByRole('button', { name: /From Undo Una/ }).click();
  await page.getByRole('button', { name: 'Scale +', exact: true }).click();
  await expect.poll(scale).toBe(1.25);
  await undoBtn(page).click();
  await expect.poll(scale).toBe(1);
  await redoBtn(page).click();
  await expect.poll(scale).toBe(1.25);
  // a present can also be nudged from the keyboard while it is selected
  const before = (await (await request.get(`/api/rooms/${admin}/boxes`)).json()).boxes.find((b: { id: string }) => b.id === boxId).x as number;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await (await request.get(`/api/rooms/${admin}/boxes`)).json()).boxes.find((b: { id: string }) => b.id === boxId).x)
    .toBe(before + 2);
});

test('undo is a normal edit: if the host has revoked the right since, it is refused and explained, and nothing is lost', async ({ page, request }) => {
  const { admin, contribute } = await newRoom(request, 'ToolsUndoRevoked');
  await request.put(`/api/rooms/${admin}/permissions`, {
    data: { contributors: { canDecorate: 'own', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 }, celebrant: { canRearrange: false }, freezeLayout: false },
  });
  await editMode(page, contribute, 'tools-revoked-session');
  await addSofa(page);
  await expect.poll(async () => (await sofas(request, admin)).length).toBe(1);

  // the host freezes the layout; the contributor's Undo (which would delete their sofa) must be refused
  await request.put(`/api/rooms/${admin}/permissions`, {
    data: { contributors: { canDecorate: 'own', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 }, celebrant: { canRearrange: false }, freezeLayout: true },
  });
  await undoBtn(page).click();
  await expect(page.getByText(/Couldn't undo/)).toBeVisible();
  expect((await sofas(request, admin)).length).toBe(1);
});

test('deleting a custom item\'s placed copy and undoing it restores the same image', async ({ page, request }) => {
  const { admin } = await newRoom(request, 'ToolsCustomUndo');
  const up = await request.post(`/api/rooms/${admin}/custom-items?source=import&name=undo-me`, {
    data: await makePng(8, 8), headers: { 'Content-Type': 'image/png', ...ip() },
  });
  const assetId = (await up.json()).item.id as string;
  await editMode(page, admin);
  await page.getByRole('button', { name: 'Draw & Import' }).click();
  await page.getByRole('button', { name: 'Place undo-me' }).click();
  await expect.poll(async () => (await objectsOf(request, admin)).filter((o) => o.assetId === assetId).length).toBe(1);
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(async () => (await objectsOf(request, admin)).filter((o) => o.assetId === assetId).length).toBe(0);
  await undoBtn(page).click();
  await expect.poll(async () => (await objectsOf(request, admin)).filter((o) => o.assetId === assetId).length).toBe(1);
  expect((await objectsOf(request, admin)).find((o) => o.assetId === assetId)).toMatchObject({ kind: 'custom', zone: 'anywhere' });
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('two-finger pinch resizes the selected item (snapped to a crisp size), never moves it, and can be undone', async ({ page, request }) => {
    test.setTimeout(60_000);
    const { admin } = await newRoom(request, 'ToolsPinch');
    await editMode(page, admin);
    await addSofa(page); // selected, at (700, 650), scale 1
    const state = async () => (await sofas(request, admin))[0];
    const cdp = await page.context().newCDPSession(page);
    const centre = await at(page, 700, 650 - SOFA_H / 2);

    const pinch = async (fromSpread: number, toSpread: number) => {
      const pts = (spread: number) => [
        { x: centre.x - spread / 2, y: centre.y, id: 1 },
        { x: centre.x + spread / 2, y: centre.y, id: 2 },
      ];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(fromSpread) });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(fromSpread + ((toSpread - fromSpread) * i) / 8) });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    await pinch(50, 150); // spread x3 -> 3x
    await expect.poll(async () => (await state()).scale).toBe(3);
    expect(await state()).toMatchObject({ x: 700, y: 650 }); // resized in place — the fingers never dragged it

    await pinch(150, 50); // spread /3 -> back to 1x
    await expect.poll(async () => (await state()).scale).toBe(1);
    expect(await state()).toMatchObject({ x: 700, y: 650 });

    await undoBtn(page).click(); // undo the shrink
    await expect.poll(async () => (await state()).scale).toBe(3);
  });

  test('a one-finger drag still moves the item, and a pinch with nothing selected does nothing', async ({ page, request }) => {
    test.setTimeout(60_000);
    const { admin } = await newRoom(request, 'ToolsTouchMove');
    await editMode(page, admin);
    await addSofa(page);
    const cdp = await page.context().newCDPSession(page);
    const from = await at(page, 700, 650 - SOFA_H / 2);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x - (150 * i) / 6, y: from.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await sofas(request, admin))[0].x).toBeLessThan(600);
    const moved = (await sofas(request, admin))[0];
    expect(moved.scale).toBe(1);

    // deselect (Escape), then pinch over EMPTY floor (where the sofa used to be): nothing is
    // selected and no item is under the fingers, so nothing at all may change. (Two fingers landing
    // ON an item select it and then resize it — that's the pinch test above.)
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('object-toolbar')).toHaveCount(0);
    const beforeAll = (await objectsOf(request, admin)).map((o) => `${o.id}:${o.x},${o.y},${o.scale}`).sort();
    const c = await at(page, 700, 650 - SOFA_H / 2);
    const pts = (spread: number) => [{ x: c.x - spread / 2, y: c.y, id: 1 }, { x: c.x + spread / 2, y: c.y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(50) });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(50 + 15 * i) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(600);
    expect((await objectsOf(request, admin)).map((o) => `${o.id}:${o.x},${o.y},${o.scale}`).sort()).toEqual(beforeAll);
    expect((await sofas(request, admin))[0]).toMatchObject({ x: moved.x, y: moved.y, scale: 1 });
  });
});
