'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS } from '@/config/limits';
import { autoCrop, countColors, pixelate, type Bitmap } from '../pixelOps';
import { bitmapToCanvas, bitmapToPngBlob, loadImportFile, type LoadedImport } from './imageIO';

/** Shown on every import, the export leaves custom PNGs as
 * plaintext assets, so anyone with the room link (or the exported site) can see them. */
export const IMPORT_NOTICE =
  "Decorations are visible to anyone with the room link, even before the password in the exported site. Don't import private photos here.";

const btn = (active = false) =>
  `border-2 px-2 py-1 font-mono text-xs ${active ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#5e3620] bg-[#fff6d5] text-[#5e3620]'} disabled:opacity-50`;
const CHECKER = 'repeating-conic-gradient(#d9c9b8 0% 25%, #f4ead9 0% 50%) 0 0 / 12px 12px';

function PreviewCanvas({ bitmap, testId, maxPx = 128 }: { bitmap: Bitmap; testId: string; maxPx?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current) bitmapToCanvas(bitmap, ref.current);
  }, [bitmap]);
  // Displayed nearest-neighbor at a whole-number multiple where it fits, never smoothed.
  const zoom = Math.max(1, Math.floor(maxPx / Math.max(bitmap.width, bitmap.height)));
  return (
    <canvas
      ref={ref}
      data-testid={testId}
      style={{
        imageRendering: 'pixelated',
        width: bitmap.width * zoom,
        height: bitmap.height * zoom,
        maxWidth: '100%',
        background: CHECKER,
      }}
    />
  );
}

