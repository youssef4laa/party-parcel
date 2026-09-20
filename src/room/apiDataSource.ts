import type { RoomDataSource } from './dataSource';
import {
  createBox,
  createPhotoboothShot,
  deleteBox,
  deletePhotoboothShot,
  fetchBoxes,
  fetchPhotoboothShots,
  toPlacedBox,
  uploadFile,
} from './api';
import { getShotDeleteToken, rememberShotOwnership } from './photoboothOwnership';

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
    photobooth: {
      async list() {
        const shots = await fetchPhotoboothShots(token);
        return shots.map((s) => ({
          id: s.id,
          url: s.url,
          caption: s.caption,
          createdAt: Date.parse(s.createdAt),
          canDelete: Boolean(getShotDeleteToken(token, s.id)),
        }));
      },
      async add(photo) {
        const file = photo instanceof File ? photo : new File([photo], 'photobooth.jpg', { type: photo.type || 'image/jpeg' });
        const { assetKey } = await uploadFile(token, file, 'photobooth');
        const created = await createPhotoboothShot(token, assetKey);
        rememberShotOwnership(token, created.id, created.deleteToken);
        return { id: created.id, url: created.url, caption: created.caption, createdAt: Date.parse(created.createdAt), canDelete: true };
      },
      async remove(shot) {
        const deleteToken = getShotDeleteToken(token, shot.id);
        await deletePhotoboothShot(token, shot.id, deleteToken);
      },
    },
  };
}
