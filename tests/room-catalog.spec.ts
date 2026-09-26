import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { OBJECT_CATALOG, catalogEntriesFor } from '../src/room/objectCatalog';
import { LIGHT_GLOWS } from '../src/room/scene/lightGlow';

/**
 * Room Editor Phase 5 (docs/ROOM_EDITOR.md 1c): the built-in catalog is complete, every item really
 * renders, lights glow with the right z-order, and the banner/neon/balloon settings are editable.
 */

const ROOM_HEIGHT = 760;
let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.5.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

// Every item the brief's section 1c names, by the catalog key that implements it.
const BRIEF_1C = {
  furniture: ['sofa', 'armchair', 'bookshelf', 'side-table', 'dresser', 'bench', 'chair', 'bean-bag', 'cushions', 'rug'],
  plants: ['potted-plant', 'tall-tree', 'pine-tree', 'palm', 'flower-pots', 'hanging-plant'],
  lights: ['string-lights', 'paper-lantern-decor', 'floor-lamp', 'table-lamp', 'neon-sign', 'disco-ball', 'candles', 'spotlight'],
  decor: ['streamers', 'banner-text', 'balloon-cluster', 'pinata', 'confetti', 'poster', 'photo-string', 'party-hat'],
};
const NEW_KINDS = [
  'dresser', 'bench', 'cushions', 'rug-round', 'rug-stripes', 'rug-checker', 'rug-runner', 'palm', 'flower-pots',
  'hanging-plant', 'candles', 'spotlight', 'banner-text', 'confetti', 'poster', 'poster-cake', 'photo-string',
];

test('every item the brief names in 1c is in the catalog the host can add from (or is the legacy kind it maps to)', () => {
  for (const [group, keys] of Object.entries(BRIEF_1C)) {
    for (const key of keys) {
      const entry = OBJECT_CATALOG[key];
      expect(entry, `${group}: "${key}" must exist`).toBeDefined();
      // `rug` and `chair` are legacy kinds the catalog also lists for adding more; all must be addable
      expect(entry.hiddenFromCatalog ?? false, `${group}: "${key}" must be addable from the catalog`).toBe(false);
    }
  }
  // rugs come in several sizes AND patterns
  const rugs = catalogEntriesFor(undefined, 'rug').map((e) => e.key);
  expect(rugs.length).toBeGreaterThanOrEqual(5);
  // the four categories the panel filters by all have the items the brief lists
  for (const [category, keys] of Object.entries(BRIEF_1C)) {
    const listed = new Set(catalogEntriesFor(category === 'furniture' ? 'furniture' : (category as 'plants' | 'lights' | 'decor')).map((e) => e.key));
    for (const key of keys) expect(listed.has(key), `${key} should appear under "${category}"`).toBe(true);
  }
});

test('every light has a glow definition, positioned inside sensible bounds', () => {
  const lights = catalogEntriesFor('lights').map((e) => e.key);
  for (const key of lights) expect(LIGHT_GLOWS[key], `light "${key}" needs a glow`).toBeDefined();
  for (const [key, specs] of Object.entries(LIGHT_GLOWS)) {
    for (const s of specs) {
      expect(s.radius, key).toBeGreaterThan(10);
      expect(s.alpha, key).toBeGreaterThan(0);
      expect(s.alpha, key).toBeLessThanOrEqual(1);
    }
  }
});

test('the legacy room banner is not addable twice, but "Banner (your words)" is', () => {
  expect(OBJECT_CATALOG.banner.hiddenFromCatalog).toBe(true);
  expect(OBJECT_CATALOG['banner-text'].configurable).toBe(true);
});

