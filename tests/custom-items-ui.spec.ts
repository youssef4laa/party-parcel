import { randomBytes } from 'crypto';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { decodePng, makeJpeg, makePng, marginedSquare } from './customItemFixtures';

/**
 * Room Editor Phase 3 (docs/ROOM_EDITOR.md 3a + 3b) through the real UI: import (with the notice,
 * auto-crop, pixelate + palette), draw with every tool, save/edit/place/delete, and touch. Whatever
 * a drawing tool did is verified by decoding the PNG the server actually stored — not by trusting
 * the UI's own preview.
 */

const ROOM_HEIGHT = 760;
const NOTICE =
  "Decorations are visible to anyone with the room link, even before the password in the exported site. Don't import private photos here.";
// Where handlePlaceCustomItem puts a new object (RoomCanvas.tsx ROOM_EDITOR_DEFAULT_X/Y)
const PLACE_X = 700;
const PLACE_Y = 650;

async function openDrawTab(page: Page, token: string) {
  await page.goto(`/r/${token}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit room' }).click();
  await page.getByRole('button', { name: 'Draw & Import' }).click();
}

const libraryItems = async (request: APIRequestContext, token: string) =>
  (await (await request.get(`/api/rooms/${token}/custom-items`)).json()).items as Array<{ id: string; name: string; width: number; height: number; url: string; source: string }>;

const objectsOf = async (request: APIRequestContext, token: string) =>
  (await (await request.get(`/api/rooms/${token}/objects`)).json()).objects as Array<{ id: string; kind: string; assetId: string | null; scale: number }>;

async function storedPixels(request: APIRequestContext, url: string) {
  const res = await request.get(url);
  expect(res.status()).toBe(200);
  const decoded = await decodePng(Buffer.from(await res.body()));
  const at = (x: number, y: number) => [...decoded.data.subarray((y * decoded.width + x) * 4, (y * decoded.width + x) * 4 + 4)];
  return { ...decoded, at };
}

/** Centre of pixel cell (cx, cy) on the drawing canvas, in page coordinates. */
async function cellPoint(page: Page, cx: number, cy: number, cells: number) {
  // The editor is taller than the panel, so other controls (e.g. the Trim checkbox) can leave the
  // canvas scrolled partly out of view; a real user scrolls it back before drawing, and so do we.
  await page.getByTestId('pixel-canvas').scrollIntoViewIfNeeded();
  const box = await page.getByTestId('pixel-canvas').boundingBox();
  if (!box) throw new Error('pixel canvas not visible');
  return { x: box.x + ((cx + 0.5) * box.width) / cells, y: box.y + ((cy + 0.5) * box.height) / cells };
}
async function click(page: Page, cx: number, cy: number, cells: number) {
  const p = await cellPoint(page, cx, cy, cells);
  await page.mouse.click(p.x, p.y);
}
async function drag(page: Page, from: [number, number], to: [number, number], cells: number) {
  const a = await cellPoint(page, from[0], from[1], cells);
  const b = await cellPoint(page, to[0], to[1], cells);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
}
const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const setColor = (page: Page, hex: string) => page.getByLabel('Custom color').fill(hex);

async function newDrawing(page: Page, size: 16 | 32 | 64 | 128) {
  await page.getByRole('button', { name: `${size}×${size}`, exact: true }).click();
  await page.getByRole('button', { name: `New ${size}×${size} drawing` }).click();
  await expect(page.getByTestId('pixel-canvas')).toBeVisible();
}

test('import: the notice is shown, margins are trimmed, and the saved item can be placed and survives a reload', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiImport' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);

  await expect(page.getByTestId('import-notice')).toHaveText(NOTICE);

  await page.getByTestId('import-file-input').setInputFiles({ name: 'sticker.png', mimeType: 'image/png', buffer: await marginedSquare(10, 4) });
  // 10px of art inside a 4px transparent margin (18x18 file): trimmed by default
  await expect(page.getByTestId('import-info')).toContainText('10×10 px');
  await page.getByLabel('Trim transparent margins').uncheck();
  await expect(page.getByTestId('import-info')).toContainText('18×18 px');
  await page.getByLabel('Trim transparent margins').check();
  await expect(page.getByTestId('import-info')).toContainText('10×10 px');

  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  await expect(page.getByTestId('library-count')).toHaveText('1 / 40');
  const [item] = await libraryItems(request, admin);
  expect(item).toMatchObject({ width: 10, height: 10, name: 'sticker', source: 'import' });

  // place it — twice, to prove one item can be placed many times
  const roomLocator = page.getByRole('application', { name: 'Party room' });
  await page.getByRole('button', { name: 'Close edit panel' }).click();
  const box = (await roomLocator.boundingBox())!;
  const scale = box.height / ROOM_HEIGHT;
  const clip = { x: box.x + (PLACE_X - 120) * scale, y: box.y + (PLACE_Y - 200) * scale, width: 240 * scale, height: 220 * scale };
  const before = await page.screenshot({ clip });
  await page.getByRole('button', { name: 'Edit room' }).click();
  await page.getByRole('button', { name: `Place ${item.name}` }).click();
  await page.getByRole('button', { name: `Place ${item.name}` }).click();
  await expect.poll(async () => (await objectsOf(request, admin)).filter((o) => o.assetId === item.id).length).toBe(2);
  const placed = (await objectsOf(request, admin)).find((o) => o.assetId === item.id)!;
  expect(placed.kind).toBe('custom');
  expect(placed.scale).toBe(4); // 10px art -> 160/10 = 16, clamped to the 4x max: crisp whole-number scale

  await page.getByRole('button', { name: 'Close edit panel' }).click();
  await page.waitForTimeout(300);
  const after = await page.screenshot({ clip });
  expect(after.equals(before), 'the placed custom item should visibly change the room').toBe(false);

  // reload: the object is rebuilt from the server and its texture fetched from the library
  await page.reload();
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.waitForTimeout(500);
  const box2 = (await roomLocator.boundingBox())!;
  const reloaded = await page.screenshot({
    clip: { x: box2.x + (PLACE_X - 120) * scale, y: box2.y + (PLACE_Y - 200) * scale, width: 240 * scale, height: 220 * scale },
  });
  expect(reloaded.equals(before), 'after a reload the placed items must still render').toBe(false);
});

test('import: pixelate to a chosen width and a 16-color palette, live in the preview, and the saved PNG really has those limits', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiPixelate' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);

  // 200x100 smooth gradient: thousands of colors before pixelating
  const gradient = await makePng(200, 100, (x, y) => [x, y * 2, (x * y) % 256, 255]);
  await page.getByTestId('import-file-input').setInputFiles({ name: 'gradient.png', mimeType: 'image/png', buffer: gradient });
  await expect(page.getByTestId('import-info')).toContainText('200×100 px');

  await page.getByLabel('Pixelate to match room').check();
  await page.getByLabel('Pixelate width').fill('40');
  await page.getByLabel('Pixelate palette').selectOption('16');
  await expect(page.getByTestId('import-info')).toContainText('40×20 px');
  const colorsText = await page.getByTestId('import-info').innerText();
  expect(Number(/(\d+) colors/.exec(colorsText)![1])).toBeLessThanOrEqual(16);

  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  const [item] = await libraryItems(request, admin);
  expect([item.width, item.height]).toEqual([40, 20]);
  const stored = await storedPixels(request, item.url);
  const seen = new Set<string>();
  for (let i = 0; i < stored.data.length; i += 4) seen.add(`${stored.data[i]},${stored.data[i + 1]},${stored.data[i + 2]}`);
  expect(seen.size).toBeLessThanOrEqual(16);
});

test('import: a spoofed extension, a wrong type, and an oversize file are each refused with a message, and nothing is saved', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiReject' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  const input = page.getByTestId('import-file-input');
  const err = page.getByTestId('import-error');

  // a real JPEG renamed .png, with a PNG mime type
  await input.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: await makeJpeg(30, 30) });
  await expect(err).toContainText('Only PNG and WebP');
  // plain text renamed .webp
  await input.setInputFiles({ name: 'notes.webp', mimeType: 'image/webp', buffer: Buffer.from('hello, I am definitely not an image file at all') });
  await expect(err).toContainText('Only PNG and WebP');
  // honest wrong type
  await input.setInputFiles({ name: 'vector.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(err).toContainText('Only PNG and WebP');
  // over 512 KB (random pixels don't compress)
  const random = randomBytes(512 * 512 * 3);
  const big = await makePng(512, 512, (x, y) => {
    const i = (y * 512 + x) * 3;
    return [random[i], random[i + 1], random[i + 2], 255];
  });
  expect(big.length).toBeGreaterThan(512 * 1024);
  await input.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big });
  await expect(err).toContainText('KB');

  await expect(page.getByTestId('import-options')).toHaveCount(0);
  expect(await libraryItems(request, admin)).toHaveLength(0);
});

test('import: an image wider than 512px is shrunk to fit (nearest-neighbor) and the user is told', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiShrink' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  // 1024x64 solid PNG: tiny in bytes, too wide in pixels
  await page.getByTestId('import-file-input').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: await makePng(1024, 64) });
  await expect(page.getByTestId('import-options')).toContainText('was 1024×64');
  await expect(page.getByTestId('import-info')).toContainText('512×32 px');
  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  expect((await libraryItems(request, admin))[0]).toMatchObject({ width: 512, height: 32 });
});

test('import: dropping a file onto the drop zone works the same as choosing one', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiDrop' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  const png = (await marginedSquare(6, 1)).toString('base64');
  await page.getByText('Drag a PNG or WebP here').evaluate(async (el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    el.parentElement!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, png);
  await expect(page.getByTestId('import-info')).toContainText('6×6 px');
  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
});

test('draw: every tool changes exactly the pixels it should, verified from the PNG the server stored', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiDrawTools' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  await newDrawing(page, 16);
  await page.getByLabel('Trim empty edges when saving').uncheck();
  await page.getByRole('button', { name: 'Grid', exact: true }).click(); // grid off: must not affect saved pixels

  // rectangle outline (2,2)-(9,9) in green; then fill the inside in blue
  await setColor(page, '#00ff00');
  await tool(page, 'Rect').click();
  await drag(page, [2, 2], [9, 9], 16);
  await setColor(page, '#0000ff');
  await tool(page, 'Fill').click();
  await click(page, 5, 5, 16);

  // a line along the bottom row in red
  await setColor(page, '#ff0000');
  await tool(page, 'Line').click();
  await drag(page, [0, 15], [15, 15], 16);

  // eyedropper picks the blue back up; the tool switches to pencil, so the next click paints blue
  await tool(page, 'Pick').click();
  await click(page, 5, 5, 16);
  await expect(page.getByLabel('Custom color')).toHaveValue('#0000ff');
  await click(page, 12, 3, 16);

  // eraser knocks a hole in the green outline
  await tool(page, 'Eraser').click();
  await click(page, 2, 2, 16);

  // horizontal mirror: one click at (1, 0) also paints (14, 0)
  await page.getByRole('button', { name: 'Mirror ↔' }).click();
  await tool(page, 'Pencil').click();
  await setColor(page, '#ffff00');
  await click(page, 1, 0, 16);
  await page.getByRole('button', { name: 'Mirror ↔' }).click(); // mirror off again

  // ellipse, filled, top-right corner in magenta
  await setColor(page, '#ff00ff');
  await page.getByRole('button', { name: 'Filled shapes' }).click();
  await tool(page, 'Ellipse').click();
  await drag(page, [11, 6], [14, 9], 16);

  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  const [item] = await libraryItems(request, admin);
  expect([item.width, item.height, item.source]).toEqual([16, 16, 'drawing']);

  const px = await storedPixels(request, item.url);
  const GREEN = [0, 255, 0, 255];
  const BLUE = [0, 0, 255, 255];
  const RED = [255, 0, 0, 255];
  const YELLOW = [255, 255, 0, 255];
  const CLEAR = [0, 0, 0, 0];
  expect(px.at(9, 5)).toEqual(GREEN); // right edge of the rectangle outline
  expect(px.at(5, 9)).toEqual(GREEN); // bottom edge
  expect(px.at(5, 5)).toEqual(BLUE); // flood-filled interior
  expect(px.at(3, 3)).toEqual(BLUE);
  expect(px.at(8, 8)).toEqual(BLUE);
  expect(px.at(12, 3)).toEqual(BLUE); // pencil after the eyedropper, outside the rectangle
  for (let x = 0; x < 16; x++) expect(px.at(x, 15), `line pixel ${x}`).toEqual(RED);
  expect(px.at(2, 2)).toEqual(CLEAR); // eraser hole (was the outline's corner)
  expect(px.at(1, 0)).toEqual(YELLOW);
  expect(px.at(14, 0)).toEqual(YELLOW); // mirrored
  expect(px.at(7, 0)).toEqual(CLEAR); // mirror didn't smear anything else
  expect(px.at(12, 7)).toEqual([255, 0, 255, 255]); // filled ellipse centre
  expect(px.at(0, 8)).toEqual(CLEAR); // untouched area stays transparent
});

test('draw: undo and redo work through the buttons and the keyboard, and an empty drawing cannot be saved', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiDrawUndo' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  await newDrawing(page, 16);
  await page.getByLabel('Trim empty edges when saving').uncheck();

  await setColor(page, '#123456');
  await click(page, 4, 4, 16);
  await click(page, 6, 6, 16);
  await page.getByTestId('pixel-editor').getByRole('button', { name: 'Undo' }).click(); // removes (6,6)
  await page.getByTestId('pixel-editor').getByRole('button', { name: 'Undo' }).click(); // removes (4,4)
  await expect(page.getByTestId('pixel-editor').getByRole('button', { name: 'Undo' })).toBeDisabled();

  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByText('Draw something first')).toContainText('completely transparent');
  expect(await libraryItems(request, admin)).toHaveLength(0);

  await page.getByTestId('pixel-editor').getByRole('button', { name: 'Redo' }).click(); // brings back (4,4) only
  // Keyboard shortcuts must work wherever focus is — including the page body, which is where focus
  // ends up after clicking the canvas or a button that just became disabled (that used to be a bug).
  await page.keyboard.press('Control+Shift+Z'); // redo -> (6,6) again
  await page.keyboard.press('Control+Z'); // undo -> just (4,4)
  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  const px = await storedPixels(request, (await libraryItems(request, admin))[0].url);
  expect(px.at(4, 4)).toEqual([0x12, 0x34, 0x56, 255]);
  expect(px.at(6, 6)).toEqual([0, 0, 0, 0]);
});

test('draw: Ctrl/Cmd+Z after clicking the canvas undoes the stroke — and never a room edit made earlier', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiDrawFocusUndo' });
  const admin = tokenFromLink(room.links.admin);
  await page.goto(`/r/${admin}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit room' }).click();
  // a room edit first, so the ROOM history has something a stray Ctrl+Z could wrongly undo
  await page.getByRole('button', { name: '+ Sofa' }).click();
  const sofaCount = async () =>
    ((await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects as Array<{ kind: string }>).filter((o) => o.kind === 'sofa').length;
  await expect.poll(sofaCount).toBe(1);

  await page.getByRole('button', { name: 'Draw & Import' }).click();
  await newDrawing(page, 16);
  await setColor(page, '#ff0000');
  await click(page, 3, 3, 16); // clicking the canvas leaves keyboard focus on the page body, not in the editor
  const editorUndo = page.getByTestId('pixel-editor').getByRole('button', { name: 'Undo' });
  await expect(editorUndo).toBeEnabled();

  await page.keyboard.press('Control+z');
  await expect(editorUndo).toBeDisabled(); // the stroke is undone
  await page.waitForTimeout(600);
  expect(await sofaCount(), 'Ctrl+Z inside the drawing editor must not undo the room edit behind it').toBe(1);
});

test('draw: flip and rotate change the picture, and the canvas sizes 16/32/64/128 are all offered', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiDrawTransform' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  for (const size of [16, 32, 64, 128] as const) {
    await page.getByRole('button', { name: `${size}×${size}`, exact: true }).click();
    await page.getByRole('button', { name: `New ${size}×${size} drawing` }).click();
    await expect(page.getByTestId('pixel-canvas')).toHaveAttribute('aria-label', `Pixel canvas ${size} by ${size}`);
    await page.getByRole('button', { name: 'Cancel' }).click();
  }

  await newDrawing(page, 16);
  await page.getByLabel('Trim empty edges when saving').uncheck();
  await setColor(page, '#ff0000');
  await click(page, 1, 2, 16);
  await page.getByRole('button', { name: 'Flip ↔' }).click(); // (1,2) -> (14,2)
  await page.getByRole('button', { name: 'Flip ↕' }).click(); // -> (14,13)
  await page.getByRole('button', { name: 'Rotate 90°' }).click(); // (x,y)->(15-y, x) = (2,14)
  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  const px = await storedPixels(request, (await libraryItems(request, admin))[0].url);
  expect(px.at(2, 14)).toEqual([255, 0, 0, 255]);
  let opaque = 0;
  for (let i = 3; i < px.data.length; i += 4) if (px.data[i] > 0) opaque++;
  expect(opaque).toBe(1);
});

