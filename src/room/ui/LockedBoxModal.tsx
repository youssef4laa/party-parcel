'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';

function formatCountdown(ms: number) {
  if (ms <= 0) return 'any moment now...';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function LockedBoxModal({ eventAt, onClose }: { eventAt: Date; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Modal title="Not yet!" onClose={onClose}>
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <p className="font-mono text-base text-[#5e3620]">
          Opens on {eventAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
        </p>
        <p className="font-pixel text-lg text-[#ff3d8b]">{formatCountdown(eventAt.getTime() - now)}</p>
      </div>
    </Modal>
  );
}
