'use client';

import { useState } from 'react';
import type { CustomItemApi, RoomObjectApi } from '@/room/api';
import { LIMITS } from '@/config/limits';
import { createBitmap, type Bitmap } from '../pixelOps';
import ImportSection from './ImportSection';
import MyItems from './MyItems';
import PixelEditor, { DRAW_SIZES } from './PixelEditor';
import { bitmapToPngBlob, urlToBitmap } from './imageIO';

type EditorState = { bitmap: Bitmap; name: string; existing: CustomItemApi | null };

const btn = (active = false) =>
  `border-2 px-2 py-1 font-mono text-xs ${active ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#5e3620] bg-[#fff6d5] text-[#5e3620]'} disabled:opacity-50`;

/** The "Draw & Import" tab (docs/ROOM_EDITOR.md Phase 3): import a PNG/WebP, draw pixel art, and
 * manage the room's "My items" library. Which sections show follows the capabilities list — a
 * display hint only; the custom-items routes enforce canImport/canDraw themselves. */
export default function DrawImportTab({
  capabilities,
  items,
  objects,
  onCreate,
  onReplace,
  onDelete,
  onPlace,
}: {
  capabilities: string[];
  items: CustomItemApi[];
  objects: RoomObjectApi[];
  onCreate: (png: Blob, opts: { source: 'import' | 'drawing'; name: string }) => Promise<CustomItemApi>;
  onReplace: (itemId: string, png: Blob, opts: { source: 'import' | 'drawing'; name: string }) => Promise<CustomItemApi>;
  onDelete: (itemId: string) => Promise<void>;
  onPlace: (item: CustomItemApi) => void;
}) {
  const canImport = capabilities.includes('items:import');
  const canDraw = capabilities.includes('items:draw');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [newSize, setNewSize] = useState<(typeof DRAW_SIZES)[number]>(32);
  const [loadError, setLoadError] = useState<string | null>(null);
  const libraryFull = items.length >= LIMITS.maxCustomItemsPerRoom;

  if (editor) {
    return (
      <PixelEditor
        // A fresh editor per opened image, so its undo history and bitmap never leak between them.
        key={editor.existing?.id ?? `new-${editor.name}-${editor.bitmap.width}`}
        initial={editor.bitmap}
        initialName={editor.name}
        editingExisting={editor.existing !== null}
        canSaveOver={editor.existing?.mine ?? false}
        onCancel={() => setEditor(null)}
        onSave={async (png, opts) => {
          if (editor.existing && !opts.asNew) {
            await onReplace(editor.existing.id, png, { source: 'drawing', name: opts.name });
          } else {
            await onCreate(png, { source: 'drawing', name: opts.name });
          }
          setEditor(null);
        }}
      />
    );
  }

  if (!canImport && !canDraw) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-mono text-sm text-[#5e3620]">The host hasn&apos;t given this link the right to import or draw items.</p>
        <MyItems items={items} objects={objects} onPlace={onPlace} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canImport && (
        <ImportSection
          libraryFull={libraryFull}
          canDraw={canDraw}
          onCreate={onCreate}
          onSaved={() => setLoadError(null)}
          onTouchUp={(bitmap, name) => setEditor({ bitmap, name, existing: null })}
        />
      )}

      {canDraw && (
        <section className="flex flex-col gap-2" aria-label="Draw an item">
          <h3 className="font-pixel text-[9px] text-[#ff3d8b]">Draw an item</h3>
          <div className="flex flex-wrap items-center gap-1">
            {DRAW_SIZES.map((s) => (
              <button key={s} type="button" className={btn(newSize === s)} aria-pressed={newSize === s} onClick={() => setNewSize(s)}>
                {s}×{s}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={btn(true)}
            disabled={libraryFull}
            onClick={() => setEditor({ bitmap: createBitmap(newSize, newSize), name: '', existing: null })}
          >
            New {newSize}×{newSize} drawing
          </button>
        </section>
      )}

      {loadError && (
        <p role="alert" className="font-mono text-xs text-[#d1266a]">
          {loadError}
        </p>
      )}

      <MyItems
        items={items}
        objects={objects}
        onPlace={onPlace}
        canEdit={canDraw}
        onEdit={async (item) => {
          setLoadError(null);
          try {
            setEditor({ bitmap: await urlToBitmap(item.url), name: item.name, existing: item });
          } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'Could not open that item.');
          }
        }}
        onDelete={(item) => onDelete(item.id)}
      />
    </div>
  );
}

// Re-exported so EditPanel's tests/other callers can encode a bitmap without reaching into imageIO.
export { bitmapToPngBlob };
