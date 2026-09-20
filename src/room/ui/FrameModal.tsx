'use client';

import { useEffect, useRef } from 'react';
import { drawFrame } from '../sprites/frame';
import Modal from './Modal';

const LABELS: Record<'mountain' | 'tulip', string> = {
  mountain: 'Mountain view',
  tulip: 'Tulip',
};

export default function FrameModal({
  subject,
  onClose,
}: {
  subject: 'mountain' | 'tulip';
  onClose: () => void;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const canvas = drawFrame(subject);
    canvas.style.width = '320px';
    canvas.style.height = '320px';
    canvas.style.imageRendering = 'pixelated';
    canvas.style.border = '4px solid #8a5a35';
    holder.appendChild(canvas);
    return () => {
      holder.removeChild(canvas);
    };
  }, [subject]);

  return (
    <Modal title={LABELS[subject]} onClose={onClose}>
      <div ref={holderRef} className="flex justify-center py-2" />
    </Modal>
  );
}
