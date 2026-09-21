import { Container, Sprite, Ticker } from 'pixi.js';
import { getTexture } from '../../manifest';
import type { DragState } from '../camera';

/** Gentle twinkle via alpha oscillation; click spawns a brief sparkle overlay. */
export function attachStar(
  s: Sprite,
  world: Container,
  drag: DragState,
  ticker: Ticker,
  phaseSeed: number,
  reducedMotion: boolean,
) {
  let t = phaseSeed * 1.3;
  s.eventMode = 'static';
  s.cursor = 'pointer';
  s.accessible = true;
  s.accessibleTitle = 'Star';

  const tickerFn = (ticker2: Ticker) => {
    t += ticker2.deltaMS / 1000;
    s.alpha = reducedMotion ? 1 : 0.65 + Math.sin(t * 2) * 0.35;
  };
  ticker.add(tickerFn);

  let sparkle: Sprite | null = null;
  let sparkleTickerFn: ((ticker2: Ticker) => void) | null = null;
  const onTap = () => {
    if (drag.wasDragging) return;
    // A re-click before the previous sparkle's own ~0.5s fade finished must stop ITS ticker
    // callback too, not just destroy the sprite — otherwise that callback runs again next frame
    // against an already-destroyed Sprite and throws (the exact bug this project's cake blow-out
    // had — see DECISIONS.md's Room Editor Phase 2 entry for the full story of finding it there).
    if (sparkleTickerFn) {
      ticker.remove(sparkleTickerFn);
      sparkleTickerFn = null;
    }
    sparkle?.destroy();
    sparkle = new Sprite(getTexture('sparkle'));
    sparkle.anchor.set(0.5);
    sparkle.position.set(s.x, s.y + s.height * 0.6);
    sparkle.alpha = 1;
    world.addChild(sparkle);
    let age = 0;
    const localSparkle = sparkle;
    const sparkleFn = (ticker2: Ticker) => {
      age += ticker2.deltaMS / 1000;
      localSparkle.alpha = Math.max(0, 1 - age / 0.5);
      localSparkle.scale.set(1 + age * 0.8);
      localSparkle.rotation += ticker2.deltaMS * 0.005;
      if (age > 0.5) {
        ticker.remove(sparkleFn);
        sparkleTickerFn = null;
        localSparkle.destroy();
        if (sparkle === localSparkle) sparkle = null;
      }
    };
    sparkleTickerFn = sparkleFn;
    ticker.add(sparkleFn);
  };
  s.on('pointertap', onTap);

  return () => {
    ticker.remove(tickerFn);
    s.off('pointertap', onTap);
    if (sparkleTickerFn) ticker.remove(sparkleTickerFn);
    sparkle?.destroy();
  };
}
