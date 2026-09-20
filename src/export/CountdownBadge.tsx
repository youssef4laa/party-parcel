'use client';

import { useEffect, useState } from 'react';

/** Decoration only — see the brief: "the password is the real lock." This never gates anything. */
export default function CountdownBadge({ eventAt }: { eventAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(eventAt).getTime();
  const diff = target - now;
  const label =
    diff <= 0
      ? "It's the day! 🎉"
      : `Opens in ${Math.floor(diff / 86400000)}d ${Math.floor((diff % 86400000) / 3600000)}h ${Math.floor(
          (diff % 3600000) / 60000,
        )}m`;

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 border-2 border-[#ff3d8b]/60 bg-[#fff6d5]/80 px-3 py-1 font-mono text-xs text-[#5e3620]">
      {label}
    </div>
  );
}
