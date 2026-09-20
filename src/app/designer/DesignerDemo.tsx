'use client';

import { useState } from 'react';
import BoxDesigner from '@/box/BoxDesigner';
import BoxOpenAnimation from '@/box/BoxOpenAnimation';
import { DEFAULT_DESIGN, type BoxDesign } from '@/box/types';

export default function DesignerDemo() {
  const [design, setDesign] = useState<BoxDesign>(DEFAULT_DESIGN);
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 font-pixel text-lg text-[#ff3d8b]">Gift Box Designer</h1>
      <p className="mb-6 font-mono text-base text-[#5e3620]">
        Milestone 2 preview — the deterministic box renderer used everywhere a box appears.
      </p>
      <div className="border-4 border-[#ff3d8b] bg-[#fff6d5] p-4">
        <BoxDesigner
          initialDesign={design}
          onChange={setDesign}
          onSave={() => setPreviewOpen(true)}
          saveLabel="Preview unwrap animation"
        />
      </div>

      {previewOpen && (
        <BoxOpenAnimation
          design={design}
          fromName="Sam"
          goodieCount={5}
          onComplete={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
