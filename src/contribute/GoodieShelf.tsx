'use client';

import { useState } from 'react';
import { LIMITS } from '@/config/limits';
import { GOODIE_EDITORS } from '@/goodies/editors';
import { summarizeGoodie } from '@/goodies/summary';
import { GOODIE_ICONS, GOODIE_LABELS, type GoodieItem, type GoodieType } from './types';

const ALL_TYPES = Object.keys(GOODIE_LABELS) as GoodieType[];

function formatMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default function GoodieShelf({
  goodies,
  roomToken,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: {
  goodies: GoodieItem[];
  roomToken?: string;
  onAdd: (item: GoodieItem) => void;
  onUpdate: (id: string, item: GoodieItem) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState<{ type: GoodieType; item?: GoodieItem } | null>(null);
  const totalBytes = goodies.reduce((sum, g) => sum + g.sizeBytes, 0);
  const atLimit = goodies.length >= LIMITS.maxGoodiesPerBox;

  const EditorComponent = editing ? GOODIE_EDITORS[editing.type] : null;

  return (
    <div>
      <h3 className="mb-1.5 font-pixel text-[10px] text-[#ff3d8b]">Add more goodies</h3>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {ALL_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={atLimit}
            onClick={() => setEditing({ type })}
            className="border-2 border-[#e0b8c8] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b] disabled:opacity-30"
          >
            {GOODIE_ICONS[type]} {GOODIE_LABELS[type]}
          </button>
        ))}
      </div>

      {editing && EditorComponent && (
        <div className="mb-2">
          <EditorComponent
            key={editing.item?.id ?? editing.type}
            initial={editing.item}
            roomToken={roomToken}
            onCancel={() => setEditing(null)}
            onSave={(item) => {
              if (editing.item) {
                onUpdate(editing.item.id, { ...item, id: editing.item.id });
              } else {
                onAdd({ ...item, id: crypto.randomUUID() });
              }
              setEditing(null);
            }}
          />
        </div>
      )}

      <div className="mb-1.5 flex justify-between font-mono text-sm text-[#5e3620]">
        <span>
          {goodies.length} / {LIMITS.maxGoodiesPerBox}
        </span>
        <span>
          {formatMb(totalBytes)} MB / {formatMb(LIMITS.maxBytesPerBox)} MB
        </span>
      </div>

      <div className="border-2 border-dashed border-[#e0b8c8] bg-[#fffdf5]">
        {goodies.length === 0 ? (
          <p className="p-4 text-center font-mono text-sm italic text-[#5e3620]/70">
            a little empty, a lot of possibility.
          </p>
        ) : (
          <ul>
            {goodies.map((g, i) => (
              <li
                key={g.id}
                className="flex items-center gap-2 border-b border-dashed border-[#e0b8c8] px-2 py-1.5 last:border-b-0"
              >
                <span aria-hidden>{GOODIE_ICONS[g.type]}</span>
                <span className="font-mono text-xs uppercase text-[#5e3620]/60">{GOODIE_LABELS[g.type]}</span>
                <button
                  type="button"
                  onClick={() => setEditing({ type: g.type, item: g })}
                  className="min-w-0 flex-1 truncate text-left font-mono text-sm text-[#5e3620] underline decoration-dotted hover:text-[#ff3d8b]"
                >
                  {summarizeGoodie(g)}
                </button>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => onReorder(g.id, -1)}
                  className="px-1 font-mono text-sm text-[#5e3620] disabled:opacity-20"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === goodies.length - 1}
                  onClick={() => onReorder(g.id, 1)}
                  className="px-1 font-mono text-sm text-[#5e3620] disabled:opacity-20"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${GOODIE_LABELS[g.type]}`}
                  onClick={() => onRemove(g.id)}
                  className="px-1 font-mono text-sm text-[#ff3d8b]"
                >
                  ✕
                </button>
              </li>
            ))}
            <li className="px-2 py-2 text-center font-mono text-xs italic text-[#5e3620]/60">
              THANK YOU FOR CARING · have a nice day :)
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
