import { execFileSync } from 'child_process';
import path from 'path';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { seedRoom, tokenFromLink, uploadPhoto, parseAssetUrl } from './helpers';
import { LIMITS } from '../src/config/limits';

/**
 * Room Editor Phase 4b: a box can hold several separately wrapped gifts.
 * Covers the wire shape, backward compatibility (a flat `goodies` box is one default gift), the
 * limits (MAX_GIFTS_PER_BOX, per-box goodie and byte totals across gifts), and — the important one —
 * that inner-gift data (labels, wrap designs, goodies, media) is gated by the birthday lock exactly
 * like goodies always were: requested before unlock, with and without a valid celebrate token,
 * and refused.
 */

const DB_PATH = path.join(__dirname, '..', 'prisma', 'dev.db');
const sqlite = (sql: string) => execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf-8' }).trim();

const OUTER = {
  shape: 'cube', pattern: 'solid', baseColor: '#f4a6c1', accentColor: '#ff3d8b', ribbon: 'vertical',
  ribbonColor: '#fff6d5', bow: 'classic', tag: 'none', tagText: '', sticker: 'none', topper: 'none',
};
const WRAP_A = { ...OUTER, shape: 'tall', baseColor: '#6ec6ff', pattern: 'polka' };
const WRAP_B = { ...OUTER, shape: 'flat', baseColor: '#a679d6', pattern: 'stars' };
const note = (text: string) => ({ type: 'note', text, sizeBytes: text.length });

