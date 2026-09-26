# Party Parcel
<img width="1508" height="847" alt="image" src="https://github.com/user-attachments/assets/8dc821bb-c285-46b0-af78-40f53faa3b8c" />


**Build a cozy pixel-art room for someone's birthday, let friends fill it with presents, and lock it
until the big day.**

A *host* decorates a pixel-art party room. *Friends* open a link, pack a gift box (a note, photos, a
song, a video, a voice message, a drawing, a coupon, a place on a map, a news clipping, or a gift
message), design its wrapping, and drop it in the room. Everything stays sealed until the birthday —
the server itself refuses to hand out any contents early. Then the *celebrant* opens their link and
unwraps everything. The host can also download a **sealed, fully static copy** of the room to keep or
give away.

- **Presents**: ten kinds of goodies, a pixel-art box designer (shape, pattern, ribbon, bow, tag, size),
  several separately wrapped gifts in one box, an optional "open in order".
- **A room you can decorate**: 40 catalog items to add (furniture, plants, glowing lights, party decor),
  every piece of the default room movable and resizable, a configurable birthday cake, your own imported
  or hand-drawn pixel art, undo/redo, placement zones, touch support.
- **Permissions**: the host decides what contributors and the celebrant may change; the server enforces it.
- **Sealed export**: a folder (or one-click `.zip`) you can host anywhere, locked with a password, no
  server needed.

**[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)** explains how it all fits together — the data model, how
the birthday lock is enforced, the room, permissions, and the sealed export — and how to extend it.

> **Status.** The room, presents, locking, decorating and export all work and are covered by an
> end-to-end test suite. What's *not* built yet: a host sign-up/payment flow (you create rooms from the
> terminal for now — see below), transactional email, and an admin page beyond the small host panel.

## Setup

```bash
npm install
cp .env.example .env   # fill in ASSET_SIGNING_SECRET at minimum — see comments in the file
npx prisma migrate dev
npm run dev
```

