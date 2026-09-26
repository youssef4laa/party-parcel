'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';
import { createRoomObject, deleteRoomObject, updateRoomObject, type RoomObjectApi, type RoomObjectPatch } from '../api';

/**
 * Undo/redo for room-object edits. Every edit the panel or the
 * canvas makes goes through here, so each one is (1) sent to the server, which stays the only
 * authority on whether it's allowed, and (2) if it succeeded, recorded as a pair of "how to take it
 * back" / "how to do it again" functions. Undoing replays those against the SERVER too — it is a
 * normal edit, subject to the same permission checks — rather than only rewinding local state.
 *
 * The one wrinkle is that deleting an object and then undoing that must RE-CREATE it, and the new row
 * gets a new id. Every entry therefore stores the id it first knew the object by, and `alias`
 * remembers what that id currently is, so older entries still find the object after it comes back.
 */

const MAX_HISTORY = 100;
type Entry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> };

export type CreateInput = {
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
};

const toCreateInput = (o: RoomObjectApi): CreateInput => ({
  kind: o.kind,
  x: o.x,
  y: o.y,
  zone: o.zone,
  z: o.z,
  scale: o.scale,
  flipX: o.flipX,
  rotation: o.rotation,
  configJson: o.configJson,
  ...(o.assetId ? { assetId: o.assetId } : {}),
});

/** The values a patch is about to overwrite, so undo can restore exactly them. */
function beforeValues(existing: RoomObjectApi, patch: RoomObjectPatch): RoomObjectPatch {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as Array<keyof RoomObjectPatch>) {
    if (key === 'expectedUpdatedAt') continue;
    before[key] = existing[key as keyof RoomObjectApi];
  }
  return before as RoomObjectPatch;
}

