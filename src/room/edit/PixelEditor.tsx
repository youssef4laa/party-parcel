'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { palette as roomPalette } from '../draw/palette';
import { LIMITS } from '@/config/limits';
import {
  cloneBitmap,
  contentBounds,
  createBitmap,
  cropBitmap,
  defaultPlacementScale,
  ellipsePoints,
  flipHorizontal,
  flipVertical,
  floodFill,
  getPixel,
  hexToRgba,
  linePoints,
  rectPoints,
  rgbaToHex,
  rotateClockwise,
  setPixel,
  bitmapsEqual,
  TRANSPARENT,
  withMirror,
  type Bitmap,
  type RGBA,
} from '../pixelOps';
import { bitmapToCanvas, bitmapToPngBlob } from './imageIO';

export const DRAW_SIZES = [16, 32, 64, 128] as const;

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'ellipse';
const TOOLS: { key: Tool; label: string; hint: string }[] = [
  { key: 'pencil', label: 'Pencil', hint: 'Draw single pixels or freehand' },
  { key: 'eraser', label: 'Eraser', hint: 'Make pixels transparent' },
  { key: 'fill', label: 'Fill', hint: 'Fill a connected area' },
  { key: 'eyedropper', label: 'Pick', hint: 'Pick a color from the canvas' },
  { key: 'line', label: 'Line', hint: 'Drag to draw a straight line' },
  { key: 'rect', label: 'Rect', hint: 'Drag to draw a rectangle' },
  { key: 'ellipse', label: 'Ellipse', hint: 'Drag to draw an ellipse' },
];

// The room's own colors (deduped), plus black/white — "room palette plus custom and recent colors".
const ROOM_SWATCHES = Array.from(new Set(['#000000', '#ffffff', ...Object.values(roomPalette).map((c) => c.toLowerCase())]));
const MAX_HISTORY = 100;
const MAX_RECENT = 10;

const btn = (active = false) =>
  `border-2 px-1.5 py-1 font-mono text-[11px] ${active ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#5e3620] bg-[#fff6d5] text-[#5e3620]'}`;

const CHECKER =
  'repeating-conic-gradient(#d9c9b8 0% 25%, #f4ead9 0% 50%) 0 0 / 16px 16px';

/** Where in the canvas a pointer event landed, as a pixel cell (clamped to the bitmap). */
function cellAt(canvas: HTMLCanvasElement, bmp: Bitmap, clientX: number, clientY: number): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((clientX - rect.left) / rect.width) * bmp.width);
  const y = Math.floor(((clientY - rect.top) / rect.height) * bmp.height);
  return [Math.min(bmp.width - 1, Math.max(0, x)), Math.min(bmp.height - 1, Math.max(0, y))];
}

export type PixelEditorSaveOpts = { name: string; trim: boolean };