let ipCounter = 0;
const ip = () => ({ 'X-Forwarded-For': `10.99.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

async function seal(request: APIRequestContext, contribute: string, body: Record<string, unknown>) {
  return request.post(`/api/rooms/${contribute}/boxes`, {
    data: { fromName: 'Gifty', design: OUTER, x: 500, y: 600, ...body },
    headers: ip(),
  });
}
const contentsOf = async (request: APIRequestContext, boxId: string, token: string) =>
  (await request.get(`/api/boxes/${boxId}/contents?token=${token}`));

async function newRoom(request: APIRequestContext, name: string, locked = true) {
  const room = await seedRoom(request, {
    celebrantName: name,
    eventAt: locked ? new Date(Date.now() + 60 * 60_000).toISOString() : undefined,
  });
  return {
    admin: tokenFromLink(room.links.admin),
    contribute: tokenFromLink(room.links.contribute),
    celebrate: tokenFromLink(room.links.celebrate),
  };
}

test('a plain single-gift box (the original wire shape) is stored as one default gift holding all its goodies', async ({ request }) => {
  const { admin, contribute, celebrate } = await newRoom(request, 'GiftLegacyShape');
  const res = await seal(request, contribute, { goodies: [note('one'), note('two'), note('three')] });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { id } = await res.json();
  await request.post(`/api/rooms/${admin}/unlock`);

  const contents = await (await contentsOf(request, id, celebrate)).json();
  expect(contents.gifts).toHaveLength(1);
  expect(contents.gifts[0]).toMatchObject({ label: '', design: {}, sortOrder: 0 });
  expect(contents.gifts[0].goodies.map((g: { text: string }) => g.text)).toEqual(['one', 'two', 'three']);
  // the flat list every existing reader uses is unchanged
  expect(contents.goodies.map((g: { text: string }) => g.text)).toEqual(['one', 'two', 'three']);
  expect(contents.openInOrder).toBe(false);
});

test('a box with no goodies at all still opens (one empty default gift), as before', async ({ request }) => {
  const { admin, contribute, celebrate } = await newRoom(request, 'GiftEmptyBox');
  const { id } = await (await seal(request, contribute, { goodies: [] })).json();
  await request.post(`/api/rooms/${admin}/unlock`);
  const contents = await (await contentsOf(request, id, celebrate)).json();
  expect(contents.goodies).toEqual([]);
  expect(contents.gifts).toHaveLength(1);
  expect(contents.gifts[0].goodies).toEqual([]);
});

test('a multi-gift box round-trips: order, labels, wrap designs, and each gift\'s own goodies', async ({ request }) => {
  const { admin, contribute, celebrate } = await newRoom(request, 'GiftMulti');
  const res = await seal(request, contribute, {
    openInOrder: true,
    gifts: [
      { label: 'Open me first!', design: WRAP_A, goodies: [note('a1'), note('a2')] },
      { label: 'Then me', design: WRAP_B, goodies: [{ type: 'coupon', title: 'One free hug', sizeBytes: 10 }] },
      { label: '', design: {}, goodies: [{ type: 'location', placeName: 'The tree', lat: 40.7, lng: -74, sizeBytes: 5 }, note('c2')] },
    ],
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { id } = await res.json();
  await request.post(`/api/rooms/${admin}/unlock`);

  const contents = await (await contentsOf(request, id, celebrate)).json();
  expect(contents.openInOrder).toBe(true);
  expect(contents.gifts.map((g: { label: string }) => g.label)).toEqual(['Open me first!', 'Then me', '']);
  expect(contents.gifts[0].design).toMatchObject({ shape: 'tall', baseColor: '#6ec6ff', pattern: 'polka' });
  expect(contents.gifts[1].design).toMatchObject({ shape: 'flat', baseColor: '#a679d6' });
  expect(contents.gifts.map((g: { goodies: unknown[] }) => g.goodies.length)).toEqual([2, 1, 2]);
  expect(contents.gifts[0].goodies.map((g: { text: string }) => g.text)).toEqual(['a1', 'a2']);
  expect(contents.gifts[1].goodies[0]).toMatchObject({ type: 'coupon', title: 'One free hug' });
  expect(contents.gifts[2].goodies.map((g: { type: string }) => g.type)).toEqual(['location', 'note']);
  // flat list = every goodie in box order, with one box-wide sortOrder
  expect(contents.goodies.map((g: { sortOrder: number }) => g.sortOrder)).toEqual([0, 1, 2, 3, 4]);
  expect(contents.goodies).toHaveLength(5);
  // and gift ids are distinct real ids
  expect(new Set(contents.gifts.map((g: { id: string }) => g.id)).size).toBe(3);
});

test('limits: max gifts per box, no empty gift in a multi-gift box, and goodie/byte totals count ALL gifts', async ({ request }) => {
  const { contribute } = await newRoom(request, 'GiftLimits');
  expect(LIMITS.maxGiftsPerBox).toBe(6);
  const gift = (n: number) => ({ label: `g${n}`, design: WRAP_A, goodies: [note(`n${n}`)] });

  const six = await seal(request, contribute, { gifts: Array.from({ length: 6 }, (_, i) => gift(i)) });
  expect(six.status(), await six.text()).toBe(200);
  const seven = await seal(request, contribute, { gifts: Array.from({ length: 7 }, (_, i) => gift(i)) });
  expect(seven.status()).toBe(400);
  expect((await seven.json()).error).toMatch(/at most 6 gifts/);

  // an empty gift among several is refused (it would open to a blank)
  const empty = await seal(request, contribute, { gifts: [gift(0), { label: 'empty', design: {}, goodies: [] }] });
  expect(empty.status()).toBe(400);
  expect((await empty.json()).error).toMatch(/Gift 2 is empty/);
  expect((await seal(request, contribute, { gifts: [] })).status()).toBe(400);
  expect((await seal(request, contribute, { gifts: 'nope' })).status()).toBe(400);
  expect((await seal(request, contribute, { gifts: [null] })).status()).toBe(400);

  // 25-goodie cap is per BOX: 3 gifts x 9 = 27 is over even though no single gift is
  const many = (n: number) => Array.from({ length: n }, (_, i) => note(`m${i}`));
  const overGoodies = await seal(request, contribute, {
    gifts: [0, 1, 2].map((i) => ({ label: `g${i}`, design: {}, goodies: many(9) })),
  });
  expect(overGoodies.status()).toBe(400);
  expect((await overGoodies.json()).error).toContain(`${LIMITS.maxGoodiesPerBox} goodies`);
  const exactly = await seal(request, contribute, {
    gifts: [{ label: 'a', design: {}, goodies: many(13) }, { label: 'b', design: {}, goodies: many(12) }],
  });
  expect(exactly.status(), await exactly.text()).toBe(200); // 25 total is allowed

  // byte cap is per box too: two gifts each under the cap, together over it
  const half = Math.floor(LIMITS.maxBytesPerBox * 0.6);
  const overBytes = await seal(request, contribute, {
    gifts: [
      { label: 'a', design: {}, goodies: [{ type: 'note', text: 'x', sizeBytes: half }] },
      { label: 'b', design: {}, goodies: [{ type: 'note', text: 'y', sizeBytes: half }] },
    ],
  });
  expect(overBytes.status()).toBe(400);
  expect((await overBytes.json()).error).toMatch(/under \d+ MB/);
  const oneHalf = await seal(request, contribute, { gifts: [{ label: 'a', design: {}, goodies: [{ type: 'note', text: 'x', sizeBytes: half }] }] });
  expect(oneHalf.status(), await oneHalf.text()).toBe(200);
});

test('open-in-order is only stored for a box that actually has several gifts; labels are trimmed and capped', async ({ request }) => {
  const { admin, contribute, celebrate } = await newRoom(request, 'GiftOrderFlag');
  const single = await (await seal(request, contribute, { openInOrder: true, goodies: [note('solo')] })).json();
  const single2 = await (await seal(request, contribute, { openInOrder: true, gifts: [{ label: 'only', design: {}, goodies: [note('solo')] }] })).json();
  const long = 'L'.repeat(200);
  const multi = await (
    await seal(request, contribute, {
      openInOrder: 'yes-please', // not a real boolean -> not honored
      gifts: [{ label: `   ${long}   `, design: {}, goodies: [note('a')] }, { label: 'b', design: {}, goodies: [note('b')] }],
    })
  ).json();
  await request.post(`/api/rooms/${admin}/unlock`);
  expect((await (await contentsOf(request, single.id, celebrate)).json()).openInOrder).toBe(false);
  expect((await (await contentsOf(request, single2.id, celebrate)).json()).openInOrder).toBe(false);
  const m = await (await contentsOf(request, multi.id, celebrate)).json();
  expect(m.openInOrder).toBe(false);
  expect(m.gifts[0].label).toBe('L'.repeat(40)); // trimmed of the padding, then capped at 40 chars
});

test('every goodie in every gift is validated like any other; one bad goodie rejects the whole box', async ({ request }) => {
  const { contribute } = await newRoom(request, 'GiftValidation');
  const res = await seal(request, contribute, {
    gifts: [
      { label: 'ok', design: {}, goodies: [note('fine')] },
      { label: 'bad', design: {}, goodies: [{ type: 'location', placeName: 'x', lat: 999, lng: 0, sizeBytes: 1 }] },
    ],
  });
  expect(res.status()).toBe(400);
  const err = (await res.json()).error as string;
  expect(err).toMatch(/Invalid location/);
  expect(err).not.toMatch(/received undefined/); // it failed on the bad latitude, not on a malformed test payload
  // a design that is absurdly large is refused too
  const huge = await seal(request, contribute, { gifts: [{ label: 'a', design: { junk: 'x'.repeat(5000) }, goodies: [note('a')] }, { label: 'b', design: {}, goodies: [note('b')] }] });
  expect(huge.status()).toBe(400);
});

test('LOCK: inner-gift data is refused before unlock — celebrate token, other tokens, no token, and a token from another room', async ({ request }) => {
  const room = await newRoom(request, 'GiftLockA');
  const other = await newRoom(request, 'GiftLockB');
  const { id } = await (
    await seal(request, room.contribute, {
      gifts: [
        { label: 'SECRET-GIFT-LABEL-ONE', design: WRAP_A, goodies: [note('SECRET-GOODIE-ONE')] },
        { label: 'SECRET-GIFT-LABEL-TWO', design: WRAP_B, goodies: [note('SECRET-GOODIE-TWO')] },
      ],
    })
  ).json();

  const attempts: Array<[string, string]> = [
    ['valid celebrate token', `?token=${room.celebrate}`],
    ['admin token', `?token=${room.admin}`],
    ['contribute token', `?token=${room.contribute}`],
    ['no token', ''],
    ['empty token', '?token='],
    ['garbage token', '?token=not-a-real-token'],
    ["another room's celebrate token", `?token=${other.celebrate}`],
  ];
  for (const [what, qs] of attempts) {
    const res = await request.get(`/api/boxes/${id}/contents${qs}`);
    expect(res.status(), `${what} must be refused before unlock`).toBe(403);
    const body = await res.text();
    for (const secret of ['SECRET-GIFT-LABEL', 'SECRET-GOODIE', 'gifts', 'goodies', 'assetUrls', 'openInOrder']) {
      expect(body, `${what}: response must not mention ${secret}`).not.toContain(secret);
    }
  }
});

test('LOCK: even after unlock, only the box\'s own room\'s celebrate token reads the gifts', async ({ request }) => {
  const room = await newRoom(request, 'GiftLockC');
  const other = await newRoom(request, 'GiftLockD');
  const { id } = await (
    await seal(request, room.contribute, {
      gifts: [{ label: 'L1', design: {}, goodies: [note('g1')] }, { label: 'L2', design: {}, goodies: [note('g2')] }],
    })
  ).json();
  await request.post(`/api/rooms/${room.admin}/unlock`);

  expect((await contentsOf(request, id, room.celebrate)).status()).toBe(200);
  expect((await contentsOf(request, id, room.admin)).status()).toBe(403);
  expect((await contentsOf(request, id, room.contribute)).status()).toBe(403);
  expect((await request.get(`/api/boxes/${id}/contents`)).status()).toBe(403);
  await request.post(`/api/rooms/${other.admin}/unlock`);
  expect((await contentsOf(request, id, other.celebrate)).status()).toBe(403); // unlocked room, wrong room
});

test('LOCK: the public boxes list reveals nothing about gifts — no count, label, wrap design, or goodie text', async ({ request }) => {
  const room = await newRoom(request, 'GiftLockE');
  await seal(request, room.contribute, {
    openInOrder: true,
    gifts: [
      { label: 'LEAKY-LABEL-1', design: { ...WRAP_A, tagText: 'LEAKY-TAG' }, goodies: [note('LEAKY-GOODIE-1')] },
      { label: 'LEAKY-LABEL-2', design: WRAP_B, goodies: [note('LEAKY-GOODIE-2')] },
    ],
  });
  for (const token of [room.celebrate, room.admin, room.contribute]) {
    const res = await request.get(`/api/rooms/${token}/boxes`);
    const raw = await res.text();
    for (const leak of ['LEAKY-', 'gifts', 'openInOrder', 'goodies', '#a679d6' /* WRAP_B's base color: only in a gift design */]) {
      expect(raw, `boxes list (${token === room.admin ? 'admin' : 'other'}) must not contain ${leak}`).not.toContain(leak);
    }
  }
});

test('LOCK: a gift\'s media is unreachable before unlock, and only exposed as signed URLs after', async ({ request }) => {
  const room = await newRoom(request, 'GiftLockMedia');
  const asset = await uploadPhoto(request, room.contribute);
  const { id } = await (
    await seal(request, room.contribute, {
      gifts: [
        { label: 'words', design: {}, goodies: [note('hello')] },
        { label: 'pics', design: {}, goodies: [{ type: 'photo', assetKeys: [asset.assetKey], sizeBytes: 500 }] },
      ],
    })
  ).json();

  // before unlock: no token yields contents; and the raw asset key alone is not fetchable
  expect((await contentsOf(request, id, room.celebrate)).status()).toBe(403);
  const unsigned = await request.get(`/api/assets/${asset.assetKey}`);
  expect(unsigned.status()).toBe(403);
  const forged = await request.get(`/api/assets/${asset.assetKey}?exp=${Date.now() + 60_000}&sig=forged`);
  expect(forged.status()).toBe(403);

  await request.post(`/api/rooms/${room.admin}/unlock`);
  const contents = await (await contentsOf(request, id, room.celebrate)).json();
  const photo = contents.gifts[1].goodies[0];
  expect(photo.assetUrls).toHaveLength(1);
  expect(contents.gifts[0].goodies[0].assetUrls).toEqual([]);
  expect(parseAssetUrl(photo.assetUrls[0]).key).toBe(asset.assetKey);
  const media = await request.get(photo.assetUrls[0]);
  expect(media.status()).toBe(200);
});

test('deleting a multi-gift box removes its gifts and goodies (no orphans)', async ({ request }) => {
  const room = await newRoom(request, 'GiftCascade');
  const { id } = await (
    await seal(request, room.contribute, {
      gifts: [{ label: 'a', design: {}, goodies: [note('a')] }, { label: 'b', design: {}, goodies: [note('b'), note('c')] }],
    })
  ).json();
  const count = (table: string) => JSON.parse(sqlite(`SELECT COUNT(*) AS n FROM "${table}" WHERE boxId = '${id}';`))[0].n;
  expect(count('Gift')).toBe(2);
  expect(count('Goodie')).toBe(3);
  const del = await request.delete(`/api/rooms/${room.admin}/boxes/${id}`, { data: {}, headers: ip() });
  expect(del.ok()).toBeTruthy();
  expect(count('Gift')).toBe(0);
  expect(count('Goodie')).toBe(0);
  expect(JSON.parse(sqlite(`SELECT COUNT(*) AS n FROM "Goodie" WHERE giftId IS NOT NULL AND giftId NOT IN (SELECT id FROM "Gift");`))[0].n).toBe(0);
});
