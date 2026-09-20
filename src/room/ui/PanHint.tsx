'use client';

import { useEffect, useState } from 'react';

export default function PanHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border-2 border-[#ff3d8b] bg-[#fff6d5]/90 px-3 py-1.5 font-mono text-xs text-[#5e3620] transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      Drag, scroll, or use ← → to look around
    </div>
  );
}
