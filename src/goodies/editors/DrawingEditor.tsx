'use client';

import { useEffect, useRef, useState } from 'react';
import type { DrawingPayload } from '@/goodies/schema';
import { EditorShell } from './shared';
import { useAssetUpload } from './useAssetUpload';
import type { GoodieEditorProps } from './types';

const SIZE = 512;
const COLORS = [
  '#000000', '#ffffff', '#7a4a30', '#ff3d8b', '#f4a6c1', '#ffd166', '#f4d35e', '#9be08d',
  '#5a9e4a', '#6ec6ff', '#3a6ea8', '#a679d6', '#f0954a', '#e6566f', '#8a5a35', '#c9c2c2',
];
const BRUSH_SIZES = [2, 6, 12, 24];

export default function DrawingEditor({ roomToken, onSave, onCancel }: GoodieEditorProps<DrawingPayload>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);

  const [color, setColor] = useState(COLORS[3]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'fill'>('brush');
  const { upload, uploading, error } = useAssetUpload(roomToken, 'drawing');

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    pushHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time canvas init
  }, []);

  function ctx() {
    return canvasRef.current!.getContext('2d')!;
  }

  function pushHistory() {
    historyRef.current.push(ctx().getImageData(0, 0, SIZE, SIZE));
    if (historyRef.current.length > 25) historyRef.current.shift();
    redoRef.current = [];
  }

  function undo() {
    if (historyRef.current.length <= 1) return;
    redoRef.current.push(historyRef.current.pop()!);
    ctx().putImageData(historyRef.current[historyRef.current.length - 1], 0, 0);
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(next);
    ctx().putImageData(next, 0, 0);
  }

  function clear() {
    ctx().fillStyle = '#ffffff';
    ctx().fillRect(0, 0, SIZE, SIZE);
    pushHistory();
  }

  function posFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE };
  }

  function floodFill(x: number, y: number, fillColor: string) {
    const c = ctx();
    const img = c.getImageData(0, 0, SIZE, SIZE);
    const data = img.data;
    const startIdx = (Math.floor(y) * SIZE + Math.floor(x)) * 4;
    const target = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];
    const fill = hexToRgba(fillColor);
    if (target.every((v, i) => v === fill[i])) return;

    const stack = [[Math.floor(x), Math.floor(y)]];
    while (stack.length) {
      const [px, py] = stack.pop()!;
      if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
      const idx = (py * SIZE + px) * 4;
      if (!colorsMatch(data, idx, target)) continue;
      data[idx] = fill[0];
      data[idx + 1] = fill[1];
      data[idx + 2] = fill[2];
      data[idx + 3] = fill[3];
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    c.putImageData(img, 0, 0);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const pos = posFromEvent(e);
    if (tool === 'fill') {
      floodFill(pos.x, pos.y, color);
      pushHistory();
      return;
    }
    drawing.current = true;
    last.current = pos;
    drawDot(pos);
  }

  function drawDot(pos: { x: number; y: number }) {
    const c = ctx();
    c.fillStyle = tool === 'eraser' ? '#ffffff' : color;
    c.beginPath();
    c.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    c.fill();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const pos = posFromEvent(e);
    const c = ctx();
    c.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    c.lineWidth = brushSize;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(last.current.x, last.current.y);
    c.lineTo(pos.x, pos.y);
    c.stroke();
    last.current = pos;
  }

  function onPointerUp() {
    if (drawing.current) pushHistory();
    drawing.current = false;
    last.current = null;
  }

  async function handleSave() {
    const blob: Blob | null = await new Promise((resolve) => canvasRef.current!.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const result = await upload(blob, 'drawing.png');
    if (result) {
      onSave({ id: '', type: 'drawing', assetKey: result.assetKey, sizeBytes: result.size });
    }
  }

  return (
    <EditorShell title="Drawing" onCancel={onCancel} onSave={handleSave} saveDisabled={uploading} error={error}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTool('brush')}
          className={`border-2 px-2 py-1 font-mono text-xs ${tool === 'brush' ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#e0b8c8] bg-white text-[#5e3620]'}`}
        >
          Brush
        </button>
        <button
          type="button"
          onClick={() => setTool('eraser')}
          className={`border-2 px-2 py-1 font-mono text-xs ${tool === 'eraser' ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#e0b8c8] bg-white text-[#5e3620]'}`}
        >
          Eraser
        </button>
        <button
          type="button"
          onClick={() => setTool('fill')}
          className={`border-2 px-2 py-1 font-mono text-xs ${tool === 'fill' ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#e0b8c8] bg-white text-[#5e3620]'}`}
        >
          Fill
        </button>
        {BRUSH_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setBrushSize(s)}
            aria-label={`Brush size ${s}`}
            className={`flex h-7 w-7 items-center justify-center border-2 ${brushSize === s ? 'border-[#ff3d8b]' : 'border-[#e0b8c8]'} bg-white`}
          >
            <span className="rounded-full bg-[#5e3620]" style={{ width: s / 2, height: s / 2 }} />
          </button>
        ))}
        <button type="button" onClick={undo} className="border-2 border-[#5e3620] bg-white px-2 py-1 font-mono text-xs text-[#5e3620]">
          ↶ Undo
        </button>
        <button type="button" onClick={redo} className="border-2 border-[#5e3620] bg-white px-2 py-1 font-mono text-xs text-[#5e3620]">
          ↷ Redo
        </button>
        <button type="button" onClick={clear} className="border-2 border-[#5e3620] bg-white px-2 py-1 font-mono text-xs text-[#5e3620]">
          Clear
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => setColor(c)}
            className={`h-6 w-6 border-2 ${color === c ? 'border-[#ff3d8b]' : 'border-[#5e3620]/30'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="mx-auto touch-none border-2 border-[#5e3620]"
        style={{ width: 280, height: 280, imageRendering: 'pixelated' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
    </EditorShell>
  );
}

function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function colorsMatch(data: Uint8ClampedArray, idx: number, target: number[]) {
  return data[idx] === target[0] && data[idx + 1] === target[1] && data[idx + 2] === target[2] && data[idx + 3] === target[3];
}
