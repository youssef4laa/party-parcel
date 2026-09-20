'use client';

import { useState } from 'react';
import type { VideoPayload } from '@/goodies/schema';
import { Field, inputClass, EditorShell } from './shared';
import { useAssetUpload } from './useAssetUpload';
import type { GoodieEditorProps } from './types';

export default function VideoEditor({ initial, roomToken, onSave, onCancel }: GoodieEditorProps<VideoPayload>) {
  const [mode, setMode] = useState<'url' | 'upload'>(initial?.assetKey ? 'upload' : 'url');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [assetKey, setAssetKey] = useState(initial?.assetKey);
  const [size, setSize] = useState(initial?.sizeBytes ?? 0);
  const { upload, uploading, error } = useAssetUpload(roomToken, 'video');

  const ready = mode === 'url' ? url.trim().length > 0 : Boolean(assetKey);

  return (
    <EditorShell
      title="Video"
      onCancel={onCancel}
      onSave={() =>
        onSave({
          id: initial?.id ?? '',
          type: 'video',
          url: mode === 'url' ? url.trim() : undefined,
          assetKey: mode === 'upload' ? assetKey : undefined,
          sizeBytes: mode === 'upload' ? size : new Blob([url]).size,
        })
      }
      saveDisabled={!ready || uploading}
      error={error}
    >
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`border-2 px-2 py-1 font-mono text-sm ${mode === 'url' ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#e0b8c8] bg-white text-[#5e3620]'}`}
        >
          Link
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`border-2 px-2 py-1 font-mono text-sm ${mode === 'upload' ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#e0b8c8] bg-white text-[#5e3620]'}`}
        >
          Upload video
        </button>
      </div>

      {mode === 'url' ? (
        <Field label="YouTube or Vimeo link">
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://youtube.com/watch?v=..." />
        </Field>
      ) : (
        <Field label="MP4 or WebM file">
          <input
            type="file"
            accept="video/mp4,video/webm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const result = await upload(file);
              if (result) {
                setAssetKey(result.assetKey);
                setSize(result.size);
              }
            }}
            className={inputClass}
          />
          {uploading && <span className="font-mono text-xs text-[#5e3620]">uploading...</span>}
          {assetKey && <span className="font-mono text-xs text-[#5e3620]">✓ uploaded</span>}
        </Field>
      )}
    </EditorShell>
  );
}