test('draw: save, edit later ("Save changes" overwrites, "Save as new" copies), and placed copies follow the edit', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiDrawEdit' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  await newDrawing(page, 16);
  await page.getByLabel('Name').fill('smiley');
  await setColor(page, '#ff3d8b');
  await click(page, 3, 3, 16);
  await click(page, 4, 3, 16);
  await page.getByRole('button', { name: 'Save to My items' }).click(); // trim is on by default
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  let [item] = await libraryItems(request, admin);
  expect([item.width, item.height, item.name]).toEqual([2, 1, 'smiley']); // trimmed to the 2 drawn pixels

  await page.getByRole('button', { name: 'Place smiley' }).click();
  await expect.poll(async () => (await objectsOf(request, admin)).filter((o) => o.assetId === item.id).length).toBe(1);

  // open it again: the editor loads the saved pixels
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByTestId('pixel-canvas')).toHaveAttribute('aria-label', 'Pixel canvas 2 by 1');
  await page.getByLabel('Trim empty edges when saving').uncheck();
  await setColor(page, '#00ffff');
  await click(page, 0, 0, 2);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1); // overwritten, not duplicated
  const urlBefore = item.url;
  [item] = await libraryItems(request, admin);
  expect(item.url).not.toBe(urlBefore);
  const px = await storedPixels(request, item.url);
  expect(px.at(0, 0)).toEqual([0, 255, 255, 255]);
  expect(px.at(1, 0)).toEqual([255, 0x3d, 0x8b, 255]);
  expect((await objectsOf(request, admin)).filter((o) => o.assetId === item.id)).toHaveLength(1); // the placed copy is still there

  // "Save as new item" from the same editor makes a second library entry
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name').fill('smiley copy');
  await page.getByRole('button', { name: 'Save as new item' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(2);
  expect((await libraryItems(request, admin)).map((i) => i.name).sort()).toEqual(['smiley', 'smiley copy']);
});

