/**
 * The fixed print caption format from section 3: "HAPPY BIRTHDAY · {date} · {name}". Shared
 * (isomorphic — no server- or browser-only APIs) so the live API route and the browser-only
 * local fallbacks (stub demo page, static export) produce byte-identical captions. {date} is the
 * day the shot was taken (a real photobooth print stamps the moment, not the event date), {name}
 * is the celebrant's name.
 */
export function formatPhotoboothCaption(celebrantName: string, takenAt: Date = new Date()): string {
  const date = takenAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `HAPPY BIRTHDAY · ${date} · ${celebrantName}`;
}
