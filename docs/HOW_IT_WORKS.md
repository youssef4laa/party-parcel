# How Party Parcel works

A guide for anyone who wants to run, understand, or change the project. The [README](../README.md)
covers setup and day-to-day use; this covers what's underneath.

## 1. The idea in one minute

A **host** creates a *room* and gets three secret links. Each link is a different role:

| Link | Role | What it's for |
|---|---|---|
| **admin** | host | decorate the room, set permissions, unlock early, export a sealed copy |
| **contribute** | friend | pack a present (a *box* full of *goodies*), design its wrapping, drop it in the room |
| **celebrate** | the birthday person | see the room, and — once it's unlocked — open the presents |

Everything a friend adds is **sealed until the birthday**. The server itself refuses to hand out any
present's contents before then, so it doesn't matter what a page says or what a browser's clock shows.

## 2. The stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind** — pages, and the API as route handlers.
- **PixiJS v8** — draws the room. All the art is *procedural*: small canvas-drawing functions, not image files.
- **Prisma + SQLite** — the database (any Prisma-supported database works; SQLite needs zero setup).
- **Zod** — validates every payload the server accepts.
- **Playwright** — the end-to-end test suite (Chromium, a phone-sized WebKit, and desktop Safari).
- **Vite** — builds the separate, server-free site that ships inside an export (`export-site/`).

## 3. Where things live

```
prisma/               schema.prisma and the migrations
src/
  app/                pages (/, /r/[token], /designer) and every API route (src/app/api/...)
  server/             server-only logic: permissions, tokens, lock, storage, validation, defaults
  room/               the room: scene, edit mode, catalog, sprites, the client API
    scene/            buildScene.ts (interactive render), editableObjects.ts (edit-mode render),
                      camera, presents, light glow
    edit/             the edit panel: items, layers, presents, permissions, draw & import, undo/redo
    sprites/          the procedural pixel art (one draw function per item)
    ui/               modals
  box/                the gift-box designer and its shared renderer
  contribute/         the friend's flow: Pack -> Design -> Place
  goodies/            the ten goodie types: schema, editors (packing), viewers (opening), gift flow
  photobooth/         the in-room camera
  export/             the read-only site that runs inside an export
  config/limits.ts    every limit, overridable by environment variable
scripts/              export-gift.ts (CLI), lib/exportRoom.ts (the export itself), backup.ts
export-site/          the Vite project that builds the static site for an export
tests/                the Playwright suite
```

## 4. The data model

| Table | What it holds |
|---|---|
| `Room` | title, celebrant, event time, banner text, the **hashes** of the three links, `unlockedAt`, `permissionsJson` |
| `Box` | one present: sender name, its wrapping design (JSON), position, scale, layer, `openInOrder`, the hash of its delete token |
| `Gift` | one separately wrapped gift inside a box (label + wrap design). **Every box has at least one.** |
| `Goodie` | one item inside a gift (a note, a photo, ...): `type` and a JSON payload |
| `Asset` | an uploaded file belonging to a box (photo, audio, video, drawing) |
| `CouponRedemption` | remembers that a coupon goodie was redeemed |
| `PhotoboothShot` | a photo taken in the room's photobooth |
| `RoomObject` | one decoration in the room: kind, position, scale, layer, flip, rotation, zone, config, who added it |
| `CustomItem` | an imported or hand-drawn image in the room's "My items" library |
| `Payment` | reserved for a future payment flow; nothing writes to it yet |

Schema changes are migrations (`npx prisma migrate dev`). Restore-and-migrate from an old database is
covered by a test (`tests/migration-from-backup.spec.ts`).

## 5. Links, roles, and the birthday lock

**Links are bearer tokens.** Each is 192 random bits (`src/server/tokens.ts`). Only the SHA-256
*hash* is stored; the raw token exists only in the link you were handed. Every request that carries a
token goes through `resolveRoomByToken` (`src/server/rooms.ts`), which returns the room and the role.
Treat a link like a password: whoever has it has that role.

**The lock is server-side, always.** `isRoomUnlocked` (`src/server/lock.ts`) is true when the event
time has passed *or* the host clicked "Unlock early". The one place contents leave the server is
`GET /api/boxes/[boxId]/contents`, and it requires **both** a celebrate token for that box's own room
**and** an unlocked room. Everything else — the list of presents, their wrapping, their positions — is
safe to show early, so it is shown; only contents and media are gated.

**Media is gated too.** Files aren't served by a public URL. The contents route returns short-lived
signed URLs (`/api/assets/[key]?exp=...&sig=...`, an HMAC over the key and expiry using
`ASSET_SIGNING_SECRET`, valid for five minutes). A missing, expired, or forged signature is refused.

**Gifts inside a box are gated exactly the same way.** A gift's label, its wrap design, and which
goodies it holds come only from the locked contents route — never from the public list of presents.

## 6. Presents

**Packing** (`src/contribute/`). A friend enters their name, an optional letter and pictures, adds any
of the ten goodie types, optionally adds more gifts to the same box (each with its own label, wrap and
goodies, up to 6), designs the outer box (shape, pattern, colors, ribbon, bow, tag, sticker, topper,
and a small/medium/large size), and clicks where to drop it.