async function hideEverything(request: APIRequestContext, admin: string) {
  const objects = (await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects as Array<{ id: string }>;
  for (const o of objects) {
    const res = await request.patch(`/api/rooms/${admin}/objects/${o.id}`, { data: { hidden: true }, headers: ip() });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
}
const place = (request: APIRequestContext, admin: string, data: Record<string, unknown>) =>
  request.post(`/api/rooms/${admin}/objects`, { data: { zone: 'anywhere', ...data }, headers: ip() });

async function openRoom(page: Page, admin: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/r/${admin}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.waitForTimeout(800);
  const box = (await page.getByRole('application', { name: 'Party room' }).boundingBox())!;
  return { errors, box, scale: box.height / ROOM_HEIGHT };
}

// [key, centre x, base y, width, height] in world px (art grid size x 4). Three clear rows; rugs on their own.
const CELLS: Array<[string, number, number, number, number]> = [
  // (x >= ~330: the host panel is an opaque HTML overlay over the room's top-left corner)
  ['palm', 90, 250, 104, 184], ['hanging-plant', 345, 190, 56, 120], ['spotlight', 470, 190, 56, 128],
  ['poster', 590, 200, 64, 88], ['poster-cake', 710, 200, 64, 88], ['dresser', 850, 250, 96, 88],
  ['candles', 980, 250, 64, 64], ['flower-pots', 1120, 250, 88, 56],
  ['banner-text', 150, 430, 192, 66], ['photo-string', 400, 430, 176, 80], ['confetti', 650, 430, 136, 36],
  ['cushions', 850, 430, 72, 36], ['bench', 1050, 430, 112, 52],
  ['rug-round', 120, 620, 176, 48], ['rug-stripes', 400, 620, 240, 72], ['rug-checker', 760, 620, 288, 88], ['rug-runner', 1150, 620, 400, 36],
];

test('every new catalog item really draws: each one paints pixels in its own clear spot, with no errors', async ({ page, request }) => {
  test.setTimeout(120_000);
  const seeded = await seedRoom(request, { celebrantName: 'CatalogRender', eventAt: new Date(Date.now() - 60_000).toISOString() });
  const admin = tokenFromLink(seeded.links.admin);
  await hideEverything(request, admin); // an empty room, so the ONLY thing that can change a clip is the item placed in it

  expect(new Set(CELLS.map((c) => c[0]))).toEqual(new Set(NEW_KINDS)); // the grid covers every new kind

  const empty = await openRoom(page, admin);
  const clips = CELLS.map(([key, cx, by, w, h]) => ({
    key,
    clip: { x: empty.box.x + (cx - w / 2 - 6) * empty.scale, y: empty.box.y + (by - h - 6) * empty.scale, width: (w + 12) * empty.scale, height: (h + 60) * empty.scale },
  }));
  const before = await Promise.all(clips.map(async (c) => ({ key: c.key, shot: await page.screenshot({ clip: c.clip }) })));

  for (const [kind, cx, by] of CELLS) {
    const res = await place(request, admin, { kind, x: cx, y: by, config: undefined });
    expect(res.ok(), `${kind}: ${await res.text()}`).toBeTruthy();
  }
  const filled = await openRoom(page, admin);
  const rects = CELLS.map(([key, cx, by, w, h]) => ({
    key,
    clip: { x: filled.box.x + (cx - w / 2 - 6) * filled.scale, y: filled.box.y + (by - h - 6) * filled.scale, width: (w + 12) * filled.scale, height: (h + 60) * filled.scale },
  }));
  const blank: string[] = [];
  for (let i = 0; i < rects.length; i++) {
    const after = await page.screenshot({ clip: rects[i].clip });
    if (after.equals(before[i].shot)) blank.push(rects[i].key);
  }
  expect(filled.errors, 'placing every new item threw in the browser').toEqual([]);
  expect(blank, 'these items painted nothing in their own spot').toEqual([]);
});

test('lights glow, and the glow respects z-order: behind a sofa it never paints over it, in front it does', async ({ page, request }) => {
  test.setTimeout(120_000);
  const seeded = await seedRoom(request, { celebrantName: 'CatalogGlow', eventAt: new Date(Date.now() - 60_000).toISOString() });
  const admin = tokenFromLink(seeded.links.admin);
  await hideEverything(request, admin);

  // A sofa (120x64, base at 600,500) and a floor lamp (40x128) whose glow centre lands in the sofa's seat.
  const sofa = (await (await place(request, admin, { kind: 'sofa', x: 600, y: 500, z: 5 })).json()).object.id as string;
  const lamp = (await (await place(request, admin, { kind: 'floor-lamp', x: 600, y: 575, z: 0 })).json()).object.id as string;
  const setZ = async (id: string, z: number) => {
    const res = await request.patch(`/api/rooms/${admin}/objects/${id}`, { data: { z }, headers: ip() });
    expect(res.ok(), await res.text()).toBeTruthy();
  };
  const seatClip = async () => {
    const v = await openRoom(page, admin);
    expect(v.errors).toEqual([]);
    return page.screenshot({ clip: { x: v.box.x + 566 * v.scale, y: v.box.y + 468 * v.scale, width: 68 * v.scale, height: 22 * v.scale } });
  };

  // (A) the sofa alone: hide the lamp entirely
  await request.patch(`/api/rooms/${admin}/objects/${lamp}`, { data: { hidden: true }, headers: ip() });
  const sofaAlone = await seatClip();

  // (B) lamp shown but BEHIND the sofa (lower z): the seat pixels must be identical to the sofa alone
  await request.patch(`/api/rooms/${admin}/objects/${lamp}`, { data: { hidden: false }, headers: ip() });
  const lampBehind = await seatClip();
  expect(lampBehind.equals(sofaAlone), 'a lamp behind the sofa must not paint its glow over the sofa').toBe(true);

  // (C) the same lamp IN FRONT (higher z): its additive glow now brightens the seat
  await setZ(lamp, 20);
  await setZ(sofa, 5);
  const lampFront = await seatClip();
  expect(lampFront.equals(sofaAlone), 'a lamp in front of the sofa should light it up').toBe(false);
});

test('the Decor editor changes a neon sign\'s words, a banner\'s words and a balloon\'s colour, and the room updates', async ({ page, request }) => {
  test.setTimeout(90_000);
  const seeded = await seedRoom(request, { celebrantName: 'CatalogDecorEdit', eventAt: new Date(Date.now() - 60_000).toISOString() });
  const admin = tokenFromLink(seeded.links.admin);
  const cfg = async (kind: string) => {
    const o = (await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects.filter((x: { kind: string }) => x.kind === kind).pop();
    return JSON.parse(o.configJson) as Record<string, unknown>;
  };
  const balloonColors = async () =>
    ((await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects as Array<{ kind: string; configJson: string }>)
      .filter((x) => x.kind === 'balloon')
      .map((x) => JSON.parse(x.configJson).color as string);

  await page.goto(`/r/${admin}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit room' }).click();

  await page.getByRole('button', { name: '+ Neon sign' }).click();
  await expect(page.getByTestId('decor-editor')).toBeVisible();
  await page.getByPlaceholder('PARTY', { exact: true }).fill('HELLO ALEX');
  await expect.poll(async () => (await cfg('neon-sign')).text).toBe('HELLO ALEX');

  await page.getByRole('button', { name: '+ Banner (your words)' }).click();
  await page.getByPlaceholder('PARTY!').fill('CONGRATS');
  await expect.poll(async () => (await cfg('banner-text')).text).toBe('CONGRATS');

  // the length cap is enforced in the field itself
  await page.getByPlaceholder('PARTY!').fill('A'.repeat(40));
  await expect(page.getByPlaceholder('PARTY!')).toHaveValue('A'.repeat(16));

  // a balloon: pick it from the Layers tab (the six default balloons are legacy objects) and recolour it
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByRole('button', { name: /^balloon/ }).first().click();
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  const beforeColors = await balloonColors();
  await page.getByTestId('decor-editor').getByRole('combobox').selectOption('green');
  await expect.poll(async () => (await balloonColors()).filter((c) => c === 'green').length).toBe(beforeColors.filter((c) => c === 'green').length + 1);
});

test('a new neon sign\'s words are drawn in the room (the sprite changes when the text does)', async ({ page, request }) => {
  test.setTimeout(90_000);
  const seeded = await seedRoom(request, { celebrantName: 'CatalogNeonDraw', eventAt: new Date(Date.now() - 60_000).toISOString() });
  const admin = tokenFromLink(seeded.links.admin);
  await hideEverything(request, admin);
  const id = (await (await place(request, admin, { kind: 'neon-sign', x: 600, y: 250 })).json()).object.id as string;
  const shot = async () => {
    const v = await openRoom(page, admin);
    return page.screenshot({ clip: { x: v.box.x + 480 * v.scale, y: v.box.y + 150 * v.scale, width: 260 * v.scale, height: 130 * v.scale } });
  };
  const plain = await shot();
  await request.patch(`/api/rooms/${admin}/objects/${id}`, { data: { configJson: JSON.stringify({ text: 'XOXO' }) }, headers: ip() });
  expect((await shot()).equals(plain), 'changing the sign\'s text should change what is drawn').toBe(false);
});
