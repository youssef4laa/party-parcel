import { randomBytes } from 'crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { seedRoom, tokenFromLink } from './helpers';
import { LIMITS } from '../src/config/limits';
import { validateCustomItemImage } from '../src/server/customItemImage';
import { decodePng, makeJpeg, makePng, makeWebp, makeWebpWithExif, marginedSquare, withTextChunk } from './customItemFixtures';

/**
 * Room Editor Phase 3: the server is the real boundary for custom items —
 * magic-byte sniffing, size and dimension limits, the 40-item library cap, canImport/canDraw, and
 * owner-or-host deletion that takes placed copies with it. Every denial below is a real request
 * that the server refuses, not a UI check.
 */

const PNG = { 'Content-Type': 'image/png' };
let ipCounter = 0;
// Each call gets its own X-Forwarded-For so unrelated tests never share a rate-limit bucket.
const ip = () => ({ 'X-Forwarded-For': `10.77.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

async function upload(
  request: APIRequestContext,
  token: string,
  body: Buffer,
  opts: { source?: 'import' | 'drawing'; name?: string; session?: string; contentType?: string; ip?: Record<string, string> } = {},
) {
  const q = new URLSearchParams({ source: opts.source ?? 'import', name: opts.name ?? 'test' });
  return request.post(`/api/rooms/${token}/custom-items?${q}`, {
    data: body,
    headers: {
      'Content-Type': opts.contentType ?? 'image/png',
      ...(opts.session ? { 'X-Contributor-Session': opts.session } : {}),
      ...(opts.ip ?? ip()),
    },
  });
}

async function setPermissions(request: APIRequestContext, admin: string, contributors: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const res = await request.put(`/api/rooms/${admin}/permissions`, {
    data: {
      contributors: { canDecorate: 'own', canImport: false, canDraw: false, canMoveOwnPresents: false, maxItemsPerContributor: 10, ...contributors },
      celebrant: { canRearrange: false },
      freezeLayout: false,
      ...extra,
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test('the host can import a PNG; it is stored with real dimensions and served back byte-for-byte as a PNG', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomHostImport' });
  const admin = tokenFromLink(room.links.admin);
  const png = await makePng(24, 40);

  const res = await upload(request, admin, png, { name: 'pink block' });
  expect(res.status(), await res.text()).toBe(200);
  const { item } = await res.json();
  expect(item).toMatchObject({ width: 24, height: 40, name: 'pink block', source: 'import', createdByRole: 'admin', mine: true });

  const list = await (await request.get(`/api/rooms/${admin}/custom-items`)).json();
  expect(list.items).toHaveLength(1);

  const img = await request.get(item.url);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toBe('image/png');
  expect(img.headers()['x-content-type-options']).toBe('nosniff');
  const stored = await decodePng(Buffer.from(await img.body()));
  expect([stored.width, stored.height]).toEqual([24, 40]);
  expect([...stored.data.subarray(0, 4)]).toEqual([255, 0, 128, 255]);
});

test('a WebP is accepted and its dimensions come from its own header', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomWebp' });
  const admin = tokenFromLink(room.links.admin);
  const res = await upload(request, admin, await makeWebp(33, 17), { contentType: 'image/webp' });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).item).toMatchObject({ width: 33, height: 17 });
  const img = await request.get((await res.json()).item.url);
  expect(img.headers()['content-type']).toBe('image/webp');
});

test('a WebP\'s EXIF metadata is stripped and the image still decodes', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomWebpExif' });
  const admin = tokenFromLink(room.links.admin);
  const dirty = await makeWebpWithExif(20, 12, 'SECRET-COPYRIGHT-HOLDER');
  expect(dirty.toString('latin1')).toContain('SECRET-COPYRIGHT-HOLDER'); // the fixture really carries it
  const res = await upload(request, admin, dirty, { contentType: 'image/webp' });
  expect(res.status(), await res.text()).toBe(200);
  const { item } = await res.json();
  expect([item.width, item.height]).toEqual([20, 12]);
  const stored = Buffer.from(await (await request.get(item.url)).body());
  expect(stored.toString('latin1')).not.toContain('SECRET-COPYRIGHT-HOLDER');
  expect(stored.toString('latin1', 0, 4)).toBe('RIFF');
  expect(stored.readUInt32LE(4) + 8).toBe(stored.length); // RIFF size was fixed up to match
  const decoded = await decodePng(stored); // sharp reads any format: proves the rewritten WebP is still valid
  expect([decoded.width, decoded.height]).toEqual([20, 12]);
  expect([...decoded.data.subarray(0, 4)]).toEqual([30, 200, 90, 255]);
});

test('wrong types are refused by content, not by name or the claimed Content-Type', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomWrongType' });
  const admin = tokenFromLink(room.links.admin);

  // a real JPEG claiming to be a PNG
  const jpegAsPng = await upload(request, admin, await makeJpeg(20, 20), { contentType: 'image/png', name: 'photo.png' });
  expect(jpegAsPng.status()).toBe(415);
  // plain text with an image extension/type
  const text = await upload(request, admin, Buffer.from('not an image at all, just text padded out to be long enough'), { contentType: 'image/png', name: 'x.png' });
  expect(text.status()).toBe(415);
  // an SVG (script vector) must never be accepted
  const svg = await upload(request, admin, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { contentType: 'image/svg+xml' });
  expect(svg.status()).toBe(415);
  // empty body
  const empty = await upload(request, admin, Buffer.alloc(0));
  expect(empty.status()).toBe(400);
  // a PNG signature with nothing valid behind it
  const truncated = await upload(request, admin, (await makePng(8, 8)).subarray(0, 40));
  expect(truncated.status()).toBe(415);
  const sigOnly = await upload(request, admin, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]));
  expect(sigOnly.status()).toBe(415);

  expect((await (await request.get(`/api/rooms/${admin}/custom-items`)).json()).items).toHaveLength(0);
});

test('oversize files and oversize dimensions are refused', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomOversize' });
  const admin = tokenFromLink(room.links.admin);

  // > 512 KB of bytes: noisy pixels don't compress, so a 512x512 noise PNG is well over the cap
  const random = randomBytes(512 * 512 * 3);
  const noise = await makePng(512, 512, (x, y) => {
    const i = (y * 512 + x) * 3;
    return [random[i], random[i + 1], random[i + 2], 255];
  });
  expect(noise.length).toBeGreaterThan(LIMITS.maxCustomItemBytes);
  const big = await upload(request, admin, noise);
  expect(big.status()).toBe(413);
  expect((await big.json()).error).toMatch(/KB/);

  // small in bytes but too many pixels: 513 wide is one over
  const wide = await upload(request, admin, await makePng(LIMITS.maxCustomItemPx + 1, 8));
  expect(wide.status()).toBe(413);
  expect((await wide.json()).error).toMatch(/512×512/);
  const tall = await upload(request, admin, await makePng(8, LIMITS.maxCustomItemPx + 1));
  expect(tall.status()).toBe(413);

  // exactly the max is fine
  const exact = await upload(request, admin, await makePng(LIMITS.maxCustomItemPx, LIMITS.maxCustomItemPx));
  expect(exact.status(), await exact.text()).toBe(200);
});

test('validateCustomItemImage strips metadata chunks and trailing junk from a PNG, and keeps the pixels', async () => {
  const clean = await makePng(10, 10);
  const dirty = Buffer.concat([withTextChunk(clean, 'Author', 'secret-location-42.0,-71.0'), Buffer.from('TRAILING-JUNK-PAYLOAD')]);
  expect(dirty.toString('latin1')).toContain('secret-location');
  const verdict = validateCustomItemImage(dirty);
  if (!verdict.ok) throw new Error(verdict.error);
  expect(verdict.bytes.toString('latin1')).not.toContain('secret-location');
  expect(verdict.bytes.toString('latin1')).not.toContain('TRAILING-JUNK');
  const before = await decodePng(clean);
  const after = await decodePng(verdict.bytes);
  expect(after.data.equals(before.data)).toBe(true);
});

test('metadata is stripped end-to-end through the upload route', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomStrip' });
  const admin = tokenFromLink(room.links.admin);
  const dirty = withTextChunk(await makePng(12, 12), 'Comment', 'gps=12.3,45.6');
  const res = await upload(request, admin, dirty);
  expect(res.status(), await res.text()).toBe(200);
  const stored = Buffer.from(await (await request.get((await res.json()).item.url)).body());
  expect(stored.toString('latin1')).not.toContain('gps=12.3');
  expect((await decodePng(stored)).width).toBe(12);
});

test('the library is capped at MAX_CUSTOM_ITEMS_PER_ROOM; deleting one frees a slot', async ({ request }) => {
  test.setTimeout(90_000);
  const room = await seedRoom(request, { celebrantName: 'CustomCap' });
  const admin = tokenFromLink(room.links.admin);
  const png = await makePng(4, 4);
  let lastId = '';
  for (let i = 0; i < LIMITS.maxCustomItemsPerRoom; i++) {
    const res = await upload(request, admin, png, { name: `item ${i}` });
    expect(res.ok(), `upload #${i}: ${await res.text()}`).toBeTruthy();
    lastId = (await res.json()).item.id;
  }
  const over = await upload(request, admin, png);
  expect(over.status()).toBe(400);
  expect((await over.json()).error).toMatch(/library is full/);

  const del = await request.delete(`/api/rooms/${admin}/custom-items/${lastId}`, { headers: ip() });
  expect(del.ok()).toBeTruthy();
  expect((await upload(request, admin, png)).ok()).toBeTruthy();
});

