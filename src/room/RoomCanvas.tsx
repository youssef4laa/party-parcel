'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { attachCamera } from './scene/camera';
import { buildScene, mountBackground } from './scene/buildScene';
import { attachPlacement } from './scene/placement';
import { createBoxSprite, textureForDesign, animateSettle, attachHoverWobble, boxWorldSize } from './scene/presentBox';
import { showLabel } from './scene/interactions/label';
import { PhotoWall } from './scene/interactions/photobooth';
import { EditableObjectsLayer } from './scene/editableObjects';
import { customTextureFor, loadCustomTexture, forgetCustomTexture } from './scene/objectSprites';
import { defaultPlacementScale } from './pixelOps';
import { useEditHistory } from './edit/useEditHistory';
import { OBJECT_CATALOG } from './objectCatalog';
import { GRID_SIZE, clampToZone, defaultPositionFor, snapScale, snapToGrid, stepScale } from './zones';
import { demoLayoutObjects } from './scene/demoObjects';
import { registerBannerText } from './manifest';
import FrameModal from './ui/FrameModal';
import PanHint from './ui/PanHint';
import ContributeFlow from '@/contribute/ContributeFlow';
import PhotoboothModal from '@/photobooth/PhotoboothModal';
import PrintModal from '@/photobooth/PrintModal';
import EditPanel from './edit/EditPanel';
import { getDropZones, nearestPointInZones } from './constants';
import { LIMITS } from '@/config/limits';
import { createStubDataSource } from '@/contribute/stubDataSource';
import { getOrCreateSessionToken } from './contributorSession';
import {
  fetchRoomObjects,
  fetchCustomItems,
  updateBox,
  type PresentPatch,
  createCustomItem,
  replaceCustomItem,
  deleteCustomItem,
  type CustomItemApi,
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
  /** The static export's baked layout. Only used when there is no
   * `roomToken` (i.e. no server): the read-only exported site renders exactly the objects the host
   * left in the room instead of the default layout. Must be a stable reference (memoize it) — a new
   * array identity rebuilds the whole scene. */
  staticObjects?: RoomObjectApi[];
  /** The images those objects use (`kind: "custom"`), as URLs relative to the exported page. */
  staticCustomItems?: Array<{ id: string; url: string }>;
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

/** Room objects are only grabbable in edit mode by someone who may edit objects — a contributor who
 * may only move presents still sees the edit-mode render, but can't drag the furniture. */
function objectsInteractive(edit: boolean, capabilities: string[]) {
  return edit && capabilities.includes('objects:edit-mode');
}

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
  staticObjects,
  staticCustomItems,
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

  // --- Room Editor state — only meaningful with a real roomToken ---
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
  // Placed presents: the live placement data (position, scale, z, and
  // whether this browser may move it) behind each sprite, mirrored into state for the edit panel.
  const presentsRef = useRef<Map<string, PlacedBox>>(new Map());
  const outlinesRef = useRef<Map<string, Graphics>>(new Map());
  const [presents, setPresents] = useState<PlacedBox[]>([]);
  const [selectedPresentId, setSelectedPresentId] = useState<string | null>(null);
  const capabilitiesRef = useRef(capabilities);
  const rebuildPresentsState = useCallback(() => setPresents([...presentsRef.current.values()]), []);
  /** Display-hint mirror of the server's canMovePresent (permissions.ts) — the PATCH re-checks. */
  const canMovePresentHint = useCallback(
    (box: PlacedBox) =>
      capabilitiesRef.current.includes('presents:move-any') ||
      (capabilitiesRef.current.includes('presents:move-own') && box.mine === true),
    [],
  );
  const customItemsRef = useRef<CustomItemApi[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [sessionToken] = useState<string | undefined>(() => (roomToken ? getOrCreateSessionToken(roomToken) : undefined));
  const editModeRef = useRef(editMode);
  const selectedIdRef = useRef(selectedId);
  // Editing preferences: snap-to-grid, free-scale (default off: integer scale
  // steps so pixels stay crisp), and — host only — "place anywhere", which lifts the zone limit.
  const [snapOn, setSnapOn] = useState(false);
  const [freeScale, setFreeScale] = useState(false);
  const [placeAnywhere, setPlaceAnywhere] = useState(false);
  const prefsRef = useRef({ snapOn: false, freeScale: false, placeAnywhere: false, isHost });
  useEffect(() => {
    prefsRef.current = { snapOn, freeScale, placeAnywhere: isHost && placeAnywhere, isHost };
  }, [snapOn, freeScale, placeAnywhere, isHost]);

  const syncObjects = useCallback((next: RoomObjectApi[]) => {
    objectsRef.current = next;
    setObjects(next);
    // If an undo/redo/delete removed the selected object, the selection goes with it. One that still
    // exists stays selected, so you can keep working on it (e.g. undo a move, then nudge it).
    if (selectedIdRef.current && !next.some((o) => o.id === selectedIdRef.current)) setSelectedId(null);
    const engine = engineRef.current;
    if (engine) engine.editableLayer.setObjects(renderableObjects(next), editModeRef.current, selectedIdRef.current, objectsInteractive(editModeRef.current, capabilitiesRef.current));
  }, []);
  useEffect(() => {
    editModeRef.current = editMode;
    engineRef.current?.editableLayer.setObjects(renderableObjects(objectsRef.current), editMode, selectedIdRef.current, objectsInteractive(editMode, capabilitiesRef.current));
  }, [editMode]);
  useEffect(() => {
    capabilitiesRef.current = capabilities;
  }, [capabilities]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    engineRef.current?.editableLayer.setObjects(renderableObjects(objectsRef.current), editModeRef.current, selectedId, objectsInteractive(editModeRef.current, capabilitiesRef.current));
  }, [selectedId]);

  // Destructured on purpose: the hook returns a fresh object every render, but each function in it is
  // stable. Depending on the object would change `persistPresent` -> `placeBoxSprite` every render,
  // and `placeBoxSprite` is a dependency of the scene-build effect — i.e. it would rebuild the
  // entire Pixi scene on every render.
  const {
    updateObject, addObject, removeObject, duplicateObject, recordExternal, serial, undo, redo, clear: clearHistory, canUndo, canRedo,
  } = useEditHistory({
    roomToken,
    sessionToken,
    objectsRef,
    syncObjects,
    setEditError,
  });

  const syncOutline = useCallback((id: string, x: number, y: number) => {
    const outline = outlinesRef.current.get(id);
    if (outline && !outline.destroyed) outline.position.set(x, y);
  }, []);

  /** Applies a present's stored placement (position, stacking, size) to its sprite. */
  const applyPresentToSprite = useCallback((box: PlacedBox) => {
    const entry = engineRef.current?.boxSprites.get(box.id);
    if (!entry) return;
    syncOutline(box.id, box.x, box.y);
    entry.sprite.position.set(box.x, box.y);
    entry.sprite.zIndex = box.z ?? 0;
    const size = boxWorldSize(box.design, box.scale ?? 1);
    entry.sprite.width = size;
    entry.sprite.height = size;
  }, [syncOutline]);

  /** Sends a move/resize/reorder to the server and applies the saved result to the sprite. Throws on
   * refusal — the server is the real gate (canMovePresent); callers decide how to report it. */
  const sendPresent = useCallback(
    async (id: string, patch: PresentPatch) => {
      const before = presentsRef.current.get(id);
      if (!roomToken || !before) throw new Error('That present is gone.');
      const { box: saved } = await updateBox(roomToken, id, patch, deleteTokensRef.current.get(id));
      const next: PlacedBox = { ...before, x: saved.x, y: saved.y, z: saved.z, scale: saved.scale };
      presentsRef.current.set(id, next);
      applyPresentToSprite(next);
      rebuildPresentsState();
    },
    [roomToken, applyPresentToSprite, rebuildPresentsState],
  );

  /** A user-driven present edit: on refusal the sprite snaps back and the reason is shown; on success
   * it joins the undo history (undo/redo replay through the same server route). */
  const persistPresent = useCallback(
    (id: string, patch: PresentPatch) =>
      // Same queue as room-object edits and undo, so an undo pressed right after a present move
      // waits for that move to be saved and recorded.
      serial(async () => {
        const before = presentsRef.current.get(id);
        if (!roomToken || !before) return;
        setEditError(null);
        try {
          await sendPresent(id, patch);
          const undoPatch: PresentPatch = {};
          for (const key of Object.keys(patch) as Array<keyof PresentPatch>) undoPatch[key] = before[key] as number;
          recordExternal({ undo: () => sendPresent(id, undoPatch), redo: () => sendPresent(id, patch) });
        } catch (e) {
          applyPresentToSprite(before);
          rebuildPresentsState();
          setEditError(e instanceof Error ? e.message : 'Could not move that present.');
        }
      }),
    [roomToken, serial, sendPresent, recordExternal, applyPresentToSprite, rebuildPresentsState],
  );

  const placeBoxSprite = useCallback(
    (box: PlacedBox, animate: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;
      designsRef.current.set(box.id, box.design);
      presentsRef.current.set(box.id, box);
      const sprite = createBoxSprite(box.design, box.opened ? 'open' : 'closed', box.scale ?? 1);
      sprite.position.set(box.x, box.y);
      sprite.zIndex = box.z ?? 0;
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';
      sprite.accessible = true;
      sprite.accessibleTitle = `Sealed present from ${box.fromName}`;
      const removeWobble = attachHoverWobble(sprite, engine.app.ticker);

      // Edit mode (Phase 4a): a present this browser may move becomes selectable and draggable,
      // exactly like a room object; anyone else's present (or any present outside edit mode)
      // behaves as it always did.
      const editable = () => {
        const cur = presentsRef.current.get(box.id);
        return editModeRef.current && cur !== undefined && canMovePresentHint(cur);
      };
      let dragging: { px: number; py: number; ox: number; oy: number; moved: boolean } | null = null;
      sprite.on('pointerdown', (e) => {
        if (!editable()) return;
        const cur = presentsRef.current.get(box.id)!;
        dragging = { px: e.global.x, py: e.global.y, ox: cur.x, oy: cur.y, moved: false };
        setSelectedId(null);
        setSelectedPresentId(box.id);
        e.stopPropagation(); // keep the camera from panning while a present is being dragged
      });
      sprite.on('globalpointermove', (e) => {
        if (!dragging) return;
        const scale = engine.camera.getScale();
        const dx = (e.global.x - dragging.px) / scale;
        const dy = (e.global.y - dragging.py) / scale;
        if (Math.abs(dx) + Math.abs(dy) > 2) dragging.moved = true;
        sprite.position.set(dragging.ox + dx, dragging.oy + dy);
        syncOutline(box.id, sprite.x, sprite.y);
      });
      const endDrag = () => {
        if (!dragging) return;
        const d = dragging;
        dragging = null;
        if (!d.moved) return;
        // Presents rest on the table or floor (the same drop zones a new present is placed into);
        // the host can put one anywhere.
        const rest = isHost ? { x: sprite.x, y: sprite.y } : nearestPointInZones(sprite.x, sprite.y, getDropZones());
        sprite.position.set(rest.x, rest.y);
        syncOutline(box.id, rest.x, rest.y);
        void persistPresent(box.id, { x: Math.round(rest.x), y: Math.round(rest.y) });
      };
      sprite.on('pointerup', endDrag);
      sprite.on('pointerupoutside', endDrag);

      sprite.on('pointertap', () => {
        if (engine.camera.drag.wasDragging) return;
        if (editable()) return; // selecting/dragging, not opening
        if (onBoxClick) {
          onBoxClick(box);
        } else {
          showLabel(engine.world, sprite.x, sprite.y - sprite.height - 10, `From ${box.fromName} · opens on the big day!`, 2400);
        }
      });
      engine.world.addChild(sprite);
      engine.boxSprites.set(box.id, { sprite, cleanup: removeWobble });
      if (animate) animateSettle(sprite, engine.app.ticker, engine.reducedMotion);
      rebuildPresentsState();
    },
    [onBoxClick, canMovePresentHint, persistPresent, rebuildPresentsState, isHost, syncOutline],
  );

  /** Where an object may actually rest: inside its zone (unless the host turned on "place anywhere")
   * and on the grid if snapping is on. The server enforces the zone again for everyone but the host. */
  const constrainPosition = useCallback((zone: string, x: number, y: number) => {
    const { snapOn: snap, placeAnywhere: anywhere } = prefsRef.current;
    let p = { x, y };
    if (snap) p = { x: snapToGrid(p.x), y: snapToGrid(p.y) };
    if (!anywhere) p = clampToZone(zone, p.x, p.y);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }, []);

  const handleObjectMoved = useCallback(
    async (id: string, x: number, y: number) => {
      const obj = objectsRef.current.find((o) => o.id === id);
      if (!roomToken || !obj) return;
      const p = constrainPosition(obj.zone, x, y);
      if (p.x === obj.x && p.y === obj.y) {
        syncObjects(objectsRef.current); // a click, or dropped where it started: nothing to save, snap the node back
        return;
      }
      await updateObject(id, { x: p.x, y: p.y });
    },
    [roomToken, constrainPosition, updateObject, syncObjects],
  );

  /** A corner-handle drag or pinch ended at `raw` scale: snap it (crisp steps unless free), save it. */
  const handleResizeEnd = useCallback(
    async (id: string, raw: number) => {
      const obj = objectsRef.current.find((o) => o.id === id);
      if (!roomToken || !obj) return;
      const scale = snapScale(raw, { free: prefsRef.current.freeScale, min: LIMITS.minObjectScale, max: LIMITS.maxObjectScale });
      if (scale === obj.scale) {
        syncObjects(objectsRef.current); // ended where it began (or snapped back): restore the node's live preview
        return;
      }
      await updateObject(id, { scale });
    },
    [roomToken, updateObject, syncObjects],
  );

  // The scene is built once (its effect must not depend on anything that changes), so the layer's
  // callbacks reach the CURRENT handlers through this ref instead of being captured at build time.
  const layerActionsRef = useRef({ moved: handleObjectMoved, resized: handleResizeEnd });
  useEffect(() => {
    layerActionsRef.current = { moved: handleObjectMoved, resized: handleResizeEnd };
  }, [handleObjectMoved, handleResizeEnd]);

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
      // Presents are ordered by their own z (Phase 4a); every other world child keeps zIndex 0 and so
      // keeps its existing insertion order, which is why turning this on changes nothing else.
      world.sortableChildren = true;
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
      let initialObjects: RoomObjectApi[] = roomToken ? [] : (staticObjects ?? demoLayoutObjects(age));
      // The export has no server to ask for custom images: load the ones it shipped, up front, so a
      // custom object never paints as an empty sprite (same reason the live room does this).
      if (!roomToken && staticCustomItems) {
        await Promise.all(staticCustomItems.map((i) => loadCustomTexture(i.id, i.url).catch(() => undefined)));
      }
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

      // The photo-print wall isn't a catalog/RoomObject item — it's always-present infrastructure
      // beside the camera prop, so it's built once here, independent of the legacy-scene rebuild cycle, and never torn down until unmount.
      photoWallInstance = new PhotoWall(world, 610, 90, (shot) => setViewingShot(shot));

      const placement = attachPlacement(application, camera);

      const editableLayer = new EditableObjectsLayer(
        world,
        camera.drag,
        () => camera.getScale(),
        application.ticker,
        (id) => {
          setSelectedId(id);
          if (id !== null) setSelectedPresentId(null);
        },
        (id, x, y) => {
          void layerActionsRef.current.moved(id, x, y);
        },
        (id, raw) => {
          void layerActionsRef.current.resized(id, raw);
        },
        (suspended) => camera.suspendPointer(suspended),
      );
      editableLayer.enablePinch(application.canvas);
      editableLayer.setObjects(renderableObjects(initialObjects), editModeRef.current, selectedIdRef.current, objectsInteractive(editModeRef.current, capabilitiesRef.current));

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
  }, [bannerText, placeBoxSprite, source, handleRef, roomToken, age, sessionToken, staticObjects, staticCustomItems]);

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
      // A new item takes its catalog zone and starts inside it (a wall item on the wall, a ceiling
      // item at the top) — the server does the same for non-hosts, so the two always agree.
      const zone = OBJECT_CATALOG[kind]?.defaultZone ?? 'anywhere';
      const at = defaultPositionFor(zone);
      const created = await addObject({ kind, x: at.x, y: at.y, zone });
      if (created) setSelectedId(created.id);
    },
    [roomToken, addObject],
  );

  // --- Custom items: the room's "My items" library ---
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
    engineRef.current?.editableLayer.setObjects(renderableObjects(objectsRef.current), editModeRef.current, selectedIdRef.current, objectsInteractive(editModeRef.current, capabilitiesRef.current));
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
      clearHistory(); // the placed copies are gone for good; history entries pointing at them are dead
      await refreshLibrary();
    },
    [roomToken, sessionToken, refreshLibrary, syncObjects, clearHistory],
  );

  const handlePlaceCustomItem = useCallback(
    async (item: CustomItemApi) => {
      if (!roomToken) return;
      const created = await addObject({
        kind: 'custom',
        assetId: item.id,
        x: ROOM_EDITOR_DEFAULT_X,
        y: ROOM_EDITOR_DEFAULT_Y,
        zone: 'anywhere',
        scale: defaultPlacementScale(item.width, item.height, { min: LIMITS.minObjectScale, max: LIMITS.maxObjectScale }),
      });
      if (created) setSelectedId(created.id);
    },
    [roomToken, addObject],
  );

  /** The selected present's toolbar: only position, scale, and z ever go over the wire (the PATCH
   * schema is strict about it), so there is nothing here that could touch a present's contents. */
  const handleUpdatePresent = useCallback(
    (patch: PresentPatch) => {
      if (!selectedPresentId) return;
      const clamped: PresentPatch = { ...patch };
      if (clamped.scale !== undefined) {
        clamped.scale = Math.min(LIMITS.maxPresentScale, Math.max(LIMITS.minPresentScale, clamped.scale));
      }
      void persistPresent(selectedPresentId, clamped);
    },
    [selectedPresentId, persistPresent],
  );

  // The pink outline around the selected present (only while editing). A Pixi v8 Sprite is a leaf
  // node and cannot have children, so this is its own Graphics in the world, kept over the sprite
  // (redrawn here whenever its size changes, and repositioned by syncOutline as it's dragged).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const outlines = outlinesRef.current;
    for (const [id, outline] of outlines) {
      if (!engine.boxSprites.has(id)) {
        outline.destroy();
        outlines.delete(id);
      }
    }
    for (const [id, entry] of engine.boxSprites) {
      const show = editMode && id === selectedPresentId;
      let outline = outlines.get(id);
      if (show) {
        if (!outline || outline.destroyed) {
          outline = new Graphics();
          engine.world.addChild(outline);
          outlines.set(id, outline);
        }
        const { width: w, height: h } = entry.sprite;
        outline.clear();
        outline.rect(-w / 2 - 3, -h - 3, w + 6, h + 6).stroke({ width: 3, color: 0xff3d8b });
        outline.position.set(entry.sprite.x, entry.sprite.y);
        outline.zIndex = entry.sprite.zIndex + 0.5;
      }
      if (outline && !outline.destroyed) outline.visible = show;
    }
  }, [editMode, selectedPresentId, presents]);

  const handleUpdateSelected = useCallback(
    async (patch: RoomObjectPatch) => {
      if (!roomToken || !selectedId) return;
      await updateObject(selectedId, patch);
    },
    [roomToken, selectedId, updateObject],
  );

  /** Scale +/−: crisp whole-number steps by default, quarter steps with free-scale on. */
  const handleStepScale = useCallback(
    async (dir: 1 | -1) => {
      const obj = objectsRef.current.find((o) => o.id === selectedId);
      if (!roomToken || !obj) return;
      const next = stepScale(obj.scale, dir, { free: freeScale, min: LIMITS.minObjectScale, max: LIMITS.maxObjectScale });
      if (next !== obj.scale) await updateObject(obj.id, { scale: next });
    },
    [roomToken, selectedId, freeScale, updateObject],
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!roomToken || !selectedId) return;
    if (await removeObject(selectedId)) setSelectedId(null);
  }, [roomToken, selectedId, removeObject]);

  const handleDuplicateSelected = useCallback(async () => {
    if (!roomToken || !selectedId) return;
    const copy = await duplicateObject(selectedId, { x: 32, y: 16 }, (x, y) => {
      const zone = objectsRef.current.find((o) => o.id === selectedId)?.zone ?? 'anywhere';
      return constrainPosition(zone, x, y);
    });
    if (copy) setSelectedId(copy.id);
  }, [roomToken, selectedId, duplicateObject, constrainPosition]);

  // --- Keyboard: arrows nudge, Delete, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z ---
  // Nudging shows the new position immediately but only SAVES after a short pause, so holding an
  // arrow key is one edit (one undo step, one request) rather than dozens that would trip the rate limit.
  const nudgeRef = useRef<{
    kind: 'object' | 'present';
    id: string;
    beforeX: number;
    beforeY: number;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const commitNudge = useCallback(() => {
    const n = nudgeRef.current;
    if (!n) return;
    nudgeRef.current = null;
    if (n.kind === 'object') void updateObject(n.id, { x: n.x, y: n.y }, { before: { x: n.beforeX, y: n.beforeY } });
    else void persistPresent(n.id, { x: n.x, y: n.y });
  }, [updateObject, persistPresent]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number, big: boolean) => {
      const { snapOn: snap } = prefsRef.current;
      const step = snap ? (big ? GRID_SIZE * 4 : GRID_SIZE) : big ? 10 : 1;
      const pending = nudgeRef.current;
      const obj = selectedId ? objectsRef.current.find((o) => o.id === selectedId) : undefined;
      const present = !obj && selectedPresentId ? presentsRef.current.get(selectedPresentId) : undefined;
      if (!obj && !present) return;
      const kind = obj ? 'object' : 'present';
      const id = (obj?.id ?? present!.id) as string;
      if (pending && (pending.kind !== kind || pending.id !== id)) commitNudge(); // switched target: save the old one first
      const base = nudgeRef.current ?? { beforeX: (obj ?? present)!.x, beforeY: (obj ?? present)!.y, x: (obj ?? present)!.x, y: (obj ?? present)!.y };
      let x = base.x + dx * step;
      let y = base.y + dy * step;
      if (obj) {
        ({ x, y } = constrainPosition(obj.zone, x, y));
        syncObjects(objectsRef.current.map((o) => (o.id === obj.id ? { ...o, x, y } : o)));
      } else {
        const room = { x: Math.min(2400, Math.max(0, x)), y: Math.min(760, Math.max(0, y)) };
        ({ x, y } = isHost ? room : nearestPointInZones(room.x, room.y, getDropZones()));
        const entry = engineRef.current?.boxSprites.get(id);
        entry?.sprite.position.set(x, y);
        syncOutline(id, x, y);
      }
      if (nudgeRef.current) clearTimeout(nudgeRef.current.timer);
      nudgeRef.current = { kind, id, beforeX: base.beforeX, beforeY: base.beforeY, x, y, timer: setTimeout(commitNudge, 450) };
    },
    [selectedId, selectedPresentId, constrainPosition, syncObjects, commitNudge, isHost, syncOutline],
  );

  // While something is selected in edit mode the arrow keys belong to it, not to the camera pan.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const owns = editMode && (selectedId !== null || selectedPresentId !== null);
    engine.camera.suspendKeyboard(owns);
    return () => engine.camera.suspendKeyboard(false);
  }, [editMode, selectedId, selectedPresentId]);

  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      // The pixel editor has its own undo/redo (Ctrl+Z inside a drawing must not also undo a room edit).
      if (el?.closest('[data-own-shortcuts]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        commitNudge();
        void (e.shiftKey ? redo() : undo());
      } else if (mod && key === 'y') {
        e.preventDefault();
        void redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        void handleDuplicateSelected();
      } else if (key === 'escape') {
        setSelectedId(null);
        setSelectedPresentId(null);
      } else if ((key === 'delete' || key === 'backspace') && selectedId) {
        e.preventDefault();
        void handleDeleteSelected();
      } else if (!mod && key.startsWith('arrow') && (selectedId || selectedPresentId)) {
        e.preventDefault();
        nudgeSelected(key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0, key === 'arrowup' ? -1 : key === 'arrowdown' ? 1 : 0, e.shiftKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, selectedId, selectedPresentId, undo, redo, commitNudge, nudgeSelected, handleDuplicateSelected, handleDeleteSelected]);

  const handleResetLayout = useCallback(async () => {
    if (!roomToken) return;
    setEditError(null);
    try {
      const next = await resetRoomObjects(roomToken);
      syncObjects(next);
      setSelectedId(null);
      clearHistory(); // every object has a new id now; nothing recorded before this can be replayed
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not reset the layout.');
    }
  }, [roomToken, syncObjects, clearHistory]);

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
        const box: PlacedBox = { id, fromName: contribution.fromName, design: contribution.design, x, y: stackedY, placedAt: Date.now(), scale: 1, z: 0, mine: true };
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
    presentsRef.current.delete(undoToast.boxId);
    rebuildPresentsState();
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

      {/* Room Editor: rendered only when the room payload's
          capabilities list grants it — but this is a display hint, never the actual boundary;
          every mutation route re-checks the real rule independently regardless of whether this
          button is even shown. */}
      {ready && roomToken && (capabilities.includes('objects:edit-mode') || capabilities.some((c) => c.startsWith('presents:move'))) && !placingHint && (
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
          onSelect={(id) => {
            setSelectedId(id);
            if (id !== null) setSelectedPresentId(null);
          }}
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
          presents={presents}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => {
            commitNudge();
            void undo();
          }}
          onRedo={() => void redo()}
          snapOn={snapOn}
          onToggleSnap={() => setSnapOn((v) => !v)}
          freeScale={freeScale}
          onToggleFreeScale={() => setFreeScale((v) => !v)}
          placeAnywhere={isHost && placeAnywhere}
          onTogglePlaceAnywhere={isHost ? () => setPlaceAnywhere((v) => !v) : undefined}
          onStepScale={(dir) => void handleStepScale(dir)}
          onDuplicate={() => void handleDuplicateSelected()}
          selectedPresentId={selectedPresentId}
          onSelectPresent={(id) => {
            setSelectedPresentId(id);
            if (id !== null) setSelectedId(null);
          }}
          onUpdatePresent={handleUpdatePresent}
          canMovePresent={canMovePresentHint}
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
