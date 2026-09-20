'use client';

import { useState } from 'react';
import { uploadFile, type UploadKind } from '@/room/api';

/** Shared upload-state machine for the asset-backed editors (photo/song/video/voice/drawing). */
export function useAssetUpload(roomToken: string | undefined, kind: UploadKind) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | Blob, filename = 'upload'): Promise<{ assetKey: string; size: number } | null> {
    if (!roomToken) {
      setError('Uploads need a live room link — try this from the actual contribute page.');
      return null;
    }
    setUploading(true);
    setError(null);
    try {
      const asFile = file instanceof File ? file : new File([file], filename, { type: file.type });
      const result = await uploadFile(roomToken, asFile, kind);
      return { assetKey: result.assetKey, size: result.size };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error, setError };
}
