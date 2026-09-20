'use client';

import { useState } from 'react';

export default function PasswordPrompt({
  onSubmit,
  error,
  busy,
  onCancel,
}: {
  onSubmit: (password: string) => void;
  error?: string | null;
  busy?: boolean;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(password);
        }}
        className="flex w-full max-w-xs flex-col gap-3 border-4 border-[#ff3d8b] bg-[#fff6d5] p-5 shadow-[6px_6px_0_rgba(0,0,0,0.35)]"
      >
        <h2 className="font-pixel text-sm text-[#ff3d8b]">Enter the password</h2>
        <p className="font-mono text-sm text-[#5e3620]">
          Whoever put this together should have shared it with you separately from this link.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-2 border-[#e0b8c8] bg-white px-2 py-1 font-mono text-sm text-[#5e3620] focus:border-[#ff3d8b] focus:outline-none"
        />
        {error && <p className="font-mono text-sm text-[#d1266a]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border-2 border-[#5e3620] bg-[#fff6d5] px-3 py-1 font-mono text-sm text-[#5e3620]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-3 py-1 font-mono text-sm text-[#fff6d5] disabled:opacity-50"
          >
            {busy ? 'Checking...' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
}
