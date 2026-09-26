import { Container, FederatedPointerEvent, Graphics, Sprite, Ticker } from 'pixi.js';
import { getTexture, anchorFor, manifestKeyFor, dynamicTextureFor } from './objectSprites';
import { parseObjectConfig } from './objectConfig';
import { buildGlows, relayoutGlows } from './lightGlow';
import type { DragState } from './camera';

export type RoomObjectData = {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  flipX: boolean;
  rotation: number;
  zone: string;
  locked: boolean;
  hidden: boolean;
  configJson: string;
  assetId: string | null;
  createdByRole: string;
  createdBySessionHash: string | null;
  updatedAt: string;
};

/** The original ~20 scene elements (window, banner, garlands, cake, cat, ...) — these render two
 * different ways depending on edit mode, and never both at once (see RoomCanvas.tsx's
 * `legacySceneRef` effect): in view mode, buildScene.ts renders them with their full
 * animated/interactive behavior (cake toggles, cat wanders, ...), positioned from this same
 * RoomObject data; in edit mode, buildScene's interactive scene is torn down and THIS layer
 * renders them instead, as plain static/draggable nodes — same as every catalog item, just with
 * no click-to-toggle/wander/etc. while you're rearranging. `isLegacyKind` is what `setObjects`
 * below uses to decide whether a kind belongs to this dual-render group at all. */
const LEGACY_KINDS = new Set([
  'rug', 'frame-mountain', 'frame-tulip', 'camera', 'window', 'curtain-left', 'curtain-right',
  'banner', 'garland', 'lantern', 'star', 'table', 'chair', 'cake', 'cupcake-stand', 'vase',
  'snack-bowl', 'cups', 'shelf', 'balloon', 'cat',
]);

export function isLegacyKind(kind: string): boolean {
  return LEGACY_KINDS.has(kind);
}

/** Catalog (non-legacy) kinds with a subtle idle animation even outside edit mode — a fairy-light
 * twinkle, say. Only ever touches `.alpha`, never position/rotation/scale, so it can never fight
 * the drag/transform system the way animating those would. */
const AMBIENT_ALPHA_TWINKLE_KINDS = new Set(['string-lights']);

const BASE_UNIT_PX = 4; // matches every sprite's own `unit` — used for the selection outline only
const HANDLE_PX = 14; // on-screen-ish size of a corner resize handle, in world px
const MIN_LIVE_SCALE = 0.1; // while dragging a handle / pinching, before the value is snapped and saved
const MAX_LIVE_SCALE = 8;

/** Per-node mutable state the persistent pointer handlers read from — kept OUTSIDE the handler
 * closures deliberately (see the comment on `applyInteractivity` for why: rebuilding listeners
 * on every React-driven `setObjects()` call, which happens mid-gesture the instant a drag's own
 * `pointerdown` selects the object, was silently discarding the in-progress drag). */
type NodeState = {
  obj: RoomObjectData;
  editMode: boolean;
  dragging: boolean;
  startPointer: { x: number; y: number };
  startNode: { x: number; y: number };
};

export class EditableObjectsLayer {
  private container = new Container();
  private nodes = new Map<string, Container>();
  private sprites = new Map<string, Sprite>();
  private selectionBoxes = new Map<string, Graphics>();
  private nodeStates = new Map<string, NodeState>();
  private ambientTickers = new Map<string, (ticker: Ticker) => void>();
  private handles = new Map<string, Container>();
  private glows = new Map<string, Sprite[]>();
  private selectedId: string | null = null;
  private interactive = false;
  /** A corner handle being dragged: scale follows the pointer's distance from the object's anchor. */
  private resize: { id: string; startDist: number; startScale: number; node: Container } | null = null;
  /** A two-finger pinch on the selected object. */
  private pinch: { id: string; startDist: number; startScale: number; node: Container } | null = null;
  private pinchCleanup: (() => void) | null = null;

  constructor(
    world: Container,
    private drag: DragState,
    private getScale: () => number,
    private ticker: Ticker,
    private onSelect: (id: string | null) => void,
    private onDragEnd: (id: string, x: number, y: number) => void,
    /** A corner-handle drag or a pinch finished: the RAW (unsnapped) scale the object ended at. The
     * owner snaps it (crisp integer steps unless free-scale is on), clamps it, and saves it. */
    private onResizeEnd: (id: string, rawScale: number) => void = () => {},
    /** Pinching needs the camera's own one-finger pan switched off for the duration. */
    private suspendCamera: (suspended: boolean) => void = () => {},
  ) {
    this.container.sortableChildren = true;
    world.addChild(this.container);
  }

