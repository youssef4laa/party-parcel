'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RoomCanvas, { type RoomCanvasHandle } from '@/room/RoomCanvas';
import BoxOpenAnimation from '@/box/BoxOpenAnimation';
import GoodieUnwrapFlow from '@/goodies/GoodieUnwrapFlow';
import GiftsFlow from '@/goodies/GiftsFlow';
import type { ContentsGift } from '@/room/api';
import type { ViewerGoodie } from '@/goodies/viewers';
import type { RoomDataSource } from '@/room/dataSource';
import type { PlacedBox } from '@/contribute/types';
import { deriveKey, decryptJson, decryptBlob } from './browserCrypto';
import { getLocalRedemption, setLocalRedemption } from './localRedemption';
import { addLocalPhotoboothShot, listLocalPhotoboothShots, removeLocalPhotoboothShot } from '@/room/localPhotobooth';
import CountdownBadge from './CountdownBadge';
import PasswordPrompt from './PasswordPrompt';
import type { StaticBoxSecret, StaticManifest } from './manifest';
import { toRoomObjectApi } from './staticObjects';

/** One exported bundle is always exactly one room, so a fixed namespace is enough. (Shots taken
 * *before* an export aren't carried over: they live in the live app's database, not in the export.) */
const PHOTOBOOTH_NS = 'export-room';

/** Placeholder shown on the in-room sprite for every box until its password is entered — the
 * real sender name is sender-authored text, not cosmetic design, so it lives inside the
 * encrypted blob (see manifest.ts) and never reaches the DOM (not even as an aria-label) before
 * decryption. */
const SEALED_LABEL = 'A friend';

type OpenState = {
  boxId: string;
  design: PlacedBox['design'];
  fromName: string;
  goodies: ViewerGoodie[];
  /** Only for a box with several gifts (Phase 4b) — decrypted from the box's own blob. */
  gifts?: ContentsGift[];
  openInOrder?: boolean;
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

  // Stable references: RoomCanvas rebuilds its whole scene if these change identity.
  const staticObjects = useMemo(() => manifest?.objects?.map(toRoomObjectApi), [manifest]);
  const staticCustomItems = useMemo(
    () => manifest?.customItems?.map((c) => ({ id: c.id, url: c.file })),
    [manifest],
  );

  const dataSource: RoomDataSource | null = manifest
    ? {
        async list() {
          // fromName isn't in the plaintext manifest at all (see manifest.ts) — every sealed box
          // shows the same generic placeholder in the room until its password is entered.
          return manifest.boxes.map((b) => ({
            id: b.id,
            fromName: SEALED_LABEL,
            design: b.design,
            x: b.x,
            y: b.y,
            placedAt: Date.parse(b.placedAt),
            scale: b.scale ?? 1,
            z: b.z ?? 0,
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

  /** Decrypts one box's sender name/tag text + goodies + referenced media with the given key.
   * Throws on wrong password (AES-GCM auth tag failure) — callers must not show anything if this
   * rejects. */
  const decryptBox = useCallback(
    async (boxMeta: StaticManifest['boxes'][number], activeKey: CryptoKey): Promise<Omit<OpenState, 'boxId' | 'design'>> => {
      const goodiesBuf = await fetch(boxMeta.goodiesFile).then((r) => r.arrayBuffer());
      const secret = await decryptJson<StaticBoxSecret>(activeKey, goodiesBuf);

      const goodies = await Promise.all(
        secret.goodies.map(async (g) => {
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
      // Regroup the flat, decrypted goodies into their gifts (a multi-gift box only).
      let gifts: ContentsGift[] | undefined;
      if (secret.gifts && secret.gifts.length > 1) {
        const byId = new Map(goodies.map((g) => [g.id, g]));
        gifts = secret.gifts.map((g) => ({
          id: g.id,
          label: g.label,
          design: g.design,
          sortOrder: g.sortOrder,
          goodies: g.goodieIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) as unknown as ContentsGift['goodies'],
        }));
      }
      return { fromName: secret.fromName, goodies, gifts, openInOrder: secret.openInOrder === true };
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
          const opened = await decryptBox(boxMeta, key);
          setOpenBox({ boxId: boxMeta.id, design: boxMeta.design, ...opened });
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
      const opened = await decryptBox(boxMeta, candidateKey);
      setKey(candidateKey); // only cache once we've proven it actually decrypts something
      setOpenBox({ boxId: boxMeta.id, design: boxMeta.design, ...opened });
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

  const finishOpening = () => {
    if (openBox) handleRef.current?.markBoxOpened(openBox.boxId);
    setUnwrapping(false);
    setOpenBox(null);
  };

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
        staticObjects={staticObjects}
        staticCustomItems={staticCustomItems}
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
          design={openBox.design}
          fromName={openBox.fromName}
          goodieCount={openBox.goodies.length}
          onComplete={() => setUnwrapping(true)}
        />
      )}

      {openBox && unwrapping && openBox.gifts && (
        <GiftsFlow
          gifts={openBox.gifts}
          boxId={openBox.boxId}
          celebrateToken=""
          fromName={openBox.fromName}
          openInOrder={openBox.openInOrder === true}
          onRedeem={handleRedeem}
          onDone={finishOpening}
        />
      )}
      {openBox && unwrapping && !openBox.gifts && (
        <GoodieUnwrapFlow
          goodies={openBox.goodies}
          boxId={openBox.boxId}
          celebrateToken=""
          fromName={openBox.fromName}
          onRedeem={handleRedeem}
          onDone={finishOpening}
        />
      )}
    </div>
  );
}
