import { Container, Sprite, Texture } from 'pixi.js';
import type { DragState } from '../camera';
import { createPixelCanvas } from '../../draw/pixelCanvas';
import { palette as p } from '../../draw/palette';
import type { PhotoboothShotView } from '../../dataSource';

/** Click the camera prop to open the photobooth modal (handled by the caller, a DOM overlay). */
export function attachCameraTrigger(sprite: Sprite, drag: DragState, onTap: () => void) {
  sprite.eventMode = 'static';
  sprite.cursor = 'pointer';
  sprite.accessible = true;
  sprite.accessibleTitle = 'Photobooth camera — click to take a photo';
  const handler = () => {
    if (drag.wasDragging) return;
    onTap();
  };
  sprite.on('pointertap', handler);
  return () => sprite.off('pointertap', handler);
}

const UNIT = 4;
const GRID = 16; // print is GRID x (GRID+2) cells, square photo window + a caption-strip margin
const PRINT_W = GRID * UNIT; // 64
const PRINT_H = (GRID + 2) * UNIT; // 72
const PHOTO_INSET = 1.5 * UNIT; // 6
const PHOTO_SIZE = PRINT_W - PHOTO_INSET * 2; // 52
const GAP = 8;
const COLS = 3;

let frameTextureCache: Texture | null = null;

/** The cream polaroid-style border every print sits in, drawn once and reused (matches how wall
 * frames / other procedural sprites are cached — see manifest.ts). */
function getPrintFrameTexture(): Texture {
  if (frameTextureCache) return frameTextureCache;
  const g = createPixelCanvas(GRID, GRID + 2, UNIT);
  g.px(0, 0, GRID, GRID + 2, p.cream);
  g.px(1.5, 1.5, GRID - 3, GRID - 3, p.wallWoodDark);
  g.pborder(0, 0, GRID, GRID + 2, p.outline);
  const tex = Texture.from(g.canvas);
  tex.source.scaleMode = 'nearest';
  frameTextureCache = tex;
  return tex;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

/**
 * A small grid of photo "prints" beside the booth (section 3). Each print is a cream frame
 * (procedural, cached) plus the real captured photo loaded as a plain `<img>` and wrapped in a
 * `Texture` — deliberately not PixiJS's `Assets` loader, which resolves a parser from the URL's
 * file extension and would misfire on our extension-less signed asset URLs and blob:/data: URLs.
 */
export class PhotoWall {
  private container = new Container();
  private items = new Map<string, Container>();

  constructor(
    world: Container,
    private originX: number,
    private originY: number,
    private onTapPrint: (shot: PhotoboothShotView) => void,
  ) {
    world.addChild(this.container);
  }

  private slotPosition(index: number) {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    return { x: this.originX + col * (PRINT_W + GAP), y: this.originY + row * (PRINT_H + GAP) };
  }

  /** Reconciles the wall with the given shot list: repositions/keeps existing prints, removes
   * ones no longer present, and loads any new ones. Safe to call repeatedly (e.g. after a poll). */
  async setShots(shots: PhotoboothShotView[]) {
    for (const [id, node] of this.items) {
      if (!shots.some((s) => s.id === id)) {
        node.destroy({ children: true });
        this.items.delete(id);
      }
    }
    await Promise.all(
      shots.map((shot, i) => {
        const existing = this.items.get(shot.id);
        if (existing) {
          const { x, y } = this.slotPosition(i);
          existing.position.set(x, y);
          return undefined;
        }
        return this.addPrint(shot, i);
      }),
    );
  }

  private async addPrint(shot: PhotoboothShotView, index: number) {
    const { x, y } = this.slotPosition(index);
    const node = new Container();
    node.position.set(x, y);
    node.addChild(new Sprite(getPrintFrameTexture()));

    try {
      const img = await loadImage(shot.url);
      const texture = Texture.from(img);
      texture.source.scaleMode = 'nearest';
      const photo = new Sprite(texture);
      const scale = Math.min(PHOTO_SIZE / img.naturalWidth, PHOTO_SIZE / img.naturalHeight);
      photo.scale.set(scale);
      photo.position.set(
        PHOTO_INSET + (PHOTO_SIZE - img.naturalWidth * scale) / 2,
        PHOTO_INSET + (PHOTO_SIZE - img.naturalHeight * scale) / 2,
      );
      node.addChild(photo);
    } catch {
      // signed URL expired or the network hiccuped — the cream frame alone still shows, and a
      // fresh setShots() call (e.g. after reopening the room) will retry the load
    }

    node.eventMode = 'static';
    node.cursor = 'pointer';
    node.accessible = true;
    node.accessibleTitle = shot.caption;
    node.on('pointertap', () => this.onTapPrint(shot));
    this.container.addChild(node);
    this.items.set(shot.id, node);
  }

  destroy() {
    this.container.destroy({ children: true });
    this.items.clear();
  }
}
