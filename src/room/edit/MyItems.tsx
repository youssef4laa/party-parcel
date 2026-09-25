'use client';

import { useState } from 'react';
import type { CustomItemApi, RoomObjectApi } from '@/room/api';
import { LIMITS } from '@/config/limits';

const btn = 'border-2 border-[#5e3620] bg-[#fff6d5] px-1.5 py-0.5 font-mono text-[11px] text-[#5e3620] disabled:opacity-50';

/**
 * The room's "My items" library. Clicking a thumbnail places a copy (items can be placed many
 * times). Edit/Delete only show on items the caller made (or for the host); the routes re-check.
 * Deleting is a two-step inline confirm that says how many placed copies go with it — the spec
 * requires "after a confirm", and a native confirm() dialog can't say that or be tested reliably.
 */
export default function MyItems({
  items,
  objects,
  onPlace,
  onEdit,
  onDelete,
  canEdit,
}: {
  items: CustomItemApi[];
  objects: RoomObjectApi[];
  onPlace: (item: CustomItemApi) => void;
  /** Omitted in the compact (Items tab) listing, where only placing makes sense. */
  onEdit?: (item: CustomItemApi) => void;
  onDelete?: (item: CustomItemApi) => Promise<void>;
  canEdit?: boolean;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="flex flex-col gap-2" aria-label="My items">
      <h3 className="font-pixel text-[9px] text-[#ff3d8b]">
        My items{' '}
        <span className="font-mono text-[10px] text-[#5e3620]/60" data-testid="library-count">
          {items.length} / {LIMITS.maxCustomItemsPerRoom}
        </span>
      </h3>
      {items.length === 0 && <p className="font-mono text-xs italic text-[#5e3620]/60">Nothing here yet — import an image or draw one.</p>}
      {error && (
        <p role="alert" className="font-mono text-xs text-[#d1266a]">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const copies = objects.filter((o) => o.assetId === item.id).length;
          return (
            <li key={item.id} className="flex flex-col gap-1 border-2 border-[#e0b8c8] bg-white p-1" data-testid="library-item">
              <button
                type="button"
                onClick={() => onPlace(item)}
                aria-label={`Place ${item.name || 'item'}`}
                title="Place in the room"
                className="flex h-16 items-center justify-center bg-[#f4ead9]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- pixel art must stay nearest-neighbor, which next/image can't guarantee */}
                <img
                  src={item.url}
                  alt={item.name || 'Custom item'}
                  // Small pixel art is shown at a whole-number multiple so it stays crisp AND readable
                  // (a 16px drawing at native size is a speck); large art just shrinks to fit the tile.
                  style={{
                    imageRendering: 'pixelated',
                    width: item.width * Math.max(1, Math.floor(56 / Math.max(item.width, item.height))),
                    maxWidth: '100%',
                    maxHeight: '100%',
                  }}
                />
              </button>
              <span className="truncate font-mono text-[10px] text-[#5e3620]" title={item.name}>
                {item.name || 'Untitled'} · {item.width}×{item.height}
              </span>
              {confirming === item.id ? (
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] text-[#d1266a]" data-testid="delete-confirm-text">
                    Delete this item and its {copies} placed cop{copies === 1 ? 'y' : 'ies'}?
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      className={`${btn} !border-[#ff3d8b] !bg-[#ff3d8b] !text-[#fff6d5]`}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          await onDelete?.(item);
                          setConfirming(null);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Could not delete.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Yes, delete
                    </button>
                    <button type="button" className={btn} onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </div>
                </div>
              ) : (
                (onEdit || onDelete) &&
                item.mine && (
                  <div className="flex gap-1">
                    {onEdit && canEdit && (
                      <button type="button" className={btn} onClick={() => onEdit(item)}>
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" className={btn} onClick={() => setConfirming(item.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
