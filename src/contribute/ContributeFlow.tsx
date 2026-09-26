'use client';

import { useMemo, useRef, useState } from 'react';
import BoxDesigner from '@/box/BoxDesigner';
import { BOX_PRESETS, DEFAULT_DESIGN, type BoxDesign } from '@/box/types';
import { uploadFile } from '@/room/api';
import { processImageClientSide } from '@/room/imageProcessing';
import { LIMITS } from '@/config/limits';
import GoodieShelf from './GoodieShelf';
import { type BoxContribution, type GiftContribution, type GoodieItem } from './types';

export type ContributeFlowProps = {
  onCancel: () => void;
  onReadyToPlace: (contribution: BoxContribution) => void;
  /** When set, pictures upload for real (content-sniffed, EXIF-stripped, stored) against this
   * room's contribute token. Omit to keep the client-only demo behavior (just counts files). */
  roomToken?: string;
};

function bytesOf(text: string) {
  return new Blob([text]).size;
}

/** One gift while it's being packed. Gift 1 is the box's original
 * contents: the letter and pictures fields below belong to it, exactly as before gifts existed. */
type GiftDraft = { id: string; label: string; design: BoxDesign; goodies: GoodieItem[] };

const GIFT_LABEL_MAX = 40;
let giftCounter = 0;
function newGift(index: number): GiftDraft {
  giftCounter += 1;
  // each gift starts with a different look, so a fresh multi-gift box doesn't open to identical wraps
  return { id: `gift-${giftCounter}`, label: '', design: BOX_PRESETS[index % BOX_PRESETS.length].design, goodies: [] };
}

