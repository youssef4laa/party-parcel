import { Sprite, Ticker } from 'pixi.js';
import { getTexture } from '../../manifest';
import type { DragState } from '../camera';
import { showLabel } from './label';

/** Click extinguishes the candles with a smoke puff + "make a wish" bubble; click again relights. */
export function attachCake(
  cake: Sprite,
  drag: DragState,
  ticker: Ticker,
  state: { lit: boolean },
  onToggle?: (lit: boolean) => void,
) {
  cake.eventMode = 'static';
  cake.cursor = 'pointer';
  cake.accessible = true;
  cake.accessibleTitle = 'Birthday cake with candles';

  let removeLabel: (() => void) | null = null;
  let smoke: Sprite | null = null;
  const world = cake.parent;

  const onTap = () => {
    if (drag.wasDragging) return;
    state.lit = !state.lit;
    cake.texture = getTexture(state.lit ? 'cakeLit' : 'cakeUnlit');
    onToggle?.(state.lit);
    removeLabel?.();
    removeLabel = null;
    smoke?.destroy();
    smoke = null;

    if (!state.lit && world) {
      smoke = new Sprite(getTexture('smokePuff'));
      smoke.anchor.set(0.5, 1);
      smoke.position.set(cake.x, cake.y - cake.height + 6);
      world.addChild(smoke);
      let age = 0;
      const localSmoke = smoke;
      const smokeFn = (t: Ticker) => {
        age += t.deltaMS / 1000;
        localSmoke.y -= t.deltaMS * 0.03;
        localSmoke.alpha = Math.max(0, 1 - age / 1.2);
        if (age > 1.2) {
          ticker.remove(smokeFn);
          localSmoke.destroy();
          if (smoke === localSmoke) smoke = null;
        }
      };
      ticker.add(smokeFn);

      removeLabel = showLabel(world, cake.x, cake.y - cake.height - 30, 'Make a wish!', 2200);
    }
  };
  cake.on('pointertap', onTap);

  return () => {
    cake.off('pointertap', onTap);
    removeLabel?.();
    smoke?.destroy();
  };
}
