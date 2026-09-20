'use client';

import { useState } from 'react';
import type { GiftPayload } from '@/goodies/schema';
import { Field, inputClass, EditorShell } from './shared';
import type { GoodieEditorProps } from './types';

export default function GiftEditor({ initial, onSave, onCancel }: GoodieEditorProps<GiftPayload>) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [message, setMessage] = useState(initial?.message ?? '');
  const [redeemCode, setRedeemCode] = useState(initial?.redeemCode ?? '');

  const trimmedMessage = message.trim();
  const error = trimmedMessage.length === 0 ? 'Add a short message.' : null;

  return (
    <EditorShell
      title="Gift"
      onCancel={onCancel}
      onSave={() =>
        onSave({
          id: initial?.id ?? '',
          type: 'gift',
          url: url.trim() || undefined,
          message: trimmedMessage,
          redeemCode: redeemCode.trim() || undefined,
          sizeBytes: new Blob([trimmedMessage + redeemCode]).size,
        })
      }
      saveDisabled={Boolean(error)}
      error={error}
    >
      <Field label="Gift, wishlist, or e-gift-card link (optional)">
        <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://..." />
      </Field>
      <Field label="Message">
        <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} rows={3} className={inputClass} />
      </Field>
      <Field label="Redeem code (optional — stays hidden until unwrapped)">
        <input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value.slice(0, 200))} className={inputClass} />
      </Field>
      <p className="font-mono text-xs italic text-[#5e3620]/60">No payments are processed here — just a link and a code.</p>
    </EditorShell>
  );
}
