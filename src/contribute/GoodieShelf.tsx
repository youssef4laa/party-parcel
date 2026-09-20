'use client';

import { GOODIE_ICONS, GOODIE_LABELS, MAX_GOODIES, MAX_TOTAL_BYTES, type GoodieItem, type GoodieType } from './types';

const ALL_TYPES = Object.keys(GOODIE_LABELS) as GoodieType[];

function formatMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default function GoodieShelf({
  goodies,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: {
  goodies: GoodieItem[];
  onAdd: (type: GoodieType) => void;
  onUpdate: (id: string, summary: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
}) {
  const totalBytes = goodies.reduce((sum, g) => sum + g.sizeBytes, 0);
  const atLimit = goodies.length >= MAX_GOODIES;

  return (
    <div>
      <h3 className="mb-1.5 font-pixel text-[10px] text-[#ff3d8b]">Add more goodies</h3>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {ALL_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={atLimit}
            onClick={() => onAdd(type)}
            className="border-2 border-[#e0b8c8] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b] disabled:opacity-30"
          >
            {GOODIE_ICONS[type]} {GOODIE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="mb-1.5 flex justify-between font-mono text-sm text-[#5e3620]">
        <span>
          {goodies.length} / {MAX_GOODIES}
        </span>
        <span>
          {formatMb(totalBytes)} MB / {formatMb(MAX_TOTAL_BYTES)} MB
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
                <input
                  value={g.summary}
                  onChange={(e) => onUpdate(g.id, e.target.value)}
                  className="min-w-0 flex-1 border border-[#e0b8c8] bg-white px-1.5 py-0.5 font-mono text-sm text-[#5e3620] focus:border-[#ff3d8b] focus:outline-none"
                  aria-label={`${GOODIE_LABELS[g.type]} details`}
                />
                <span className="font-mono text-xs text-[#5e3620]/50">x1</span>
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
