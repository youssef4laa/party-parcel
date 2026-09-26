'use client';

import { useEffect, useState } from 'react';
import { deleteBox, exportSealedCopy, fetchBoxes, unlockRoom, type PlacedBoxApi, type RoomInfo } from './api';

/**
 * Minimal host admin surface so Milestone 4's unlock + box-removal logic is actually testable.
 * Milestone 7 replaces/extends this with the full admin page (regenerate links, delete room,
 * download-everything zip).
 */
export default function AdminPanel({
  token,
  room,
  onRoomChange,
  onBoxesChange,
}: {
  token: string;
  room: RoomInfo;
  onRoomChange: () => void;
  onBoxesChange: () => void;
}) {
  const [boxes, setBoxes] = useState<PlacedBoxApi[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [exportPassword, setExportPassword] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  async function refresh() {
    setBoxes(await fetchBoxes(token));
  }

  useEffect(() => {
    // one-shot fetch on mount/token-change, not a subscription; `refresh` is intentionally
    // omitted below since it's redefined every render but only ever needs `token`
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleUnlock() {
    setBusy(true);
    try {
      await unlockRoom(token);
      onRoomChange();
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    setExporting(true);
    setExportError(null);
    setExported(null);
    try {
      const { blob, filename } = await exportSealedCopy(token, exportPassword);
      // hand the zip to the browser as an ordinary download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExported(filename);
      setExportPassword(''); // never keep the password around once it has been used
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'The export failed.');
    } finally {
      setExporting(false);
    }
  }

  async function handleRemove(boxId: string) {
    setBusy(true);
    try {
      await deleteBox(token, boxId);
      await refresh();
      onBoxesChange();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-3 top-3 border-2 border-[#5e3620] bg-[#fff6d5] px-3 py-1.5 font-mono text-sm text-[#5e3620]"
      >
        Host panel
      </button>
    );
  }

  return (
    <div className="absolute left-3 top-3 max-h-[80vh] w-72 overflow-auto border-4 border-[#ff3d8b] bg-[#fff6d5] p-3 shadow-[3px_3px_0_rgba(0,0,0,0.3)]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-pixel text-[10px] text-[#ff3d8b]">Host panel</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Collapse" className="font-mono text-sm text-[#5e3620]">
          ✕
        </button>
      </div>
      <p className="mb-1 font-mono text-sm text-[#5e3620]">{room.title}</p>
      <p className="mb-2 font-mono text-xs text-[#5e3620]/70">
        Opens {new Date(room.eventAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
      {!room.unlocked ? (
        <button
          type="button"
          disabled={busy}
          onClick={handleUnlock}
          className="mb-3 w-full border-2 border-[#ff3d8b] bg-[#ff3d8b] px-2 py-1 font-mono text-sm text-[#fff6d5] disabled:opacity-50"
        >
          Unlock early
        </button>
      ) : (
        <p className="mb-3 font-mono text-xs text-[#5e3620]">🔓 Unlocked</p>
      )}

      <h3 className="mb-1 font-mono text-xs uppercase text-[#5e3620]/70">Presents ({boxes.length})</h3>
      <ul className="flex flex-col gap-1">
        {boxes.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 border-b border-dashed border-[#e0b8c8] py-1">
            <span className="min-w-0 truncate font-mono text-sm text-[#5e3620]">{b.fromName}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleRemove(b.id)}
              className="shrink-0 font-mono text-xs text-[#ff3d8b] disabled:opacity-50"
            >
              remove
            </button>
          </li>
        ))}
        {boxes.length === 0 && <li className="font-mono text-sm italic text-[#5e3620]/60">No presents yet.</li>}
      </ul>

      <form onSubmit={handleExport} className="mt-3 flex flex-col gap-1.5 border-t-2 border-[#e0b8c8] pt-3" aria-label="Export a sealed copy">
        <h3 className="font-mono text-xs uppercase text-[#5e3620]/70">Export a sealed copy</h3>
        <p className="font-mono text-[11px] leading-snug text-[#5e3620]/80">
          Downloads the room as a folder you can host anywhere, with no server. Every present is locked
          with the password below — it&apos;s the only lock, so share it separately from the link.
          Decorations and imported pictures are <strong>not</strong> locked.
        </p>
        <label className="flex flex-col gap-1 font-mono text-xs text-[#5e3620]">
          Password (12+ characters)
          <input
            type="password"
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
            autoComplete="new-password"
            className="border-2 border-[#e0b8c8] bg-white px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={exporting || !exportPassword}
          className="w-full border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] disabled:opacity-50"
        >
          {exporting ? 'Building… this can take a minute' : 'Download sealed copy (.zip)'}
        </button>
        {exportError && (
          <p role="alert" className="font-mono text-xs text-[#d1266a]">
            {exportError}
          </p>
        )}
        {exported && <p className="font-mono text-xs text-[#5e3620]">Downloaded {exported}. Unzip it and put the folder on any static host.</p>}
      </form>
    </div>
  );
}
