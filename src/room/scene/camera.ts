import { Application, Container, FederatedPointerEvent } from 'pixi.js';
import { ROOM_WIDTH, ROOM_HEIGHT } from '../constants';

export type DragState = { active: boolean; wasDragging: boolean };

const DRAG_THRESHOLD = 6;
const ARROW_SPEED = 700; // world px / second

/**
 * Wires drag-to-pan, wheel/trackpad pan, and arrow-key pan onto `world`.
 * Returns the shared drag state (so sprite click handlers can ignore a
 * click that was actually the end of a drag gesture) and a cleanup fn.
 */
export function attachCamera(
  app: Application,
  world: Container,
  getViewport: () => { width: number; height: number },
) {
  const drag: DragState = { active: false, wasDragging: false };
  let startPointerX = 0;
  let startWorldX = 0;
  let scale = 1;

  function computeScale() {
    const { height } = getViewport();
    scale = height / ROOM_HEIGHT;
    world.scale.set(scale);
  }

  function clampX(x: number) {
    const { width } = getViewport();
    const worldPxWidth = ROOM_WIDTH * scale;
    const minX = Math.min(0, width - worldPxWidth);
    return Math.max(minX, Math.min(0, x));
  }

  function panBy(dx: number) {
    world.x = clampX(world.x + dx);
  }

  computeScale();
  // start panned to the left edge
  world.x = 0;
  world.y = 0;

  const onResize = () => {
    const prevScale = scale;
    computeScale();
    // keep the same world focal point roughly centered after a resize
    world.x = clampX((world.x / prevScale) * scale);
  };

  const stage = app.stage;
  stage.eventMode = 'static';
  stage.hitArea = app.screen;

  const suspend = { keyboard: false, pointer: false };

  const onPointerDown = (e: FederatedPointerEvent) => {
    if (suspend.pointer) return;
    drag.active = true;
    drag.wasDragging = false;
    startPointerX = e.global.x;
    startWorldX = world.x;
  };
  const onPointerMove = (e: FederatedPointerEvent) => {
    if (!drag.active) return;
    const dx = e.global.x - startPointerX;
    if (Math.abs(dx) > DRAG_THRESHOLD) drag.wasDragging = true;
    world.x = clampX(startWorldX + dx);
  };
  const endDrag = () => {
    drag.active = false;
  };

  stage.on('pointerdown', onPointerDown);
  stage.on('pointermove', onPointerMove);
  stage.on('pointerup', endDrag);
  stage.on('pointerupoutside', endDrag);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    panBy(-delta);
  };
  app.canvas.addEventListener('wheel', onWheel, { passive: false });

  let keyDir = 0;
  const onKeyDown = (e: KeyboardEvent) => {
    if (suspend.keyboard) return;
    if (e.key === 'ArrowLeft') keyDir = -1;
    else if (e.key === 'ArrowRight') keyDir = 1;
    else return;
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && keyDir === -1) keyDir = 0;
    if (e.key === 'ArrowRight' && keyDir === 1) keyDir = 0;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const tickerFn = (ticker: { deltaMS: number }) => {
    if (keyDir !== 0) {
      panBy(-keyDir * ARROW_SPEED * (ticker.deltaMS / 1000));
    }
  };
  app.ticker.add(tickerFn);

  window.addEventListener('resize', onResize);

  function destroy() {
    stage.off('pointerdown', onPointerDown);
    stage.off('pointermove', onPointerMove);
    stage.off('pointerup', endDrag);
    stage.off('pointerupoutside', endDrag);
    app.canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    app.ticker.remove(tickerFn);
  }

  return {
    drag,
    destroy,
    recomputeScale: onResize,
    getScale: () => scale,
    screenToWorld: (sx: number, sy: number) => ({ x: (sx - world.x) / scale, y: sy / scale }),
    worldToScreen: (wx: number, wy: number) => ({ x: world.x + wx * scale, y: wy * scale }),
    suspendKeyboard: (v: boolean) => {
      suspend.keyboard = v;
      keyDir = 0;
    },
    suspendPointer: (v: boolean) => {
      suspend.pointer = v;
      drag.active = false;
    },
  };
}