  /** `interactive` is whether nodes are selectable/draggable — it defaults to `editMode`, but differs
   * for someone in edit mode who may move presents and NOT room objects (docs/ROOM_EDITOR.md 4a):
   * they still see the edit-mode render, they just can't grab anything in it.
   *
   * In view mode, legacy kinds are excluded — buildScene.ts renders those instead, with their
   * full interactive/animated behavior. In edit mode, every non-hidden kind (legacy included)
   * renders here as a plain draggable node. See the LEGACY_KINDS comment above. */
  setObjects(objects: RoomObjectData[], editMode: boolean, selectedId: string | null, interactive: boolean = editMode) {
    this.selectedId = selectedId;
    this.interactive = interactive;
    const visible = objects.filter((o) => !o.hidden && (editMode || !isLegacyKind(o.kind)));
    const seen = new Set<string>();

    for (const obj of visible) {
      seen.add(obj.id);
      let node = this.nodes.get(obj.id);
      if (!node) {
        const built = this.buildNode(obj);
        node = built.node;
        this.nodes.set(obj.id, node);
        this.selectionBoxes.set(obj.id, built.selectionBox);
        this.container.addChild(node);
      }

      const state = this.nodeStates.get(obj.id);
      if (state) {
        // A kind whose look depends on its own configJson (cake, banner, neon-sign, balloon — see
        // dynamicTextureFor) needs its sprite's texture rebuilt when THAT changes — buildNode only
        // ever runs once per object id, so without this, editing a placed cake's style/text/colors
        // (docs/ROOM_EDITOR.md Phase 2's Cake editor) would silently do nothing to the actual
        // in-room sprite until edit mode was toggled off and back on. Position/scale/rotation
        // already refresh every call via applyTransform below; this is the one thing that didn't.
        if (state.obj.configJson !== obj.configJson) {
          const dynamicTex = dynamicTextureFor(obj.kind, parseObjectConfig(obj.configJson), obj.assetId);
          if (dynamicTex) {
            const sprite = this.sprites.get(obj.id);
            if (sprite) {
              sprite.texture = dynamicTex;
              const glows = this.glows.get(obj.id);
              if (glows) relayoutGlows(obj.kind, sprite, glows); // its size may have changed with the new text
            }
          }
        }
        // A custom item's pixels change without ITS row changing at all (the library entry was
        // edited in the pixel editor and every placed copy should follow), so compare the texture
        // itself — a plain map lookup, cheap enough to do on every sync for custom kinds only.
        if (obj.kind === 'custom') {
          const tex = dynamicTextureFor('custom', {}, obj.assetId);
          const sprite = this.sprites.get(obj.id);
          if (tex && sprite && sprite.texture !== tex) {
            sprite.texture = tex;
            const box = this.selectionBoxes.get(obj.id);
            if (box) this.drawSelectionBox(box, sprite);
          }
        }
        // Update the snapshot the persistent handlers read from — never touch listeners here,
        // and never clobber x/y while a drag on THIS node is actually in progress (a reactive
        // setObjects can land mid-gesture, e.g. right after the drag's own pointerdown selects
        // the object and triggers a re-render).
        state.obj = obj;
        state.editMode = interactive;
      }
      if (!state?.dragging) this.applyTransform(node, obj);
      this.applyStaticInteractivity(node, obj, interactive, selectedId === obj.id);
    }

    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.destroy({ children: true });
        this.nodes.delete(id);
        this.sprites.delete(id);
        this.selectionBoxes.delete(id);
        this.handles.delete(id);
        this.glows.delete(id);
        this.nodeStates.delete(id);
        const ambientFn = this.ambientTickers.get(id);
        if (ambientFn) {
          this.ticker.remove(ambientFn);
          this.ambientTickers.delete(id);
        }
      }
    }
  }

  private buildNode(obj: RoomObjectData): { node: Container; selectionBox: Graphics } {
    const node = new Container();
    const config = parseObjectConfig(obj.configJson);
    const dynamicTex = dynamicTextureFor(obj.kind, config, obj.assetId);
    const texture = dynamicTex ?? getTexture(manifestKeyFor(obj.kind));
    const sprite = new Sprite(texture);
    const anchor = anchorFor(obj.kind, obj.zone);
    sprite.anchor.set(anchor.x, anchor.y);
    node.addChild(sprite);
    this.sprites.set(obj.id, sprite);
    // Lights glow. The glow is a child of THIS node, so it shares the light's z-order (see lightGlow.ts).
    const glows = buildGlows(obj.kind, sprite);
    for (const glow of glows) node.addChild(glow);
    if (glows.length) this.glows.set(obj.id, glows);

    const selectionBox = new Graphics();
    selectionBox.visible = false;
    node.addChild(selectionBox);
    this.drawSelectionBox(selectionBox, sprite);

    const handles = new Container();
    handles.visible = false;
    for (let i = 0; i < 4; i++) {
      const g = new Graphics();
      g.eventMode = 'static';
      g.cursor = i === 0 || i === 3 ? 'nwse-resize' : 'nesw-resize';
      this.attachHandleEvents(g, obj.id);
      handles.addChild(g);
    }
    node.addChild(handles);
    this.handles.set(obj.id, handles);

    const state: NodeState = {
      obj,
      editMode: false,
      dragging: false,
      startPointer: { x: 0, y: 0 },
      startNode: { x: 0, y: 0 },
    };
    this.nodeStates.set(obj.id, state);
    this.attachPersistentHandlers(node, state);

    if (AMBIENT_ALPHA_TWINKLE_KINDS.has(obj.kind)) {
      let t = Math.random() * 10;
      const tickerFn = (ticker: Ticker) => {
        t += ticker.deltaMS / 1000;
        sprite.alpha = 0.75 + Math.sin(t * 1.4) * 0.25;
      };
      this.ticker.add(tickerFn);
      this.ambientTickers.set(obj.id, tickerFn);
    }

    return { node, selectionBox };
  }

  /** Attached exactly once per node, for its whole lifetime — never torn down and rebuilt by a
   * `setObjects()` call, which (see NodeState's comment) would otherwise reset `dragging` mid-
   * gesture the moment selecting the object on pointerdown triggers a React re-render. */
  private attachPersistentHandlers(node: Container, state: NodeState) {
    node.on('pointertap', () => {
      if (this.drag.wasDragging) return;
      if (!state.editMode) return;
      this.onSelect(state.obj.id);
    });

    node.on('pointerdown', (e: FederatedPointerEvent) => {
      if (!state.editMode || state.obj.locked || this.pinch) return;
      state.dragging = true;
      state.startPointer = { x: e.global.x, y: e.global.y };
      state.startNode = { x: node.x, y: node.y };
      this.onSelect(state.obj.id);
      e.stopPropagation();
    });

    node.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!state.dragging) return;
      // e.global is in stage/screen pixels, unaffected by the world container's pan/zoom scale —
      // node.x/y are world-local, so the raw screen delta has to be un-scaled first, or dragging
      // moves objects at the wrong rate whenever the camera isn't at scale 1 (it almost never is
      // — computeScale() in scene/camera.ts fits the room height to the viewport).
      const scale = this.getScale();
      node.x = state.startNode.x + (e.global.x - state.startPointer.x) / scale;
      node.y = state.startNode.y + (e.global.y - state.startPointer.y) / scale;
    });

    const endDrag = () => {
      if (!state.dragging) return;
      state.dragging = false;
      this.onDragEnd(state.obj.id, node.x, node.y);
    };
    node.on('pointerup', endDrag);
    node.on('pointerupoutside', endDrag);
  }

  private drawSelectionBox(g: Graphics, sprite: Sprite) {
    const w = sprite.width;
    const h = sprite.height;
    const x = -sprite.anchor.x * w;
    const y = -sprite.anchor.y * h;
    g.clear();
    g.rect(x - BASE_UNIT_PX, y - BASE_UNIT_PX, w + BASE_UNIT_PX * 2, h + BASE_UNIT_PX * 2);
    g.stroke({ width: 2, color: 0xff3d8b });
  }

  private applyTransform(node: Container, obj: RoomObjectData) {
    node.position.set(obj.x, obj.y);
    node.scale.set(obj.flipX ? -obj.scale : obj.scale, obj.scale);
    node.angle = obj.rotation;
    node.zIndex = obj.zone === 'floor' ? 100_000 + obj.y : obj.z;
  }

  /** Only ever touches display/cursor state, never (re)registers listeners — see
   * attachPersistentHandlers for why that distinction matters. */
  private applyStaticInteractivity(node: Container, obj: RoomObjectData, editMode: boolean, selected: boolean) {
    const selectionBox = this.selectionBoxes.get(obj.id);
    if (selectionBox) selectionBox.visible = selected;
    this.updateHandles(obj, editMode && selected && !obj.locked);
    node.eventMode = editMode ? 'static' : 'none';
    node.cursor = editMode ? (obj.locked ? 'not-allowed' : 'grab') : 'default';
  }

  /** Positions the four corner handles on the object's own bounds and keeps them a constant size on
   * screen regardless of how much the object is scaled. */
  private updateHandles(obj: RoomObjectData, show: boolean) {
    const handles = this.handles.get(obj.id);
    const sprite = this.sprites.get(obj.id);
    if (!handles) return;
    handles.visible = show;
    if (!show || !sprite) return;
    const w = sprite.width;
    const h = sprite.height;
    const x0 = -sprite.anchor.x * w;
    const y0 = -sprite.anchor.y * h;
    const size = HANDLE_PX / Math.max(Math.abs(obj.scale), 0.05);
    const corners: Array<[number, number]> = [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]];
    handles.children.forEach((child, i) => {
      const g = child as Graphics;
      g.clear();
      g.rect(corners[i][0] - size / 2, corners[i][1] - size / 2, size, size).fill(0xffffff).stroke({ width: 2 / Math.max(Math.abs(obj.scale), 0.05), color: 0xff3d8b });
    });
  }

  private attachHandleEvents(g: Graphics, id: string) {
    g.on('pointerdown', (e: FederatedPointerEvent) => {
      const node = this.nodes.get(id);
      const state = this.nodeStates.get(id);
      if (!node || !state || state.obj.locked) return;
      e.stopPropagation(); // not a drag of the object, and not a camera pan
      const p = this.container.toLocal(e.global);
      const startDist = Math.hypot(p.x - node.x, p.y - node.y);
      if (startDist < 1) return;
      this.resize = { id, startDist, startScale: state.obj.scale, node };
    });
    g.on('globalpointermove', (e: FederatedPointerEvent) => {
      const r = this.resize;
      if (!r || r.id !== id) return;
      const p = this.container.toLocal(e.global);
      const raw = r.startScale * (Math.hypot(p.x - r.node.x, p.y - r.node.y) / r.startDist);
      const scale = Math.min(MAX_LIVE_SCALE, Math.max(MIN_LIVE_SCALE, raw));
      r.node.scale.set(r.node.scale.x < 0 ? -scale : scale, scale); // live preview; snapped + saved on release
    });
    const end = () => {
      const r = this.resize;
      if (!r || r.id !== id) return;
      this.resize = null;
      this.drag.wasDragging = true; // the release must not count as a tap that re-selects something
      this.onResizeEnd(id, Math.abs(r.node.scale.y));
    };
    g.on('pointerup', end);
    g.on('pointerupoutside', end);
  }

  /**
   * Two-finger pinch resizes the SELECTED object (docs/ROOM_EDITOR.md 1b: touch — drag, pinch to
   * resize). Listens on the canvas element directly for touch pointers only, so mouse behavior is
   * untouched; the camera's one-finger pan is suspended for the gesture and any half-started drag
   * of an object (the first finger usually lands on it) is cancelled.
   */
  enablePinch(canvas: HTMLCanvasElement) {
    this.pinchCleanup?.();
    const touches = new Map<number, { x: number; y: number }>();
    const spread = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) this.startPinch(spread());
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && touches.size >= 2) this.updatePinch(spread());
    };
    const up = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      if (this.pinch && touches.size < 2) this.endPinch();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    this.pinchCleanup = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }

  private startPinch(distance: number) {
    const id = this.selectedId;
    if (!id || !this.interactive || distance < 10) return;
    const node = this.nodes.get(id);
    const state = this.nodeStates.get(id);
    if (!node || !state || state.obj.locked) return;
    // The first finger usually landed on the object and began dragging it — undo that.
    for (const [nodeId, st] of this.nodeStates) {
      if (!st.dragging) continue;
      st.dragging = false;
      this.nodes.get(nodeId)?.position.set(st.startNode.x, st.startNode.y);
    }
    this.resize = null;
    this.drag.active = false;
    this.drag.wasDragging = true;
    this.suspendCamera(true);
    this.pinch = { id, startDist: distance, startScale: state.obj.scale, node };
  }

  private updatePinch(distance: number) {
    const p = this.pinch;
    if (!p) return;
    const scale = Math.min(MAX_LIVE_SCALE, Math.max(MIN_LIVE_SCALE, p.startScale * (distance / p.startDist)));
    p.node.scale.set(p.node.scale.x < 0 ? -scale : scale, scale);
  }

  private endPinch() {
    const p = this.pinch;
    if (!p) return;
    this.pinch = null;
    this.suspendCamera(false);
    this.drag.wasDragging = true;
    this.onResizeEnd(p.id, Math.abs(p.node.scale.y));
  }

  destroy() {
    this.pinchCleanup?.();
    this.pinchCleanup = null;
    this.handles.clear();
    this.glows.clear();
    for (const fn of this.ambientTickers.values()) this.ticker.remove(fn);
    this.ambientTickers.clear();
    this.container.destroy({ children: true });
    this.nodes.clear();
    this.sprites.clear();
    this.selectionBoxes.clear();
    this.nodeStates.clear();
  }
}