export default function PixelEditor({
  initial,
  initialName,
  editingExisting,
  canSaveOver,
  onSave,
  onCancel,
}: {
  initial: Bitmap;
  initialName: string;
  /** True when opened from an existing library item — enables "Save changes" next to "Save as new". */
  editingExisting: boolean;
  /** Whether the current user may overwrite the existing item (owner/host); false forces save-as-new. */
  canSaveOver: boolean;
  onSave: (png: Blob, opts: PixelEditorSaveOpts & { asNew: boolean }) => Promise<void>;
  onCancel: () => void;
}) {
  const bmpRef = useRef<Bitmap>(cloneBitmap(initial));
  const undoRef = useRef<Bitmap[]>([]);
  const redoRef = useRef<Bitmap[]>([]);
  // What the render reads about the bitmap. The bitmap itself lives in a ref (strokes mutate it in
  // place, many times a second), so anything the JSX needs — its size, whether undo/redo have
  // anything to do — is mirrored into this state by `bump`, which every change calls. `rev` is also
  // what tells the drawing effect below that the pixels changed.
  const [meta, setMeta] = useState({ rev: 0, w: initial.width, h: initial.height, canUndo: false, canRedo: false });
  const bump = useCallback(
    () =>
      setMeta((m) => ({
        rev: m.rev + 1,
        w: bmpRef.current.width,
        h: bmpRef.current.height,
        canUndo: undoRef.current.length > 0,
        canRedo: redoRef.current.length > 0,
      })),
    [],
  );
  const { rev, w, h } = meta;

  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#ff3d8b');
  const [recent, setRecent] = useState<string[]>([]);
  const [filled, setFilled] = useState(false);
  const [mirrorH, setMirrorH] = useState(false);
  const [mirrorV, setMirrorV] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(() => Math.max(1, Math.min(16, Math.floor(280 / Math.max(initial.width, initial.height)))));
  const [name, setName] = useState(initialName);
  const [trim, setTrim] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewSmallRef = useRef<HTMLCanvasElement | null>(null);
  const previewRoomRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<{ start: [number, number]; last: [number, number]; before: Bitmap } | null>(null);
  const shapePreviewRef = useRef<[number, number][] | null>(null);

  const pushHistory = useCallback((before: Bitmap) => {
    undoRef.current.push(before);
    if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
    redoRef.current = [];
  }, []);

  /** Runs `mutate` on a fresh copy, records the old state for undo, and swaps the copy in. */
  const commit = useCallback(
    (mutate: (b: Bitmap) => Bitmap | void) => {
      const before = bmpRef.current;
      const next = cloneBitmap(before);
      const replaced = mutate(next);
      const result = replaced ?? next;
      if (bitmapsEqual(before, result)) return;
      pushHistory(before);
      bmpRef.current = result;
      bump();
    },
    [bump, pushHistory],
  );

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(bmpRef.current);
    bmpRef.current = prev;
    bump();
  }, [bump]);
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(bmpRef.current);
    bmpRef.current = next;
    bump();
  }, [bump]);

  // Redraw the main canvas (image + grid + in-progress shape) and both previews whenever pixels,
  // zoom, or the grid toggle change. `rev` is the dependency that carries "the bitmap changed".
  useEffect(() => {
    const b = bmpRef.current;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = b.width * zoom;
      canvas.height = b.height * zoom;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmapToCanvas(b), 0, 0, canvas.width, canvas.height);
      const overlay = shapePreviewRef.current;
      if (overlay) {
        ctx.fillStyle = tool === 'eraser' ? 'rgba(255,255,255,0.6)' : color;
        ctx.globalAlpha = 0.7;
        for (const [px, py] of overlay) ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
        ctx.globalAlpha = 1;
      }
      if (showGrid && zoom >= 4) {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= b.width; x++) {
          ctx.moveTo(x * zoom + 0.5, 0);
          ctx.lineTo(x * zoom + 0.5, canvas.height);
        }
        for (let y = 0; y <= b.height; y++) {
          ctx.moveTo(0, y * zoom + 0.5);
          ctx.lineTo(canvas.width, y * zoom + 0.5);
        }
        ctx.stroke();
      }
    }
    // Previews: 1x real size, and "as placed in the room" at the scale a freshly placed copy gets.
    const small = previewSmallRef.current;
    if (small) bitmapToCanvas(b, small);
    const room = previewRoomRef.current;
    if (room) {
      const scale = defaultPlacementScale(b.width, b.height, { min: LIMITS.minObjectScale, max: LIMITS.maxObjectScale });
      const src = bitmapToCanvas(b);
      room.width = Math.max(1, Math.round(b.width * scale));
      room.height = Math.max(1, Math.round(b.height * scale));
      const ctx = room.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, room.width, room.height);
      ctx.drawImage(src, 0, 0, room.width, room.height);
    }
  }, [rev, zoom, showGrid, tool, color]);

  const rememberColor = useCallback((hex: string) => {
    setRecent((r) => [hex, ...r.filter((c) => c !== hex)].slice(0, MAX_RECENT));
  }, []);

  const paintColor = useMemo<RGBA>(() => hexToRgba(color), [color]);

  const stamp = useCallback(
    (b: Bitmap, pts: [number, number][], c: RGBA) => {
      for (const [x, y] of withMirror(pts, b, { horizontal: mirrorH, vertical: mirrorV })) setPixel(b, x, y, c);
    },
    [mirrorH, mirrorV],
  );

  const shapeCells = useCallback(
    (kind: Tool, from: [number, number], to: [number, number]) => {
      const pts =
        kind === 'line'
          ? linePoints(from[0], from[1], to[0], to[1])
          : kind === 'rect'
            ? rectPoints(from[0], from[1], to[0], to[1], filled)
            : ellipsePoints(from[0], from[1], to[0], to[1], filled);
      return withMirror(pts, bmpRef.current, { horizontal: mirrorH, vertical: mirrorV });
    },
    [filled, mirrorH, mirrorV],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const cell = cellAt(canvas, bmpRef.current, e.clientX, e.clientY);

    if (tool === 'eyedropper') {
      const [r, g, bl, a] = getPixel(bmpRef.current, cell[0], cell[1]);
      if (a > 0) {
        const hex = rgbaToHex([r, g, bl, 255]);
        setColor(hex);
        rememberColor(hex);
        setTool('pencil');
      }
      return;
    }
    if (tool === 'fill') {
      commit((b) => {
        floodFill(b, cell[0], cell[1], paintColor);
      });
      rememberColor(color);
      return;
    }

    strokeRef.current = { start: cell, last: cell, before: cloneBitmap(bmpRef.current) };
    if (tool === 'pencil' || tool === 'eraser') {
      stamp(bmpRef.current, [cell], tool === 'eraser' ? TRANSPARENT : paintColor);
      bump();
    } else {
      shapePreviewRef.current = shapeCells(tool, cell, cell);
      bump();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokeRef.current;
    const canvas = canvasRef.current;
    if (!stroke || !canvas) return;
    const cell = cellAt(canvas, bmpRef.current, e.clientX, e.clientY);
    if (cell[0] === stroke.last[0] && cell[1] === stroke.last[1]) return;
    if (tool === 'pencil' || tool === 'eraser') {
      // connect to the previous cell so a fast drag leaves a solid line, not scattered dots
      stamp(bmpRef.current, linePoints(stroke.last[0], stroke.last[1], cell[0], cell[1]), tool === 'eraser' ? TRANSPARENT : paintColor);
    } else {
      shapePreviewRef.current = shapeCells(tool, stroke.start, cell);
    }
    stroke.last = cell;
    bump();
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = strokeRef.current;
    const canvas = canvasRef.current;
    if (!stroke || !canvas) return;
    strokeRef.current = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      const cell = e.type === 'pointercancel' ? stroke.start : cellAt(canvas, bmpRef.current, e.clientX, e.clientY);
      const pts = shapeCells(tool, stroke.start, cell);
      shapePreviewRef.current = null;
      for (const [x, y] of pts) setPixel(bmpRef.current, x, y, paintColor);
    }
    if (tool !== 'eraser') rememberColor(color);
    if (bitmapsEqual(stroke.before, bmpRef.current)) {
      bump();
      return;
    }
    pushHistory(stroke.before);
    bump();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    }
  };

  const save = async (asNew: boolean) => {
    setError(null);
    let out = bmpRef.current;
    const bounds = contentBounds(out);
    if (!bounds) {
      setError('Draw something first — this image is completely transparent.');
      return;
    }
    if (trim) out = cropBitmap(out, bounds.x, bounds.y, bounds.w, bounds.h);
    setSaving(true);
    try {
      const png = await bitmapToPngBlob(out);
      if (png.size > LIMITS.maxCustomItemBytes) {
        throw new Error(`That image is ${Math.round(png.size / 1024)} KB — the limit is ${Math.round(LIMITS.maxCustomItemBytes / 1024)} KB.`);
      }
      await onSave(png, { name, trim, asNew });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" onKeyDown={onKeyDown} data-testid="pixel-editor">
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((t) => (
          <button key={t.key} type="button" title={t.hint} aria-pressed={tool === t.key} className={btn(tool === t.key)} onClick={() => setTool(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn(mirrorH)} aria-pressed={mirrorH} onClick={() => setMirrorH((v) => !v)} title="Mirror strokes left/right">
          Mirror ↔
        </button>
        <button type="button" className={btn(mirrorV)} aria-pressed={mirrorV} onClick={() => setMirrorV((v) => !v)} title="Mirror strokes top/bottom">
          Mirror ↕
        </button>
        <button type="button" className={btn(filled)} aria-pressed={filled} onClick={() => setFilled((v) => !v)} title="Fill rectangles and ellipses">
          Filled shapes
        </button>
        <button type="button" className={btn(showGrid)} aria-pressed={showGrid} onClick={() => setShowGrid((v) => !v)}>
          Grid
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn()} onClick={undo} disabled={!meta.canUndo} aria-label="Undo">
          Undo
        </button>
        <button type="button" className={btn()} onClick={redo} disabled={!meta.canRedo} aria-label="Redo">
          Redo
        </button>
        <button type="button" className={btn()} onClick={() => commit((b) => flipHorizontal(b))}>
          Flip ↔
        </button>
        <button type="button" className={btn()} onClick={() => commit((b) => flipVertical(b))}>
          Flip ↕
        </button>
        <button type="button" className={btn()} onClick={() => commit((b) => rotateClockwise(b))}>
          Rotate 90°
        </button>
        <button type="button" className={btn()} onClick={() => commit(() => createBitmap(bmpRef.current.width, bmpRef.current.height))}>
          Clear
        </button>
        <button type="button" className={btn()} onClick={() => setZoom((z) => Math.max(1, z - 1))} aria-label="Zoom out">
          −
        </button>
        <span className="self-center font-mono text-[11px] text-[#5e3620]">{zoom}×</span>
        <button type="button" className={btn()} onClick={() => setZoom((z) => Math.min(32, z + 1))} aria-label="Zoom in">
          +
        </button>
      </div>

      {/* The drawing surface: scrolls inside the panel at high zoom. `touch-action: none` is what
          makes one-finger drawing work on phones instead of the page scrolling under the stroke. */}
      <div className="max-h-[300px] overflow-auto border-2 border-[#5e3620]" style={{ background: CHECKER }}>
        <canvas
          ref={canvasRef}
          aria-label={`Pixel canvas ${w} by ${h}`}
          data-testid="pixel-canvas"
          className="block"
          style={{ imageRendering: 'pixelated', touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          onBlur={() => rememberColor(color)}
          aria-label="Custom color"
          className="h-7 w-9 border-2 border-[#5e3620] bg-white p-0"
        />
        <span className="font-mono text-[11px] text-[#5e3620]">{color}</span>
      </div>
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" aria-label="Recent colors">
          <span className="font-mono text-[10px] uppercase text-[#5e3620]/60">Recent</span>
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Recent color ${c}`}
              onClick={() => setColor(c)}
              className={`h-5 w-5 border ${c === color ? 'border-2 border-[#ff3d8b]' : 'border-[#5e3620]'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-[3px]" aria-label="Room palette">
        {ROOM_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Palette color ${c}`}
            onClick={() => setColor(c)}
            className={`h-5 w-5 border ${c === color ? 'border-2 border-[#ff3d8b]' : 'border-[#5e3620]/60'}`}
            style={{ background: c }}
          />
        ))}
      </div>

      <div className="flex items-end gap-3 border-2 border-[#e0b8c8] bg-white p-2">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase text-[#5e3620]/60">Real size</div>
          <canvas ref={previewSmallRef} data-testid="preview-real" style={{ imageRendering: 'pixelated', background: CHECKER, maxWidth: 128 }} />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="mb-1 font-mono text-[10px] uppercase text-[#5e3620]/60">In the room</div>
          <div className="overflow-auto bg-[#e8c9a0] p-1">
            <canvas ref={previewRoomRef} data-testid="preview-room" style={{ imageRendering: 'pixelated', maxHeight: 120 }} />
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
        Name
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="My item"
          className="border-2 border-[#e0b8c8] bg-white px-2 py-1 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 font-mono text-xs text-[#5e3620]">
        <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
        Trim empty edges when saving
      </label>

      {error && (
        <p role="alert" className="font-mono text-xs text-[#d1266a]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        {editingExisting && canSaveOver && (
          <button type="button" disabled={saving} className={btn(true)} onClick={() => save(false)}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
        <button type="button" disabled={saving} className={btn(!(editingExisting && canSaveOver))} onClick={() => save(true)}>
          {editingExisting ? 'Save as new item' : saving ? 'Saving…' : 'Save to My items'}
        </button>
        <button type="button" disabled={saving} className={btn()} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
