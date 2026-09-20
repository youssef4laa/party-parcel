'use client';

import { useState } from 'react';
import GoodieCard from './GoodieCard';
import type { ViewerGoodie } from './types';

export default function VoiceViewer({ goodie }: { goodie: ViewerGoodie }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const assetUrl = goodie.assetUrls[0];
  const transcript = typeof goodie.transcript === 'string' ? goodie.transcript : undefined;
  const duration = typeof goodie.durationSeconds === 'number' ? goodie.durationSeconds : undefined;

  return (
    <GoodieCard title="Voice Message" tone="dark">
      {assetUrl && <audio controls src={assetUrl} className="w-full" />}
      {duration ? <p className="text-center font-mono text-xs text-[#fff6d5]/70">{duration}s</p> : null}
      {transcript && (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="font-mono text-xs underline"
          >
            {showTranscript ? 'Hide transcript' : 'Show transcript'}
          </button>
          {showTranscript && <p className="mt-1 whitespace-pre-wrap font-mono text-sm">{transcript}</p>}
        </div>
      )}
    </GoodieCard>
  );
}
