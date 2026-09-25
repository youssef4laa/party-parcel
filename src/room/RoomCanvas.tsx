'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Application, Container, Sprite } from 'pixi.js';
import { attachCamera } from './scene/camera';
import { buildScene, mountBackground } from './scene/buildScene';
import { attachPlacement } from './scene/placement';
import { createBoxSprite, textureForDesign, animateSettle, attachHoverWobble } from './scene/presentBox';
import { showLabel } from './scene/interactions/label';
import { PhotoWall } from './scene/interactions/photobooth';
import { EditableObjectsLayer } from './scene/editableObjects';
import { customTextureFor, loadCustomTexture, forgetCustomTexture } from './scene/objectSprites';
import { defaultPlacementScale } from './pixelOps';
import { demoLayoutObjects } from './scene/demoObjects';
import { registerBannerText } from './manifest';
import FrameModal from './ui/FrameModal';
import PanHint from './ui/PanHint';
import ContributeFlow from '@/contribute/ContributeFlow';
import PhotoboothModal from '@/photobooth/PhotoboothModal';
import PrintModal from '@/photobooth/PrintModal';
import EditPanel from './edit/EditPanel';
import { LIMITS } from '@/config/limits';
import { createStubDataSource } from '@/contribute/stubDataSource';
import { getOrCreateSessionToken } from './contributorSession';
import {
  fetchRoomObjects,
  fetchCustomItems,
  createCustomItem,
  replaceCustomItem,
  deleteCustomItem,
  type CustomItemApi,
  createRoomObject,
  updateRoomObject,
  deleteRoomObject,
  resetRoomObjects,
  fetchRoomPermissions,
  updateRoomPermissions,
  type RoomObjectApi,
  type RoomObjectPatch,
  type RoomPermissions,
} from './api';
import type { RoomDataSource, PhotoboothShotView } from './dataSource';
import type { BoxContribution, PlacedBox } from '@/contribute/types';

export type RoomCanvasProps = {
  celebrantName?: string;
  age?: number;
  bannerText?: string;
  /** Defaults to the localStorage-backed demo stub, scoped to `roomId`. Pass a real
   * `createApiDataSource(token)` for token-scoped, persisted room pages. */
  dataSource?: RoomDataSource;
  roomId?: string;
  canContribute?: boolean;
  /** Only meaningful with a real data source: enables real (content-sniffed, EXIF-stripped) uploads. */
  roomToken?: string;
  /** From the room payload's `capabilities` list (src/server/permissions.ts) — a display hint
   * only, gating whether the pencil/edit-mode UI even shows. Every server mutation re-checks the
   * real rule independently, so this is never the actual security boundary. Room Editor is only
   * available with a real `roomToken` — the localStorage demo/static-export sandboxes don't get
   * it in this pass. */
  capabilities?: string[];
  isHost?: boolean;
  /** Custom handling for clicking an already-placed box (e.g. the celebrant's lock/unwrap flow).
   * Defaults to a simple "from {name}" label. */
  onBoxClick?: (box: PlacedBox) => void;
  /** Filled in once the scene is ready with a small imperative API (currently just
   * `markBoxOpened`) — a plain ref prop, simpler than forwarding a ref through the dynamic-import loader. */
  handleRef?: React.RefObject<RoomCanvasHandle | null>;
};

export type RoomCanvasHandle = {
  /** Swaps a placed box's sprite to its "opened" look (ribbon undone, lid ajar). */
  markBoxOpened: (boxId: string) => void;
};

type Engine = {
  app: Application;
  world: Container;
  camera: ReturnType<typeof attachCamera>;
  placement: ReturnType<typeof attachPlacement>;
  reducedMotion: boolean;
  boxSprites: Map<string, { sprite: Sprite; cleanup: () => void }>;
  photoWall: PhotoWall;
  editableLayer: EditableObjectsLayer;
};

const UNDO_WINDOW_MS = 60_000;
// A newly-added catalog item drops here — open floor between the wall props and the present
// pile — rather than dead center, so it doesn't immediately overlap the table/cake.
const ROOM_EDITOR_DEFAULT_X = 700;
const ROOM_EDITOR_DEFAULT_Y = 650;