test('an imported PNG can be opened in the pixel editor to touch it up, then saved', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiTouchUp' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  await page.getByTestId('import-file-input').setInputFiles({ name: 'blob.png', mimeType: 'image/png', buffer: await makePng(8, 8, () => [10, 200, 10, 255]) });
  await page.getByRole('button', { name: 'Touch up in editor' }).click();
  await expect(page.getByTestId('pixel-canvas')).toHaveAttribute('aria-label', 'Pixel canvas 8 by 8');
  await setColor(page, '#ff0000');
  await click(page, 0, 0, 8);
  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  const px = await storedPixels(request, (await libraryItems(request, admin))[0].url);
  expect(px.at(0, 0)).toEqual([255, 0, 0, 255]);
  expect(px.at(4, 4)).toEqual([10, 200, 10, 255]); // the rest of the imported art is intact
});

test('deleting an item asks for confirmation, names how many placed copies go with it, and removes them all', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiDelete' });
  const admin = tokenFromLink(room.links.admin);
  await openDrawTab(page, admin);
  await page.getByTestId('import-file-input').setInputFiles({ name: 'gone.png', mimeType: 'image/png', buffer: await makePng(6, 6) });
  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  const [item] = await libraryItems(request, admin);

  await page.getByRole('button', { name: 'Place gone' }).click();
  await page.getByRole('button', { name: 'Place gone' }).click();
  await expect.poll(async () => (await objectsOf(request, admin)).filter((o) => o.assetId === item.id).length).toBe(2);
  const total = (await objectsOf(request, admin)).length;

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('delete-confirm-text')).toHaveText('Delete this item and its 2 placed copies?');
  // "Keep" backs out: nothing was deleted
  await page.getByRole('button', { name: 'Keep' }).click();
  expect(await libraryItems(request, admin)).toHaveLength(1);
  expect(await objectsOf(request, admin)).toHaveLength(total);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(0);
  expect(await libraryItems(request, admin)).toHaveLength(0);
  expect(await objectsOf(request, admin)).toHaveLength(total - 2);
});

