import { Application, Container, Sprite } from 'pixi.js';
import { getTexture } from '../manifest';
import { ROOM_WIDTH, ROOM_HEIGHT, WINDOW_X, TABLE_X, TABLE_Y } from '../constants';
import type { DragState } from './camera';
import { CatController } from './interactions/cat';
import { attachBalloon } from './interactions/balloon';
import { attachStar } from './interactions/star';
import { attachCake } from './interactions/cake';
import { attachFrame } from './interactions/frame';
import { attachCameraTrigger, PhotoWall } from './interactions/photobooth';
import type { PhotoboothShotView } from '../dataSource';

export type SceneCallbacks = {
  onEnlargeFrame: (subject: 'mountain' | 'tulip') => void;
  onCakeToggle?: (lit: boolean) => void;
  onOpenPhotobooth: () => void;
  onTapPrint: (shot: PhotoboothShotView) => void;
  reducedMotion: boolean;
  /**
   * Room Editor (docs/ROOM_EDITOR.md 1a): kinds a RoomObject row has marked `hidden`. Every
   * legacy scene element (window, banner, garland, ...) still renders from this same hardcoded
   * layout function — rewriting it to be fully position/scale-driven from RoomObject data is the
   * next real step (see DECISIONS.md's Room Editor entry for why this pass stops short of that)
   * — but "hidden" is real and enforced here: a hidden kind's sprite (and its interaction) is
   * skipped entirely, not just visually hidden. Multi-instance kinds (garland/star/balloon) hide
   * as a whole group in this pass, not per-instance — also logged as a known limitation.
   */
  hiddenKinds: Set<string>;
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
  const hidden = (kind: string) => cb.hiddenKinds.has(kind);

  world.addChild(sprite('background', 0, 0));

  // --- rug on the floor, centered under the table ---
  if (!hidden('rug')) {
    world.addChild(sprite('rug', ROOM_WIDTH / 2, ROOM_HEIGHT - 4, { anchorX: 0.5, anchorY: 1 }));
  }

  // --- left wall zone: frames + camera/tripod ---
  if (!hidden('frame-mountain')) {
    const frameMountain = sprite('frameMountain', 160, 120);
    world.addChild(frameMountain);
    cleanups.push(attachFrame(frameMountain, drag, () => cb.onEnlargeFrame('mountain')));
  }
  if (!hidden('frame-tulip')) {
    const frameTulip = sprite('frameTulip', 320, 150);
    world.addChild(frameTulip);
    cleanups.push(attachFrame(frameTulip, drag, () => cb.onEnlargeFrame('tulip')));
  }

  if (!hidden('camera')) {
    const camera = sprite('camera', 470, 300, { anchorX: 0.5, anchorY: 0 });
    world.addChild(camera);
    cleanups.push(attachCameraTrigger(camera, drag, cb.onOpenPhotobooth));
  }

  // photo wall: prints accumulate beside the booth, on the open wall between the camera and the
  // window (see DECISIONS.md for the grid layout choice) — not a catalog item, always present
  const photoWall = new PhotoWall(world, 610, 90, cb.onTapPrint);
  cleanups.push(() => photoWall.destroy());

  // --- center zone: window, curtains, banner, table setting ---
  const windowX = WINDOW_X;
  if (!hidden('window')) world.addChild(sprite('window', windowX, 60));
  const winTex = getTexture('window');
  if (!hidden('curtain-left')) world.addChild(sprite('curtainLeft', windowX - 78, 40));
  if (!hidden('curtain-right')) world.addChild(sprite('curtainRight', windowX + winTex.width - 10, 40));

  if (!hidden('banner')) {
    world.addChild(sprite('banner', windowX + winTex.width / 2, 8, { anchorX: 0.5, anchorY: 0 }));
  }

  if (!hidden('garland')) {
    const garlandTex = getTexture('garland');
    for (let gx = -40; gx < ROOM_WIDTH; gx += garlandTex.width - 4) {
      world.addChild(sprite('garland', gx, 0));
    }
  }

  if (!hidden('lantern')) {
    const lantern = sprite('lantern', windowX + winTex.width / 2, 0, { anchorX: 0.5, anchorY: 0 });
    const glow = sprite('glow', lantern.x, 90, { anchorX: 0.5, anchorY: 0.5 });
    glow.alpha = 0.6;
    glow.blendMode = 'add';
    world.addChild(glow, lantern);
  }

  // hanging stars scattered along the ceiling
  if (!hidden('star')) {
    const starPositions = [560, 760, 1320, 1520, 1780, 2020];
    for (let i = 0; i < starPositions.length; i++) {
      const s = sprite('star', starPositions[i], 0, { anchorX: 0.5, anchorY: 0 });
      world.addChild(s);
      cleanups.push(attachStar(s, world, drag, app.ticker, i, cb.reducedMotion));
    }
  }

  // table + setting
  const tableTex = getTexture('table');
  const tableX = TABLE_X;
  const tableY = TABLE_Y;
  if (!hidden('table')) world.addChild(sprite('table', tableX, tableY));

  if (!hidden('chair')) {
    world.addChild(sprite('chair', tableX - 60, tableY - 20));
    world.addChild(sprite('chair', tableX + tableTex.width - 30, tableY - 20));
  }

  if (!hidden('cake')) {
    const cakeState = { lit: true };
    const cake = sprite('cakeLit', tableX + tableTex.width / 2, tableY + 6, { anchorX: 0.5, anchorY: 1 });
    world.addChild(cake);
    cleanups.push(attachCake(cake, drag, app.ticker, cakeState, cb.onCakeToggle));
  }

  if (!hidden('cupcake-stand')) world.addChild(sprite('cupcakeStand', tableX + 20, tableY - 24));
  if (!hidden('vase')) world.addChild(sprite('vase', tableX + tableTex.width - 70, tableY - 30));
  if (!hidden('snack-bowl')) world.addChild(sprite('snackBowl', tableX + tableTex.width - 130, tableY - 12));
  if (!hidden('cups')) world.addChild(sprite('cups', tableX + 40, tableY - 8));

  // --- right wall zone: shelf + balloons ---
  if (!hidden('shelf')) world.addChild(sprite('shelf', 1780, 130));

  if (!hidden('balloon')) {
    const balloonColors = ['purple', 'red', 'green', 'yellow', 'orange', 'pink'];
    const balloonBaseX = [1980, 2050, 2120, 2190, 2260, 2330];
    const balloonBaseY = [180, 235, 190, 160, 225, 195];
    for (let i = 0; i < balloonColors.length; i++) {
      const b = sprite(`balloon_${balloonColors[i]}`, balloonBaseX[i], balloonBaseY[i], { anchorX: 0.5, anchorY: 0 });
      world.addChild(b);
      cleanups.push(attachBalloon(b, world, drag, app.ticker, i, cb.reducedMotion));
    }
  }

  // --- cat wandering the floor ---
  if (!hidden('cat')) {
    const cat = new CatController(world, app.ticker, drag, cb.reducedMotion);
    cleanups.push(() => cat.destroy());
  }

  return { destroy: () => cleanups.forEach((fn) => fn()), photoWall };
}
