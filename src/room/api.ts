import type { BoxContribution, PlacedBox } from '@/contribute/types';
import { getOrCreateSessionToken } from './contributorSession';
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
  /** Display hint only — every mutation route re-checks the real rule server-side regardless of
   * what this says. See src/server/permissions.ts. */
  capabilities: string[];
  hostEmail?: string;
  status?: string;
  unlockedAt?: string | null;
  createdAt?: string;
  permissions?: RoomPermissions;
};

export type DecorateLevel = 'off' | 'own' | 'any';
export type RoomPermissions = {
  contributors: {
    canDecorate: DecorateLevel;
    canImport: boolean;
    canDraw: boolean;
    canMoveOwnPresents: boolean;
    maxItemsPerContributor: number;
  };
  celebrant: { canRearrange: boolean };
  freezeLayout: boolean;
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
  // The session header is how the server tells this browser which presents it packed ("mine") —
  // see contributorSession.ts; it only ever leaves the browser hashed.
  const res = await fetch(`/api/rooms/${token}/boxes`, { headers: { 'X-Contributor-Session': getOrCreateSessionToken(token) } });
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
  scale: number;
  mine: boolean;
  placedAt: string;
  opened: boolean;
};

function goodiesWire(goodies: BoxContribution['goodies']) {
  return goodies.map((g) => {
    const wire: Record<string, unknown> = { ...g };
    delete wire.id;
    return wire;
  });
}

export async function createBox(token: string, contribution: BoxContribution, x: number, y: number) {
  // A multi-gift box sends `gifts` (each with its own wrap + goodies); a single-gift box keeps the
  // original flat `goodies` shape, byte-for-byte what it always sent.
  const contents =
    contribution.gifts && contribution.gifts.length > 1
      ? {
          gifts: contribution.gifts.map((g) => ({ label: g.label, design: g.design, goodies: goodiesWire(g.goodies) })),
          openInOrder: contribution.openInOrder === true,
        }
      : { goodies: goodiesWire(contribution.goodies) };
  const res = await fetch(`/api/rooms/${token}/boxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Contributor-Session': getOrCreateSessionToken(token) },
    body: JSON.stringify({ fromName: contribution.fromName, design: contribution.design, x, y, ...contents }),
  });
  return asJson<{ id: string; deleteToken: string }>(res);
}

export type PresentPatch = Partial<{ x: number; y: number; z: number; scale: number }>;

/** Move/resize/reorder a placed present. `deleteToken` is the fallback ownership proof for the
 * present's packer when their session was cleared (see UpdatePresentSchema). */
export async function updateBox(token: string, boxId: string, patch: PresentPatch, deleteToken?: string) {
  const res = await fetch(`/api/rooms/${token}/boxes/${boxId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Contributor-Session': getOrCreateSessionToken(token) },
    body: JSON.stringify(deleteToken ? { ...patch, deleteToken } : patch),
  });
  return asJson<{ box: { id: string; x: number; y: number; z: number; scale: number } }>(res);
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
  // A live MediaRecorder's Blob.type carries codec parameters the server's allowlist doesn't
  // (and shouldn't need to) know about, e.g. 'audio/webm;codecs=opus' — strip them for the
  // init-phase type check. Harmless to strip generally: the actual PUT request below still sends
  // the full file.type as its Content-Type header, and the server never reads that header at all
  // (only the signed query param, which is derived from this same stripped value) — the real
  // content type is re-sniffed from the actual bytes at finalize time regardless.
  const contentType = file.type.split(';')[0].trim();
  const init = await fetch(`/api/rooms/${token}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, contentType }),
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

export type ContentsGoodie = Record<string, unknown> & {
  id: string;
  type: string;
  sortOrder: number;
  assetUrls: string[];
  redeemedAt: string | null;
};

export type ContentsGift = { id: string; label: string; design: Partial<BoxDesign>; sortOrder: number; goodies: ContentsGoodie[] };

export type BoxContents = {
  fromName: string;
  design: BoxDesign;
  /** Phase 4b: the recipient must open the inner gifts in order. */
  openInOrder: boolean;
  /** Every goodie in the box, flat and in order (what single-gift boxes have always used). */
  goodies: ContentsGoodie[];
  /** The same goodies grouped by the gift they're wrapped in; a single-gift box has exactly one. */
  gifts: ContentsGift[];
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
    scale: b.scale,
    z: b.z,
    mine: b.mine,
  };
}

// --- Room Editor ---

export type RoomObjectApi = {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  flipX: boolean;
  rotation: number;
  zone: string;
  locked: boolean;
  hidden: boolean;
  configJson: string;
  /** Set only for kind "custom": the CustomItem (room library entry) this object renders. */
  assetId: string | null;
  createdByRole: string;
  createdBySessionHash: string | null;
  createdAt: string;
  updatedAt: string;
};

function objectHeaders(sessionToken: string | undefined): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['X-Contributor-Session'] = sessionToken;
  return headers;
}

export async function fetchRoomObjects(token: string) {
  const res = await fetch(`/api/rooms/${token}/objects`);
  const data = await asJson<{ objects: RoomObjectApi[] }>(res);
  return data.objects;
}

export async function createRoomObject(
  token: string,
  sessionToken: string | undefined,
  input: {
    kind: string;
    x: number;
    y: number;
    zone: string;
    z?: number;
    scale?: number;
    flipX?: boolean;
    rotation?: number;
    configJson?: string;
    assetId?: string;
  },
) {
  const res = await fetch(`/api/rooms/${token}/objects`, {
    method: 'POST',
    headers: objectHeaders(sessionToken),
    body: JSON.stringify(input),
  });
  const data = await asJson<{ object: RoomObjectApi }>(res);
  return data.object;
}

export type RoomObjectPatch = Partial<{
  x: number;
  y: number;
  z: number;
  scale: number;
  flipX: boolean;
  rotation: number;
  locked: boolean;
  hidden: boolean;
  configJson: string;
  expectedUpdatedAt: string;
}>;

export async function updateRoomObject(
  token: string,
  sessionToken: string | undefined,
  objectId: string,
  patch: RoomObjectPatch,
) {
  const res = await fetch(`/api/rooms/${token}/objects/${objectId}`, {
    method: 'PATCH',
    headers: objectHeaders(sessionToken),
    body: JSON.stringify(patch),
  });
  const data = await asJson<{ object: RoomObjectApi }>(res);
  return data.object;
}

export async function deleteRoomObject(token: string, sessionToken: string | undefined, objectId: string) {
  const res = await fetch(`/api/rooms/${token}/objects/${objectId}`, {
    method: 'DELETE',
    headers: objectHeaders(sessionToken),
  });
  return asJson<{ ok: true }>(res);
}

export async function resetRoomObjects(token: string) {
  const res = await fetch(`/api/rooms/${token}/objects/reset`, { method: 'POST' });
  const data = await asJson<{ objects: RoomObjectApi[] }>(res);
  return data.objects;
}

export async function fetchRoomPermissions(token: string) {
  const res = await fetch(`/api/rooms/${token}/permissions`);
  const data = await asJson<{ permissions: RoomPermissions }>(res);
  return data.permissions;
}

export async function updateRoomPermissions(token: string, permissions: RoomPermissions) {
  const res = await fetch(`/api/rooms/${token}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(permissions),
  });
  const data = await asJson<{ permissions: RoomPermissions }>(res);
  return data.permissions;
}