export default function ContributeFlow({ onCancel, onReadyToPlace, roomToken }: ContributeFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [fromName, setFromName] = useState('');
  const [letter, setLetter] = useState('');
  const [pictures, setPictures] = useState<File[]>([]);
  const [uploadedAssetKeys, setUploadedAssetKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [gifts, setGifts] = useState<GiftDraft[]>(() => [newGift(0)]);
  const [activeGift, setActiveGift] = useState(0);
  const [openInOrder, setOpenInOrder] = useState(false);
  const [showWrap, setShowWrap] = useState(false);
  const multi = gifts.length > 1;
  const [design, setDesign] = useState<BoxDesign>(DEFAULT_DESIGN);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Each gift's final goodie list. Gift 1 also carries the letter (a Note) and the pictures (a
  // Photo), exactly as it did when a box could only hold one gift's worth of contents.
  const finalGifts = useMemo<GiftContribution[]>(
    () =>
      gifts.map((g, i) => {
        const list = [...g.goodies];
        if (i === 0) {
          if (letter.trim()) {
            list.push({
              id: '__letter',
              type: 'note',
              text: letter.trim(),
              paperStyle: 'cream',
              font: 'typewriter',
              sizeBytes: bytesOf(letter),
            });
          }
          if (pictures.length > 0 && uploadedAssetKeys.length > 0) {
            list.push({
              id: '__pictures',
              type: 'photo',
              assetKeys: uploadedAssetKeys,
              sizeBytes: pictures.reduce((s, f) => s + f.size, 0),
            });
          }
        }
        return { label: g.label.trim(), design: g.design, goodies: list };
      }),
    [gifts, letter, pictures, uploadedAssetKeys],
  );
  const finalGoodies = useMemo<GoodieItem[]>(() => finalGifts.flatMap((g) => g.goodies), [finalGifts]);

  const totalBytes = finalGoodies.reduce((s, g) => s + g.sizeBytes, 0);
  const overLimit = finalGoodies.length > LIMITS.maxGoodiesPerBox || totalBytes > LIMITS.maxBytesPerBox;

  // Goodie edits always apply to the gift whose tab is open.
  function patchActive(fn: (goodies: GoodieItem[]) => GoodieItem[]) {
    setGifts((all) => all.map((g, i) => (i === activeGift ? { ...g, goodies: fn(g.goodies) } : g)));
  }
  function addGoodie(item: GoodieItem) {
    patchActive((g) => [...g, item]);
  }
  function updateGoodie(id: string, item: GoodieItem) {
    patchActive((g) => g.map((existing) => (existing.id === id ? item : existing)));
  }
  function removeGoodie(id: string) {
    patchActive((g) => g.filter((item) => item.id !== id));
  }
  function reorderGoodie(id: string, dir: -1 | 1) {
    patchActive((g) => {
      const i = g.findIndex((item) => item.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= g.length) return g;
      const next = [...g];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function patchGift(index: number, patch: Partial<GiftDraft>) {
    setGifts((all) => all.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }
  function addGift() {
    if (gifts.length >= LIMITS.maxGiftsPerBox) return;
    setGifts((all) => [...all, newGift(all.length)]);
    setActiveGift(gifts.length);
    setShowWrap(false);
  }
  function removeGift(index: number) {
    if (index === 0 || gifts.length <= 1) return; // gift 1 owns the letter/pictures — it stays
    setGifts((all) => all.filter((_, i) => i !== index));
    setActiveGift((a) => Math.min(a, gifts.length - 2));
    setShowWrap(false);
  }

  async function addFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setPictures((p) => [...p, ...images]);
    if (!roomToken) return;

    setUploading(true);
    setError(null);
    try {
      // resize/re-encode/strip EXIF in the browser first (see src/room/imageProcessing.ts) —
      // production never depends on the server-side sharp pass for this
      const processed = await Promise.all(images.map(processImageClientSide));
      const results = await Promise.all(processed.map((f) => uploadFile(roomToken, f, 'photo')));
      setUploadedAssetKeys((keys) => [...keys, ...results.map((r) => r.assetKey)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That upload failed — try a different image.');
      setPictures((p) => p.filter((f) => !images.includes(f)));
    } finally {
      setUploading(false);
    }
  }

  function goNext() {
    if (!fromName.trim()) {
      setError('Add your name so they know who this is from.');
      return;
    }
    if (overLimit) {
      setError(`Keep it to ${LIMITS.maxGoodiesPerBox} goodies and ${(LIMITS.maxBytesPerBox / (1024 * 1024)).toFixed(0)} MB total.`);
      return;
    }
    if (uploading) {
      setError('Hang on, still uploading your pictures...');
      return;
    }
    // A box with several gifts must not open to an empty one — the server refuses it too.
    const emptyIdx = multi ? finalGifts.findIndex((g) => g.goodies.length === 0) : -1;
    if (emptyIdx >= 0) {
      setActiveGift(emptyIdx);
      setError(`Gift ${emptyIdx + 1} is empty — put something in it or remove it.`);
      return;
    }
    setError(null);
    setStep(2);
  }

  function wrapItUp() {
    onReadyToPlace({
      fromName: fromName.trim(),
      letter,
      pictureCount: pictures.length,
      goodies: finalGoodies,
      design,
      // only a box with more than one gift carries the extra structure; a single-gift box is the
      // same plain contribution it has always been
      ...(multi ? { gifts: finalGifts, openInOrder } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-auto border-4 border-[#ff3d8b] bg-[#fff6d5] p-5 shadow-[6px_6px_0_rgba(0,0,0,0.35)]">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="font-pixel text-sm text-[#ff3d8b]">
            {step === 1 ? 'Pack a present' : 'Design the box'}
          </h2>
          <span className="font-pixel text-[10px] text-[#5e3620]">STEP {step} OF 3</span>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-sm text-[#5e3620]">FROM (required)</span>
              <input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                className="border-2 border-[#e0b8c8] bg-white px-2 py-1 font-mono text-sm text-[#5e3620] focus:border-[#ff3d8b] focus:outline-none"
                placeholder="Your name"
              />
            </label>

            <div role="tablist" aria-label="Gifts in this box" className="flex flex-wrap items-center gap-1.5">
              {multi &&
                gifts.map((g, i) => (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={i === activeGift}
                    onClick={() => {
                      setActiveGift(i);
                      setShowWrap(false);
                    }}
                    className={`border-2 px-2 py-1 font-mono text-sm ${
                      i === activeGift ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#e0b8c8] bg-[#fff6d5] text-[#5e3620]'
                    }`}
                  >
                    Gift {i + 1}
                    {g.label.trim() ? `: ${g.label.trim().slice(0, 14)}` : ''}
                  </button>
                ))}
              <button
                type="button"
                onClick={addGift}
                disabled={gifts.length >= LIMITS.maxGiftsPerBox}
                className="border-2 border-dashed border-[#ff3d8b] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#ff3d8b] disabled:opacity-40"
              >
                Add another gift to this box
              </button>
              {multi && (
                <span className="font-mono text-xs text-[#5e3620]/70">
                  {gifts.length} of {LIMITS.maxGiftsPerBox} gifts
                </span>
              )}
            </div>

            {multi && (
              <div className="flex flex-col gap-2 border-2 border-[#e0b8c8] bg-white p-2" data-testid="gift-settings">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-sm text-[#5e3620]">GIFT {activeGift + 1} LABEL</span>
                  <input
                    value={gifts[activeGift].label}
                    maxLength={GIFT_LABEL_MAX}
                    onChange={(e) => patchGift(activeGift, { label: e.target.value.slice(0, GIFT_LABEL_MAX) })}
                    placeholder="Open me first!"
                    aria-label={`Gift ${activeGift + 1} label`}
                    className="border-2 border-[#e0b8c8] bg-white px-2 py-1 font-mono text-sm text-[#5e3620] focus:border-[#ff3d8b] focus:outline-none"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWrap((v) => !v)}
                    className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620]"
                  >
                    {showWrap ? 'Hide wrap design' : 'Wrap this gift'}
                  </button>
                  {activeGift > 0 && (
                    <button
                      type="button"
                      onClick={() => removeGift(activeGift)}
                      className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#d1266a]"
                    >
                      Remove this gift
                    </button>
                  )}
                </div>
                {showWrap && (
                  <BoxDesigner
                    key={gifts[activeGift].id}
                    compact
                    initialDesign={gifts[activeGift].design}
                    onChange={(d) => patchGift(activeGift, { design: d })}
                  />
                )}
                <label className="flex items-center gap-2 font-mono text-sm text-[#5e3620]">
                  <input type="checkbox" checked={openInOrder} onChange={(e) => setOpenInOrder(e.target.checked)} />
                  Open in order (they must unwrap the gifts one after another)
                </label>
              </div>
            )}

            {activeGift === 0 && (
              <>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-sm text-[#5e3620]">LETTER (becomes a Note goodie)</span>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value.slice(0, 2000))}
                rows={3}
                maxLength={2000}
                className="border-2 border-[#e0b8c8] bg-white px-2 py-1 font-mono text-sm text-[#5e3620] focus:border-[#ff3d8b] focus:outline-none"
                placeholder="Write a little something..."
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-sm text-[#5e3620]">PICTURES (becomes a Photo goodie)</span>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                className={`cursor-pointer border-2 border-dashed px-3 py-4 text-center font-mono text-sm text-[#5e3620] ${
                  dragOver ? 'border-[#ff3d8b] bg-[#fff0f6]' : 'border-[#e0b8c8] bg-white'
                }`}
              >
                {uploading
                  ? 'uploading...'
                  : pictures.length > 0
                    ? `${pictures.length} image(s) attached`
                    : 'drop images here or click to choose'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
              </div>
            </div>

              </>
            )}

            <GoodieShelf
              key={gifts[activeGift].id}
              goodies={gifts[activeGift].goodies}
              boxGoodieCount={finalGoodies.length}
              roomToken={roomToken}
              onAdd={addGoodie}
              onUpdate={updateGoodie}
              onRemove={removeGoodie}
              onReorder={reorderGoodie}
            />

            {error && <p className="font-mono text-sm text-[#d1266a]">{error}</p>}

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="border-2 border-[#5e3620] bg-[#fff6d5] px-4 py-2 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={goNext}
                className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-4 py-2 font-mono text-sm text-[#fff6d5] hover:bg-[#d1266a]"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <BoxDesigner initialDesign={design} onChange={setDesign} onSave={wrapItUp} saveLabel="Wrap it up" />
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="border-2 border-[#5e3620] bg-[#fff6d5] px-4 py-2 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
