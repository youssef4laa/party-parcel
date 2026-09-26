'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomObjectApi, RoomObjectPatch } from '@/room/api';
import { parseObjectConfig } from '@/room/scene/objectConfig';

const DEBOUNCE_MS = 300;
export const DECOR_TEXT_MAX_LEN = 16;
const BALLOON_COLORS = ['purple', 'red', 'green', 'yellow', 'orange', 'pink'] as const;

/** Kinds that have a small config this editor can change (a sign's or banner's words, a balloon's colour). */
export function hasDecorEditor(kind: string): boolean {
  return kind === 'neon-sign' || kind === 'banner-text' || kind === 'balloon';
}

const FIELD = 'border-2 border-[#e0b8c8] bg-white px-2 py-1 font-mono text-sm text-[#5e3620]';

/**
 * Edits the one setting each configurable decoration has: a neon sign's or banner's words, or a
 * balloon's colour. Before this, those configJson fields could only be set through the API. Same shape as
 * CakeEditor: a local draft, a debounced save, and `key={item.id}` at the call site so selecting a
 * different item re-initializes it.
 */
export default function DecorEditor({ item, onUpdate }: { item: RoomObjectApi; onUpdate: (patch: RoomObjectPatch) => void }) {
  const config = parseObjectConfig(item.configJson);
  const isText = item.kind === 'neon-sign' || item.kind === 'banner-text';
  const [text, setText] = useState(() => (typeof config.text === 'string' ? config.text : ''));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const save = (next: Record<string, unknown>) => onUpdate({ configJson: JSON.stringify({ ...config, ...next }) });

  return (
    <div className="flex flex-col gap-2 border-2 border-[#ff3d8b] bg-white p-2" data-testid="decor-editor">
      <span className="font-mono text-xs uppercase text-[#5e3620]/70">{item.kind === 'balloon' ? 'Balloon' : item.kind === 'neon-sign' ? 'Neon sign' : 'Banner'}</span>
      {isText && (
        <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
          Words (up to {DECOR_TEXT_MAX_LEN} characters)
          <input
            value={text}
            maxLength={DECOR_TEXT_MAX_LEN}
            onChange={(e) => {
              const v = e.target.value.slice(0, DECOR_TEXT_MAX_LEN);
              setText(v);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => save({ text: v }), DEBOUNCE_MS);
            }}
            placeholder={item.kind === 'neon-sign' ? 'PARTY' : 'PARTY!'}
            className={FIELD}
          />
        </label>
      )}
      {item.kind === 'balloon' && (
        <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
          Colour
          <select
            defaultValue={typeof config.color === 'string' ? config.color : 'purple'}
            onChange={(e) => save({ color: e.target.value })}
            className={FIELD}
          >
            {BALLOON_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      {isText && <p className="font-mono text-[10px] text-[#5e3620]/60">Decorations are visible to anyone with the room link — keep secrets in presents, not here.</p>}
    </div>
  );
}
