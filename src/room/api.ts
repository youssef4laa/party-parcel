import type { BoxContribution, PlacedBox } from '@/contribute/types';
import type { BoxDesign } from '@/box/types';

export type RoomInfo = {
  id: string;
  mode: 'room' | 'solo';
  title: string;
  celebrantName: string;
  age: number | null;
  occasion: string;
  bannerText: string;
  eventAt: string;
  timezone: string;
  unlocked: boolean;
  hostEmail?: string;
  status?: string;
  unlockedAt?: string | null;
  createdAt?: string;
};

export type RoomRole = 'admin' | 'contribute' | 'celebrate';

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function fetchRoom(token: string) {
  const res = await fetch(`/api/rooms/${token}`);
  return asJson<{ role: RoomRole; room: RoomInfo }>(res);
}

export async function fetchBoxes(token: string) {
  const res = await fetch(`/api/rooms/${token}/boxes`);
  const data = await asJson<{ boxes: PlacedBoxApi[] }>(res);
  return data.boxes;
}

export type PlacedBoxApi = {
  id: string;
  fromName: string;
  design: BoxDesign;
  x: number;
  y: number;
  z: number;
  placedAt: string;
  opened: boolean;
};

export async function createBox(token: string, contribution: BoxContribution, x: number, y: number) {
  const res = await fetch(`/api/rooms/${token}/boxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromName: contribution.fromName,
      design: contribution.design,
      x,
      y,
      goodies: contribution.goodies.map((g) => {
        const wire: Record<string, unknown> = { ...g };
        delete wire.id;
        return wire;
      }),
    }),
  });
  return asJson<{ id: string; deleteToken: string }>(res);
}

export async function deleteBox(token: string, boxId: string, deleteToken?: string) {
  const res = await fetch(`/api/rooms/${token}/boxes/${boxId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleteToken }),
  });
  return asJson<{ ok: true }>(res);
}

export async function unlockRoom(token: string) {
  const res = await fetch(`/api/rooms/${token}/unlock`, { method: 'POST' });
  return asJson<{ ok: true }>(res);
}

export type UploadKind = 'photo' | 'drawing' | 'video' | 'voice' | 'song' | 'photobooth';

/**
 * Two-phase presigned upload: ask for a PUT target, PUT the raw bytes straight there (our app
 * server never proxies them on the way in), then ask the server to validate+finalize what
 * landed. Works the same whether the target is our own local-storage PUT route or a real S3/R2
 * presigned URL — see src/server/storage.
 */
export async function uploadFile(token: string, file: File, kind: UploadKind = 'photo') {
  const init = await fetch(`/api/rooms/${token}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, contentType: file.type }),
  });
  const { uploadUrl, key } = await asJson<{ uploadUrl: string; key: string; maxBytes: number }>(init);

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

  const final = await fetch(`/api/rooms/${token}/uploads/${key}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  });
  return asJson<{ assetKey: string; mime: string; size: number; sha256: string }>(final);
}

export type BoxContents = {
  fromName: string;
  design: BoxDesign;
  goodies: Array<
    Record<string, unknown> & { id: string; type: string; sortOrder: number; assetUrls: string[]; redeemedAt: string | null }
  >;
};

export async function fetchBoxContents(boxId: string, celebrateToken: string) {
  const res = await fetch(`/api/boxes/${boxId}/contents?token=${encodeURIComponent(celebrateToken)}`);
  return asJson<BoxContents>(res);
}

export async function redeemCoupon(boxId: string, goodieId: string, celebrateToken: string) {
  const res = await fetch(`/api/boxes/${boxId}/goodies/${goodieId}/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: celebrateToken }),
  });
  return asJson<{ redeemedAt: string; alreadyRedeemed: boolean }>(res);
}

export type PhotoboothShotApi = { id: string; url: string; caption: string; createdAt: string };

export async function fetchPhotoboothShots(token: string) {
  const res = await fetch(`/api/rooms/${token}/photobooth`);
  const data = await asJson<{ shots: PhotoboothShotApi[] }>(res);
  return data.shots;
}

export async function createPhotoboothShot(token: string, assetKey: string) {
  const res = await fetch(`/api/rooms/${token}/photobooth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetKey }),
  });
  return asJson<PhotoboothShotApi & { deleteToken: string }>(res);
}

export async function deletePhotoboothShot(token: string, shotId: string, deleteToken?: string) {
  const res = await fetch(`/api/rooms/${token}/photobooth/${shotId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleteToken }),
  });
  return asJson<{ ok: true }>(res);
}

/** Adapts an API-backed room to the same shape RoomCanvas already speaks (see `PlacedBox`). */
export function toPlacedBox(b: PlacedBoxApi): PlacedBox {
  return {
    id: b.id,
    fromName: b.fromName,
    design: b.design,
    x: b.x,
    y: b.y,
    placedAt: Date.parse(b.placedAt),
    opened: b.opened,
  };
}
