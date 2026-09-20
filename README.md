# Party Parcel

A web app where a Host builds a cozy pixel-art birthday room, friends pack and design gift boxes
and drop them into the room, and the Celebrant unwraps everything on the big day. See
`party-room-agent-prompt.md` for the full brief and [DECISIONS.md](DECISIONS.md) for every choice
made where that brief was silent.

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
(`tests/goodies-e2e.spec.ts`).

## Static export: `npm run export:gift`

Bakes one finished, sealed room into a fully static folder — no server, no database, no API
calls at runtime. You can drop the output folder on **any** static host.

```bash
npm run export:gift -- --admin <adminLinkToken> --password "a strong password" --out ./export/my-room
```

(Omit `--admin`/`--password` and the script will prompt for them instead.)

**How the lock works**: every box's goodies and media are individually encrypted with AES-256-GCM,
using a key derived from your password via PBKDF2 (600,000 iterations — see
`src/export/cryptoFormat.ts`). Box *metadata* (sender name, box design, position) stays in plain
`manifest.json`, matching how the live app already shows the present pile before anything unlocks;
only *contents* are behind the password. The countdown to the event date shown in the exported
page is decoration only — **the password is the only real lock**. Choose one you're comfortable
sharing with the celebrant through a separate channel than the link itself.

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
export. Goodies that use an *uploaded* file (photo, drawing, an uploaded song/video/voice
recording) are fully self-contained in the exported folder and need no network access beyond the
static host itself.

## Learn more

This project is built with Next.js (App Router) + TypeScript + Tailwind, PixiJS for the room
scene, Prisma for the data layer, and a separate Vite bundle (`export-site/`) for the static
export above. See [DECISIONS.md](DECISIONS.md) for the reasoning behind each of these choices.
