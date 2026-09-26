import { formatPhotoboothCaption } from '@/photobooth/caption';
import type { PhotoboothShotView } from './dataSource';

/**
 * Browser-only photobooth shots, stored as base64 data URLs in localStorage — never sent to any
 * server. Used by two places that have no backend to persist to: the "/" localStorage demo page
 * (`stubDataSource.ts`), and the static export (`StaticRoomApp.tsx`), so that shots taken while viewing an exported room stay in that visitor's browser
 * only. `ns` namespaces the storage key (room id for the demo page, a fixed key for the export).
 */
function storageKey(ns: string) {
  return `party-parcel-photobooth:${ns}`;
}

type StoredShot = { id: string; dataUrl: string; caption: string; createdAt: number };

function load(ns: string): StoredShot[] {
  try {
    const raw = localStorage.getItem(storageKey(ns));
    return raw ? (JSON.parse(raw) as StoredShot[]) : [];
  } catch {
    return [];
  }
}

function save(ns: string, shots: StoredShot[]) {
  try {
    localStorage.setItem(storageKey(ns), JSON.stringify(shots));
  } catch {
    // localStorage unavailable (private mode, quota) — shot just won't survive a reload
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.readAsDataURL(blob);
  });
}

function toView(s: StoredShot): PhotoboothShotView {
  return { id: s.id, url: s.dataUrl, caption: s.caption, createdAt: s.createdAt, canDelete: true };
}

export function listLocalPhotoboothShots(ns: string): PhotoboothShotView[] {
  return load(ns).map(toView);
}

export async function addLocalPhotoboothShot(ns: string, photo: Blob, celebrantName: string): Promise<PhotoboothShotView> {
  const dataUrl = await blobToDataURL(photo);
  const shot: StoredShot = {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    caption: formatPhotoboothCaption(celebrantName),
    createdAt: Date.now(),
  };
  const shots = load(ns);
  shots.push(shot);
  save(ns, shots);
  return toView(shot);
}

export function removeLocalPhotoboothShot(ns: string, id: string) {
  save(ns, load(ns).filter((s) => s.id !== id));
}