test('importing obeys canImport and drawing obeys canDraw; celebrant and frozen rooms are refused', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomPerms' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  const celebrate = tokenFromLink(room.links.celebrate);
  const png = await makePng(6, 6);

  // default: contributors can neither import nor draw
  expect((await upload(request, contribute, png, { session: 'sess-a' })).status()).toBe(403);
  expect((await upload(request, contribute, png, { session: 'sess-a', source: 'drawing' })).status()).toBe(403);

  // canImport on, canDraw off: import passes, drawing still refused
  await setPermissions(request, admin, { canImport: true });
  expect((await upload(request, contribute, png, { session: 'sess-a' })).status()).toBe(200);
  expect((await upload(request, contribute, png, { session: 'sess-a', source: 'drawing' })).status()).toBe(403);

  // and the other way round
  await setPermissions(request, admin, { canDraw: true });
  expect((await upload(request, contribute, png, { session: 'sess-a' })).status()).toBe(403);
  expect((await upload(request, contribute, png, { session: 'sess-a', source: 'drawing' })).status()).toBe(200);

  // the celebrant can never add art — not before unlock, and not with canRearrange either
  await setPermissions(request, admin, { canImport: true, canDraw: true }, { celebrant: { canRearrange: true } });
  expect((await upload(request, celebrate, png)).status()).toBe(403);

  // freeze blocks a contributor who otherwise has both flags; the host is unaffected
  await setPermissions(request, admin, { canImport: true, canDraw: true }, { freezeLayout: true });
  expect((await upload(request, contribute, png, { session: 'sess-a' })).status()).toBe(403);
  expect((await upload(request, admin, png)).status()).toBe(200);
});

