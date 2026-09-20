'use client';

import { useState } from 'react';
import type { LocationPayload } from '@/goodies/schema';
import { Field, inputClass, EditorShell } from './shared';
import type { GoodieEditorProps } from './types';

export default function LocationEditor({ initial, onSave, onCancel }: GoodieEditorProps<LocationPayload>) {
  const [placeName, setPlaceName] = useState(initial?.placeName ?? '');
  const [mapUrl, setMapUrl] = useState(initial?.mapUrl ?? '');
  const [lat, setLat] = useState(initial?.lat !== undefined ? String(initial.lat) : '');
  const [lng, setLng] = useState(initial?.lng !== undefined ? String(initial.lng) : '');
  const [note, setNote] = useState(initial?.note ?? '');

  const latNum = lat.trim() ? Number(lat) : undefined;
  const lngNum = lng.trim() ? Number(lng) : undefined;
  const coordsProvided = lat.trim() !== '' || lng.trim() !== '';
  const coordsValid =
    !coordsProvided ||
    (latNum !== undefined && lngNum !== undefined && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180);

  let error: string | null = null;
  if (!placeName.trim()) error = 'Add a place name.';
  else if (coordsProvided && !coordsValid) error = 'Latitude must be -90..90 and longitude -180..180.';
  else if (!mapUrl.trim() && !coordsProvided) error = 'Add a map link or coordinates.';

  return (
    <EditorShell
      title="Location"
      onCancel={onCancel}
      onSave={() =>
        onSave({
          id: initial?.id ?? '',
          type: 'location',
          placeName: placeName.trim(),
          mapUrl: mapUrl.trim() || undefined,
          lat: coordsProvided ? latNum : undefined,
          lng: coordsProvided ? lngNum : undefined,
          note: note.trim() || undefined,
          sizeBytes: new Blob([placeName + mapUrl + note]).size,
        })
      }
      saveDisabled={Boolean(error)}
      error={error}
    >
      <Field label="Place name">
        <input value={placeName} onChange={(e) => setPlaceName(e.target.value.slice(0, 200))} className={inputClass} />
      </Field>
      <Field label="Map link (optional if coordinates given)">
        <input value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} className={inputClass} placeholder="https://maps.google.com/..." />
      </Field>
      <div className="flex gap-3">
        <Field label="Latitude">
          <input value={lat} onChange={(e) => setLat(e.target.value)} className={inputClass} placeholder="-90..90" />
        </Field>
        <Field label="Longitude">
          <input value={lng} onChange={(e) => setLng(e.target.value)} className={inputClass} placeholder="-180..180" />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} className={inputClass} />
      </Field>
    </EditorShell>
  );
}
