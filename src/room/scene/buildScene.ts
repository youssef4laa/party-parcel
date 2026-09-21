import { Application, Container, Sprite } from 'pixi.js';
import { getTexture } from '../manifest';
import { manifestKeyFor, anchorFor } from './objectSprites';
import { parseObjectConfig } from './objectConfig';
import type { DragState } from './camera';
import { CatController } from './interactions/cat';
import { attachBalloon } from './interactions/balloon';
import { attachStar } from './interactions/star';
import { attachCake } from './interactions/cake';
import { attachFrame } from './interactions/frame';
import { attachCameraTrigger } from './interactions/photobooth';
import type { RoomObjectData } from './editableObjects';

export type SceneCallbacks = {
  onEnlargeFrame: (subject: 'mountain' | 'tulip') => void;
  onCakeToggle?: (lit: boolean) => void;
  onOpenPhotobooth: () => void;
  reducedMotion: boolean;
  /**
   * Room Editor (docs/ROOM_EDITOR.md 1a): every legacy scene element (window, banner, garlands,
   * cake, cat, ...) is now a real RoomObject row, and this is the *interactive, animated* render
   * of them — position/scale/rotation/flip all come from here, a hidden row is skipped entirely,
   * and each row gets its own sprite + interaction attached at ITS OWN position (so a click target
   * follows the sprite after it's been moved). Only rendered while edit mode is off; while editing,
   * RoomCanvas.tsx tears this down and EditableObjectsLayer renders the same rows as plain
   * draggable nodes instead — see its LEGACY_KINDS comment for why these never coexist.
   */
  objects: RoomObjectData[];
};

function spriteFor(obj: RoomObjectData, textureKey?: string) {
  const s = new Sprite(getTexture(textureKey ?? manifestKeyFor(obj.kind)));
  const anchor = anchorFor(obj.kind, obj.zone);
  s.anchor.set(anchor.x, anchor.y);
  s.position.set(obj.x, obj.y);
  s.scale.set(obj.flipX ? -obj.scale : obj.scale, obj.scale);
  s.angle = obj.rotation;
  return s;
}

function bareSprite(key: string, x: number, y: number, opts: Partial<{ anchorX: number; anchorY: number; scale: number }> = {}) {
  const s = new Sprite(getTexture(key));
  s.anchor.set(opts.anchorX ?? 0, opts.anchorY ?? 0);
  s.position.set(x, y);
  if (opts.scale) s.scale.set(opts.scale);
  return s;
}

/** The wallpaper/wainscoting backdrop isn't a RoomObject either — like the photo wall, it's
 * always-present infrastructure RoomCanvas.tsx mounts once, directly, so it never disappears
 * while buildScene's legacy scene is torn down for edit mode. */
export function mountBackground(world: Container) {
  world.addChild(bareSprite('background', 0, 0));
}

export function buildScene(app: Application, world: Container, drag: DragState, cb: SceneCallbacks) {
  const cleanups: Array<() => void> = [];

  // Every interaction's own cleanup function (attachCake, attachFrame, ...) only detaches its
  // listeners/transient overlays — that was safe when buildScene ran exactly once for the whole
  // component's lifetime (the sprites died with the Pixi app on unmount either way), but this
  // scene is now torn down and rebuilt every time edit mode toggles (see RoomCanvas.tsx), so a
  // node that's never explicitly destroyed here would linger in `world` as an orphaned duplicate
  // underneath the next rebuild. `mount` is the one place every top-level node this function adds
  // goes through, so `destroy()` below can reliably remove all of them, not just their listeners.
  function mount<T extends Container>(node: T): T {
    world.addChild(node);
    cleanups.push(() => {
      if (!node.destroyed) node.destroy({ children: true });
    });
    return node;
  }

  const byKind = new Map<string, RoomObjectData[]>();
  for (const obj of cb.objects) {
    if (obj.hidden) continue;
    const list = byKind.get(obj.kind);
    if (list) list.push(obj);
    else byKind.set(obj.kind, [obj]);
  }
  const rowsFor = (kind: string) => byKind.get(kind) ?? [];

  for (const obj of rowsFor('rug')) mount(spriteFor(obj));

  for (const obj of rowsFor('frame-mountain')) {
    const s = mount(spriteFor(obj));
    cleanups.push(attachFrame(s, drag, () => cb.onEnlargeFrame('mountain')));
  }
  for (const obj of rowsFor('frame-tulip')) {
    const s = mount(spriteFor(obj));
    cleanups.push(attachFrame(s, drag, () => cb.onEnlargeFrame('tulip')));
  }

  for (const obj of rowsFor('camera')) {
    const s = mount(spriteFor(obj));
    cleanups.push(attachCameraTrigger(s, drag, cb.onOpenPhotobooth));
  }

  for (const obj of rowsFor('window')) mount(spriteFor(obj));
  for (const obj of rowsFor('curtain-left')) mount(spriteFor(obj));
  for (const obj of rowsFor('curtain-right')) mount(spriteFor(obj));
  for (const obj of rowsFor('banner')) mount(spriteFor(obj));
  for (const obj of rowsFor('garland')) mount(spriteFor(obj));

  for (const obj of rowsFor('lantern')) {
    const lanternSprite = spriteFor(obj);
    // The glow is a purely decorative companion, not its own RoomObject — it always follows
    // whichever lantern row it's paired with, at the same offset the original hardcoded scene used.
    const glow = bareSprite('glow', lanternSprite.x, obj.y + 90, { anchorX: 0.5, anchorY: 0.5 });
    glow.alpha = 0.6;
    glow.blendMode = 'add';
    mount(glow);
    mount(lanternSprite);
  }

  rowsFor('star').forEach((obj, i) => {
    const s = mount(spriteFor(obj));
    cleanups.push(attachStar(s, world, drag, app.ticker, i, cb.reducedMotion));
  });

  for (const obj of rowsFor('table')) mount(spriteFor(obj));
  for (const obj of rowsFor('chair')) mount(spriteFor(obj));

  for (const obj of rowsFor('cake')) {
    const cakeState = { lit: true };
    const s = mount(spriteFor(obj, 'cakeLit'));
    cleanups.push(attachCake(s, drag, app.ticker, cakeState, cb.onCakeToggle));
  }

  for (const obj of rowsFor('cupcake-stand')) mount(spriteFor(obj));
  for (const obj of rowsFor('vase')) mount(spriteFor(obj));
  for (const obj of rowsFor('snack-bowl')) mount(spriteFor(obj));
  for (const obj of rowsFor('cups')) mount(spriteFor(obj));

  for (const obj of rowsFor('shelf')) mount(spriteFor(obj));

  rowsFor('balloon').forEach((obj, i) => {
    const config = parseObjectConfig(obj.configJson);
    const color = typeof config.color === 'string' ? config.color : 'purple';
    const s = mount(spriteFor(obj, `balloon_${color}`));
    cleanups.push(attachBalloon(s, world, drag, app.ticker, i, cb.reducedMotion));
  });

  for (const obj of rowsFor('cat')) {
    const cat = new CatController(world, app.ticker, drag, cb.reducedMotion, { x: obj.x, y: obj.y, scale: obj.scale });
    cleanups.push(() => cat.destroy());
  }

  return { destroy: () => cleanups.forEach((fn) => fn()) };
}