test('only the owner or the host can replace or delete an item; others get 403', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomOwnership' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  const celebrate = tokenFromLink(room.links.celebrate);
  await setPermissions(request, admin, { canImport: true, canDraw: true });

  const created = await upload(request, contribute, await makePng(5, 5), { session: 'owner-session', name: 'mine' });
  const { item } = await created.json();
  expect(item.mine).toBe(true);

  // a different contributor browser sees it (library is readable) but does not own it
  const otherView = await (await request.get(`/api/rooms/${contribute}/custom-items`, { headers: { 'X-Contributor-Session': 'other-session' } })).json();
  expect(otherView.items[0].mine).toBe(false);

  const put = (session: string | undefined, token = contribute) =>
    request.put(`/api/rooms/${token}/custom-items/${item.id}?source=drawing`, {
      data: Buffer.from(String.fromCharCode(0)), // body never gets read before the permission check fails
      headers: { ...PNG, ...(session ? { 'X-Contributor-Session': session } : {}), ...ip() },
    });
  expect((await put('other-session')).status()).toBe(403);
  expect((await put(undefined)).status()).toBe(403);
  expect((await put('other-session', celebrate)).status()).toBe(403);

  const del = (session: string | undefined, token = contribute) =>
    request.delete(`/api/rooms/${token}/custom-items/${item.id}`, { headers: { ...(session ? { 'X-Contributor-Session': session } : {}), ...ip() } });
  expect((await del('other-session')).status()).toBe(403);
  expect((await del(undefined)).status()).toBe(403);
  expect((await del('owner-session', celebrate)).status()).toBe(403);
  expect((await (await request.get(`/api/rooms/${admin}/custom-items`)).json()).items).toHaveLength(1);

  // the owner may replace their own item with new pixels...
  const replaced = await request.put(`/api/rooms/${contribute}/custom-items/${item.id}?source=drawing&name=renamed`, {
    data: await makePng(9, 3),
    headers: { ...PNG, 'X-Contributor-Session': 'owner-session', ...ip() },
  });
  expect(replaced.status(), await replaced.text()).toBe(200);
  const after = (await replaced.json()).item;
  expect(after).toMatchObject({ width: 9, height: 3, name: 'renamed', source: 'drawing' });
  expect(after.url).not.toBe(item.url); // version param changed, so caches can't serve stale pixels

  // ...and the owner can delete it; the host can delete anyone's
  expect((await del('owner-session')).status()).toBe(200);
  const second = await (await upload(request, contribute, await makePng(5, 5), { session: 'owner-session' })).json();
  const hostDel = await request.delete(`/api/rooms/${admin}/custom-items/${second.item.id}`, { headers: ip() });
  expect(hostDel.status()).toBe(200);
});

