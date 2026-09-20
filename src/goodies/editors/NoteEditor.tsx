'use client';

import { useState } from 'react';
import type { NotePayload } from '@/goodies/schema';
import { Field, inputClass, EditorShell } from './shared';
import type { GoodieEditorProps } from './types';

const PAPER_STYLES: NotePayload['paperStyle'][] = ['lined', 'cream', 'pink'];
const FONTS: NotePayload['font'][] = ['typewriter', 'handwritten', 'pixel'];

export default function NoteEditor({ initial, onSave, onCancel }: GoodieEditorProps<NotePayload>) {
  const [text, setText] = useState(initial?.text ?? '');
  const [paperStyle, setPaperStyle] = useState<NotePayload['paperStyle']>(initial?.paperStyle ?? 'cream');
  const [font, setFont] = useState<NotePayload['font']>(initial?.font ?? 'typewriter');

  const trimmed = text.trim();
  const error = trimmed.length === 0 ? 'Write something first.' : null;

  return (
    <EditorShell
      title="Note"
      onCancel={onCancel}
      onSave={() =>
        onSave({
          id: initial?.id ?? '',
          type: 'note',
          text: trimmed,
          paperStyle,
          font,
          sizeBytes: new Blob([trimmed]).size,
        })
      }
      saveDisabled={Boolean(error)}
    >
      <Field label={`Text (${text.length}/2000)`}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          rows={4}
          className={inputClass}
          placeholder="Write a little something..."
        />
      </Field>
      <div className="flex gap-4">
        <Field label="Paper">
          <select value={paperStyle} onChange={(e) => setPaperStyle(e.target.value as NotePayload['paperStyle'])} className={inputClass}>
            {PAPER_STYLES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Font">
          <select value={font} onChange={(e) => setFont(e.target.value as NotePayload['font'])} className={inputClass}>
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </EditorShell>
  );
}
