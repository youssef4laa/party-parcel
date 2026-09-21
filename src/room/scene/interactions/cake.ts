import { Sprite, Ticker, Texture } from 'pixi.js';
import { getTexture } from '../../manifest';
import type { DragState } from '../camera';
import { showLabel } from './label';

/** Click extinguishes the candles with a smoke puff + "make a wish" bubble; click again relights.
 * `textureFor(lit)` re-derives the cake's own texture for the given lit state from whatever
 * style/config this particular cake has (see scene/objectSprites.ts's cakeTextureFor) — this is
 * what makes blow-out/relight work uniformly across every cake style (docs/ROOM_EDITOR.md Phase 2),
 * not just the original fixed tiered-cake look. */
export function attachCake(
  cake: Sprite,
  drag: DragState,
  ticker: Ticker,
  state: { lit: boolean },
  textureFor: (lit: boolean) => Texture,
  onToggle?: (lit: boolean) => void,
) {
  cake.eventMode = 'static';
  cake.cursor = 'pointer';
  cake.accessible = true;
  cake.accessibleTitle = 'Birthday cake with candles';

  let removeLabel: (() => void) | null = null;
  let smoke: Sprite | null = null;
  let smokeTickerFn: ((t: Ticker) => void) | null = null;
  const world = cake.parent;

  const onTap = () => {
    if (drag.wasDragging) return;
    state.lit = !state.lit;
    cake.texture = textureFor(state.lit);
    onToggle?.(state.lit);
    removeLabel?.();
    removeLabel = null;
    // A re-click before the previous blow-out's smoke puff finished its own ~1.2s fade (see below)
    // must stop ITS ticker callback here too, not just destroy the sprite — the callback was still
    // going to run again next frame regardless of the sprite's lifecycle, and reading `.y`/`.alpha`
    // off an already-destroyed Sprite throws (a real bug, not hypothetical: reproduced by clicking
    // twice within 1.2s, which is exactly what tests/cake-blowout-styles.spec.ts's relight check
    // does). That uncaught exception, thrown from inside Ticker.update()'s listener loop, is what
    // was silently stalling every subsequent render — not the texture reassignment itself, which
    // was never actually the problem despite how it looked from the outside.
    if (smokeTickerFn) {
      ticker.remove(smokeTickerFn);
      smokeTickerFn = null;
    }
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
          smokeTickerFn = null;
          localSmoke.destroy();
          if (smoke === localSmoke) smoke = null;
        }
      };
      smokeTickerFn = smokeFn;
      ticker.add(smokeFn);

      removeLabel = showLabel(world, cake.x, cake.y - cake.height - 30, 'Make a wish!', 2200);
    }
  };
  cake.on('pointertap', onTap);

  return () => {
    cake.off('pointertap', onTap);
    removeLabel?.();
    if (smokeTickerFn) ticker.remove(smokeTickerFn);
    smoke?.destroy();
  };
}
