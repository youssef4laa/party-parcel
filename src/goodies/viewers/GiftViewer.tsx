'use client';

import { useState } from 'react';
import GoodieCard from './GoodieCard';
import { SAFE_LINK_PROPS, type ViewerGoodie } from './types';

export default function GiftViewer({ goodie }: { goodie: ViewerGoodie }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof goodie.url === 'string' ? goodie.url : undefined;
  const code = typeof goodie.redeemCode === 'string' ? goodie.redeemCode : undefined;

  return (
    <GoodieCard title="A Gift">
      <p className="whitespace-pre-wrap font-mono text-sm">{String(goodie.message ?? '')}</p>
      {url && (
        <a href={url} {...SAFE_LINK_PROPS} className="text-center font-mono text-sm underline">
          Open gift link
        </a>
      )}
      {code && (
        <div className="border-2 border-dashed border-[#5e3620]/40 p-3 text-center">
          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-3 py-1 font-mono text-sm text-[#fff6d5]"
            >
              Reveal code
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <code className="font-mono text-base tracking-widest">{code}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(code).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="border-2 border-[#5e3620] bg-white px-2 py-0.5 font-mono text-xs text-[#5e3620]"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}
    </GoodieCard>
  );
}