export function useEditHistory(deps: {
  roomToken: string | undefined;
  sessionToken: string | undefined;
  objectsRef: RefObject<RoomObjectApi[]>;
  syncObjects: (next: RoomObjectApi[]) => void;
  setEditError: (message: string | null) => void;
}) {
  const { roomToken, sessionToken, objectsRef, syncObjects, setEditError } = deps;
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<Entry[]>([]);
  const alias = useRef(new Map<string, string>());
  // EVERYTHING that touches history runs through one queue: edits, adds, deletes, undos and redos.
  // Two quick Ctrl+Z presses are two undos, run in order (not one dropped) — and, just as important,
  // an undo pressed while an edit is still in flight waits for that edit to finish AND be recorded.
  // (Without this, Delete followed instantly by Ctrl+Z could run before the delete had been
  // recorded, and undo the wrong thing — the server removes the row before the client hears back.)
  const queue = useRef<Promise<void>>(Promise.resolve());
  const serial = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(task);
    queue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });
  const refresh = useCallback(() => setCounts({ undo: undoStack.current.length, redo: redoStack.current.length }), []);

  const current = (id: string) => alias.current.get(id) ?? id;
  const push = useCallback(
    (entry: Entry) => {
      undoStack.current.push(entry);
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      refresh();
    },
    [refresh],
  );

  // --- the raw server operations (never record history themselves) ---

  const patchNow = useCallback(
    async (id: string, patch: RoomObjectPatch, withStaleCheck: boolean) => {
      if (!roomToken) throw new Error('Not available here.');
      const live = objectsRef.current.find((o) => o.id === id);
      const updated = await updateRoomObject(roomToken, sessionToken, id, {
        ...patch,
        // The stale-write guard protects a fresh user edit from clobbering someone else's change. An
        // undo/redo is deliberately "put it back the way it was", so it doesn't send one.
        ...(withStaleCheck && live ? { expectedUpdatedAt: live.updatedAt } : {}),
      });
      syncObjects(objectsRef.current.map((o) => (o.id === id ? updated : o)));
      return updated;
    },
    [roomToken, sessionToken, objectsRef, syncObjects],
  );

  const createNow = useCallback(
    async (input: CreateInput, flags?: { locked?: boolean; hidden?: boolean }) => {
      if (!roomToken) throw new Error('Not available here.');
      let created = await createRoomObject(roomToken, sessionToken, input);
      // locked/hidden aren't accepted at creation, so a restored locked/hidden object gets them next
      if (flags?.locked || flags?.hidden) {
        created = await updateRoomObject(roomToken, sessionToken, created.id, { locked: flags.locked, hidden: flags.hidden });
      }
      syncObjects([...objectsRef.current, created]);
      return created;
    },
    [roomToken, sessionToken, objectsRef, syncObjects],
  );

  const deleteNow = useCallback(
    async (id: string) => {
      if (!roomToken) throw new Error('Not available here.');
      await deleteRoomObject(roomToken, sessionToken, id);
      syncObjects(objectsRef.current.filter((o) => o.id !== id));
    },
    [roomToken, sessionToken, objectsRef, syncObjects],
  );

  // --- the recorded operations the editor calls ---

  /** Edit an object. `before` overrides what undo restores (used by keyboard nudging, which shows
   * optimistic positions before it commits and so can't read "before" from the live list). */
  const updateObject = useCallback(
    (id: string, patch: RoomObjectPatch, opts?: { before?: RoomObjectPatch }): Promise<RoomObjectApi | null> =>
      serial(async () => {
        const existing = objectsRef.current.find((o) => o.id === current(id));
        if (!existing) return null;
        const before = opts?.before ?? beforeValues(existing, patch);
        setEditError(null);
        try {
          const updated = await patchNow(existing.id, patch, true);
          const origin = id;
          push({
            label: 'edit',
            undo: async () => void (await patchNow(current(origin), before, false)),
            redo: async () => void (await patchNow(current(origin), patch, false)),
          });
          return updated;
        } catch (e) {
          setEditError(e instanceof Error ? e.message : 'Could not update that item.');
          syncObjects(objectsRef.current); // snap any optimistic/dragged node back to the last known state
          return null;
        }
      }),
    [objectsRef, patchNow, push, serial, setEditError, syncObjects],
  );

  const addObject = useCallback(
    (input: CreateInput): Promise<RoomObjectApi | null> =>
      serial(async () => {
      setEditError(null);
      try {
        const created = await createNow(input);
        const origin = created.id;
        let snapshot = created;
        push({
          label: 'add',
          undo: async () => {
            const live = objectsRef.current.find((o) => o.id === current(origin));
            if (live) snapshot = live;
            await deleteNow(current(origin));
          },
          redo: async () => {
            const again = await createNow(toCreateInput(snapshot), { locked: snapshot.locked, hidden: snapshot.hidden });
            alias.current.set(origin, again.id);
          },
        });
        return created;
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Could not add that item.');
        return null;
      }
      }),
    [createNow, deleteNow, objectsRef, push, serial, setEditError],
  );

  const removeObject = useCallback(
    (id: string): Promise<boolean> =>
      serial(async () => {
      const snapshot = objectsRef.current.find((o) => o.id === current(id));
      if (!snapshot) return false;
      setEditError(null);
      try {
        await deleteNow(snapshot.id);
        const origin = id;
        push({
          label: 'delete',
          undo: async () => {
            const back = await createNow(toCreateInput(snapshot), { locked: snapshot.locked, hidden: snapshot.hidden });
            alias.current.set(origin, back.id);
          },
          redo: async () => deleteNow(current(origin)),
        });
        return true;
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Could not delete that item.');
        return false;
      }
      }),
    [createNow, deleteNow, objectsRef, push, serial, setEditError],
  );

  /** A copy, offset a little so it doesn't sit exactly on the original. Returns the copy. */
  const duplicateObject = useCallback(
    async (id: string, offset: { x: number; y: number }, place?: (x: number, y: number) => { x: number; y: number }) => {
      const original = objectsRef.current.find((o) => o.id === id);
      if (!original) return null;
      const spot = (place ?? ((x, y) => ({ x, y })))(original.x + offset.x, original.y + offset.y);
      return addObject({ ...toCreateInput(original), x: spot.x, y: spot.y });
    },
    [addObject, objectsRef],
  );

  /** Record an edit that something else already applied (present moves go through their own route). */
  const recordExternal = useCallback(
    (entry: Omit<Entry, 'label'>) => push({ label: 'external', ...entry }),
    [push],
  );

  // --- undo / redo ---

  const run = useCallback(
    (from: RefObject<Entry[]>, to: RefObject<Entry[]>, which: 'undo' | 'redo') =>
      serial(async () => {
        const entry = from.current.pop();
        if (!entry) return;
        refresh();
        setEditError(null);
        try {
          await entry[which]();
          to.current.push(entry);
        } catch (e) {
          // The entry is dropped: replaying it failed (e.g. the right was revoked, or the item is gone).
          setEditError(e instanceof Error ? `Couldn't ${which}: ${e.message}` : `Couldn't ${which}.`);
        } finally {
          refresh();
        }
      }),
    [refresh, serial, setEditError],
  );
  const undo = useCallback(() => run(undoStack, redoStack, 'undo'), [run]);
  const redo = useCallback(() => run(redoStack, undoStack, 'redo'), [run]);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    alias.current.clear();
    refresh();
  }, [refresh]);

  return {
    updateObject,
    addObject,
    removeObject,
    duplicateObject,
    recordExternal,
    serial,
    undo,
    redo,
    clear,
    canUndo: counts.undo > 0,
    canRedo: counts.redo > 0,
  };
}
