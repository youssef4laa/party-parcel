import { Sprite } from 'pixi.js';
import type { DragState } from '../camera';

/** Click a wall frame to enlarge its picture (handled by the caller, e.g. opening a DOM modal). */
export function attachFrame(s: Sprite, drag: DragState, onTap: () => void) {
  s.eventMode = 'static';
  s.cursor = 'pointer';
  s.accessible = true;
  s.accessibleTitle = 'Framed picture';
  const handler = () => {
    if (drag.wasDragging) return;
    onTap();
  };
  s.on('pointertap', handler);
  return () => s.off('pointertap', handler);
}
