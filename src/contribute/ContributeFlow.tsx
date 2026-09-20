'use client';

import { useMemo, useRef, useState } from 'react';
import BoxDesigner from '@/box/BoxDesigner';
import { DEFAULT_DESIGN, type BoxDesign } from '@/box/types';
import { uploadFile } from '@/room/api';
import GoodieShelf from './GoodieShelf';
import { makeId } from './stubBackend';
import { MAX_GOODIES, MAX_TOTAL_BYTES, type BoxContribution, type GoodieItem, type GoodieType } from './types';

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

export default function ContributeFlow({ onCancel, onReadyToPlace, roomToken }: ContributeFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [fromName, setFromName] = useState('');
  const [letter, setLetter] = useState('');
  const [pictures, setPictures] = useState<File[]>([]);
  const [uploadedAssetKeys, setUploadedAssetKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [goodies, setGoodies] = useState<GoodieItem[]>([]);
  const [design, setDesign] = useState<BoxDesign>(DEFAULT_DESIGN);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const finalGoodies = useMemo(() => {
    const list = [...goodies];
    if (letter.trim()) {
      list.push({ id: '__letter', type: 'note', summary: letter.trim().slice(0, 60), sizeBytes: bytesOf(letter) });
    }
    if (pictures.length > 0) {
      list.push({
        id: '__pictures',
        type: 'photo',
        summary: `${pictures.length} photo${pictures.length > 1 ? 's' : ''}`,
        sizeBytes: pictures.reduce((s, f) => s + f.size, 0),
        payload: uploadedAssetKeys.length > 0 ? { assetKeys: uploadedAssetKeys } : undefined,
      });
    }
    return list;
  }, [goodies, letter, pictures, uploadedAssetKeys]);

  const totalBytes = finalGoodies.reduce((s, g) => s + g.sizeBytes, 0);
  const overLimit = finalGoodies.length > MAX_GOODIES || totalBytes > MAX_TOTAL_BYTES;

  function addGoodie(type: GoodieType) {
    if (goodies.length >= MAX_GOODIES) return;
    setGoodies((g) => [...g, { id: makeId(), type, summary: '', sizeBytes: 1024 }]);
  }
  function updateGoodie(id: string, summary: string) {
    setGoodies((g) => g.map((item) => (item.id === id ? { ...item, summary } : item)));
  }
  function removeGoodie(id: string) {
    setGoodies((g) => g.filter((item) => item.id !== id));
  }
  function reorderGoodie(id: string, dir: -1 | 1) {
    setGoodies((g) => {
      const i = g.findIndex((item) => item.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= g.length) return g;
      const next = [...g];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function addFiles(files: FileList | File[]) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setPictures((p) => [...p, ...images]);
    if (!roomToken) return;

    setUploading(true);
    setError(null);
    try {
      const results = await Promise.all(images.map((f) => uploadFile(roomToken, f)));
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
      setError(`Keep it to ${MAX_GOODIES} goodies and ${(MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB total.`);
      return;
    }
    if (uploading) {
      setError('Hang on, still uploading your pictures...');
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

            <GoodieShelf
              goodies={goodies}
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
