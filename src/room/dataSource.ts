import type { BoxContribution, PlacedBox } from '@/contribute/types';

export type PhotoboothShotView = {
  id: string;
  /** Ready to render directly (signed asset URL, blob:, or data:). */
  url: string;
  caption: string;
  createdAt: number;
  /** True if this browser holds the delete token for this shot (see photobooth ownership notes). */
  canDelete: boolean;
};

/** Whatever backs the room's present list — the localStorage stub (demo page) or the real API
 * (token-scoped room pages). RoomCanvas only ever talks to this interface. */
export type RoomDataSource = {
  list(): Promise<PlacedBox[]>;
  create(contribution: BoxContribution, x: number, y: number): Promise<{ id: string; deleteToken?: string }>;
  remove(id: string, deleteToken?: string): Promise<void>;
  photobooth: {
    list(): Promise<PhotoboothShotView[]>;
    /** `celebrantName` is only used by browser-only implementations (stub/export) that can't ask
     * a server to stamp the caption; the real API always derives it server-side instead. */
    add(photo: Blob, celebrantName: string): Promise<PhotoboothShotView>;
    remove(shot: PhotoboothShotView): Promise<void>;
  };
};
