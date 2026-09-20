import type { BoxContribution, PlacedBox } from './types';

/**
 * Local-storage-backed stand-in for the real API (Milestone 4 replaces this with actual
 * persistence + tokens + server-side birthday lock). Lets the contributor flow (pack/design/place)
 * be exercised end to end in the browser before there's a server to talk to.
 */
const boxesKey = (roomId: string) => `party-parcel:boxes:${roomId}`;
const contributionKey = (boxId: string) => `party-parcel:contribution:${boxId}`;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadPlacedBoxes(roomId: string): PlacedBox[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(boxesKey(roomId)), []);
}

function savePlacedBoxes(roomId: string, boxes: PlacedBox[]) {
  window.localStorage.setItem(boxesKey(roomId), JSON.stringify(boxes));
}

export function addPlacedBox(roomId: string, box: PlacedBox, contribution: BoxContribution) {
  const boxes = loadPlacedBoxes(roomId);
  boxes.push(box);
  savePlacedBoxes(roomId, boxes);
  window.localStorage.setItem(contributionKey(box.id), JSON.stringify(contribution));
}

export function removePlacedBox(roomId: string, boxId: string) {
  const boxes = loadPlacedBoxes(roomId).filter((b) => b.id !== boxId);
  savePlacedBoxes(roomId, boxes);
  window.localStorage.removeItem(contributionKey(boxId));
}

export function getContribution(boxId: string): BoxContribution | null {
  if (typeof window === 'undefined') return null;
  return safeParse(window.localStorage.getItem(contributionKey(boxId)), null);
}

export function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
