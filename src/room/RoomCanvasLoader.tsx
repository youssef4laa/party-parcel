'use client';

import dynamic from 'next/dynamic';
import type { RoomCanvasProps } from './RoomCanvas';

const RoomCanvas = dynamic(() => import('./RoomCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0d0d1f] font-pixel text-xs text-[#fff6d5]">
      Loading room…
    </div>
  ),
});

export default function RoomCanvasLoader(props: RoomCanvasProps) {
  return <RoomCanvas {...props} />;
}
