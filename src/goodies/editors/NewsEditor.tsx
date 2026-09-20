'use client';

import { useState } from 'react';
import type { NewsPayload } from '@/goodies/schema';
import { Field, inputClass, EditorShell } from './shared';
import type { GoodieEditorProps } from './types';

export default function NewsEditor({ initial, onSave, onCancel }: GoodieEditorProps<NewsPayload>) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const error = !url.trim() ? 'Add a link.' : null;

  return (
    <EditorShell
      title="News"
      onCancel={onCancel}
      onSave={() => onSave({ id: initial?.id ?? '', type: 'news', url: url.trim(), sizeBytes: new Blob([url]).size })}
      saveDisabled={Boolean(error)}
      error={error}
    >
      <Field label="Article link">
        <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://..." />
      </Field>
      <p className="font-mono text-xs italic text-[#5e3620]/60">
        We&apos;ll fetch a preview (title, image, source) when you seal the box — not shown live here.
      </p>
    </EditorShell>
  );
}