Requires Node.js 20+. Open [http://localhost:3000](http://localhost:3000). The homepage is a client-side demo room
(no server data); real, persisted rooms live at token-scoped links (`/r/[token]`) — see
`POST /api/dev/seed-room` (development only) for a way to create one without the full host/payment
flow.

Env vars are documented inline in `.env.example`: database URL, storage provider (`local` or
`s3`/R2), free-tier limits, and the asset-signing secret.

## Tests

```bash
npm run typecheck   # type-check (generates Next's route types first — needed on a fresh clone)
npm run lint
npm run test:e2e
```

Playwright tests cover the server-side birthday lock (`tests/media-lock.spec.ts`) and the full
Pack → Seal → Lock → Unlock → Unwrap flow for all ten goodie types, through the real UI
(`tests/goodies-e2e.spec.ts`). `npx playwright test --project=safari` runs the camera/microphone
tests again under real WebKit; `npx playwright test --project=mobile tests/phone.spec.ts` runs the
touch-specific pan/drag tests. Both need `npx playwright install webkit` first (one-time, not part
of the default `npm install`).

The Room Editor has its own specs: permissions and zones (`room-objects-*.spec.ts`,
`room-zones.spec.ts`), the edit tools with real mouse, keyboard and touch input
(`room-edit-tools.spec.ts`), the catalog and lights (`room-catalog.spec.ts`), cakes
(`cake-*.spec.ts`), importing and drawing (`pixel-ops`, `custom-items-*.spec.ts`), presents and
multi-gift boxes (`presents-*`, `gifts-*.spec.ts`), and the static export end to end
(`export-*.spec.ts`).

**Run the suite one copy at a time.** Every spec shares one dev server and one SQLite database, so
two overlapping `playwright test` runs interfere with each other and fail in ways that look like
real bugs. Wait for one to finish before starting another.

## Creating a room and adding friends' content

There's no host sign-up UI yet (it's on the roadmap — see
[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md#14-not-built-yet)). Until then, this is how to actually run a party with what's built:

### 1. Create the room

With the dev server running, create a room from the terminal:

```bash
curl -X POST http://localhost:3000/api/dev/seed-room \
  -H "Content-Type: application/json" \
  -d '{"celebrantName":"Alex","age":25,"eventAt":"2026-06-15T18:00:00.000Z"}'
```

(`eventAt` is an ISO timestamp — the birthday lock opens at that moment, or earlier if the host
unlocks manually.) This route is dev-only and 404s once `NODE_ENV=production`, so it's not a
backdoor in a real deployment. The response includes three links:
![Uploading image.png…]()

```json
{
  "roomId": "cm...",
  "eventAt": "2026-06-15T18:00:00.000Z",
  "links": {
    "admin": "/r/AbC123...",
    "contribute": "/r/XyZ789...",
    "celebrate": "/r/QwE456..."
  }
}
```

### 2. Share the right link with the right people

Each link is a random, unguessable token — nobody needs an account, and the app never shows one
role how to reach another:

- **Admin link** — keep this one for yourself (the host). Opens a small panel over the room to
  unlock early, remove a box, or see who has placed one (name and time only — never contents).
- **Contribute link** — send this to friends who are packing a gift. Opens the "+" button in the
  room: **Pack** (name, a note/letter, photos, and the full goodie shelf — Note, Photo, Song,
  Video, Gift, Voice, Drawing, Location, Coupon, News), **Design** (the box designer — shape,
  pattern, colors, ribbon, bow, tag, presets), then **Place** (drag the finished box anywhere in
  the room; there's a 60-second "Oops, take it back" undo after dropping it).
- **Celebrate link** — send this to the birthday person. They can pan the room and use every
  interaction (cake, cat, balloons, stars, frames, photobooth) right away, but a present stays
  locked — "Opens on {date}" — until `eventAt` passes or the host unlocks early from the admin
  panel. Once unlocked, clicking a box plays the open animation and the unwrap flow (one goodie at
  a time, or all at once).

**Photobooth** works from *any* of the three links (it's a normal room interaction, not gated like
box contents) — click the camera on the tripod to take a photo; it joins a small print wall next
to the booth that everyone with the room link can see. A photo's own creator can delete it later
from the same browser; nobody else can.

### 3. When it's time to send the finished room

Once every contributor has placed their box, either keep sharing the live links (the room stays
usable at those URLs indefinitely), or bake a sealed, offline copy to hand the celebrant as a
keepsake — see "Filling the room" and "Static export" below.

## Filling the room

The exact sequence for actually running a party with what's built so far, start to finish.

1. **Create the room and set the event date.** The event date can only be set at creation time —
   there's no edit-room UI yet (it's on the roadmap). Decide the real
   date/time up front:
   ```bash
   curl -X POST http://localhost:3000/api/dev/seed-room \
     -H "Content-Type: application/json" \
     -d '{"celebrantName":"Alex","age":25,"eventAt":"2026-06-15T18:00:00.000Z"}'
   ```
   Save the three links from the response (see "Share the right link with the right people"
   above). If you really need to change the date on a room that already exists, `npx prisma
   studio` (Prisma's own admin UI, not something this project built or tested) can edit the
   `eventAt` column directly — there's no in-app way to do it yet.

2. **Add boxes.** Send the contribute link to friends. Each one packs goodies (Pack), designs the
   box (Design), then drags it into the room (Place) — no sign-up, no limit beyond the per-box/
   per-room size caps below.

3. **Unlock early for local testing.** Open the admin link, click "Unlock early" in the Host
   panel (or `POST /api/rooms/<adminToken>/unlock` directly). This is permanent for that room —
   only use it on a throwaway test room, not the one you're actually sending, unless you mean to
   open it before the real date.

4. **Back up before anything risky** (re-exporting, testing unlock, running migrations, etc.):
   ```bash
   npm run backup
   ```
   Copies `prisma/dev.db` and `.data/uploads` to a timestamped folder next to the repo (default
   `../party-parcel-backups/<timestamp>`; override with `--out <dir>`) and prints exactly where
   it went. This is the only copy of anything friends uploaded — neither file is tracked by git.

5. **Export** once every contributor has placed their box — see "Static export" below for the
   full picture (encryption, subpath-safety, deploying it):
   ```bash
   npm run export:gift -- --admin <adminToken> --password "a strong password" --out ./export/my-room
   ```

6. **Re-export** if a box was added or changed after the first export — run the same command
   again. It's not incremental: the whole output folder is wiped and rebuilt from the room's
   *current* state every time. If you already deployed an earlier export somewhere, redeploy the
   new output too — the two copies aren't linked once they're out the door.

### Size limits, and how to raise them

All enforced server-side; the UI's live counters just mirror these numbers. Set in `.env` (see
`.env.example`) — changing one needs a dev-server restart (`npm run dev`) or a rebuild
(`npm run build`), since Next.js inlines `NEXT_PUBLIC_*` vars into the client bundle at build time,
not read at runtime.

| Env var | Default | What it caps |
|---|---|---|
| `NEXT_PUBLIC_MAX_GOODIES_PER_BOX` | 25 | goodies per box |
| `NEXT_PUBLIC_MAX_BYTES_PER_BOX` | 25 MB | total goodie bytes per box |
| `NEXT_PUBLIC_MAX_BYTES_PER_ROOM` | 200 MB | total goodie bytes across the whole room |
| `NEXT_PUBLIC_MAX_PHOTO_BYTES` | 10 MB | one photo upload |
| `NEXT_PUBLIC_MAX_VIDEO_UPLOAD_BYTES` | 20 MB | one video/voice/song file upload |
| `NEXT_PUBLIC_MAX_VOICE_SECONDS` | 180 (3 min) | one voice recording's length |
| `NEXT_PUBLIC_MAX_OBJECTS_PER_ROOM` | 300 | decoration objects in a room |
| `NEXT_PUBLIC_MAX_ITEMS_PER_CONTRIBUTOR` | 10 | default items one contributor may add (host can change it per room) |
| `NEXT_PUBLIC_MIN_OBJECT_SCALE` / `MAX_OBJECT_SCALE` | 0.25 / 4 | how small/large a decoration can be resized |
| `NEXT_PUBLIC_MIN_PRESENT_SCALE` / `MAX_PRESENT_SCALE` | 0.5 / 3 | how small/large a placed present can be resized |
| `NEXT_PUBLIC_MAX_CUSTOM_ITEM_BYTES` | 512 KB | one imported/drawn image |
| `NEXT_PUBLIC_MAX_CUSTOM_ITEM_PX` | 512 | its width and height |
| `NEXT_PUBLIC_MAX_CUSTOM_ITEMS_PER_ROOM` | 40 | images in "My items" |
| `NEXT_PUBLIC_MAX_GIFTS_PER_BOX` | 6 | separately wrapped gifts in one box |

50 goodies / 500 MB per box is the "paid tier" reference —
`RECOMMENDED_PAID_TIER` in `src/config/limits.ts` — raise the env vars to those, or higher, for a
bigger room.

Two more caps exist but aren't env-configurable yet (a code change, not just a setting, would be
needed): `MAX_BOXES_PER_ROOM` and `MAX_PHOTOBOOTH_SHOTS_PER_ROOM`, both 100, hardcoded in
`src/server/limits.ts`.

## Decorating the room

The room is built from objects you can move, resize and change — not a fixed picture. This all
happens on the live room page (`/r/<token>`); the "/" demo and the exported site don't have it.

**Opening edit mode.** Click the pencil (✏️) in the top-right corner. The host's link always has it.
A contributor's or celebrant's link only shows it if the host allowed something — see
[Permissions](#permissions) below. A side panel opens with tabs: **Items**, **Draw & Import**,
**Layers**, **Presents**, and (host only) **Permissions**. The ✕ hides the panel but keeps edit mode on
(so you can drag things with the whole room visible); click the pencil again to bring it back, and
once more to leave edit mode.

**Adding things.** *Items* lists the built-in catalog — search it or filter by category:
- *Furniture*: sofa, armchair, bookshelf, side table, dresser, bench, chair, bean bag, cushions, and
  rugs in a round, striped, checkered and runner size/pattern.
- *Plants & trees*: potted plant, tall tree, pine, palm, flower pots, hanging plant.
- *Lights*: string lights (they twinkle), paper lantern, floor lamp, table lamp, neon sign, disco ball,
  candles, spotlight. Lights cast a soft glow that respects layering — a lamp behind a sofa doesn't
  light the sofa.
- *Party decor*: streamers, a banner with your own words, balloon clusters, piñata, confetti, two
  posters, a photo string with clothespins, party hats.

The cake, balloons, neon sign and banners have their own small editors under the item's toolbar (the
cake's has eight styles, colours, toppers, up to 16 characters of writing, and candles that match the
age or are number candles, sparklers, or none — and it still blows out and relights).

**Zones.** Each item belongs to a zone — floor, wall, ceiling, tabletop or anywhere — and can only be
placed in it (a rug can't go on the ceiling). The server enforces this for everyone except the host.
The host can switch **Place anywhere** on to ignore zones.

**Moving and resizing.**
- *Move*: drag it. *Resize*: drag a corner handle, use **Scale −/+**, or pinch with two fingers on a
  phone. By default sizes step through whole numbers (¼, ½, 1, 2, 3, 4×) so the pixel art stays crisp;
  turn on **Free scale** for any size. The bounds are set by `NEXT_PUBLIC_MIN/MAX_OBJECT_SCALE`.
- *Also*: flip, rotate 90°, forward/backward, lock (only the host can move a locked item), hide,
  duplicate, delete, and **Snap to grid** (16 px).
- **Undo/redo** (the buttons or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) covers every edit, presents included.
  Undoing is an ordinary edit sent to the server, so if your right to make it has since been
  withdrawn, it's refused and explained rather than silently ignored.

| Key | Does |
|---|---|
| Arrow keys | nudge the selected item 1 px (Shift: 10 px; with Snap on: one grid cell) |
| Delete / Backspace | delete the selected item |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | undo, redo |
| Ctrl/Cmd+D | duplicate |
| Escape | deselect |

The host can also **Reset to default layout** (Permissions tab), which restores the original room.

**Your own pictures — Draw & Import.**
- *Import* a PNG or WebP (drag it in, or click). Files are checked by their contents, not their
  name; the limit is 512 KB and 512×512 px (larger images are scaled down with nearest-neighbor).
  Transparent margins are trimmed, and **Pixelate to match room** shrinks a photo to 16–128 px wide
  with an optional 16/32-colour palette, with a live preview. Metadata is stripped on your device
  *and* again on the server.
- *Draw* pixel art on a 16, 32, 64 or 128 px canvas: pencil, eraser, fill, eyedropper, line,
  rectangle, ellipse, mirror, the room palette plus custom and recent colours, zoom, grid, undo/redo,
  flip/rotate, and previews at real size and as placed in the room. Mouse, pen and touch all work.
- Everything you save lands in **My items** (up to 40): place a copy as many times as you like, edit
  it later (all placed copies follow), or open an imported PNG in the editor to touch it up.
  Deleting an item asks first and removes every placed copy.

> **Decorations are visible to anyone with the room link — even before the password in the exported
> site.** Custom images are ordinary files in the export. Don't import private photos, and don't put
> secrets in a sign, banner or cake. Anything private belongs inside a present.

**Presents.** The **Presents** tab lists every present. In edit mode you can select one (or click it
in the room), drag it, resize it (0.5–3×, `NEXT_PUBLIC_MIN/MAX_PRESENT_SCALE`) and move it forward or
back. Only its position, size and layer can change — what's inside stays sealed and the birthday lock
is untouched. The box designer also has a **Small / Medium / Large** size.

**Several gifts in one box.** When packing, **Add another gift to this box** (up to 6,
`NEXT_PUBLIC_MAX_GIFTS_PER_BOX`). Each gift gets a label ("Open me first!"), its own wrap design and
its own goodies (all ten types); the per-box goodie and size limits count the whole box. Tick **Open
in order** to make the celebrant open them one after another. On the big day the celebrant opens the
outer box, the gifts float out with their wraps and labels, and each opens to its goodies — with an
"N of M gifts opened" counter and an **Open everything** button. A box with one gift works exactly as
it always did.

## Permissions

The host's link can do everything, always. Everyone else's rights are decided by the host in the
**Permissions** tab, and — importantly — **enforced by the server on every change**. Hiding the
pencil in the page is only a convenience; a person who skips the page and calls the server directly
is refused just the same.

| | Host | Contributor | Celebrant |
|---|---|---|---|
| Edit the room (add/move/resize/delete objects) | always | only if **Can decorate** is *Own items only* or *Any item* | only if **Can rearrange** is on **and** the room has unlocked — and then move/resize only, never add or delete |
| Import images / draw | always | only with **Can import PNGs** / **Can draw** | never |
| Move and resize presents | always | only their own, only with **Can move own presents** | never |
| Items per person | — | capped by **Max items per contributor** (default 10) | — |
| Place outside an item's zone | with "Place anywhere" | never | never |
| Reset to default layout, change permissions | yes | no | no |

Also: **Freeze layout** stops everyone except the host from changing anything. A **locked** item can
only be moved by the host. Rooms hold at most 300 objects (`NEXT_PUBLIC_MAX_OBJECTS_PER_ROOM`).

**"Own items" is per browser, not per person.** Contributors have no accounts. The first time a link is
used, that browser gets a random token; only a hash of it is stored, and it decides which items and
presents are "yours". The catch: clearing your browser data (or using another device) loses your claim
on what you added. The host can always edit or delete anything, so nothing is ever stuck.

## Static export: `npm run export:gift`

Bakes one finished, sealed room into a fully static folder — no server, no database, no API
calls at runtime. You can drop the output folder on **any** static host.

```bash
npm run export:gift -- --admin <adminLinkToken> --password "a strong password" --out ./export/my-room
```

(Omit `--admin`/`--password` and the script will prompt for them instead.)

**Or use the button.** The host's page has an **Export a sealed copy** form in the Host panel: enter
the password, click **Download sealed copy (.zip)**, unzip it, and put the folder on any static host.
It produces exactly what the command above does. The password is sent to *your* server to build the
export, so use it over HTTPS (or locally); it isn't stored or logged. It builds the site on your server, so it needs
Node — it works when you self-host (`npm run dev`, or `npm run build && npm start`). In production,
run `npm run build:export-site` once at deploy time (the bundle is reused after that; it needs the dev
dependencies installed at build time). On a serverless host with no writable disk, run the command from
your own machine instead.

**How the lock works**: every box's goodies, media, sender name, and gift-tag text are
individually encrypted with AES-256-GCM, using a key derived from your password via PBKDF2
(600,000 iterations — see `src/export/cryptoFormat.ts`). Only a box's *cosmetic appearance*
(shape, pattern, colors, ribbon, bow, position) stays in plain `manifest.json`, matching how the
live app already shows the present pile before anything unlocks — every box shows as a generic
sealed present from "A friend" until the password is entered. The countdown to the event date
shown in the exported page is decoration only — **the password is the only real lock**. Choose one
you're comfortable sharing with the celebrant through a separate channel than the link itself
(`scripts/export-gift.ts` requires at least 12 characters and rejects common/low-entropy ones).

**What else the export carries.** The room exactly as you left it: every visible decoration (position,
size, layer, flip, and the cake's style, text and candles), and the custom images you *placed* — those
are plain image files in `custom/` (unused library items never ship), so they are **not** encrypted.
Present sizes and stacking are baked in too. A multi-gift box keeps its structure — gift labels, wrap
designs, order and "open in order" — *inside* that box's encrypted blob, so none of it is readable
without the password, and the gifts open in the same floating-gifts flow. The exported page has no edit
mode and never talks to a server. The room is still alive — the cake blows out, picture frames
enlarge, the photobooth works (all three are covered by tests; the rest of the scene runs on the same
code as the live room). Passwords, link tokens, permissions and who-added-what are never
exported.

The exported folder also ships a `robots.txt` that disallows everything and a `noindex` meta tag,
since — like the live app's room links — it's meant to be unlisted, shared only with people you
trust with the link.

### Deploying the export to Cloudflare Pages

1. Run the export command above; note the output folder (e.g. `./export/my-room`).
2. Install Wrangler if you don't have it: `npm install -g wrangler` (or use `npx wrangler`).
3. From the repo root:
   ```bash
   npx wrangler pages deploy ./export/my-room --project-name my-party-parcel
   ```
   The first run will ask you to log in and create the Pages project; accept the defaults.
4. Wrangler prints a `*.pages.dev` URL when it's done — that's the link to share with the
   celebrant (along with the password, separately).

Any other static host works too — the folder is just HTML/CSS/JS/JSON plus encrypted binary
blobs. Locally, `npx serve ./export/my-room` (or any static file server) is enough to test it.

**Third-party content**: Song and Video goodies that use a Spotify/YouTube/Apple
Music/SoundCloud/Vimeo *link* (as opposed to an uploaded file) embed a player from that
provider's own site, and Location goodies with coordinates embed a live OpenStreetMap view —
those still make requests to their respective providers even in an otherwise fully static,
offline-capable export, but *only* for boxes that actually use one of those link types. Goodies
that use an *uploaded* file (photo, drawing, an uploaded song/video/voice recording) are fully
self-contained in the exported folder and need no network access beyond the static host itself —
and so is everything else: the pixel fonts are bundled into the export (not loaded from Google
Fonts, unlike the live app, which always has normal server-side internet access) under an SIL
Open Font License that explicitly permits this; the license text ships alongside them at
`fonts-license/`. Verified with a real network-request audit — see `tests/export-subpath.spec.ts`.

The export also works correctly when served from a subpath (e.g. `example.com/my-export/`, not
just a domain root) — asset paths are relative, and a `.nojekyll` file is included for GitHub
Pages.

## Deploying your own

This is a standard Next.js app with a SQLite database (Prisma) and local-disk or S3/R2 storage — see
`.env.example`. Set a strong `ASSET_SIGNING_SECRET`. The `/api/dev/seed-room` helper is disabled when
`NODE_ENV=production`, so a real deployment needs its own way of creating rooms (the host sign-up flow
is the next planned piece). Room links are unguessable bearer tokens: anyone
who has one has that link's rights, so treat them like passwords.

## License

Party Parcel is free software under the **GNU Affero General Public License v3.0** — see
[LICENSE](LICENSE). In plain terms: you can use, study, change and share it, but if you run a modified
version as a service for other people you must offer them the source of your changes under the same
license. The pixel fonts bundled with the static export (Press Start 2P, VT323) are separately licensed
under the SIL Open Font License; their license text ships in the export's `fonts-license/` folder.

## Learn more

This project is built with Next.js (App Router) + TypeScript + Tailwind, PixiJS for the room
scene, Prisma for the data layer, and a separate Vite bundle (`export-site/`) for the static
export above. See [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) for how these fit together.
