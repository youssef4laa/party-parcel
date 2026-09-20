'use client';

import { useEffect, useMemo, useState } from 'react';
import BoxPreview from './BoxPreview';
import type { BoxDesign } from './types';

const CONFETTI_COLORS = ['#ff3d8b', '#ffd166', '#6ec6ff', '#9be08d', '#a679d6', '#fff6d5'];

type Stage = 'zooming' | 'waiting' | 'opening' | 'done';

/** Shared unwrap animation: zoom to center, wiggle, tap to unwrap, lid lifts, confetti, goodies reveal. */
export default function BoxOpenAnimation({
  design,
  fromName,
  onComplete,
  goodieCount,
}: {
  design: BoxDesign;
  fromName?: string;
  onComplete?: () => void;
  goodieCount?: number;
}) {
  const [stage, setStage] = useState<Stage>('zooming');
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => setStage('waiting'), reducedMotion ? 50 : 500);
    return () => clearTimeout(t);
  }, [reducedMotion]);

  // Lazy useState initializer (not useMemo) is the sanctioned escape hatch for one-time
  // impure setup like Math.random() — it runs exactly once, never during a render pass.
  const [confetti] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      dx: (Math.random() - 0.5) * 320,
      dy: -Math.random() * 260 - 40,
      rot: Math.random() * 720 - 360,
      delay: Math.random() * 0.15,
      left: 50 + (Math.random() - 0.5) * 20,
    })),
  );

  function unwrap() {
    if (stage !== 'waiting') return;
    setStage('opening');
    setTimeout(() => setStage('done'), reducedMotion ? 100 : 1400);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70">
      {fromName && stage !== 'done' && (
        <p className="font-pixel text-sm text-[#fff6d5]">A PRESENT FROM {fromName.toUpperCase()}</p>
      )}

      <div
        className={`relative transition-transform duration-500 ${
          stage === 'zooming' ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <div
          className={
            stage === 'waiting' && !reducedMotion ? 'animate-[box-wiggle_0.7s_ease-in-out_infinite]' : ''
          }
        >
          <BoxPreview design={design} size={260} mode={stage === 'opening' || stage === 'done' ? 'open' : 'closed'} />
        </div>

        {stage === 'opening' &&
          confetti.map((c) => (
            <span
              key={c.id}
              className="pointer-events-none absolute top-1/2 h-2 w-2 animate-[confetti-piece_1.1s_ease-out_forwards]"
              style={
                {
                  left: `${c.left}%`,
                  backgroundColor: c.color,
                  animationDelay: `${c.delay}s`,
                  '--dx': `${c.dx}px`,
                  '--dy': `${c.dy}px`,
                  '--rot': `${c.rot}deg`,
                } as React.CSSProperties
              }
            />
          ))}
      </div>

      {stage === 'waiting' && (
        <button
          type="button"
          onClick={unwrap}
          className="border-4 border-[#ff3d8b] bg-[#fff6d5] px-4 py-2 font-pixel text-xs text-[#ff3d8b] shadow-[3px_3px_0_rgba(0,0,0,0.35)] hover:bg-[#ff3d8b] hover:text-[#fff6d5]"
        >
          Tap to unwrap!
        </button>
      )}

      {stage === 'done' && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-pixel text-xs text-[#fff6d5]">
            {typeof goodieCount === 'number' ? `${goodieCount} goodies inside!` : 'All unwrapped!'}
          </p>
          <button
            type="button"
            onClick={onComplete}
            className="border-4 border-[#ff3d8b] bg-[#ff3d8b] px-4 py-2 font-pixel text-xs text-[#fff6d5] hover:bg-[#d1266a]"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
