'use client';

import { useEffect, useRef } from 'react';
import { renderBox } from './renderBox';
import type { BoxDesign } from './types';

export default function BoxPreview({
  design,
  size = 288,
  mode = 'closed',
  className = '',
}: {
  design: BoxDesign;
  size?: number;
  mode?: 'closed' | 'open';
  className?: string;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const canvas = renderBox(design, mode);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.style.imageRendering = 'pixelated';
    holder.innerHTML = '';
    holder.appendChild(canvas);
  }, [design, size, mode]);

  return <div ref={holderRef} className={className} style={{ width: size, height: size }} />;
}
