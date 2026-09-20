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

const MB = 1024 * 1024;

export const LIMITS = {
  maxGoodiesPerBox: positiveInt(process.env.NEXT_PUBLIC_MAX_GOODIES_PER_BOX, 25),
  maxBytesPerBox: positiveInt(process.env.NEXT_PUBLIC_MAX_BYTES_PER_BOX, 25 * MB),
  maxBytesPerRoom: positiveInt(process.env.NEXT_PUBLIC_MAX_BYTES_PER_ROOM, 200 * MB),
  maxPhotoBytes: positiveInt(process.env.NEXT_PUBLIC_MAX_PHOTO_BYTES, 10 * MB),
  maxVideoUploadBytes: positiveInt(process.env.NEXT_PUBLIC_MAX_VIDEO_UPLOAD_BYTES, 20 * MB),
  maxVoiceSeconds: positiveInt(process.env.NEXT_PUBLIC_MAX_VOICE_SECONDS, 180),
} as const;

/** The brief's own numbers — shown in the UI/docs as "what a paid host tier gets." */
export const RECOMMENDED_PAID_TIER = {
  maxGoodiesPerBox: 50,
  maxBytesPerBox: 500 * MB,
} as const;
