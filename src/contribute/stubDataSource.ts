import type { RoomDataSource } from '@/room/dataSource';
import { addPlacedBox, loadPlacedBoxes, makeId, removePlacedBox } from './stubBackend';
import { addLocalPhotoboothShot, listLocalPhotoboothShots, removeLocalPhotoboothShot } from '@/room/localPhotobooth';

/** The localStorage-backed stand-in, wrapped in the same `RoomDataSource` shape the real API uses. */
export function createStubDataSource(roomId: string): RoomDataSource {
  return {
    async list() {
      return loadPlacedBoxes(roomId);
    },
    async create(contribution, x, y) {
      const id = makeId();
      addPlacedBox(roomId, { id, fromName: contribution.fromName, design: contribution.design, x, y, placedAt: Date.now() }, contribution);
      return { id };
    },
    async remove(id) {
      removePlacedBox(roomId, id);
    },
    // No server here at all, so photobooth shots — like everything else on this demo page —
    // live only in this browser's localStorage, namespaced by roomId.
    photobooth: {
      async list() {
        return listLocalPhotoboothShots(roomId);
      },
      async add(photo, celebrantName) {
        return addLocalPhotoboothShot(roomId, photo, celebrantName);
      },
      async remove(shot) {
        removeLocalPhotoboothShot(roomId, shot.id);
      },
    },
  };
}
