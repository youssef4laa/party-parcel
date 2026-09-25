import type { NextRequest } from 'next/server';
import type { CustomItem } from '@/generated/prisma';
import { hashToken } from './tokens';

/** Same header and hashing every room-object route uses (see contributorSession.ts on the client):
 * the raw token never reaches the DB, only its hash — ownership is by hash, not accounts. */
export function sessionHashFrom(req: NextRequest): string | undefined {
  const raw = req.headers.get('x-contributor-session');
  return raw ? hashToken(raw) : undefined;
}

export type CustomItemApi = {
  id: string;
  name: string;
  width: number;
  height: number;
  size: number;
  source: 'import' | 'drawing';
  createdByRole: string;
  /** True when the requesting browser's contributor session created it (or the requester is the
   * host) — a display hint so the UI can hide Delete/Edit; the routes re-check for real. */
  mine: boolean;
  url: string;
};

export function toCustomItemApi(item: CustomItem, token: string, mine: boolean): CustomItemApi {
  return {
    id: item.id,
    name: item.name,
    width: item.width,
    height: item.height,
    size: item.size,
    source: item.source === 'drawing' ? 'drawing' : 'import',
    createdByRole: item.createdByRole,
    mine,
    // `v` changes whenever the bytes are replaced (a fresh storage key each time), so a long
    // browser-cache lifetime on the image route can never show a stale copy after an edit.
    url: `/api/rooms/${token}/custom-items/${item.id}/image?v=${item.storageKey.slice(0, 12)}`,
  };
}
