# Party Parcel

A web app where a Host builds a cozy pixel-art birthday room, friends pack and design gift boxes
and drop them into the room, and the Celebrant unwraps everything on the big day. See
[docs/brief.md](docs/brief.md) for the full brief and [DECISIONS.md](DECISIONS.md) for every
choice made where that brief was silent.

## Setup

```bash
npm install
cp .env.example .env   # fill in ASSET_SIGNING_SECRET at minimum — see comments in the file
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The homepage is a client-side demo room
(no server data); real, persisted rooms live at token-scoped links (`/r/[token]`) — see
`POST /api/dev/seed-room` (development only) for a way to create one without the full host/payment
flow.

Env vars are documented inline in `.env.example`: database URL, storage provider (`local` or
`s3`/R2), free-tier limits, and the asset-signing secret.

## Tests

```bash
npm run test:e2e
```

Playwright tests cover the server-side birthday lock (`tests/media-lock.spec.ts`) and the full
Pack → Seal → Lock → Unlock → Unwrap flow for all ten goodie types, through the real UI
(`tests/goodies-e2e.spec.ts`). `npx playwright test --project=safari` runs the camera/microphone
tests again under real WebKit; `npx playwright test --project=mobile tests/phone.spec.ts` runs the
touch-specific pan/drag tests. Both need `npx playwright install webkit` first (one-time, not part
of the default `npm install` — see [HANDOFF.md](HANDOFF.md) if that step is unfamiliar).

## Creating a room and adding friends' content

There's no host sign-up UI yet (that's Milestone 7 — see [HANDOFF.md](HANDOFF.md) for what's
still ahead). Until then, this is how to actually run a party with what's built:

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
role how to reach another (see section 2 of the brief for the full reasoning):

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
   there's no edit-room UI yet (Milestone 7, see [HANDOFF.md](HANDOFF.md)). Decide the real
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

The brief's own numbers (50 goodies / 500 MB per box) are the "paid tier" reference —
`RECOMMENDED_PAID_TIER` in `src/config/limits.ts` — raise the env vars to those, or higher, for a
bigger room.

Two more caps exist but aren't env-configurable yet (a code change, not just a setting, would be
needed): `MAX_BOXES_PER_ROOM` and `MAX_PHOTOBOOTH_SHOTS_PER_ROOM`, both 100, hardcoded in
`src/server/limits.ts`.

## Static export: `npm run export:gift`

Bakes one finished, sealed room into a fully static folder — no server, no database, no API
calls at runtime. You can drop the output folder on **any** static host.

```bash
npm run export:gift -- --admin <adminLinkToken> --password "a strong password" --out ./export/my-room
```

(Omit `--admin`/`--password` and the script will prompt for them instead.)

**How the lock works**: every box's goodies, media, sender name, and gift-tag text are
individually encrypted with AES-256-GCM, using a key derived from your password via PBKDF2
(600,000 iterations — see `src/export/cryptoFormat.ts`). Only a box's *cosmetic appearance*
(shape, pattern, colors, ribbon, bow, position) stays in plain `manifest.json`, matching how the
live app already shows the present pile before anything unlocks — every box shows as a generic
sealed present from "A friend" until the password is entered. The countdown to the event date
shown in the exported page is decoration only — **the password is the only real lock**. Choose one
you're comfortable sharing with the celebrant through a separate channel than the link itself
(`scripts/export-gift.ts` requires at least 12 characters and rejects common/low-entropy ones).

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
both still make requests to those third parties even in an otherwise fully static, offline-capable
export. The page also always loads its pixel fonts from Google Fonts, regardless of goodie
content (same as the live app). Goodies that use an *uploaded* file (photo, drawing, an uploaded
song/video/voice recording) are fully self-contained in the exported folder and need no network
access beyond the static host itself. Verified with a real network-request audit — see
`tests/export-subpath.spec.ts`.

The export also works correctly when served from a subpath (e.g. `example.com/my-export/`, not
just a domain root) — asset paths are relative, and a `.nojekyll` file is included for GitHub
Pages.

## Learn more

This project is built with Next.js (App Router) + TypeScript + Tailwind, PixiJS for the room
scene, Prisma for the data layer, and a separate Vite bundle (`export-site/`) for the static
export above. See [DECISIONS.md](DECISIONS.md) for the reasoning behind each of these choices.
