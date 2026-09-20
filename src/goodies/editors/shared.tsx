'use client';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-sm text-[#5e3620]">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'border-2 border-[#e0b8c8] bg-white px-2 py-1 font-mono text-sm text-[#5e3620] focus:border-[#ff3d8b] focus:outline-none';

export function EditorShell({
  title,
  children,
  onCancel,
  onSave,
  saveDisabled,
  error,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 border-2 border-[#ff3d8b] bg-[#fffdf5] p-3">
      <h4 className="font-pixel text-[10px] text-[#ff3d8b]">{title}</h4>
      {children}
      {error && <p className="font-mono text-sm text-[#d1266a]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-2 border-[#5e3620] bg-[#fff6d5] px-3 py-1 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-3 py-1 font-mono text-sm text-[#fff6d5] hover:bg-[#d1266a] disabled:opacity-40"
        >
          Add to box
        </button>
      </div>
    </div>
  );
}