test('a contributor with canImport (but not canDraw) sees only the import section, and their item is theirs to delete', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiContributor' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  await request.put(`/api/rooms/${admin}/permissions`, {
    data: {
      contributors: { canDecorate: 'own', canImport: true, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 },
      celebrant: { canRearrange: false },
      freezeLayout: false,
    },
  });

  await openDrawTab(page, contribute);
  await expect(page.getByRole('region', { name: 'Import an image' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Draw an item' })).toHaveCount(0);
  await page.getByTestId('import-file-input').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: await makePng(5, 5) });
  await expect(page.getByRole('button', { name: 'Touch up in editor' })).toHaveCount(0); // needs canDraw
  await page.getByRole('button', { name: 'Save to My items' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(1);
  const [item] = await libraryItems(request, admin);
  expect(item.name).toBe('mine');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0); // no canDraw -> no editor
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByTestId('library-item')).toHaveCount(0);
});

test('a contributor with neither flag is told so, and the celebrant (no edit rights) has no way in', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'UiNoRights' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  await request.put(`/api/rooms/${admin}/permissions`, {
    data: {
      contributors: { canDecorate: 'own', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10 },
      celebrant: { canRearrange: false },
      freezeLayout: false,
    },
  });
  await openDrawTab(page, contribute);
  await expect(page.getByText("hasn't given this link the right to import or draw")).toBeVisible();
  await expect(page.getByTestId('import-file-input')).toHaveCount(0);

  const celebrate = tokenFromLink(room.links.celebrate);
  await page.goto(`/r/${celebrate}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit room' })).toHaveCount(0);
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('drawing works with touch: a tap paints one pixel and a one-finger drag draws a connected line', async ({ page, request }) => {
    const room = await seedRoom(request, { celebrantName: 'UiTouch' });
    const admin = tokenFromLink(room.links.admin);
    await openDrawTab(page, admin);
    await newDrawing(page, 16);
    await page.getByLabel('Trim empty edges when saving').uncheck();
    await setColor(page, '#ff0000');

    const tap = await cellPoint(page, 2, 2, 16);
    await page.touchscreen.tap(tap.x, tap.y);

    // a real touch drag via CDP (Playwright's touchscreen API only taps): (0,8) -> (15,8)
    const cdp = await page.context().newCDPSession(page);
    const a = await cellPoint(page, 0, 8, 16);
    const b = await cellPoint(page, 15, 8, 16);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
    for (let i = 1; i <= 5; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 5, y: a.y }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await page.getByRole('button', { name: 'Save to My items' }).click();
    await expect(page.getByTestId('library-item')).toHaveCount(1);
    const px = await storedPixels(request, (await libraryItems(request, admin))[0].url);
    expect(px.at(2, 2)).toEqual([255, 0, 0, 255]);
    for (let x = 0; x < 16; x++) expect(px.at(x, 8), `touch-dragged pixel ${x}`).toEqual([255, 0, 0, 255]);
    expect(px.at(2, 5)).toEqual([0, 0, 0, 0]);
    // the page must not have scrolled/panned under the stroke
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
