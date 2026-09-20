'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Application, Container, Sprite } from 'pixi.js';
import { attachCamera } from './scene/camera';
import { buildScene } from './scene/buildScene';
import { attachPlacement } from './scene/placement';
import { createBoxSprite, textureForDesign, animateSettle, attachHoverWobble } from './scene/presentBox';
import { showLabel } from './scene/interactions/label';
import type { PhotoWall } from './scene/interactions/photobooth';
import { registerBannerText } from './manifest';
import FrameModal from './ui/FrameModal';
import PanHint from './ui/PanHint';
import ContributeFlow from '@/contribute/ContributeFlow';
import PhotoboothModal from '@/photobooth/PhotoboothModal';
import PrintModal from '@/photobooth/PrintModal';
import { createStubDataSource } from '@/contribute/stubDataSource';
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
};

const UNDO_WINDOW_MS = 60_000;

export default function RoomCanvas({
  celebrantName = 'Alex',
  age,
  bannerText = 'HAPPY BIRTHDAY!',
  dataSource,
  roomId = 'demo-room',
  canContribute = true,
  roomToken,
  onBoxClick,
  handleRef,
}: RoomCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
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

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    let app: Application | null = null;
    let cleanupScene: { destroy: () => void; photoWall: PhotoWall } | null = null;
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

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      const camera = attachCamera(application, world, () => ({
        width: host.clientWidth,
        height: host.clientHeight,
      }));
      cleanupCamera = camera.destroy;

      cleanupScene = buildScene(application, world, camera.drag, {
        onEnlargeFrame: setEnlargedFrame,
        onOpenPhotobooth: () => setPhotoboothOpen(true),
        onTapPrint: (shot) => setViewingShot(shot),
        reducedMotion,
      });

      const placement = attachPlacement(application, camera);

      engineRef.current = {
        app: application,
        world,
        camera,
        placement,
        reducedMotion,
        boxSprites: new Map(),
        photoWall: cleanupScene.photoWall,
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
        if (!destroyed) await cleanupScene.photoWall.setShots(shots);
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
      cleanupScene?.destroy();
      cleanupCamera?.();
      engineRef.current?.placement.destroy();
      engineRef.current = null;
      if (app) {
        app.destroy(true, { children: true });
      }
    };
  }, [bannerText, placeBoxSprite, source, handleRef]);

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
