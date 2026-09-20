'use client';

import Modal from '@/room/ui/Modal';
import { useState } from 'react';
import type { PhotoboothShotView } from '@/room/dataSource';

export default function PrintModal({
  shot,
  onClose,
  onDelete,
}: {
  shot: PhotoboothShotView;
  onClose: () => void;
  onDelete: (shot: PhotoboothShotView) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(shot);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that shot.');
      setDeleting(false);
    }
  }

  return (
    <Modal title="Photobooth print" onClose={onClose}>
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed/blob/data URL, not a static remote asset */}
        <img src={shot.url} alt="Photobooth capture" className="max-h-80 w-full border-4 border-[#8a5a35] object-contain" />
        <p className="text-center font-mono text-sm text-[#5e3620]">{shot.caption}</p>
        {shot.canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="border-2 border-[#ff3d8b] bg-[#fff6d5] px-3 py-1.5 font-mono text-sm text-[#ff3d8b] hover:bg-[#ff3d8b] hover:text-[#fff6d5] disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete my shot'}
          </button>
        )}
        {error && <p className="font-mono text-xs text-[#c0244b]">{error}</p>}
      </div>
    </Modal>
  );
}
