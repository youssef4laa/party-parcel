'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomObjectApi, RoomObjectPatch } from '@/room/api';
import { parseObjectConfig } from '@/room/scene/objectConfig';
import { drawCake } from '@/room/sprites/cake';
import {
  CAKE_STYLES,
  CAKE_TOPPERS,
  CANDLE_MODES,
  CAKE_COLOR_SWATCHES,
  CAKE_TEXT_MAX_LEN,
  CAKE_MIN_CANDLES,
  CAKE_MAX_CANDLES,
  parseCakeConfig,
  defaultCandleCount,
  type CakeConfig,
  type CakeStyle,
  type CakeTopper,
  type CandleMode,
} from '@/room/cakeConfig';

const DEBOUNCE_MS = 300;

/**
 * The Cake section of the Items tab (docs/ROOM_EDITOR.md Phase 2) — the app's first configJson-
 * editing UI (see DECISIONS.md: every previous `configurable: true` catalog entry had no editor at
 * all). Keeps its own local draft, like PermissionsForm's pattern (EditPanel.tsx), rather than
 * writing straight into the parent's `objects` state on every keystroke — the parent is only
 * re-synced once the debounced PATCH actually resolves. `key={item.id}` on the call site is what
 * makes the draft re-initialize when a *different* cake gets selected; the same cake's own config
 * echoing back from the server after our own PATCH must NOT clobber an in-progress edit, so this
 * component intentionally never re-derives its draft from `item` after mount.
 */
export default function CakeEditor({
  item,
  onUpdate,
  age,
}: {
  item: RoomObjectApi;
  onUpdate: (patch: RoomObjectPatch) => void;
  age?: number;
}) {
  const [draft, setDraft] = useState<CakeConfig>(() => parseCakeConfig(parseObjectConfig(item.configJson)));
  const previewRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!previewRef.current) return;
    const canvas = drawCake(true, draft);
    canvas.style.width = `${canvas.width * 1.5}px`;
    canvas.style.height = `${canvas.height * 1.5}px`;
    canvas.style.imageRendering = 'pixelated';
    previewRef.current.replaceChildren(canvas);
  }, [draft]);

  // One-shot cleanup of any pending debounced write if the panel closes/unmounts mid-edit.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  function commit(patch: Partial<CakeConfig>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onUpdate({ configJson: JSON.stringify(next) }), DEBOUNCE_MS);
  }

  return (
    <div className="flex flex-col gap-2 border-2 border-[#ff3d8b] bg-white p-2">
      <span className="font-mono text-xs uppercase text-[#5e3620]/70">Cake</span>

      <div ref={previewRef} className="flex justify-center bg-[#fff6d5] p-2" aria-label="Cake preview" />

      <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
        Style
        <select
          value={draft.style}
          onChange={(e) => commit({ style: e.target.value as CakeStyle })}
          className="border-2 border-[#e0b8c8] bg-white p-1 font-mono text-sm"
        >
          {CAKE_STYLES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-3">
        <ColorField label="Frosting" value={draft.frostingColor} onChange={(c) => commit({ frostingColor: c })} />
        <ColorField label="Sponge" value={draft.spongeColor} onChange={(c) => commit({ spongeColor: c })} />
      </div>

      <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
        Topper
        <select
          value={draft.topper}
          onChange={(e) => commit({ topper: e.target.value as CakeTopper })}
          className="border-2 border-[#e0b8c8] bg-white p-1 font-mono text-sm"
        >
          {CAKE_TOPPERS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
        Text on cake ({draft.text.length}/{CAKE_TEXT_MAX_LEN})
        <input
          type="text"
          maxLength={CAKE_TEXT_MAX_LEN}
          value={draft.text}
          onChange={(e) => commit({ text: e.target.value.slice(0, CAKE_TEXT_MAX_LEN) })}
          className="border-2 border-[#e0b8c8] bg-white p-1 font-mono text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
        Candles
        <select
          value={draft.candleMode}
          onChange={(e) => commit({ candleMode: e.target.value as CandleMode })}
          className="border-2 border-[#e0b8c8] bg-white p-1 font-mono text-sm"
        >
          {CANDLE_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {(draft.candleMode === 'count' || draft.candleMode === 'numbers') && (
        <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
          {draft.candleMode === 'count' ? 'Number of candles' : 'Number to show'}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={CAKE_MIN_CANDLES}
              max={CAKE_MAX_CANDLES}
              value={draft.candleCount}
              onChange={(e) =>
                commit({ candleCount: Math.max(CAKE_MIN_CANDLES, Math.min(CAKE_MAX_CANDLES, Math.round(Number(e.target.value)) || CAKE_MIN_CANDLES)) })
              }
              className="w-16 border-2 border-[#e0b8c8] bg-white p-1"
            />
            {typeof age === 'number' && (
              <button
                type="button"
                onClick={() => commit({ candleCount: defaultCandleCount(age) })}
                className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs text-[#5e3620]"
              >
                Match age ({age})
              </button>
            )}
          </div>
        </label>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex-1">
      <span className="block font-mono text-xs text-[#5e3620]">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {CAKE_COLOR_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`${label} ${c}`}
            aria-pressed={value === c}
            className={`h-5 w-5 border-2 ${value === c ? 'border-[#ff3d8b]' : 'border-[#5e3620]/40'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
