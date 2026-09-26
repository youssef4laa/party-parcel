'use client';

import { useState } from 'react';
import { GoodieViewer, type ViewerGoodie } from './viewers';

/** Section 5: the recipient chooses to unwrap goodies one by one (Next/Prev + progress dots) or
 * open everything at once (a scrollable stack). */
export default function GoodieUnwrapFlow({
  goodies,
  boxId,
  celebrateToken,
  fromName,
  onDone,
  onRedeem,
  subtitle,
  initialMode,
}: {
  goodies: ViewerGoodie[];
  boxId: string;
  celebrateToken: string;
  fromName: string;
  onDone: () => void;
  onRedeem?: (goodieId: string) => Promise<{ redeemedAt: string }>;
  /** Shown under the heading — a multi-gift box passes the gift's label here (Phase 4b). */
  subtitle?: string;
  /** Skips the "one by one or all at once" choice; used when the recipient already asked to open everything. */
  initialMode?: 'choose' | 'all';
}) {
  const [mode, setMode] = useState<'choose' | 'one' | 'all'>(goodies.length > 0 ? (initialMode ?? 'choose') : 'all');
  const [index, setIndex] = useState(0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center gap-4 overflow-auto bg-black/80 p-4 py-8">
      <p className="font-pixel text-sm text-[#fff6d5]">A PRESENT FROM {fromName.toUpperCase()}</p>
      {subtitle && (
        <p data-testid="unwrap-subtitle" className="font-mono text-base text-[#ffd166]">
          {subtitle}
        </p>
      )}

      {mode === 'choose' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="font-mono text-base text-[#fff6d5]">
            {goodies.length} goodie{goodies.length === 1 ? '' : 's'} inside!
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode('one')}
              className="border-4 border-[#ff3d8b] bg-[#fff6d5] px-4 py-2 font-mono text-sm text-[#ff3d8b] hover:bg-[#ff3d8b] hover:text-[#fff6d5]"
            >
              Unwrap one by one
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className="border-4 border-[#ff3d8b] bg-[#ff3d8b] px-4 py-2 font-mono text-sm text-[#fff6d5] hover:bg-[#d1266a]"
            >
              Open everything at once
            </button>
          </div>
        </div>
      )}

      {mode === 'one' && goodies.length > 0 && (
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-4">
          <GoodieViewer goodie={goodies[index]} boxId={boxId} celebrateToken={celebrateToken} onRedeem={onRedeem} />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
              className="border-2 border-[#fff6d5] px-3 py-1 font-mono text-sm text-[#fff6d5] disabled:opacity-30"
            >
              ← Prev
            </button>
            <div className="flex gap-1.5" role="tablist" aria-label="Goodie progress">
              {goodies.map((g, i) => (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Goodie ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={`h-2.5 w-2.5 rounded-full ${i === index ? 'bg-[#ff3d8b]' : 'bg-[#fff6d5]/40'}`}
                />
              ))}
            </div>
            {index < goodies.length - 1 ? (
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                className="border-2 border-[#fff6d5] px-3 py-1 font-mono text-sm text-[#fff6d5]"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={onDone}
                className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-3 py-1 font-mono text-sm text-[#fff6d5]"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {mode === 'all' && (
        <div className="flex w-full flex-col items-center gap-4">
          {goodies.length === 0 && <p className="font-mono text-base text-[#fff6d5]">Just the box, this time!</p>}
          {goodies.map((g) => (
            <GoodieViewer key={g.id} goodie={g} boxId={boxId} celebrateToken={celebrateToken} onRedeem={onRedeem} />
          ))}
          <button
            type="button"
            onClick={onDone}
            className="mb-4 border-4 border-[#ff3d8b] bg-[#ff3d8b] px-4 py-2 font-mono text-sm text-[#fff6d5] hover:bg-[#d1266a]"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
