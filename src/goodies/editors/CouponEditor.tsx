'use client';

import { useState } from 'react';
import type { CouponPayload } from '@/goodies/schema';
import { Field, inputClass, EditorShell } from './shared';
import type { GoodieEditorProps } from './types';

export default function CouponEditor({ initial, onSave, onCancel }: GoodieEditorProps<CouponPayload>) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [finePrint, setFinePrint] = useState(initial?.finePrint ?? '');
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ? initial.expiresAt.slice(0, 10) : '');

  const error = !title.trim() ? 'Give the coupon a title.' : null;

  return (
    <EditorShell
      title="Coupon"
      onCancel={onCancel}
      onSave={() =>
        onSave({
          id: initial?.id ?? '',
          type: 'coupon',
          title: title.trim(),
          finePrint: finePrint.trim() || undefined,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
          sizeBytes: new Blob([title + finePrint]).size,
        })
      }
      saveDisabled={Boolean(error)}
      error={error}
    >
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} className={inputClass} placeholder="One free hug" />
      </Field>
      <Field label="Fine print (optional)">
        <input value={finePrint} onChange={(e) => setFinePrint(e.target.value.slice(0, 500))} className={inputClass} />
      </Field>
      <Field label="Expires on (optional)">
        <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
      </Field>
    </EditorShell>
  );
}
