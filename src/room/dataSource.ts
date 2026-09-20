import type { BoxContribution, PlacedBox } from '@/contribute/types';

/** Whatever backs the room's present list — the localStorage stub (demo page) or the real API
 * (token-scoped room pages). RoomCanvas only ever talks to this interface. */
export type RoomDataSource = {
  list(): Promise<PlacedBox[]>;
  create(contribution: BoxContribution, x: number, y: number): Promise<{ id: string; deleteToken?: string }>;
  remove(id: string, deleteToken?: string): Promise<void>;
};
