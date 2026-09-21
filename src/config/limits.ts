/**
 * Free-tier limits, overridable via env vars, used by both the server (source of truth,
 * enforced in API routes) and the client (so counters in the UI match reality instead of
 * drifting). Each must be referenced as a literal `process.env.NEXT_PUBLIC_...` — Next.js
 * inlines these textually at build time for the client bundle, so a dynamic/computed lookup
 * would silently come back `undefined` in the browser.
 *
 * The brief's original numbers (50 goodies / 500 MB per box) are what we recommend for a paid
 * host tier; these are the free-tier defaults actually enforced out of the box.
 */
function positiveInt(raw: string | undefined, fallback: number): number {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function positiveFloat(raw: string | undefined, fallback: number): number {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MB = 1024 * 1024;

export const LIMITS = {
  maxGoodiesPerBox: positiveInt(process.env.NEXT_PUBLIC_MAX_GOODIES_PER_BOX, 25),
  maxBytesPerBox: positiveInt(process.env.NEXT_PUBLIC_MAX_BYTES_PER_BOX, 25 * MB),
  maxBytesPerRoom: positiveInt(process.env.NEXT_PUBLIC_MAX_BYTES_PER_ROOM, 200 * MB),
  maxPhotoBytes: positiveInt(process.env.NEXT_PUBLIC_MAX_PHOTO_BYTES, 10 * MB),
  maxVideoUploadBytes: positiveInt(process.env.NEXT_PUBLIC_MAX_VIDEO_UPLOAD_BYTES, 20 * MB),
  maxVoiceSeconds: positiveInt(process.env.NEXT_PUBLIC_MAX_VOICE_SECONDS, 180),

  // Room Editor (docs/ROOM_EDITOR.md) — all new limits are env vars with defaults, per that brief.
  maxObjectsPerRoom: positiveInt(process.env.NEXT_PUBLIC_MAX_OBJECTS_PER_ROOM, 300),
  defaultMaxItemsPerContributor: positiveInt(process.env.NEXT_PUBLIC_MAX_ITEMS_PER_CONTRIBUTOR, 10),
  minObjectScale: positiveFloat(process.env.NEXT_PUBLIC_MIN_OBJECT_SCALE, 0.25),
  maxObjectScale: positiveFloat(process.env.NEXT_PUBLIC_MAX_OBJECT_SCALE, 4),
  minPresentScale: positiveFloat(process.env.NEXT_PUBLIC_MIN_PRESENT_SCALE, 0.5),
  maxPresentScale: positiveFloat(process.env.NEXT_PUBLIC_MAX_PRESENT_SCALE, 3),
  maxCustomItemBytes: positiveInt(process.env.NEXT_PUBLIC_MAX_CUSTOM_ITEM_BYTES, 512 * 1024),
  maxCustomItemPx: positiveInt(process.env.NEXT_PUBLIC_MAX_CUSTOM_ITEM_PX, 512),
  maxCustomItemsPerRoom: positiveInt(process.env.NEXT_PUBLIC_MAX_CUSTOM_ITEMS_PER_ROOM, 40),
  maxGiftsPerBox: positiveInt(process.env.NEXT_PUBLIC_MAX_GIFTS_PER_BOX, 6),
} as const;

/** The brief's own numbers — shown in the UI/docs as "what a paid host tier gets." */
export const RECOMMENDED_PAID_TIER = {
  maxGoodiesPerBox: 50,
  maxBytesPerBox: 500 * MB,
} as const;
