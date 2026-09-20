import { Sprite, Texture, Ticker } from 'pixi.js';
import { renderBox } from '@/box/renderBox';
import type { BoxDesign } from '@/box/types';

export const BOX_WORLD_SIZE = 64;

export function textureForDesign(design: BoxDesign, mode: 'closed' | 'open' = 'closed') {
  const canvas = renderBox(design, mode);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/** A present sprite anchored at its base (bottom-center), sized to its footprint in the room. */
export function createBoxSprite(design: BoxDesign, mode: 'closed' | 'open' = 'closed') {
  const s = new Sprite(textureForDesign(design, mode));
  s.anchor.set(0.5, 1);
  s.width = BOX_WORLD_SIZE;
  s.height = BOX_WORLD_SIZE;
  return s;
}

/** Squash-and-bounce landing animation, then settles at the sprite's natural size. */
export function animateSettle(sprite: Sprite, ticker: Ticker, reducedMotion: boolean) {
  const targetW = sprite.width || BOX_WORLD_SIZE;
  const targetH = sprite.height || BOX_WORLD_SIZE;
  if (reducedMotion) return;
  let t = 0;
  const dur = 0.4;
  const fn = (tk: Ticker) => {
    t += tk.deltaMS / 1000;
    const p = Math.min(1, t / dur);
    const squash = Math.sin(p * Math.PI) * 0.22;
    sprite.width = targetW * (1 + squash * 0.6);
    sprite.height = targetH * (1 - squash);
    if (p >= 1) {
      sprite.width = targetW;
      sprite.height = targetH;
      ticker.remove(fn);
    }
  };
  ticker.add(fn);
}

/** Hover lift + wobble for a placed present. */
export function attachHoverWobble(sprite: Sprite, ticker: Ticker) {
  const baseScale = { x: sprite.scale.x, y: sprite.scale.y };
  let hovering = false;
  let t = 0;
  sprite.on('pointerover', () => (hovering = true));
  sprite.on('pointerout', () => {
    hovering = false;
    sprite.rotation = 0;
    sprite.scale.set(baseScale.x, baseScale.y);
  });
  const fn = (tk: Ticker) => {
    if (!hovering) return;
    t += tk.deltaMS / 1000;
    sprite.rotation = Math.sin(t * 8) * 0.06;
    sprite.scale.set(baseScale.x * 1.06, baseScale.y * 1.06);
  };
  ticker.add(fn);
  return () => ticker.remove(fn);
}
