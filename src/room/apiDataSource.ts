import type { RoomDataSource } from './dataSource';
import { createBox, deleteBox, fetchBoxes, toPlacedBox } from './api';

/** The real, persisted backend — a thin adapter over the token-scoped room API. */
export function createApiDataSource(token: string): RoomDataSource {
  return {
    async list() {
      const boxes = await fetchBoxes(token);
      return boxes.map(toPlacedBox);
    },
    async create(contribution, x, y) {
      return createBox(token, contribution, x, y);
    },
    async remove(id, deleteToken) {
      await deleteBox(token, id, deleteToken);
    },
  };
}