**The ten goodie types** are note, photo, song, video, gift, voice, drawing, location, coupon and news.
Each has a Zod schema in `src/goodies/schema.ts`, an *editor* (used while packing) and a *viewer* (used
while opening). The server re-validates every payload when a box is created; nothing the browser sends
is trusted. Songs, videos and maps only embed from an allowlist of providers (`src/goodies/embeds.ts`),
and a news link's preview is fetched once, at seal time, never at view time.

**Uploads** are two-phase so the app server never proxies large files inbound:
1. `POST /api/rooms/[token]/uploads` issues a short-lived, size- and type-bounded upload target.
2. The browser sends the bytes straight to it (our own route for local disk, or directly to S3/R2).
3. `POST .../uploads/[key]/finalize` reads what actually arrived, **sniffs the real file type from its
   bytes** (never the name or the claimed content type), re-checks size and allowlist, optionally
   re-encodes images (`sharp`), hashes it, and only then moves it to permanent storage.

Storage is behind an interface (`src/server/storage/`): local disk (`.data/uploads`) or any S3-compatible
bucket, chosen by `STORAGE_PROVIDER`. Photos are also resized and stripped of metadata in the browser
before upload.

**Limits** (all in `src/config/limits.ts`, all overridable): goodies per box, bytes per box and per
room, per-file caps, gifts per box, presents per room (100), photobooth shots (100).

**Undo and removal.** Sealing a present returns a one-time *delete token*; the friend can undo within a
minute. The host can remove any present.