// --- Custom items: the room's "My items" library ---

export type CustomItemApi = {
  id: string;
  name: string;
  width: number;
  height: number;
  size: number;
  source: 'import' | 'drawing';
  createdByRole: string;
  /** Display hint (this browser made it, or the caller is the host) — routes re-check for real. */
  mine: boolean;
  url: string;
};

export async function fetchCustomItems(token: string, sessionToken: string | undefined) {
  const res = await fetch(`/api/rooms/${token}/custom-items`, { headers: sessionToken ? { 'X-Contributor-Session': sessionToken } : {} });
  const data = await asJson<{ items: CustomItemApi[] }>(res);
  return data.items;
}

function customItemQuery(opts: { source?: 'import' | 'drawing'; name?: string }) {
  const q = new URLSearchParams();
  if (opts.source) q.set('source', opts.source);
  if (opts.name !== undefined) q.set('name', opts.name);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function createCustomItem(
  token: string,
  sessionToken: string | undefined,
  png: Blob,
  opts: { source: 'import' | 'drawing'; name: string },
) {
  const res = await fetch(`/api/rooms/${token}/custom-items${customItemQuery(opts)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', ...(sessionToken ? { 'X-Contributor-Session': sessionToken } : {}) },
    body: png,
  });
  const data = await asJson<{ item: CustomItemApi }>(res);
  return data.item;
}

export async function replaceCustomItem(
  token: string,
  sessionToken: string | undefined,
  itemId: string,
  png: Blob,
  opts: { source: 'import' | 'drawing'; name: string },
) {
  const res = await fetch(`/api/rooms/${token}/custom-items/${itemId}${customItemQuery(opts)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', ...(sessionToken ? { 'X-Contributor-Session': sessionToken } : {}) },
    body: png,
  });
  const data = await asJson<{ item: CustomItemApi }>(res);
  return data.item;
}

export async function deleteCustomItem(token: string, sessionToken: string | undefined, itemId: string) {
  const res = await fetch(`/api/rooms/${token}/custom-items/${itemId}`, {
    method: 'DELETE',
    headers: sessionToken ? { 'X-Contributor-Session': sessionToken } : {},
  });
  return asJson<{ ok: true; removedObjects: number }>(res);
}

/**
 * Host panel "Export a sealed copy": asks the server to build the sealed static site and returns it
 * as a zip Blob (plus the filename the server suggested). Throws the server's own message on refusal
 * (weak password, not the host, another export running).
 */
export async function exportSealedCopy(token: string, password: string) {
  const res = await fetch(`/api/rooms/${token}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Export failed (${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'party-parcel.zip';
  return { blob: await res.blob(), filename };
}
