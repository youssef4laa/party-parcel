'use client';

import { useRef, useState } from 'react';
import type { PhotoPayload } from '@/goodies/schema';
import { processImageClientSide } from '@/room/imageProcessing';
import { Field, inputClass, EditorShell } from './shared';
import { useAssetUpload } from './useAssetUpload';
import type { GoodieEditorProps } from './types';

export default function PhotoEditor({ initial, roomToken, onSave, onCancel }: GoodieEditorProps<PhotoPayload>) {
  const [assetKeys, setAssetKeys] = useState<string[]>(initial?.assetKeys ?? []);
  const [totalSize, setTotalSize] = useState(initial?.sizeBytes ?? 0);
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [alt, setAlt] = useState(initial?.alt ?? '');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { upload, uploading, error, setError } = useAssetUpload(roomToken, 'photo');

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 10 - assetKeys.length;
    const images = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, Math.max(0, remaining));
    if (images.length === 0) {
      if (assetKeys.length >= 10) setError('Up to 10 photos per goodie.');
      return;
    }
    for (const file of images) {
      const processed = await processImageClientSide(file);
      const result = await upload(processed);
      if (result) {
        setAssetKeys((keys) => [...keys, result.assetKey]);
        setTotalSize((s) => s + result.size);
      }
    }
  }

  return (
    <EditorShell
      title="Photo"
      onCancel={onCancel}
      onSave={() =>
        onSave({
          id: initial?.id ?? '',
          type: 'photo',
          assetKeys,
          caption: caption.trim() || undefined,
          alt: alt.trim() || undefined,
          sizeBytes: totalSize,
        })
      }
      saveDisabled={assetKeys.length === 0 || uploading}
      error={error}
    >
      <div
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
        className="cursor-pointer border-2 border-dashed border-[#e0b8c8] bg-white px-3 py-4 text-center font-mono text-sm text-[#5e3620]"
      >
        {uploading ? 'uploading...' : `${assetKeys.length} / 10 photos — click to add`}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>
      <Field label="Caption (optional)">
        <input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 280))} className={inputClass} />
      </Field>
      <Field label="Alt text (optional, for screen readers)">
        <input value={alt} onChange={(e) => setAlt(e.target.value.slice(0, 280))} className={inputClass} />
      </Field>
    </EditorShell>
  );
}
