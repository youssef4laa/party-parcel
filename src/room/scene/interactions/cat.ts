import { Container, Sprite, Ticker } from 'pixi.js';
import { getTexture } from '../../manifest';
import { ROOM_WIDTH } from '../../constants';
import type { DragState } from '../camera';
import { showLabel } from './label';

const CAT_NAME = 'Biscuit';
const MIN_X = 220;
const MAX_X = ROOM_WIDTH - 260;
const WALK_SPEED = 55; // world px/s

type Mode = 'walk' | 'idle' | 'sit' | 'hop';

export type CatSpawn = { x: number; y: number; scale: number };

/** Autonomous wandering ginger cat: walks back and forth, pauses, sits, and reacts to clicks/hover. */
export class CatController {
  sprite: Sprite;
  private mode: Mode = 'idle';
  private dir = 1;
  private modeTimer = 1.5;
  private walkFrameTimer = 0;
  private walkFrame = 0;
  private hopT = 0;
  private baseY: number;
  private baseScale: number;
  private tickerFn: (t: Ticker) => void;
  private removeLabel: (() => void) | null = null;

  /**
   * `spawn` is the RoomObject row's own x/y/scale (docs/ROOM_EDITOR.md 1a's "at least make
   * position, scale, and hide work" escape hatch — a fully autonomous wanderer can't sensibly
   * *track* a stored position frame-by-frame, but it starts from wherever it was dropped and
   * keeps roaming the same room-wide corridor from there; see DECISIONS.md).
   */
  constructor(
    private world: Container,
    private ticker: Ticker,
    drag: DragState,
    private reducedMotion: boolean,
    spawn: CatSpawn,
  ) {
    this.sprite = new Sprite(getTexture('cat_idle'));
    this.sprite.anchor.set(0.5, 1);
    this.baseY = spawn.y;
    this.baseScale = spawn.scale;
    this.sprite.scale.set(this.baseScale);
    this.sprite.position.set(spawn.x, this.baseY);
    this.sprite.eventMode = 'static';
    this.sprite.cursor = 'pointer';
    this.sprite.accessible = true;
    this.sprite.accessibleTitle = `${CAT_NAME} the cat`;
    world.addChild(this.sprite);

    this.sprite.on('pointertap', () => {
      if (drag.wasDragging) return;
      this.hop();
    });
    this.sprite.on('pointerover', () => {
      this.removeLabel?.();
      this.removeLabel = showLabel(world, this.sprite.x, this.sprite.y - 90, CAT_NAME);
    });
    this.sprite.on('pointerout', () => {
      this.removeLabel?.();
      this.removeLabel = null;
    });

    this.tickerFn = (t) => this.update(t.deltaMS / 1000);
    ticker.add(this.tickerFn);
  }

  private setTexture(key: string) {
    this.sprite.texture = getTexture(key);
  }

  private pickNewMode() {
    if (this.reducedMotion) {
      this.mode = 'idle';
      this.modeTimer = 999;
      this.setTexture('cat_idle');
      return;
    }
    const r = Math.random();
    if (r < 0.55) {
      this.mode = 'walk';
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.modeTimer = 2 + Math.random() * 3;
    } else if (r < 0.8) {
      this.mode = 'idle';
      this.modeTimer = 1 + Math.random() * 2;
      this.setTexture('cat_idle');
    } else {
      this.mode = 'sit';
      this.modeTimer = 2 + Math.random() * 2;
      this.setTexture('cat_sit');
    }
  }

  private hop() {
    this.mode = 'hop';
    this.hopT = 0;
    this.removeLabel?.();
    this.removeLabel = showLabel(this.world, this.sprite.x, this.sprite.y - 90, `${CAT_NAME}: meow!`, true);
  }

  private update(dt: number) {
    this.modeTimer -= dt;

    if (this.mode === 'hop') {
      this.hopT += dt;
      const dur = 0.5;
      const t = Math.min(1, this.hopT / dur);
      this.sprite.y = this.baseY - Math.sin(t * Math.PI) * 20;
      this.setTexture('cat_hop');
      if (t >= 1) {
        this.sprite.y = this.baseY;
        this.pickNewMode();
      }
      return;
    }

    if (this.modeTimer <= 0) this.pickNewMode();

    if (this.mode === 'walk') {
      this.sprite.x += this.dir * WALK_SPEED * dt;
      if (this.sprite.x < MIN_X) { this.sprite.x = MIN_X; this.dir = 1; }
      if (this.sprite.x > MAX_X) { this.sprite.x = MAX_X; this.dir = -1; }
      this.sprite.scale.x = this.dir >= 0 ? this.baseScale : -this.baseScale;
      this.walkFrameTimer += dt;
      if (this.walkFrameTimer > 0.22) {
        this.walkFrameTimer = 0;
        this.walkFrame = this.walkFrame === 0 ? 1 : 0;
        this.setTexture(`cat_walk${this.walkFrame}`);
      }
    }
  }

  destroy() {
    this.ticker.remove(this.tickerFn);
    this.removeLabel?.();
    this.sprite.destroy();
  }
}