test('an owner can still delete their own item after the host turns importing off, but cannot edit it', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomRevoked' });
  const admin = tokenFromLink(room.links.admin);
  const contribute = tokenFromLink(room.links.contribute);
  await setPermissions(request, admin, { canImport: true });
  const { item } = await (await upload(request, contribute, await makePng(5, 5), { session: 'rev-session' })).json();
  await setPermissions(request, admin, { canImport: false });

  const put = await request.put(`/api/rooms/${contribute}/custom-items/${item.id}`, {
    data: await makePng(6, 6),
    headers: { ...PNG, 'X-Contributor-Session': 'rev-session', ...ip() },
  });
  expect(put.status()).toBe(403);
  const del = await request.delete(`/api/rooms/${contribute}/custom-items/${item.id}`, { headers: { 'X-Contributor-Session': 'rev-session', ...ip() } });
  expect(del.status()).toBe(200);
});

test('placing a custom item needs a real library item from THIS room; deleting the item removes every placed copy', async ({ request }) => {
  const room = await seedRoom(request, { celebrantName: 'CustomPlace' });
  const other = await seedRoom(request, { celebrantName: 'CustomPlaceOther' });
  const admin = tokenFromLink(room.links.admin);
  const otherAdmin = tokenFromLink(other.links.admin);

  // Load the room first, as the UI always does — that's what lazily seeds the default layout. (A
  // create on a never-loaded room would make the count non-zero and skip seeding entirely.)
  await request.get(`/api/rooms/${admin}/objects`);
  const { item } = await (await upload(request, admin, await marginedSquare(8, 2))).json();
  const foreign = (await (await upload(request, otherAdmin, await makePng(4, 4))).json()).item;

  const place = (data: Record<string, unknown>) =>
    request.post(`/api/rooms/${admin}/objects`, { data: { x: 500, y: 500, zone: 'anywhere', ...data }, headers: ip() });

  expect((await place({ kind: 'custom' })).status()).toBe(400); // custom with no assetId
  expect((await place({ kind: 'sofa', assetId: item.id })).status()).toBe(400); // assetId on a built-in kind
  expect((await place({ kind: 'custom', assetId: 'not-a-real-id' })).status()).toBe(400);
  expect((await place({ kind: 'custom', assetId: foreign.id })).status()).toBe(400); // another room's item

  // items can be placed many times
  const copies: string[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await place({ kind: 'custom', assetId: item.id, x: 300 + i * 100 });
    expect(res.status(), await res.text()).toBe(200);
    const { object } = await res.json();
    expect(object).toMatchObject({ kind: 'custom', assetId: item.id });
    copies.push(object.id);
  }
  const listed = (await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects;
  expect(listed.filter((o: { assetId: string | null }) => o.assetId === item.id)).toHaveLength(3);
  const before = listed.length;

  const del = await request.delete(`/api/rooms/${admin}/custom-items/${item.id}`, { headers: ip() });
  expect(del.status()).toBe(200);
  expect((await del.json()).removedObjects).toBe(3);

  const after = (await (await request.get(`/api/rooms/${admin}/objects`)).json()).objects;
  expect(after).toHaveLength(before - 3);
  expect(after.some((o: { id: string }) => copies.includes(o.id))).toBe(false);
  expect((await request.get(item.url)).status()).toBe(404);
  // the other room's item is untouched
  expect((await request.get(foreign.url)).status()).toBe(200);
});

test('an item is only reachable through a link for its own room', async ({ request }) => {
  const a = await seedRoom(request, { celebrantName: 'CustomIsolationA' });
  const b = await seedRoom(request, { celebrantName: 'CustomIsolationB' });
  const adminA = tokenFromLink(a.links.admin);
  const adminB = tokenFromLink(b.links.admin);
  const { item } = await (await upload(request, adminA, await makePng(4, 4))).json();

  expect((await request.get(`/api/rooms/${adminB}/custom-items/${item.id}/image`)).status()).toBe(404);
  expect((await request.put(`/api/rooms/${adminB}/custom-items/${item.id}`, { data: await makePng(4, 4), headers: { ...PNG, ...ip() } })).status()).toBe(404);
  expect((await request.delete(`/api/rooms/${adminB}/custom-items/${item.id}`, { headers: ip() })).status()).toBe(404);
  expect((await request.get(`/api/rooms/not-a-token/custom-items`)).status()).toBe(404);
  // and the item survived every attempt
  expect((await request.get(item.url)).status()).toBe(200);
});
