import type { RoomObjectApi } from '@/room/api';
import type { StaticRoomObject } from './manifest';

const EPOCH = new Date(0).toISOString();

/** Rebuilds the full `RoomObjectApi` shape the scene renderer speaks from a baked object. The
 * fields the export deliberately never carries (owner, timestamps, lock) get inert placeholders —
 * the exported room has no edit mode and no server, so nothing ever reads them. */
export function toRoomObjectApi(o: StaticRoomObject): RoomObjectApi {
  return {
    id: o.id,
    kind: o.kind,
    x: o.x,
    y: o.y,
    z: o.z,
    scale: o.scale,
    flipX: o.flipX,
    rotation: o.rotation,
    zone: o.zone,
    locked: false,
    hidden: false,
    configJson: o.configJson,
    assetId: o.assetId,
    createdByRole: 'admin',
    createdBySessionHash: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
}
