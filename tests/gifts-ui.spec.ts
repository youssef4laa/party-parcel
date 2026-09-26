import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';

/**
 * Room Editor Phase 4b through the real UI: packing a box with several separately wrapped gifts
 * (labels, own wrap designs, own goodies, "open in order", the 6-gift cap), and the recipient's
 * side — gifts floating out of the box, "N of M gifts opened", "Open everything", ordered opening,
 * and single-gift boxes skipping the inner step entirely.
 */

const ROOM_HEIGHT = 760;
const OUTER = {
  shape: 'cube', pattern: 'solid', baseColor: '#f4a6c1', accentColor: '#ff3d8b', ribbon: 'vertical',
  ribbonColor: '#fff6d5', bow: 'classic', tag: 'none', tagText: '', sticker: 'none', topper: 'none',
};
let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.44.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });
const note = (text: string) => ({ type: 'note', text, sizeBytes: text.length });

async function unlockedRoom(request: APIRequestContext, name: string) {
  const room = await seedRoom(request, { celebrantName: name });
  const admin = tokenFromLink(room.links.admin);
  await request.post(`/api/rooms/${admin}/unlock`);
  return { admin, contribute: tokenFromLink(room.links.contribute), celebrate: tokenFromLink(room.links.celebrate) };
}

async function sealBox(request: APIRequestContext, contribute: string, body: Record<string, unknown>) {
  const res = await request.post(`/api/rooms/${contribute}/boxes`, {
    data: { fromName: 'Gifty Gus', design: OUTER, x: 500, y: 650, ...body },
    headers: ip(),
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).id as string;
}

/** Click the (size M) present sealed at world (500, 650) as the celebrant and get to the unwrap step. */
async function openBoxAsCelebrant(page: Page, celebrate: string) {
  await page.goto(`/r/${celebrate}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  const box = (await page.getByRole('application', { name: 'Party room' }).boundingBox())!;
  const scale = box.height / ROOM_HEIGHT;
  await page.mouse.click(box.x + 500 * scale, box.y + (650 - 32) * scale);
  await page.getByRole('button', { name: 'Tap to unwrap!' }).click({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 10_000 });
}

const tiles = (page: Page) => page.getByTestId('gift-tile');

async function addNoteGoodie(page: Page, text: string) {
  await page.getByRole('button', { name: '📝 Note' }).first().click();
  await page.getByLabel(/^Text \(/).fill(text);
  await page.getByRole('button', { name: 'Add to box' }).click();
  await expect(page.getByRole('button', { name: 'Add to box' })).toHaveCount(0, { timeout: 10_000 });
}

test('pack: a box with several gifts — tabs, labels, per-gift wrap and goodies, open in order — seals with the right structure', async ({ page, request }) => {
  test.setTimeout(90_000);
  const { admin, contribute, celebrate } = await unlockedRoom(request, 'GiftUiPack');
  await page.goto(`/r/${contribute}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.getByRole('button', { name: 'Add a present' }).click();
  await page.getByPlaceholder('Your name').fill('Multi Mia');

  // a single-gift box shows no gift tabs and no per-gift settings — exactly the old Pack step
  await expect(page.getByRole('tab', { name: /Gift 1/ })).toHaveCount(0);
  await expect(page.getByTestId('gift-settings')).toHaveCount(0);
  await page.getByPlaceholder('Write a little something...').fill('the first gift letter');

  await page.getByRole('button', { name: 'Add another gift to this box' }).click();
  await expect(page.getByRole('tab', { name: /Gift 1/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Gift 2/ })).toHaveAttribute('aria-selected', 'true'); // the new one is selected
  await expect(page.getByTestId('gift-settings')).toBeVisible();
  // the letter/pictures belong to gift 1 only
  await expect(page.getByPlaceholder('Write a little something...')).toHaveCount(0);

  // an empty second gift can't be sealed: the flow stops you and jumps to it
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Gift 2 is empty — put something in it or remove it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wrap it up' })).toHaveCount(0); // still on step 1

  await page.getByLabel('Gift 2 label').fill('Open me second!');
  await expect(page.getByRole('tab', { name: /Gift 2: Open me second/ })).toBeVisible();
  await addNoteGoodie(page, 'inside the second gift');
  // give gift 2 its own wrap design (compact designer), distinct from the outer box's
  await page.getByRole('button', { name: 'Wrap this gift' }).click();
  await page.getByTestId('gift-settings').getByRole('button', { name: 'Tall', exact: true }).click();
  await page.getByTestId('gift-settings').getByRole('button', { name: 'Blue Polka' }).click();
  // ...and the compact designer has no "size in the room" row (that belongs to the outer box)
  await expect(page.getByTestId('gift-settings').getByText('Size in the room')).toHaveCount(0);
  await page.getByLabel('Open in order (they must unwrap the gifts one after another)').check();

  // gift 1: label + its letter is still there when you come back to it
  await page.getByRole('tab', { name: /Gift 1/ }).click();
  await expect(page.getByPlaceholder('Write a little something...')).toHaveValue('the first gift letter');
  await page.getByLabel('Gift 1 label').fill('Open me first!');

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // the outer box's designer DOES have the size row
  await page.getByRole('button', { name: 'Small', exact: true }).click();
  await page.getByRole('button', { name: 'Wrap it up' }).click();
  await page.getByRole('application', { name: 'Party room' }).click({ position: { x: 400, y: 480 } });
  await expect(page.getByText('Present placed from Multi Mia.')).toBeVisible({ timeout: 10_000 });

  // what got stored
  const boxes = (await (await request.get(`/api/rooms/${admin}/boxes`)).json()).boxes;
  expect(boxes).toHaveLength(1);
  expect(boxes[0].design.size).toBe('S');
  const contents = await (await request.get(`/api/boxes/${boxes[0].id}/contents?token=${celebrate}`)).json();
  expect(contents.openInOrder).toBe(true);
  expect(contents.gifts.map((g: { label: string }) => g.label)).toEqual(['Open me first!', 'Open me second!']);
  expect(contents.gifts[0].goodies.map((g: { text: string }) => g.text)).toEqual(['the first gift letter']);
  expect(contents.gifts[1].goodies.map((g: { text: string }) => g.text)).toEqual(['inside the second gift']);
  expect(contents.gifts[1].design).toMatchObject({ shape: 'tall', pattern: 'polka', baseColor: '#6ec6ff' }); // its own wrap
  expect(contents.gifts[0].design.shape).not.toBe('tall'); // each gift keeps its own design
});

test('pack: up to 6 gifts, then the button is disabled; a gift can be removed but gift 1 cannot', async ({ page, request }) => {
  const { contribute } = await unlockedRoom(request, 'GiftUiMax');
  await page.goto(`/r/${contribute}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  await page.getByRole('button', { name: 'Add a present' }).click();

  const add = page.getByRole('button', { name: 'Add another gift to this box' });
  for (let i = 0; i < 5; i++) await add.click();
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(page.getByText('6 of 6 gifts')).toBeVisible();
  await expect(add).toBeDisabled();

  await page.getByRole('button', { name: 'Remove this gift' }).click(); // removes gift 6 (the active one)
  await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(add).toBeEnabled();
  await page.getByRole('tab', { name: /Gift 1/ }).click();
  await expect(page.getByRole('button', { name: 'Remove this gift' })).toHaveCount(0); // gift 1 stays
  // dropping back to a single gift returns the plain Pack step
  for (let i = 0; i < 4; i++) {
    await page.getByRole('tab', { name: /Gift 2/ }).click();
    await page.getByRole('button', { name: 'Remove this gift' }).click();
  }
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByTestId('gift-settings')).toHaveCount(0);
});

test('recipient: gifts float out with their labels, open one at a time, progress counts, then Open everything', async ({ page, request }) => {
  test.setTimeout(90_000);
  const { contribute, celebrate } = await unlockedRoom(request, 'GiftUiOpen');
  await sealBox(request, contribute, {
    gifts: [
      { label: 'Open me first!', design: { ...OUTER, shape: 'tall', baseColor: '#6ec6ff' }, goodies: [note('alpha-note'), note('alpha-two')] },
      { label: 'Birthday coupon', design: { ...OUTER, shape: 'flat', baseColor: '#a679d6' }, goodies: [{ type: 'coupon', title: 'One free hug', sizeBytes: 5 }] },
      { label: '', design: {}, goodies: [note('gamma-note')] },
    ],
  });

  await openBoxAsCelebrant(page, celebrate);
  await expect(page.getByText('3 gifts inside!')).toBeVisible();
  await expect(page.getByTestId('gifts-progress')).toHaveText('0 of 3 gifts opened');
  await expect(tiles(page)).toHaveCount(3);
  await expect(tiles(page).nth(0)).toContainText('Open me first!');
  await expect(tiles(page).nth(1)).toContainText('Birthday coupon');
  await expect(tiles(page).nth(2)).toContainText('Gift 3'); // unlabeled gifts get a default name
  await expect(page.getByTestId('gifts-order-note')).toHaveCount(0); // not an ordered box
  // nothing is locked when order doesn't matter
  for (let i = 0; i < 3; i++) await expect(tiles(page).nth(i)).toBeEnabled();
  // goodie contents are NOT shown until a gift is opened
  await expect(page.getByText('alpha-note')).toHaveCount(0);

  // open the SECOND gift first (any order is fine here): it goes through the normal unwrap flow
  await tiles(page).nth(1).click();
  await expect(page.getByTestId('unwrap-subtitle')).toHaveText('Birthday coupon');
  await page.getByRole('button', { name: 'Open everything at once' }).click();
  await expect(page.getByText('One free hug')).toBeVisible();
  await expect(page.getByText('alpha-note')).toHaveCount(0); // other gifts stay sealed
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await expect(page.getByTestId('gifts-progress')).toHaveText('1 of 3 gifts opened');
  await expect(tiles(page).nth(1)).toHaveAttribute('data-opened', 'true');
  await expect(tiles(page).nth(1)).toContainText('✓ opened');
  await expect(tiles(page).nth(0)).toHaveAttribute('data-opened', 'false');

  // open the first one-by-one (two goodies -> Next -> Done)
  await tiles(page).nth(0).click();
  await expect(page.getByTestId('unwrap-subtitle')).toHaveText('Open me first!');
  await page.getByRole('button', { name: 'Unwrap one by one' }).click();
  await expect(page.getByText('alpha-note')).toBeVisible();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByText('alpha-two')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('gifts-progress')).toHaveText('2 of 3 gifts opened');

  // "Open everything" shows every gift's goodies and marks all opened
  await page.getByRole('button', { name: 'Open everything', exact: true }).click();
  for (const text of ['alpha-note', 'alpha-two', 'One free hug', 'gamma-note']) await expect(page.getByText(text)).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('gifts-progress')).toHaveText('3 of 3 gifts opened');

  // progress is remembered: reopening the same box later still says 3 of 3
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('gifts-progress')).toHaveCount(0);
  await page.reload();
  await openBoxAsCelebrant(page, celebrate);
  await expect(page.getByTestId('gifts-progress')).toHaveText('3 of 3 gifts opened');
});

test('recipient: "Open everything" works straight away, from a fresh box', async ({ page, request }) => {
  const { contribute, celebrate } = await unlockedRoom(request, 'GiftUiEverything');
  await sealBox(request, contribute, {
    gifts: [
      { label: 'One', design: {}, goodies: [note('first-gift-text')] },
      { label: 'Two', design: {}, goodies: [note('second-gift-text')] },
    ],
  });
  await openBoxAsCelebrant(page, celebrate);
  await page.getByRole('button', { name: 'Open everything', exact: true }).click();
  await expect(page.getByText('first-gift-text')).toBeVisible();
  await expect(page.getByText('second-gift-text')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('gifts-progress')).toHaveText('2 of 2 gifts opened');
});

test('recipient: with "open in order", only the next gift can be opened until the one before it is', async ({ page, request }) => {
  test.setTimeout(60_000);
  const { contribute, celebrate } = await unlockedRoom(request, 'GiftUiOrder');
  await sealBox(request, contribute, {
    openInOrder: true,
    gifts: [
      { label: 'First', design: {}, goodies: [note('order-1')] },
      { label: 'Second', design: {}, goodies: [note('order-2')] },
      { label: 'Third', design: {}, goodies: [note('order-3')] },
    ],
  });
  await openBoxAsCelebrant(page, celebrate);
  await expect(page.getByTestId('gifts-order-note')).toBeVisible();
  await expect(tiles(page).nth(0)).toBeEnabled();
  await expect(tiles(page).nth(1)).toBeDisabled();
  await expect(tiles(page).nth(2)).toBeDisabled();
  await expect(tiles(page).nth(1)).toHaveAttribute('data-locked', 'true');
  await expect(tiles(page).nth(1)).toContainText('open the one before first');

  await tiles(page).nth(0).click();
  await page.getByRole('button', { name: 'Open everything at once' }).click();
  await expect(page.getByText('order-1')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await expect(page.getByTestId('gifts-progress')).toHaveText('1 of 3 gifts opened');
  await expect(tiles(page).nth(1)).toBeEnabled(); // unlocked by opening the first
  await expect(tiles(page).nth(2)).toBeDisabled(); // still waiting on the second
  await tiles(page).nth(1).click();
  await page.getByRole('button', { name: 'Open everything at once' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(tiles(page).nth(2)).toBeEnabled();
  await expect(page.getByTestId('gifts-progress')).toHaveText('2 of 3 gifts opened');
});

test('recipient: a single-gift box skips the inner step and behaves exactly as before', async ({ page, request }) => {
  const { contribute, celebrate } = await unlockedRoom(request, 'GiftUiSingle');
  await sealBox(request, contribute, { goodies: [note('plain-note-1'), note('plain-note-2')] });
  await openBoxAsCelebrant(page, celebrate);
  // straight to the original chooser: no gift tiles, no progress line
  await expect(page.getByText('2 goodies inside!')).toBeVisible();
  await expect(page.getByTestId('gifts-progress')).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Open everything at once' }).click();
  await expect(page.getByText('plain-note-1')).toBeVisible();
  await expect(page.getByText('plain-note-2')).toBeVisible();
});

test('recipient: before the birthday, clicking a multi-gift box shows the locked message and reveals nothing', async ({ page, request }) => {
  const room = await seedRoom(request, { celebrantName: 'GiftUiLocked', eventAt: new Date(Date.now() + 60 * 60_000).toISOString() });
  const contribute = tokenFromLink(room.links.contribute);
  const celebrate = tokenFromLink(room.links.celebrate);
  await sealBox(request, contribute, {
    gifts: [
      { label: 'STILL-A-SECRET', design: {}, goodies: [note('secret-goodie-text')] },
      { label: 'ALSO-SECRET', design: {}, goodies: [note('another-secret')] },
    ],
  });
  await page.goto(`/r/${celebrate}`);
  await expect(page.getByText(/Drag, scroll, or use/)).toBeVisible();
  const box = (await page.getByRole('application', { name: 'Party room' }).boundingBox())!;
  const scale = box.height / ROOM_HEIGHT;
  await page.mouse.click(box.x + 500 * scale, box.y + (650 - 32) * scale);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('gifts-progress')).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(0);
  for (const secret of ['STILL-A-SECRET', 'ALSO-SECRET', 'secret-goodie-text', 'another-secret']) {
    await expect(page.getByText(secret)).toHaveCount(0);
  }
  // and the page's own data never carried them either: nothing the browser fetched contained them
  const html = await page.content();
  for (const secret of ['STILL-A-SECRET', 'ALSO-SECRET', 'secret-goodie-text', 'another-secret']) expect(html).not.toContain(secret);
});
