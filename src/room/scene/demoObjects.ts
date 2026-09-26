import { defaultLayout } from '@/server/defaultLayout';
import type { RoomObjectApi } from '../api';

/**
 * The "/" demo page renders the room with no real, persisted RoomObject rows to fetch (it's a
 * localStorage-backed sandbox with no roomToken and no server round trip at all). The scene renderer
 * (buildScene.ts) is fully data-driven, so it still needs *something* to draw — this synthesizes the
 * same rows a brand-new real room gets from `defaultLayout()` (server/defaultLayout.ts is a plain
 * function with no Prisma/server-only imports, safe to reuse client-side) instead of duplicating that
 * layout a second time.
 *
 * The static export does not use this: it bakes the host's actual layout into its manifest and hands
 * it to RoomCanvas as `staticObjects` (see src/export/StaticRoomApp.tsx). This is the fallback only
 * when no layout is supplied.
 */
export function demoLayoutObjects(age?: number | null): RoomObjectApi[] {
  const now = new Date(0).toISOString();
  return defaultLayout(age).map((item, i) => ({
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
    assetId: null,
    createdByRole: 'admin',
    createdBySessionHash: null,
    createdAt: now,
    updatedAt: now,
  }));
}
