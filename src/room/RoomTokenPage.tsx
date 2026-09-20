'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import RoomCanvasLoader from './RoomCanvasLoader';
import RoomNotFound from './RoomNotFound';
import AdminPanel from './AdminPanel';
import LockedBoxModal from './ui/LockedBoxModal';
import { createApiDataSource } from './apiDataSource';
import { fetchRoom, fetchBoxContents, type RoomInfo, type RoomRole } from './api';
import type { RoomCanvasHandle } from './RoomCanvas';
import type { PlacedBox } from '@/contribute/types';
import BoxOpenAnimation from '@/box/BoxOpenAnimation';
import type { BoxContents } from './api';

export default function RoomTokenPage({ token }: { token: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found'>('loading');
  const [role, setRole] = useState<RoomRole | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [lockedBox, setLockedBox] = useState<{ eventAt: Date } | null>(null);
  const [openBox, setOpenBox] = useState<{ boxId: string; contents: BoxContents } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const handleRef = useRef<RoomCanvasHandle | null>(null);
  const [dataSource] = useState(() => createApiDataSource(token));
  const [sceneKey, setSceneKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchRoom(token);
      setRole(res.role);
      setRoom(res.room);
      setStatus('ready');
    } catch {
      setStatus('not-found');
    }
  }, [token]);

  useEffect(() => {
    // one-shot fetch on mount (and whenever `token` changes) — not a subscription, so the
    // set-state-in-effect rule's "prefer an external-store subscription" guidance doesn't apply
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleBoxClick = useCallback(
    async (box: PlacedBox) => {
      if (!room) return;
      if (!room.unlocked) {
        setLockedBox({ eventAt: new Date(room.eventAt) });
        return;
      }
      setOpenError(null);
      try {
        const contents = await fetchBoxContents(box.id, token);
        setOpenBox({ boxId: box.id, contents });
      } catch (e) {
        setOpenError(e instanceof Error ? e.message : "Couldn't open that present.");
      }
    },
    [room, token],
  );

  if (status === 'loading') {
    return <div className="h-full w-full bg-[#0d0d1f]" />;
  }
  if (status === 'not-found' || !room || !role) {
    return <RoomNotFound />;
  }

  return (
    <div className="relative h-full w-full">
      <RoomCanvasLoader
        key={sceneKey}
        celebrantName={room.celebrantName}
        age={room.age ?? undefined}
        bannerText={room.bannerText}
        dataSource={dataSource}
        canContribute={role === 'contribute'}
        roomToken={role === 'contribute' ? token : undefined}
        onBoxClick={role === 'celebrate' ? handleBoxClick : undefined}
        handleRef={handleRef}
      />

      {role === 'admin' && (
        <AdminPanel
          token={token}
          room={room}
          onRoomChange={load}
          onBoxesChange={() => setSceneKey((k) => k + 1)}
        />
      )}

      {lockedBox && <LockedBoxModal eventAt={lockedBox.eventAt} onClose={() => setLockedBox(null)} />}

      {openError && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 border-2 border-[#ff3d8b] bg-[#fff6d5] px-3 py-2 font-mono text-sm text-[#5e3620]">
          {openError}
        </div>
      )}

      {openBox && (
        <BoxOpenAnimation
          design={openBox.contents.design}
          fromName={openBox.contents.fromName}
          goodieCount={openBox.contents.goodies.length}
          onComplete={() => {
            handleRef.current?.markBoxOpened(openBox.boxId);
            setOpenBox(null);
          }}
        />
      )}
    </div>
  );
}
