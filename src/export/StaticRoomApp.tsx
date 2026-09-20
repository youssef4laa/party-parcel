'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import RoomCanvas, { type RoomCanvasHandle } from '@/room/RoomCanvas';
import BoxOpenAnimation from '@/box/BoxOpenAnimation';
import GoodieUnwrapFlow from '@/goodies/GoodieUnwrapFlow';
import type { ViewerGoodie } from '@/goodies/viewers';
import type { RoomDataSource } from '@/room/dataSource';
import type { PlacedBox } from '@/contribute/types';
import { deriveKey, decryptJson, decryptBlob } from './browserCrypto';
import { getLocalRedemption, setLocalRedemption } from './localRedemption';
import { addLocalPhotoboothShot, listLocalPhotoboothShots, removeLocalPhotoboothShot } from '@/room/localPhotobooth';

/** One exported bundle is always exactly one room, so a fixed namespace is enough — see the
 * "known gap" note in DECISIONS.md about why shots taken *before* export aren't carried over. */
const PHOTOBOOTH_NS = 'export-room';
import CountdownBadge from './CountdownBadge';
import PasswordPrompt from './PasswordPrompt';
import type { StaticGoodie, StaticManifest } from './manifest';

type OpenState = {
  boxMeta: { id: string; fromName: string; design: PlacedBox['design'] };
  goodies: ViewerGoodie[];
};

export default function StaticRoomApp() {
  const [manifest, setManifest] = useState<StaticManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [pendingBoxId, setPendingBoxId] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [checkingPassword, setCheckingPassword] = useState(false);
  const [openBox, setOpenBox] = useState<OpenState | null>(null);
  const [unwrapping, setUnwrapping] = useState(false);
  const handleRef = useRef<RoomCanvasHandle | null>(null);

  useEffect(() => {
    fetch('./manifest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setManifest)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load this room.'));
  }, []);

  const dataSource: RoomDataSource | null = manifest
    ? {
        async list() {
          return manifest.boxes.map((b) => ({
            id: b.id,
            fromName: b.fromName,
            design: b.design,
            x: b.x,
            y: b.y,
            placedAt: Date.parse(b.placedAt),
          }));
        },
        async create() {
          throw new Error('This is a sealed, exported room — new presents can no longer be added.');
        },
        async remove() {
          throw new Error('This is a sealed, exported room — presents can no longer be removed.');
        },
        // No backend to talk to at all here — shots taken while browsing the export live only
        // in this visitor's browser (localStorage), same as coupon redemptions.
        photobooth: {
          async list() {
            return listLocalPhotoboothShots(PHOTOBOOTH_NS);
          },
          async add(photo, celebrantName) {
            return addLocalPhotoboothShot(PHOTOBOOTH_NS, photo, celebrantName);
          },
          async remove(shot) {
            removeLocalPhotoboothShot(PHOTOBOOTH_NS, shot.id);
          },
        },
      }
    : null;

  /** Decrypts one box's goodies + referenced media with the given key. Throws on wrong password
   * (AES-GCM auth tag failure) — callers must not show anything if this rejects. */
  const decryptBox = useCallback(
    async (boxMeta: StaticManifest['boxes'][number], activeKey: CryptoKey): Promise<ViewerGoodie[]> => {
      const goodiesBuf = await fetch(boxMeta.goodiesFile).then((r) => r.arrayBuffer());
      const staticGoodies = await decryptJson<StaticGoodie[]>(activeKey, goodiesBuf);

      return Promise.all(
        staticGoodies.map(async (g) => {
          const assetUrls = await Promise.all(
            g.assetFiles.map(async ({ path, mime }) => {
              const buf = await fetch(path).then((r) => r.arrayBuffer());
              const plain = await decryptBlob(activeKey, buf);
              return URL.createObjectURL(new Blob([plain], { type: mime }));
            }),
          );
          const local = getLocalRedemption(g.id);
          return { ...g, assetUrls, redeemedAt: local ?? (g.redeemedAt as string | null) } as ViewerGoodie;
        }),
      );
    },
    [],
  );

  const handleBoxClick = useCallback(
    async (box: PlacedBox) => {
      if (!manifest) return;
      const boxMeta = manifest.boxes.find((b) => b.id === box.id);
      if (!boxMeta) return;

      if (key) {
        try {
          const goodies = await decryptBox(boxMeta, key);
          setOpenBox({ boxMeta, goodies });
          setUnwrapping(false);
          return;
        } catch {
          // fall through — treat a decrypt failure as "need the password again" defensively,
          // even though a previously-good key should never suddenly fail
        }
      }
      setPendingBoxId(box.id);
      setPasswordError(null);
    },
    [manifest, key, decryptBox],
  );

  async function submitPassword(password: string) {
    if (!manifest || !pendingBoxId) return;
    const boxMeta = manifest.boxes.find((b) => b.id === pendingBoxId);
    if (!boxMeta) return;

    setCheckingPassword(true);
    setPasswordError(null);
    try {
      const candidateKey = await deriveKey(password, manifest.kdf.salt);
      const goodies = await decryptBox(boxMeta, candidateKey);
      setKey(candidateKey); // only cache once we've proven it actually decrypts something
      setOpenBox({ boxMeta, goodies });
      setUnwrapping(false);
      setPendingBoxId(null);
    } catch {
      setPasswordError('Wrong password — nothing was unlocked. Try again.');
    } finally {
      setCheckingPassword(false);
    }
  }

  async function handleRedeem(goodieId: string) {
    const redeemedAt = setLocalRedemption(goodieId);
    return { redeemedAt };
  }

  if (loadError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0d0d1f] p-6 text-center">
        <p className="font-pixel text-sm text-[#ff3d8b]">Party Parcel</p>
        <p className="font-mono text-lg text-[#fff6d5]">Couldn&apos;t load this room ({loadError}).</p>
      </div>
    );
  }
  if (!manifest || !dataSource) {
    return <div className="h-full w-full bg-[#0d0d1f]" />;
  }

  return (
    <div className="relative h-full w-full">
      <RoomCanvas
        celebrantName={manifest.room.celebrantName}
        age={manifest.room.age ?? undefined}
        bannerText={manifest.room.bannerText}
        dataSource={dataSource}
        canContribute={false}
        onBoxClick={handleBoxClick}
        handleRef={handleRef}
      />

      <CountdownBadge eventAt={manifest.room.eventAt} />

      {pendingBoxId && (
        <PasswordPrompt
          onSubmit={submitPassword}
          onCancel={() => setPendingBoxId(null)}
          error={passwordError}
          busy={checkingPassword}
        />
      )}

      {openBox && !unwrapping && (
        <BoxOpenAnimation
          design={openBox.boxMeta.design}
          fromName={openBox.boxMeta.fromName}
          goodieCount={openBox.goodies.length}
          onComplete={() => setUnwrapping(true)}
        />
      )}

      {openBox && unwrapping && (
        <GoodieUnwrapFlow
          goodies={openBox.goodies}
          boxId={openBox.boxMeta.id}
          celebrateToken=""
          fromName={openBox.boxMeta.fromName}
          onRedeem={handleRedeem}
          onDone={() => {
            handleRef.current?.markBoxOpened(openBox.boxMeta.id);
            setUnwrapping(false);
            setOpenBox(null);
          }}
        />
      )}
    </div>
  );
}
