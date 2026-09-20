import type { RoomDataSource } from '@/room/dataSource';
import { addPlacedBox, loadPlacedBoxes, makeId, removePlacedBox } from './stubBackend';

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
  };
}
