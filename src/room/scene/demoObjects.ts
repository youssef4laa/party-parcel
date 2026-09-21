import { defaultLayout } from '@/server/defaultLayout';
import type { RoomObjectApi } from '../api';

/**
 * Two places render the room scene with no real, persisted RoomObject rows to fetch: the
 * localStorage-backed "/" sandbox (no roomToken, no server round trip at all — the sandbox is deliberately left as it is) and the static export (Phase 5 will bake real object
 * positions into it; until then it renders the same default look every fresh room starts with).
 * Both need buildScene.ts's now fully data-driven renderer fed *something* — this synthesizes the
 * same rows a brand-new real room would get from `defaultLayout()` (server/defaultLayout.ts is a
 * plain function, no Prisma/server-only imports, safe to reuse client-side here) instead of
 * duplicating that layout data a second time.
 */
export function demoLayoutObjects(): RoomObjectApi[] {
  const now = new Date(0).toISOString();
  return defaultLayout().map((item, i) => ({
    id: `demo-${item.kind}-${i}`,
    kind: item.kind,
    x: item.x,
    y: item.y,
    z: item.z,
    scale: 1,
    flipX: false,
    rotation: 0,
    zone: item.zone,
    locked: false,
    hidden: false,
    configJson: item.configJson ?? '{}',
    createdByRole: 'admin',
    createdBySessionHash: null,
    createdAt: now,
    updatedAt: now,
  }));
}