/** A custom item's pixels arrive over the network, so its object is held back from the scene until
 * that texture is cached (loadCustomTexture) — otherwise it would first paint as an empty sprite. */
function renderableObjects(list: RoomObjectApi[]): RoomObjectApi[] {
  return list.filter((o) => o.kind !== 'custom' || (o.assetId !== null && customTextureFor(o.assetId) !== null));
}

export default function RoomCanvas({
  celebrantName = 'Alex',
  age,
  bannerText = 'HAPPY BIRTHDAY!',
  dataSource,
  roomId = 'demo-room',
  canContribute = true,
  roomToken,
  capabilities = [],
  isHost = false,
  onBoxClick,
  handleRef,
}: RoomCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  // The interactive/animated legacy scene (buildScene.ts) — a ref, not engine state, because it's
  // torn down and rebuilt independently of the rest of the engine whenever edit mode toggles (see
  // the effect below), while everything else in `engineRef` lives for the whole component mount.
  const legacySceneRef = useRef<{ destroy: () => void } | null>(null);
  const [source] = useState<RoomDataSource>(() => dataSource ?? createStubDataSource(roomId));
  const deleteTokensRef = useRef<Map<string, string>>(new Map());
  const designsRef = useRef<Map<string, PlacedBox['design']>>(new Map());
  const [enlargedFrame, setEnlargedFrame] = useState<'mountain' | 'tulip' | null>(null);
  const [ready, setReady] = useState(false);
  const [contributing, setContributing] = useState(false);
  const [placingHint, setPlacingHint] = useState(false);
  const [undoToast, setUndoToast] = useState<{ boxId: string; fromName: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [photoboothOpen, setPhotoboothOpen] = useState(false);
  const [viewingShot, setViewingShot] = useState<PhotoboothShotView | null>(null);
  const shotsRef = useRef<PhotoboothShotView[]>([]);

  // --- Room Editor state (docs/ROOM_EDITOR.md) — only meaningful with a real roomToken ---
  const [objects, setObjects] = useState<RoomObjectApi[]>([]);
  const objectsRef = useRef<RoomObjectApi[]>([]);
  const [editMode, setEditMode] = useState(false);
  // The panel's own ✕ only hides the panel — it must NOT drop edit mode itself, or dragging an
  // object becomes impossible to reach again without reopening the panel first (a real bug: the
  // panel used to sit on `onClose={() => setEditMode(false)}`, so closing it also turned off
  // `node.eventMode` for every editable object). The pencil button clears this back to false
  // whenever it turns edit mode on.
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<RoomPermissions | null>(null);
  const [customItems, setCustomItems] = useState<CustomItemApi[]>([]);
  const customItemsRef = useRef<CustomItemApi[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [sessionToken] = useState<string | undefined>(() => (roomToken ? getOrCreateSessionToken(roomToken) : undefined));
  const editModeRef = useRef(editMode);
  const selectedIdRef = useRef(selectedId);

  const syncObjects = useCallback((next: RoomObjectApi[]) => {
    objectsRef.current = next;
    setObjects(next);
    const engine = engineRef.current;
    if (engine) engine.editableLayer.setObjects(renderableObjects(next), editModeRef.current, selectedIdRef.current);
  }, []);
  useEffect(() => {
    editModeRef.current = editMode;
    engineRef.current?.editableLayer.setObjects(renderableObjects(objectsRef.current), editMode, selectedIdRef.current);
  }, [editMode]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    engineRef.current?.editableLayer.setObjects(renderableObjects(objectsRef.current), editModeRef.current, selectedId);
  }, [selectedId]);

  const placeBoxSprite = useCallback(
    (box: PlacedBox, animate: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;
      designsRef.current.set(box.id, box.design);
      const sprite = createBoxSprite(box.design, box.opened ? 'open' : 'closed');
      sprite.position.set(box.x, box.y);
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';
      sprite.accessible = true;
      sprite.accessibleTitle = `Sealed present from ${box.fromName}`;
      const removeWobble = attachHoverWobble(sprite, engine.app.ticker);
      sprite.on('pointertap', () => {
        if (engine.camera.drag.wasDragging) return;
        if (onBoxClick) {
          onBoxClick(box);
        } else {
          showLabel(engine.world, sprite.x, sprite.y - sprite.height - 10, `From ${box.fromName} · opens on the big day!`, 2400);
        }
      });
      engine.world.addChild(sprite);
      engine.boxSprites.set(box.id, { sprite, cleanup: removeWobble });
      if (animate) animateSettle(sprite, engine.app.ticker, engine.reducedMotion);
    },
    [onBoxClick],
  );

  const handleObjectMoved = useCallback(
    async (id: string, x: number, y: number) => {
      if (!roomToken) return;
      const existing = objectsRef.current.find((o) => o.id === id);
      try {
        const updated = await updateRoomObject(roomToken, sessionToken, id, {
          x,
          y,
          expectedUpdatedAt: existing?.updatedAt,
        });
        syncObjects(objectsRef.current.map((o) => (o.id === id ? updated : o)));
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Could not move that item.');
        // snap back to the server's last-known position by re-rendering from current state
        syncObjects(objectsRef.current);
      }
    },
    [roomToken, sessionToken, syncObjects],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    let app: Application | null = null;
    let photoWallInstance: PhotoWall | null = null;
    let cleanupCamera: (() => void) | null = null;

    async function init() {
      try {
        await Promise.all([
          document.fonts.load('10px "Press Start 2P"'),
          document.fonts.load('21px "Press Start 2P"'),
        ]);
      } catch {
        // font API not available or font failed to load — fall back to default rendering
      }
      if (destroyed || !host) return;

      registerBannerText(bannerText);

      const application = new Application();
      await application.init({
        resizeTo: host,
        backgroundColor: 0x0d0d1f,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (destroyed) {
        application.destroy(true);
        return;
      }
      app = application;
      application.canvas.style.imageRendering = 'pixelated';
      application.canvas.style.touchAction = 'none';
      host.appendChild(application.canvas);

      const world = new Container();
      application.stage.addChild(world);
      mountBackground(world);

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const camera = attachCamera(application, world, () => ({
        width: host.clientWidth,
        height: host.clientHeight,
      }));
      cleanupCamera = camera.destroy;

      // Room Editor: fetch placed objects before building the scene, so the very first paint
      // already reflects real positions/hidden state. The "/" sandbox and the static export have
      // no roomToken (no real RoomObject rows to fetch at all — see demoObjects.ts) and fall back
      // to the same default layout a brand-new real room seeds.
      let initialObjects: RoomObjectApi[] = roomToken ? [] : demoLayoutObjects(age);
      if (roomToken) {
        try {
          initialObjects = await fetchRoomObjects(roomToken);
          if (!destroyed) {
            objectsRef.current = initialObjects;
            setObjects(initialObjects);
          }
        } catch {
          // a failed initial objects fetch shouldn't block rendering the room — it just means an
          // empty (no legacy elements, no editable items) scene until the next successful fetch
        }
      }

      // The room's custom-item library: fetched (and every image decoded into a texture) before the
      // first paint, for the same reason the objects are — a placed custom item should never flash
      // in as an empty sprite. Best-effort: a failure just leaves custom items unrendered.
      if (roomToken) {
        try {
          const items = await fetchCustomItems(roomToken, sessionToken);
          await Promise.all(items.map((i) => loadCustomTexture(i.id, i.url).catch(() => undefined)));
          if (!destroyed) {
            customItemsRef.current = items;
            setCustomItems(items);
          }
        } catch {
          // see above
        }
      }

      // The interactive/animated legacy scene (window, cake, cat, ...) — torn down and rebuilt by
      // the editMode-toggle effect below, never rendered at the same time as edit mode's plain
      // draggable version of the same rows (EditableObjectsLayer). See buildScene's SceneCallbacks
      // doc comment.
      legacySceneRef.current = buildScene(application, world, camera.drag, {
        onEnlargeFrame: setEnlargedFrame,
        onOpenPhotobooth: () => setPhotoboothOpen(true),
        reducedMotion,
        objects: initialObjects,
      });

      // The photo-print wall isn't a catalog/RoomObject item (docs/ROOM_EDITOR.md never mentions
      // it) — it's always-present infrastructure beside the camera prop, so it's built once here,
      // independent of the legacy-scene rebuild cycle, and never torn down until unmount.
      photoWallInstance = new PhotoWall(world, 610, 90, (shot) => setViewingShot(shot));

      const placement = attachPlacement(application, camera);

      const editableLayer = new EditableObjectsLayer(
        world,
        camera.drag,
        () => camera.getScale(),
        application.ticker,
        (id) => setSelectedId(id),
        (id, x, y) => {
          void handleObjectMoved(id, x, y);
        },
      );
      editableLayer.setObjects(renderableObjects(initialObjects), editModeRef.current, selectedIdRef.current);

      engineRef.current = {
        app: application,
        world,
        camera,
        placement,
        reducedMotion,
        boxSprites: new Map(),
        photoWall: photoWallInstance,
        editableLayer,
      };

      try {
        const boxes = await source.list();
        if (!destroyed) for (const box of boxes) placeBoxSprite(box, false);
      } catch {
        // demo/dev only — a failed initial box list shouldn't block rendering the room
      }

      try {
        const shots = await source.photobooth.list();
        shotsRef.current = shots;
        if (!destroyed) await photoWallInstance.setShots(shots);
      } catch {
        // a failed initial photo-wall fetch shouldn't block rendering the room either
      }

      setReady(true);
      if (handleRef) {
        handleRef.current = {
          markBoxOpened(boxId: string) {
            const entry = engineRef.current?.boxSprites.get(boxId);
            const design = designsRef.current.get(boxId);
            if (!entry || !design) return;
            entry.sprite.texture = textureForDesign(design, 'open');
          },
        };
      }
    }

    init();

    return () => {
      destroyed = true;
      legacySceneRef.current?.destroy();
      legacySceneRef.current = null;
      photoWallInstance?.destroy();
      cleanupCamera?.();
      engineRef.current?.placement.destroy();
      engineRef.current?.editableLayer.destroy();
      engineRef.current = null;
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, [bannerText, placeBoxSprite, source, handleRef, roomToken, handleObjectMoved, age, sessionToken]);

  // Rebuilds the interactive/animated legacy scene whenever edit mode toggles off (or, on the
  // very first render, is skipped — the main init effect above already built it once). Turning
  // edit mode ON tears it down with no replacement here (EditableObjectsLayer, always mounted,
  // takes over rendering the same rows as plain draggable nodes for the duration); turning it OFF
  // rebuilds it fresh from whatever `objectsRef.current` holds at that moment — which reflects
  // every move/resize/hide made while editing, since those mutations update it as they land.
  const skippedFirstEditModeToggle = useRef(false);
  useEffect(() => {
    if (!skippedFirstEditModeToggle.current) {
      skippedFirstEditModeToggle.current = true;
      return;
    }
    const engine = engineRef.current;
    if (!engine) return;
    legacySceneRef.current?.destroy();
    legacySceneRef.current = null;
    if (!editMode) {
      legacySceneRef.current = buildScene(engine.app, engine.world, engine.camera.drag, {
        onEnlargeFrame: setEnlargedFrame,
        onOpenPhotobooth: () => setPhotoboothOpen(true),
        reducedMotion: engine.reducedMotion,
        objects: objectsRef.current,
      });
    }
  }, [editMode]);

  useEffect(() => {
    if (!isHost || !roomToken) return;
    fetchRoomPermissions(roomToken)
      .then((p) => setPermissions(p))
      .catch(() => {
        // host-only fetch; a failure just means the Permissions tab shows "Loading…" — not
        // worth surfacing as a blocking error for a tab that might never be opened
      });
  }, [isHost, roomToken]);

  const handleAddItem = useCallback(
    async (kind: string) => {
      if (!roomToken) return;
      setEditError(null);
      try {
        const created = await createRoomObject(roomToken, sessionToken, {
          kind,
          x: ROOM_EDITOR_DEFAULT_X,
          y: ROOM_EDITOR_DEFAULT_Y,
          zone: 'anywhere',
        });
        syncObjects([...objectsRef.current, created]);
        setSelectedId(created.id);
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Could not add that item.');
      }
    },
    [roomToken, sessionToken, syncObjects],
  );

  // --- Custom items: the room's "My items" library (docs/ROOM_EDITOR.md Phase 3) ---
  // These throw on failure instead of setting `editError`: the Draw & Import tab shows the message
  // next to the control that caused it (a too-big file, a full library), not in a global toast.

  const refreshLibrary = useCallback(async () => {
    if (!roomToken) return [];
    const items = await fetchCustomItems(roomToken, sessionToken);
    const ids = new Set(items.map((i) => i.id));
    for (const old of customItemsRef.current) if (!ids.has(old.id)) forgetCustomTexture(old.id);
    await Promise.all(items.map((i) => loadCustomTexture(i.id, i.url).catch(() => undefined)));
    customItemsRef.current = items;
    setCustomItems(items);
    // Re-sync the scene: placed copies of an edited item pick up its new texture, and objects that
    // were held back waiting for their texture appear.
    engineRef.current?.editableLayer.setObjects(renderableObjects(objectsRef.current), editModeRef.current, selectedIdRef.current);
    return items;
  }, [roomToken, sessionToken]);

  const handleCreateCustomItem = useCallback(
    async (png: Blob, opts: { source: 'import' | 'drawing'; name: string }) => {
      if (!roomToken) throw new Error('Not available here.');
      const item = await createCustomItem(roomToken, sessionToken, png, opts);
      await refreshLibrary();
      return item;
    },
    [roomToken, sessionToken, refreshLibrary],
  );

  const handleReplaceCustomItem = useCallback(
    async (itemId: string, png: Blob, opts: { source: 'import' | 'drawing'; name: string }) => {
      if (!roomToken) throw new Error('Not available here.');
      const item = await replaceCustomItem(roomToken, sessionToken, itemId, png, opts);
      await refreshLibrary();
      return item;
    },
    [roomToken, sessionToken, refreshLibrary],
  );

  const handleDeleteCustomItem = useCallback(
    async (itemId: string) => {
      if (!roomToken) throw new Error('Not available here.');
      await deleteCustomItem(roomToken, sessionToken, itemId);
      // The server removed every placed copy too — pull the fresh object list so none linger.
      syncObjects(await fetchRoomObjects(roomToken));
      setSelectedId(null);
      await refreshLibrary();
    },
    [roomToken, sessionToken, refreshLibrary, syncObjects],
  );

  const handlePlaceCustomItem = useCallback(
    async (item: CustomItemApi) => {
      if (!roomToken) return;
      setEditError(null);
      try {
        const created = await createRoomObject(roomToken, sessionToken, {
          kind: 'custom',
          assetId: item.id,
          x: ROOM_EDITOR_DEFAULT_X,
          y: ROOM_EDITOR_DEFAULT_Y,
          zone: 'anywhere',
          scale: defaultPlacementScale(item.width, item.height, { min: LIMITS.minObjectScale, max: LIMITS.maxObjectScale }),
        });
        syncObjects([...objectsRef.current, created]);
        setSelectedId(created.id);
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Could not place that item.');
      }
    },
    [roomToken, sessionToken, syncObjects],
  );

  const handleUpdateSelected = useCallback(
    async (patch: RoomObjectPatch) => {
      if (!roomToken || !selectedId) return;
      const existing = objectsRef.current.find((o) => o.id === selectedId);
      setEditError(null);
      try {
        const updated = await updateRoomObject(roomToken, sessionToken, selectedId, {
          ...patch,
          expectedUpdatedAt: existing?.updatedAt,
        });
        syncObjects(objectsRef.current.map((o) => (o.id === selectedId ? updated : o)));
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Could not update that item.');
      }
    },
    [roomToken, sessionToken, selectedId, syncObjects],
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!roomToken || !selectedId) return;
    setEditError(null);
    try {
      await deleteRoomObject(roomToken, sessionToken, selectedId);
      syncObjects(objectsRef.current.filter((o) => o.id !== selectedId));
      setSelectedId(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not delete that item.');
    }
  }, [roomToken, sessionToken, selectedId, syncObjects]);

  const handleResetLayout = useCallback(async () => {
    if (!roomToken) return;
    setEditError(null);
    try {
      const next = await resetRoomObjects(roomToken);
      syncObjects(next);
      setSelectedId(null);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not reset the layout.');
    }
  }, [roomToken, syncObjects]);

  const handleSavePermissions = useCallback(
    async (next: RoomPermissions) => {
      if (!roomToken) return;
      setEditError(null);
      try {
        setPermissions(await updateRoomPermissions(roomToken, next));
      } catch (e) {
        setEditError(e instanceof Error ? e.message : 'Could not save permissions.');
      }
    },
    [roomToken],
  );

  const commitPlacement = useCallback(
    async (contribution: BoxContribution, x: number, y: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      // simple stacking: settle a bit higher for each existing box already near this x
      const nearby = [...engine.boxSprites.values()].filter(
        ({ sprite: s }) => Math.abs(s.x - x) < 36 && Math.abs(s.y - y) < 220,
      );
      const stackedY = y - nearby.length * 20;

      setPlacingHint(false);
      try {
        const { id, deleteToken } = await source.create(contribution, x, stackedY);
        if (deleteToken) deleteTokensRef.current.set(id, deleteToken);
        const box: PlacedBox = { id, fromName: contribution.fromName, design: contribution.design, x, y: stackedY, placedAt: Date.now() };
        placeBoxSprite(box, true);

        setUndoToast({ boxId: box.id, fromName: box.fromName });
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => setUndoToast(null), UNDO_WINDOW_MS);
      } catch (e) {
        showLabel(engine.world, x, y - 40, e instanceof Error ? e.message : 'Could not place that present.', 3000);
      }
    },
    [source, placeBoxSprite],
  );

  function handleReadyToPlace(contribution: BoxContribution) {
    setContributing(false);
    setPlacingHint(true);
    engineRef.current?.placement.start(contribution.design, (x, y) => commitPlacement(contribution, x, y));
  }

  function cancelPlacing() {
    engineRef.current?.placement.cancel();
    setPlacingHint(false);
  }

  async function undoLastPlacement() {
    if (!undoToast) return;
    const engine = engineRef.current;
    const entry = engine?.boxSprites.get(undoToast.boxId);
    entry?.cleanup();
    entry?.sprite.destroy();
    engine?.boxSprites.delete(undoToast.boxId);
    const deleteToken = deleteTokensRef.current.get(undoToast.boxId);
    setUndoToast(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    try {
      await source.remove(undoToast.boxId, deleteToken);
    } catch {
      // best-effort — the sprite is already gone client-side
    }
  }

  async function handleCapturePhoto(photo: Blob) {
    const shot = await source.photobooth.add(photo, celebrantName);
    shotsRef.current = [...shotsRef.current, shot];
    await engineRef.current?.photoWall.setShots(shotsRef.current);
  }

  async function handleDeleteShot(shot: PhotoboothShotView) {
    await source.photobooth.remove(shot);
    shotsRef.current = shotsRef.current.filter((s) => s.id !== shot.id);
    await engineRef.current?.photoWall.setShots(shotsRef.current);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d0d1f]">
      <div ref={hostRef} className="h-full w-full" role="application" aria-label="Party room" />
      {ready && !placingHint && <PanHint />}

      {ready && canContribute && !contributing && !placingHint && (
        <button
          type="button"
          onClick={() => setContributing(true)}
          aria-label="Add a present"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center border-4 border-[#ff3d8b] bg-[#fff6d5] font-pixel text-lg text-[#ff3d8b] shadow-[3px_3px_0_rgba(0,0,0,0.35)] hover:bg-[#ff3d8b] hover:text-[#fff6d5]"
        >
          +
        </button>
      )}

      {/* Room Editor (docs/ROOM_EDITOR.md 1b): rendered only when the room payload's
          capabilities list grants it — but this is a display hint, never the actual boundary;
          every mutation route re-checks the real rule independently regardless of whether this
          button is even shown. */}
      {ready && roomToken && capabilities.includes('objects:edit-mode') && !placingHint && (
        <button
          type="button"
          onClick={() => {
            // Off → on: enter edit mode with the panel showing. On + panel hidden: bring the
            // panel back without dropping edit mode. On + panel showing: this is the "I'm done"
            // gesture, so exit edit mode entirely.
            if (!editMode) {
              setEditMode(true);
              setPanelCollapsed(false);
            } else if (panelCollapsed) {
              setPanelCollapsed(false);
            } else {
              setEditMode(false);
            }
          }}
          aria-label={editMode && !panelCollapsed ? 'Exit edit mode' : 'Edit room'}
          aria-pressed={editMode}
          className={`absolute top-3 flex h-10 w-10 items-center justify-center border-4 font-pixel text-base shadow-[3px_3px_0_rgba(0,0,0,0.35)] ${
            canContribute ? 'right-16' : 'right-3'
          } ${editMode ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#ff3d8b] bg-[#fff6d5] text-[#ff3d8b] hover:bg-[#ff3d8b] hover:text-[#fff6d5]'}`}
        >
          ✏️
        </button>
      )}

      {editMode && roomToken && !panelCollapsed && (
        <EditPanel
          capabilities={capabilities}
          objects={objects}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddItem={handleAddItem}
          onUpdateSelected={handleUpdateSelected}
          onDeleteSelected={handleDeleteSelected}
          onResetLayout={handleResetLayout}
          onClose={() => setPanelCollapsed(true)}
          isHost={isHost}
          permissions={permissions}
          onSavePermissions={handleSavePermissions}
          age={age}
          customItems={customItems}
          onCreateCustomItem={handleCreateCustomItem}
          onReplaceCustomItem={handleReplaceCustomItem}
          onDeleteCustomItem={handleDeleteCustomItem}
          onPlaceCustomItem={handlePlaceCustomItem}
        />
      )}

      {editError && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 border-2 border-[#ff3d8b] bg-[#fff6d5] px-3 py-2 font-mono text-sm text-[#5e3620]">
          {editError}
          <button type="button" onClick={() => setEditError(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      {placingHint && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border-2 border-[#ff3d8b] bg-[#fff6d5]/95 px-3 py-1.5 text-center font-mono text-xs text-[#5e3620]">
          Drag your present anywhere in the room · arrow keys + Enter also work
        </div>
      )}
      {placingHint && (
        <button
          type="button"
          onClick={cancelPlacing}
          className="absolute bottom-3 right-3 border-2 border-[#5e3620] bg-[#fff6d5] px-3 py-1.5 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
        >
          Cancel
        </button>
      )}

      <div className="pointer-events-none absolute bottom-2 left-0 right-0 text-center">
        <p className="font-mono text-sm text-[#fff6d5] drop-shadow-[0_1px_0_rgba(0,0,0,0.8)]">
          {celebrantName}
          {age ? `'s ${age}th birthday!` : "'s birthday!"}
        </p>
      </div>

      {enlargedFrame && <FrameModal subject={enlargedFrame} onClose={() => setEnlargedFrame(null)} />}

      {photoboothOpen && <PhotoboothModal onCapture={handleCapturePhoto} onClose={() => setPhotoboothOpen(false)} />}

      {viewingShot && (
        <PrintModal shot={viewingShot} onClose={() => setViewingShot(null)} onDelete={handleDeleteShot} />
      )}

      {contributing && (
        <ContributeFlow onCancel={() => setContributing(false)} onReadyToPlace={handleReadyToPlace} roomToken={roomToken} />
      )}

      {undoToast && (
        <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-3 border-2 border-[#5e3620] bg-[#fff6d5] px-3 py-2 font-mono text-sm text-[#5e3620] shadow-[3px_3px_0_rgba(0,0,0,0.3)]">
          <span>Present placed from {undoToast.fromName}.</span>
          <button
            type="button"
            onClick={undoLastPlacement}
            className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-2 py-1 text-[#fff6d5]"
          >
            Oops, take it back
          </button>
        </div>
      )}
    </div>
  );
}
