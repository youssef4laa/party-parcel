import { Container, Sprite, Ticker } from 'pixi.js';
import { getTexture } from '../../manifest';
import type { DragState } from '../camera';

const RESPAWN_MS = 4000;

/** Gentle bobbing float; click pops it with a tiny burst, then it respawns after a few seconds. */
export function attachBalloon(
  s: Sprite,
  world: Container,
  drag: DragState,
  ticker: Ticker,
  phaseSeed: number,
  reducedMotion: boolean,
) {
  const baseY = s.y;
  const baseX = s.x;
  let t = phaseSeed * 1.7;
  let popped = false;
  let respawnTimer: ReturnType<typeof setTimeout> | null = null;
  let burst: Sprite | null = null;

  s.eventMode = 'static';
  s.cursor = 'pointer';
  s.accessible = true;
  s.accessibleTitle = 'Balloon';

  const tickerFn = (ticker2: Ticker) => {
    if (popped) return;
    t += ticker2.deltaMS / 1000;
    if (!reducedMotion) {
      s.y = baseY + Math.sin(t * 1.6) * 6;
      s.x = baseX + Math.sin(t * 0.9) * 3;
      s.rotation = Math.sin(t * 1.1) * 0.03;
    }
  };
  ticker.add(tickerFn);

  const onTap = () => {
    if (drag.wasDragging || popped) return;
    popped = true;
    s.visible = false;
    burst = new Sprite(getTexture('balloonPop'));
    burst.anchor.set(0.5);
    burst.position.set(s.x, baseY);
    world.addChild(burst);
    let age = 0;
    const burstFn = (ticker2: Ticker) => {
      age += ticker2.deltaMS / 1000;
      if (burst) {
        burst.alpha = Math.max(0, 1 - age / 0.5);
        burst.scale.set(1 + age);
      }
      if (age > 0.5) {
        ticker.remove(burstFn);
        burst?.destroy();
        burst = null;
      }
    };
    ticker.add(burstFn);
    respawnTimer = setTimeout(() => {
      popped = false;
      s.visible = true;
      s.alpha = 0;
      s.x = baseX;
      s.y = baseY;
      const fadeFn = (ticker2: Ticker) => {
        s.alpha = Math.min(1, s.alpha + ticker2.deltaMS / 300);
        if (s.alpha >= 1) ticker.remove(fadeFn);
      };
      ticker.add(fadeFn);
    }, RESPAWN_MS);
  };
  s.on('pointertap', onTap);

  return () => {
    ticker.remove(tickerFn);
    s.off('pointertap', onTap);
    if (respawnTimer) clearTimeout(respawnTimer);
    burst?.destroy();
  };
}
