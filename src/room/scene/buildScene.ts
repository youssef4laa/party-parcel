import { Application, Container, Sprite } from 'pixi.js';
import { getTexture } from '../manifest';
import { ROOM_WIDTH, ROOM_HEIGHT, WINDOW_X, TABLE_X, TABLE_Y } from '../constants';
import type { DragState } from './camera';
import { CatController } from './interactions/cat';
import { attachBalloon } from './interactions/balloon';
import { attachStar } from './interactions/star';
import { attachCake } from './interactions/cake';
import { attachFrame } from './interactions/frame';

export type SceneCallbacks = {
  onEnlargeFrame: (subject: 'mountain' | 'tulip') => void;
  onCakeToggle?: (lit: boolean) => void;
  reducedMotion: boolean;
};

function sprite(key: string, x: number, y: number, opts: Partial<{ anchorX: number; anchorY: number; scale: number }> = {}) {
  const s = new Sprite(getTexture(key));
  s.anchor.set(opts.anchorX ?? 0, opts.anchorY ?? 0);
  s.position.set(x, y);
  if (opts.scale) s.scale.set(opts.scale);
  return s;
}

export function buildScene(app: Application, world: Container, drag: DragState, cb: SceneCallbacks) {
  const cleanups: Array<() => void> = [];

  world.addChild(sprite('background', 0, 0));

  // --- rug on the floor, centered under the table ---
  const rug = sprite('rug', ROOM_WIDTH / 2, ROOM_HEIGHT - 4, { anchorX: 0.5, anchorY: 1 });
  world.addChild(rug);

  // --- left wall zone: frames + camera/tripod ---
  const frameMountain = sprite('frameMountain', 160, 120);
  const frameTulip = sprite('frameTulip', 320, 150);
  world.addChild(frameMountain, frameTulip);
  cleanups.push(attachFrame(frameMountain, drag, () => cb.onEnlargeFrame('mountain')));
  cleanups.push(attachFrame(frameTulip, drag, () => cb.onEnlargeFrame('tulip')));

  const camera = sprite('camera', 470, 300, { anchorX: 0.5, anchorY: 0 });
  world.addChild(camera);

  // --- center zone: window, curtains, banner, table setting ---
  const windowX = WINDOW_X;
  const windowSprite = sprite('window', windowX, 60);
  world.addChild(windowSprite);
  const winTex = getTexture('window');
  const curtainL = sprite('curtainLeft', windowX - 78, 40);
  const curtainR = sprite('curtainRight', windowX + winTex.width - 10, 40);
  world.addChild(curtainL, curtainR);

  const banner = sprite('banner', windowX + winTex.width / 2, 8, { anchorX: 0.5, anchorY: 0 });
  world.addChild(banner);

  const garlandTex = getTexture('garland');
  for (let gx = -40; gx < ROOM_WIDTH; gx += garlandTex.width - 4) {
    world.addChild(sprite('garland', gx, 0));
  }

  const lantern = sprite('lantern', windowX + winTex.width / 2, 0, { anchorX: 0.5, anchorY: 0 });
  const glow = sprite('glow', lantern.x, 90, { anchorX: 0.5, anchorY: 0.5 });
  glow.alpha = 0.6;
  glow.blendMode = 'add';
  world.addChild(glow, lantern);

  // hanging stars scattered along the ceiling
  const starPositions = [560, 760, 1320, 1520, 1780, 2020];
  for (let i = 0; i < starPositions.length; i++) {
    const s = sprite('star', starPositions[i], 0, { anchorX: 0.5, anchorY: 0 });
    world.addChild(s);
    cleanups.push(attachStar(s, world, drag, app.ticker, i, cb.reducedMotion));
  }

  // table + setting
  const tableTex = getTexture('table');
  const tableX = TABLE_X;
  const tableY = TABLE_Y;
  world.addChild(sprite('table', tableX, tableY));

  const chairL = sprite('chair', tableX - 60, tableY - 20);
  const chairR = sprite('chair', tableX + tableTex.width - 30, tableY - 20);
  world.addChild(chairL, chairR);

  const cakeState = { lit: true };
  const cake = sprite('cakeLit', tableX + tableTex.width / 2, tableY + 6, { anchorX: 0.5, anchorY: 1 });
  world.addChild(cake);
  cleanups.push(attachCake(cake, drag, app.ticker, cakeState, cb.onCakeToggle));

  world.addChild(sprite('cupcakeStand', tableX + 20, tableY - 24));
  world.addChild(sprite('vase', tableX + tableTex.width - 70, tableY - 30));
  world.addChild(sprite('snackBowl', tableX + tableTex.width - 130, tableY - 12));
  world.addChild(sprite('cups', tableX + 40, tableY - 8));

  // --- right wall zone: shelf + balloons ---
  world.addChild(sprite('shelf', 1780, 130));

  const balloonColors = ['purple', 'red', 'green', 'yellow', 'orange', 'pink'];
  const balloonBaseX = [1980, 2050, 2120, 2190, 2260, 2330];
  const balloonBaseY = [180, 235, 190, 160, 225, 195];
  for (let i = 0; i < balloonColors.length; i++) {
    const b = sprite(`balloon_${balloonColors[i]}`, balloonBaseX[i], balloonBaseY[i], { anchorX: 0.5, anchorY: 0 });
    world.addChild(b);
    cleanups.push(attachBalloon(b, world, drag, app.ticker, i, cb.reducedMotion));
  }

  // --- cat wandering the floor ---
  const cat = new CatController(world, app.ticker, drag, cb.reducedMotion);
  cleanups.push(() => cat.destroy());

  return () => cleanups.forEach((fn) => fn());
}
