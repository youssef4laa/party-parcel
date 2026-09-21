import { Texture } from 'pixi.js';
import { drawBackground } from './sprites/background';
import { drawRug } from './sprites/rug';
import { drawWindow } from './sprites/window';
import { drawCurtain } from './sprites/curtain';
import { drawBanner } from './sprites/banner';
import { drawGarland } from './sprites/garland';
import { drawLantern, drawGlow } from './sprites/lantern';
import { drawStar, drawSparkle } from './sprites/star';
import { drawFrame } from './sprites/frame';
import { drawShelf } from './sprites/shelf';
import { drawCamera } from './sprites/camera';
import { drawTable, drawChair, drawCupcakeStand, drawVase, drawSnackBowl, drawCups } from './sprites/table';
import { drawCake, drawSmokePuff } from './sprites/cake';
import { drawBalloon, drawBalloonPop, type BalloonColor } from './sprites/balloon';
import { drawCat, drawMeowBubble, type CatPose } from './sprites/cat';
import {
  drawSofa,
  drawArmchair,
  drawBookshelf,
  drawSideTable,
  drawBeanBag,
  drawPottedPlant,
  drawTallTree,
  drawPineTree,
  drawStringLights,
  drawFloorLamp,
  drawNeonSign,
  drawStreamers,
  drawBalloonCluster,
  drawPinata,
  drawPartyHat,
} from './sprites/decor';

/**
 * Sprite manifest: every sprite the room can render, resolved today by a
 * procedural draw function. To swap in real art later, replace an entry's
 * `draw` with a loader that returns an `HTMLImageElement`/`HTMLCanvasElement`
 * for a real spritesheet frame — call sites that use `getTexture(key)` don't change.
 */
type DrawFn = () => HTMLCanvasElement;

const registry: Record<string, DrawFn> = {
  background: drawBackground,
  rug: drawRug,
  window: drawWindow,
  curtainLeft: () => drawCurtain('left'),
  curtainRight: () => drawCurtain('right'),
  garland: () => drawGarland(60),
  lantern: drawLantern,
  glow: () => drawGlow(26),
  star: drawStar,
  sparkle: drawSparkle,
  frameMountain: () => drawFrame('mountain'),
  frameTulip: () => drawFrame('tulip'),
  shelf: drawShelf,
  camera: drawCamera,
  table: drawTable,
  chair: drawChair,
  cupcakeStand: drawCupcakeStand,
  vase: drawVase,
  snackBowl: drawSnackBowl,
  cups: drawCups,
  cakeLit: () => drawCake(true),
  cakeUnlit: () => drawCake(false),
  smokePuff: drawSmokePuff,
  meowBubble: drawMeowBubble,
  balloonPop: drawBalloonPop,

  // Room Editor catalog (docs/ROOM_EDITOR.md 1c) — new placeable items
  sofa: drawSofa,
  armchair: drawArmchair,
  bookshelf: drawBookshelf,
  'side-table': drawSideTable,
  'bean-bag': drawBeanBag,
  'potted-plant': drawPottedPlant,
  'tall-tree': drawTallTree,
  'pine-tree': drawPineTree,
  'string-lights': () => drawStringLights(40),
  'paper-lantern-decor': drawLantern,
  'floor-lamp': drawFloorLamp,
  'neon-sign': drawNeonSign,
  streamers: () => drawStreamers(30),
  'balloon-cluster': drawBalloonCluster,
  pinata: drawPinata,
  'party-hat': drawPartyHat,
};

const balloonColors: BalloonColor[] = ['purple', 'red', 'green', 'yellow', 'orange', 'pink'];
for (const c of balloonColors) {
  registry[`balloon_${c}`] = () => drawBalloon(c, c === 'red');
}

const catPoses: CatPose[] = ['idle', 'walk0', 'walk1', 'hop', 'sit'];
for (const pose of catPoses) {
  registry[`cat_${pose}`] = () => drawCat(pose);
}

export function registerBannerText(text: string) {
  registry.banner = () => drawBanner(text);
  textureCache.delete('banner');
}

const textureCache = new Map<string, Texture>();

/** Get (and lazily build + cache) the PixiJS texture for a manifest key. Client-only. */
export function getTexture(key: string): Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const draw = registry[key];
  if (!draw) throw new Error(`Unknown sprite key: ${key}`);
  const canvas = draw();
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  textureCache.set(key, texture);
  return texture;
}

export function hasTexture(key: string) {
  return textureCache.has(key);
}

registerBannerText('HAPPY BIRTHDAY!');