**Opening.** The celebrate link fetches the contents, plays the unwrap animation, then either the
goodie flow (a one-gift box) or the *gifts* flow (gifts float out with their wraps and labels; "N of M
opened"; "Open everything"; optionally in order). Coupons can be redeemed once and stay redeemed.

## 7. The room

The room is **data, not a fixed picture**. Every window, curtain, garland, chair, the cake, the cat,
the balloons — and everything a host adds — is a `RoomObject` row. `resolveRoomObjects` seeds the
default layout the first time a room is loaded (`src/server/defaultLayout.ts`).

**Art.** Each item is a small function that draws onto a canvas in "art pixels" (4 world pixels each),
registered under a key in `src/room/manifest.ts`; the result becomes a nearest-neighbor texture, so
everything stays crisp when scaled. There are no image assets to manage.

**Two renderers, never both at once for the same object:**
- `scene/buildScene.ts` — the **interactive** view: the cake blows out, the cat wanders, balloons pop,
  frames enlarge, the camera opens the photobooth. Every click target follows its object's position.
- `scene/editableObjects.ts` — the **editable** view: plain draggable nodes with selection outlines,
  corner handles, and pinch. It also renders every non-legacy catalog item (and custom images) in
  *both* modes. When edit mode turns on, the interactive scene is torn down; when it turns off, it's
  rebuilt from the current data.

**Camera.** The room is 2400x760 world pixels; it scales to fit the screen's height and pans with
mouse, touch, wheel or arrow keys.

**Lights glow.** A light's glow (`scene/lightGlow.ts`) is an additive child of the light's own node, so it
shares that node's layer: a lamp behind a sofa doesn't light the sofa.

**The cake** (`src/room/cakeConfig.ts`, `sprites/cake.ts`) has eight styles, two colors, five toppers,
text up to 16 characters, and candles that match the celebrant's age, number candles, sparklers, or none.

## 8. Decorating, and who may

**The server is the only boundary.** Every mutation route re-checks role, permission, ownership,
freeze, lock, unlock, zone and limits. The `capabilities` list sent to the page only decides which
buttons to *show*; a person who calls the API directly is refused just the same. `src/server/permissions.ts`
holds the rules:

- `canMutateObjects` — adding, changing, deleting room objects.
- `canManageCustomItems` — adding to, editing, or deleting from the image library.
- `canMovePresent` — moving and resizing a placed present.

The host sets `Room.permissionsJson` (contributors: can decorate *off / own items / any item*, can
import, can draw, can move own presents, max items each; celebrant: can rearrange after unlock; and a
global **freeze layout**). The host always has full rights.

**"Own items" is per browser.** Contributors have no accounts. On first use a browser is given a random
token (kept in `localStorage`); only its hash is stored, on what it creates, and that decides which
items are "yours". Clearing browser data loses the claim; the host can always edit anything.

**Zones** (`src/room/zones.ts`): each item lives in a zone — floor, wall, ceiling, tabletop, or
anywhere — and can only be placed there. The editor clamps drops; the server enforces it for everyone
but the host, who can switch on "Place anywhere".

**Editing tools.** Move, resize (whole-number steps by default so pixels stay crisp; "free scale" for
anything), flip, rotate, layers, lock, hide, duplicate, delete, snap-to-grid, keyboard shortcuts, touch
pinch, and **undo/redo** (`edit/useEditHistory.ts`). Undo isn't a local rewind: it replays the reverse
edit *against the server*, so it goes through the same permission checks. All history-recording work
runs through one serial queue, so a quick Ctrl+Z after an edit always waits for that edit to be saved.

**Custom images.** Import a PNG or WebP (checked by its bytes; 512 KB and 512x512 by default) or draw
in the built-in pixel editor. The server validates the real type and dimensions and rewrites the file
(PNGs down to their critical chunks, WebP metadata removed). Images are stored once and can be placed
many times (`RoomObject.assetId`). They are **not** birthday-locked: they're decorations everyone with a
link can see.

## 9. Sealed export

`npm run export:gift` (or the **Export a sealed copy** button in the Host panel) turns a room into a
folder that needs no server, database or API:

- **Locked with a password** you choose (12+ characters, common or low-entropy passwords are refused).
  The key comes from PBKDF2-SHA-256 (600,000 iterations) and every locked file is AES-256-GCM.
- **Locked:** every present's goodies, media, sender name, tag text — and, for a multi-gift box, the
  gift labels, wrap designs, and order. All of it is inside that box's encrypted file.
- **Not locked, by design:** the room itself. Decoration positions, sizes and text (a cake's writing, a
  sign's words), present appearance and position, and any custom images that are placed in the room are
  ordinary files. Don't put secrets in them.
- **Never exported:** link tokens, their hashes, permissions, who added what, unused library images.
- **How it's built.** `scripts/lib/exportRoom.ts` reads the room, encrypts, and writes `manifest.json`,
  the encrypted files, and any `custom/` images; then it builds `export-site/` with Vite and merges the
  result in. The exported page runs the same `RoomCanvas` as the live app, fed a baked layout instead of a
  server, and has no edit mode.
- **Works from any folder.** Every path is relative, so it can be served from a subpath, and it makes
  no requests except to its own files plus the song/video/map embeds it actually uses.
- **The button** (`POST /api/rooms/[token]/export`) is host-only, checks the password with the same rules,
  runs one export at a time, and streams back a zip. It needs Node on the server; in production run
  `npm run build:export-site` at deploy time.

## 10. Running and configuring

```bash
npm install
cp .env.example .env        # set ASSET_SIGNING_SECRET
npx prisma migrate dev
npm run dev
```

Every setting is documented in `.env.example`; the size and count limits are in the README's table and
in `src/config/limits.ts`. There is no host sign-up yet, so create a room in development with
`POST /api/dev/seed-room` (disabled when `NODE_ENV=production`) — see the README.

## 11. Testing

`npm run typecheck`, `npm run lint`, `npm run test:e2e`. The suite runs against a real dev server and a
real SQLite database, drives the real UI with mouse, keyboard and touch, and checks results by asking
the *server* what was stored. It covers the lock, all ten goodie types, permissions (including every
denial), the edit tools, the catalog, importing and drawing, presents and multi-gift boxes, and the
export end to end (including a leak scan over every exported file).

- **Run one copy at a time.** All specs share one dev server and one database; overlapping runs cause
  failures that look like real bugs.
- Playwright has three projects: `chromium` (everything), `mobile` (phone-sized WebKit, a few specs) and
  `safari` (desktop WebKit, camera/microphone specs). WebKit needs a one-time `npx playwright install webkit`.

## 12. Changing it

**Add a catalog item.** Write a draw function (`src/room/sprites/catalogExtras.ts` is the place), register
it in `src/room/manifest.ts`, and add an entry to `src/room/objectCatalog.ts` (key, label, category,
default zone). If it's a light, add a glow in `scene/lightGlow.ts`. `tests/room-catalog.spec.ts` checks
that every catalog item actually paints.

**Add a goodie type.** Add its Zod schema to `src/goodies/schema.ts`, an editor in `src/goodies/editors/`
and a viewer in `src/goodies/viewers/` (both registered in their `index.tsx`), and its label and icon in
`src/contribute/types.ts`. Then decide how it looks in the export (`scripts/lib/exportRoom.ts`).

**Add a permission.** Add it to `RoomPermissions` and `DEFAULT_PERMISSIONS`, enforce it in the relevant
rule in `src/server/permissions.ts`, add it to `computeCapabilities` (only as a display hint), add it to
the Permissions tab, and — always — add a test that proves the *server* refuses what the UI hides.

**Add a limit.** Put it in `src/config/limits.ts` (with an environment variable) and enforce it
server-side; the UI should only mirror it.

## 13. Security notes

- Room links are bearer tokens; anyone with a link has that role. Use HTTPS in production.
- Nothing the browser sends is trusted: types are sniffed from bytes, payloads re-validated, sizes and
  counts re-checked, permissions re-checked on every change.
- Decorations and custom images are visible to anyone with the room link, and are plain files in an export.
- The export password is the only lock on an export. It is sent to your server when you use the button
  (so use HTTPS), and it is not stored or logged.
- The rate limiter is in memory and per process — fine for one server; use a shared store if you run several.

## 14. Not built yet

Host sign-up, payments and transactional email (the schema and settings leave room for them), a fuller
admin page than the small Host panel, and a hosted "no-terminal" way to create rooms. Nested gifts (a
gift inside a gift) were deliberately left out.
