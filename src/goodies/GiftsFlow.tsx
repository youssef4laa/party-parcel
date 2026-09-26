'use client';

import { useState } from 'react';
import BoxPreview from '@/box/BoxPreview';
import { DEFAULT_DESIGN } from '@/box/types';
import type { ContentsGift } from '@/room/api';
import GoodieUnwrapFlow from './GoodieUnwrapFlow';

const storageKey = (boxId: string) => `party-parcel-gifts-opened:${boxId}`;

/** Which gifts of this box the recipient already opened, remembered per browser so a reload
 * mid-way doesn't send them back to "0 of 4". Best-effort: storage can be blocked. */
function loadOpened(boxId: string, gifts: ContentsGift[]): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(boxId)) ?? '[]');
    const known = new Set(gifts.map((g) => g.id));
    return new Set((Array.isArray(raw) ? raw : []).filter((id): id is string => typeof id === 'string' && known.has(id)));
  } catch {
    return new Set();
  }
}
function saveOpened(boxId: string, opened: Set<string>) {
  try {
    localStorage.setItem(storageKey(boxId), JSON.stringify([...opened]));
  } catch {
    // progress just won't survive a reload
  }
}

type View = { kind: 'grid' } | { kind: 'gift'; id: string } | { kind: 'all' };

/**
 * Multi-gift boxes: once the outer box is open, the inner gifts float
 * out with their own wraps and labels; each opens to its goodies through the existing one-by-one /
 * all-at-once flow. Shows "N of M gifts opened" and an "Open everything" shortcut. With the box's
 * "open in order" setting on, only the next unopened gift can be opened. Single-gift boxes never
 * reach this component — RoomTokenPage sends them straight to GoodieUnwrapFlow, as before.
 */
export default function GiftsFlow({
  gifts,
  boxId,
  celebrateToken,
  fromName,
  openInOrder,
  onDone,
  onRedeem,
}: {
  gifts: ContentsGift[];
  boxId: string;
  celebrateToken: string;
  fromName: string;
  openInOrder: boolean;
  onDone: () => void;
  onRedeem?: (goodieId: string) => Promise<{ redeemedAt: string }>;
}) {
  const [opened, setOpened] = useState<Set<string>>(() => loadOpened(boxId, gifts));
  const [view, setView] = useState<View>({ kind: 'grid' });

  const openedCount = gifts.filter((g) => opened.has(g.id)).length;
  const nextIndex = gifts.findIndex((g) => !opened.has(g.id));

  function markOpened(ids: string[]) {
    setOpened((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      saveOpened(boxId, next);
      return next;
    });
  }

  if (view.kind === 'gift') {
    const gift = gifts.find((g) => g.id === view.id);
    if (gift) {
      return (
        <GoodieUnwrapFlow
          goodies={gift.goodies}
          boxId={boxId}
          celebrateToken={celebrateToken}
          fromName={fromName}
          subtitle={gift.label || undefined}
          onRedeem={onRedeem}
          onDone={() => {
            markOpened([gift.id]);
            setView({ kind: 'grid' });
          }}
        />
      );
    }
  }
  if (view.kind === 'all') {
    return (
      <GoodieUnwrapFlow
        goodies={gifts.flatMap((g) => g.goodies)}
        boxId={boxId}
        celebrateToken={celebrateToken}
        fromName={fromName}
        subtitle={`All ${gifts.length} gifts`}
        initialMode="all"
        onRedeem={onRedeem}
        onDone={() => {
          markOpened(gifts.map((g) => g.id));
          setView({ kind: 'grid' });
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center gap-4 overflow-auto bg-black/80 p-4 py-8">
      {/* Gifts float up out of the box one after another; skipped entirely for reduced motion. */}
      <style>{`
        @keyframes gift-float-out { from { transform: translateY(70px) scale(0.5); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        .gift-float-out { animation: gift-float-out 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
        @media (prefers-reduced-motion: reduce) { .gift-float-out { animation: none; } }
      `}</style>
      <p className="font-pixel text-sm text-[#fff6d5]">A PRESENT FROM {fromName.toUpperCase()}</p>
      <p className="font-mono text-base text-[#fff6d5]">{gifts.length} gifts inside!</p>
      <p data-testid="gifts-progress" className="font-mono text-sm text-[#ffd166]">
        {openedCount} of {gifts.length} gifts opened
      </p>
      {openInOrder && (
        <p className="font-mono text-xs text-[#fff6d5]/70" data-testid="gifts-order-note">
          These open in order — start with the first one.
        </p>
      )}

      <ul className="flex flex-wrap items-start justify-center gap-4">
        {gifts.map((g, i) => {
          const isOpened = opened.has(g.id);
          const locked = openInOrder && !isOpened && i !== nextIndex;
          const name = g.label || `Gift ${i + 1}`;
          return (
            <li key={g.id} className="gift-float-out" style={{ animationDelay: `${i * 120}ms` }}>
              <button
                type="button"
                disabled={locked}
                aria-label={`${locked ? 'Locked' : 'Open'} gift ${i + 1}: ${name}`}
                data-testid="gift-tile"
                data-opened={isOpened}
                data-locked={locked}
                onClick={() => setView({ kind: 'gift', id: g.id })}
                className={`flex w-36 flex-col items-center gap-1 border-4 bg-[#fff6d5] p-2 ${
                  locked ? 'border-[#5e3620]/40 opacity-50' : isOpened ? 'border-[#9be08d]' : 'border-[#ff3d8b] hover:bg-white'
                }`}
              >
                <BoxPreview design={{ ...DEFAULT_DESIGN, ...g.design }} size={96} mode={isOpened ? 'open' : 'closed'} />
                <span className="font-mono text-sm text-[#5e3620]">{name}</span>
                <span className="font-mono text-xs text-[#5e3620]/70">
                  {isOpened ? '✓ opened' : locked ? '🔒 open the one before first' : `${g.goodies.length} goodie${g.goodies.length === 1 ? '' : 's'}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => setView({ kind: 'all' })}
          className="border-4 border-[#ff3d8b] bg-[#ff3d8b] px-4 py-2 font-mono text-sm text-[#fff6d5] hover:bg-[#d1266a]"
        >
          Open everything
        </button>
        <button
          type="button"
          onClick={onDone}
          className={`border-4 px-4 py-2 font-mono text-sm ${
            openedCount === gifts.length ? 'border-[#ff3d8b] bg-[#fff6d5] text-[#ff3d8b]' : 'border-[#fff6d5]/50 text-[#fff6d5]'
          }`}
        >
          Done
        </button>
      </div>
    </div>
  );
}