export default function ImportSection({
  onSaved,
  onTouchUp,
  canDraw,
  libraryFull,
  onCreate,
}: {
  onSaved: () => void;
  /** Opens the pixel editor with this (already processed) bitmap — only offered with canDraw. */
  onTouchUp: (bitmap: Bitmap, name: string) => void;
  canDraw: boolean;
  libraryFull: boolean;
  onCreate: (png: Blob, opts: { source: 'import'; name: string }) => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState<LoadedImport | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const [crop, setCrop] = useState(true);
  const [doPixelate, setDoPixelate] = useState(false);
  const [pixelWidth, setPixelWidth] = useState(48);
  const [colors, setColors] = useState<0 | 16 | 32>(0);
  const [name, setName] = useState('');

  const processed = useMemo<Bitmap | null>(() => {
    if (!loaded) return null;
    let b = crop ? autoCrop(loaded.bitmap) : loaded.bitmap;
    if (doPixelate) b = pixelate(b, { width: pixelWidth, colors });
    return b;
  }, [loaded, crop, doPixelate, pixelWidth, colors]);

  const accept = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    setLoaded(null);
    setBusy(true);
    try {
      const result = await loadImportFile(file);
      setLoaded(result);
      setFileName(file.name);
      setName(file.name.replace(/\.[^.]+$/, '').slice(0, 40));
      setPixelWidth(Math.min(64, Math.max(16, Math.min(result.bitmap.width, 128))));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!processed) return;
    setError(null);
    setBusy(true);
    try {
      const png = await bitmapToPngBlob(processed);
      if (png.size > LIMITS.maxCustomItemBytes) {
        throw new Error(
          `After processing this is ${Math.round(png.size / 1024)} KB — the limit is ${Math.round(LIMITS.maxCustomItemBytes / 1024)} KB. Try "Pixelate to match room", which makes it much smaller.`,
        );
      }
      await onCreate(png, { source: 'import', name });
      setLoaded(null);
      setFileName('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2" aria-label="Import an image">
      <h3 className="font-pixel text-[9px] text-[#ff3d8b]">Import an image</h3>
      <p data-testid="import-notice" className="border-2 border-[#ffd166] bg-[#fff3c4] p-2 font-mono text-[11px] text-[#5e3620]">
        {IMPORT_NOTICE}
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void accept(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center gap-1 border-2 border-dashed p-3 text-center ${dragOver ? 'border-[#ff3d8b] bg-[#ffe4ef]' : 'border-[#e0b8c8] bg-white'}`}
      >
        <p className="font-mono text-xs text-[#5e3620]">Drag a PNG or WebP here, or</p>
        <button type="button" className={btn()} disabled={busy || libraryFull} onClick={() => inputRef.current?.click()}>
          Choose a file…
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp"
          aria-label="Import image file"
          className="hidden"
          data-testid="import-file-input"
          onChange={(e) => {
            void accept(e.target.files?.[0]);
            e.target.value = ''; // lets the same file be chosen again after an error
          }}
        />
        <p className="font-mono text-[10px] text-[#5e3620]/60">
          Up to {Math.round(LIMITS.maxCustomItemBytes / 1024)} KB · {LIMITS.maxCustomItemPx}×{LIMITS.maxCustomItemPx} px · transparency kept
        </p>
        {libraryFull && <p className="font-mono text-[11px] text-[#d1266a]">The library is full — delete an item first.</p>}
      </div>

      {error && (
        <p role="alert" data-testid="import-error" className="font-mono text-xs text-[#d1266a]">
          {error}
        </p>
      )}

      {loaded && processed && (
        <div className="flex flex-col gap-2 border-2 border-[#e0b8c8] bg-white p-2" data-testid="import-options">
          {loaded.shrunkFrom && (
            <p className="font-mono text-[11px] text-[#5e3620]">
              {fileName} was {loaded.shrunkFrom.width}×{loaded.shrunkFrom.height}, so it was scaled down (nearest-neighbor) to fit {LIMITS.maxCustomItemPx}×{LIMITS.maxCustomItemPx}.
            </p>
          )}
          <div className="flex items-end gap-3">
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase text-[#5e3620]/60">Preview</div>
              <PreviewCanvas bitmap={processed} testId="import-preview" />
            </div>
            <p className="font-mono text-[11px] text-[#5e3620]" data-testid="import-info">
              {processed.width}×{processed.height} px
              <br />
              {countColors(processed)} colors
            </p>
          </div>

          <label className="flex items-center gap-2 font-mono text-xs text-[#5e3620]">
            <input type="checkbox" checked={crop} onChange={(e) => setCrop(e.target.checked)} />
            Trim transparent margins
          </label>
          <label className="flex items-center gap-2 font-mono text-xs text-[#5e3620]">
            <input type="checkbox" checked={doPixelate} onChange={(e) => setDoPixelate(e.target.checked)} />
            Pixelate to match room
          </label>
          {doPixelate && (
            <div className="flex flex-col gap-1 pl-5">
              <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
                Width: {Math.min(pixelWidth, 128)} px
                <input
                  type="range"
                  min={16}
                  max={128}
                  step={1}
                  value={pixelWidth}
                  aria-label="Pixelate width"
                  onChange={(e) => setPixelWidth(Number(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
                Palette
                <select
                  value={colors}
                  aria-label="Pixelate palette"
                  onChange={(e) => setColors(Number(e.target.value) as 0 | 16 | 32)}
                  className="border-2 border-[#e0b8c8] bg-white p-1"
                >
                  <option value={0}>All colors</option>
                  <option value={16}>16 colors</option>
                  <option value={32}>32 colors</option>
                </select>
              </label>
            </div>
          )}

          <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
            Name
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="border-2 border-[#e0b8c8] bg-white px-2 py-1 text-sm" />
          </label>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn(true)} disabled={busy || libraryFull} onClick={save}>
              {busy ? 'Saving…' : 'Save to My items'}
            </button>
            {canDraw && (
              <button type="button" className={btn()} disabled={busy} onClick={() => onTouchUp(processed, name)}>
                Touch up in editor
              </button>
            )}
            <button type="button" className={btn()} disabled={busy} onClick={() => setLoaded(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
