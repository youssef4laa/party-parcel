import type { Application, Sprite } from 'pixi.js';
import type { BoxDesign } from '@/box/types';
import { createBoxSprite, boxWorldSize } from './presentBox';
import { getDropZones, nearestPointInZones, isInsideZones } from '../constants';
import type { attachCamera } from './camera';

type Camera = ReturnType<typeof attachCamera>;

const KEY_STEP = 22;

/**
 * "Place" step of the contributor flow: a present sprite follows the pointer (or arrow keys)
 * in screen space until the contributor clicks / presses Enter to drop it. Drops outside the
 * floor/rug/tabletop zones snap to the nearest valid spot instead of failing.
 */
export function attachPlacement(app: Application, camera: Camera) {
  let floating: Sprite | null = null;
  let active = false;
  let screenX = 0;
  let screenY = 0;
  let onCommit: (x: number, y: number) => void = () => {};
  // Touch has no hover state — a mouse can "follow the pointer" without any button held, but a
  // finger only reports a position while it's actually touching the glass. So touch gets its own
  // real press-move-release drag (matching section 13's "one finger... drags it"), tracked here,
  // while mouse/pen keep the existing hover-then-click-to-drop flow untouched.
  let touchDragging = false;

  function sync() {
    if (floating) floating.position.set(screenX, screenY);
  }

  function moveTo(clientX: number, clientY: number) {
    const rect = app.canvas.getBoundingClientRect();
    screenX = clientX - rect.left;
    screenY = clientY - rect.top;
    sync();
  }

  const onPointerDown = (e: PointerEvent) => {
    if (!active || e.pointerType !== 'touch') return;
    touchDragging = true;
    moveTo(e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!active) return;
    if (e.pointerType === 'touch' && !touchDragging) return;
    moveTo(e.clientX, e.clientY);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!active || e.pointerType !== 'touch' || !touchDragging) return;
    touchDragging = false;
    e.preventDefault(); // suppress the synthetic "click" that would otherwise double-commit
    commit();
  };

  const onClick = (e: MouseEvent) => {
    if (!active) return;
    e.preventDefault();
    commit();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!active) return;
    switch (e.key) {
      case 'ArrowLeft':
        screenX -= KEY_STEP;
        break;
      case 'ArrowRight':
        screenX += KEY_STEP;
        break;
      case 'ArrowUp':
        screenY -= KEY_STEP;
        break;
      case 'ArrowDown':
        screenY += KEY_STEP;
        break;
      case 'Enter':
        e.preventDefault();
        commit();
        return;
      case 'Escape':
        e.preventDefault();
        cancel();
        return;
      default:
        return;
    }
    e.preventDefault();
    sync();
  };

  function commit() {
    if (!floating) return;
    const world = camera.screenToWorld(screenX, screenY);
    const zones = getDropZones();
    const target = isInsideZones(world.x, world.y, zones) ? world : nearestPointInZones(world.x, world.y, zones);
    stop();
    onCommit(target.x, target.y);
  }

  function cancel() {
    stop();
  }

  function stop() {
    if (!active) return;
    active = false;
    touchDragging = false;
    camera.suspendKeyboard(false);
    camera.suspendPointer(false);
    app.canvas.removeEventListener('pointerdown', onPointerDown);
    app.canvas.removeEventListener('pointermove', onPointerMove);
    app.canvas.removeEventListener('pointerup', onPointerUp);
    app.canvas.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
    floating?.destroy();
    floating = null;
  }

  function start(design: BoxDesign, commitHandler: (x: number, y: number) => void) {
    stop();
    active = true;
    onCommit = commitHandler;
    camera.suspendKeyboard(true);
    camera.suspendPointer(true);

    floating = createBoxSprite(design);
    floating.anchor.set(0.5, 0.5);
    // the ghost is as big as the present will actually be (its S/M/L size), so what you place is what you get
    const displaySize = boxWorldSize(design) * camera.getScale();
    floating.width = displaySize;
    floating.height = displaySize;
    floating.alpha = 0.9;
    floating.eventMode = 'none';
    app.stage.addChild(floating);

    const rect = app.canvas.getBoundingClientRect();
    screenX = rect.width / 2;
    screenY = rect.height / 2;
    sync();

    app.canvas.addEventListener('pointerdown', onPointerDown);
    app.canvas.addEventListener('pointermove', onPointerMove);
    app.canvas.addEventListener('pointerup', onPointerUp);
    app.canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);
  }

  return { start, cancel, isActive: () => active, destroy: stop };
}
