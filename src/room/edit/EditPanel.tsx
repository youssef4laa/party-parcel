'use client';

import { useState } from 'react';
import { catalogEntriesFor, type CatalogCategory } from '@/room/objectCatalog';
import type { RoomObjectApi, RoomObjectPatch, RoomPermissions } from '@/room/api';
import { LIMITS } from '@/config/limits';

type Tab = 'items' | 'draw' | 'layers' | 'permissions';

const CATEGORIES: { key: CatalogCategory; label: string }[] = [
  { key: 'furniture', label: 'Furniture' },
  { key: 'plants', label: 'Plants & trees' },
  { key: 'lights', label: 'Lights' },
  { key: 'decor', label: 'Party decor' },
];

const tabButtonClass = (active: boolean) =>
  `flex-1 border-2 px-2 py-1.5 font-mono text-xs ${
    active ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#e0b8c8] bg-[#fff6d5] text-[#5e3620]'
  }`;

export default function EditPanel({
  capabilities,
  objects,
  selectedId,
  onSelect,
  onAddItem,
  onUpdateSelected,
  onDeleteSelected,
  onResetLayout,
  onClose,
  isHost,
  permissions,
  onSavePermissions,
}: {
  capabilities: string[];
  objects: RoomObjectApi[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddItem: (kind: string) => void;
  onUpdateSelected: (patch: RoomObjectPatch) => void;
  onDeleteSelected: () => void;
  onResetLayout: () => void;
  onClose: () => void;
  isHost: boolean;
  permissions: RoomPermissions | null;
  onSavePermissions: (p: RoomPermissions) => void;
}) {
  const [tab, setTab] = useState<Tab>('items');
  const [category, setCategory] = useState<CatalogCategory | undefined>(undefined);
  const [search, setSearch] = useState('');
  const entries = catalogEntriesFor(category, search);
  const selected = objects.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="absolute right-3 top-16 flex max-h-[75vh] w-80 flex-col overflow-hidden border-4 border-[#ff3d8b] bg-[#fff6d5] shadow-[4px_4px_0_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between border-b-2 border-[#e0b8c8] px-3 py-2">
        <h2 className="font-pixel text-[10px] text-[#ff3d8b]">Edit room</h2>
        <button type="button" onClick={onClose} aria-label="Close edit panel" className="font-mono text-sm text-[#5e3620]">
          ✕
        </button>
      </div>

      <div className="flex gap-1 border-b-2 border-[#e0b8c8] p-2">
        <button type="button" className={tabButtonClass(tab === 'items')} onClick={() => setTab('items')}>
          Items
        </button>
        <button type="button" className={tabButtonClass(tab === 'draw')} onClick={() => setTab('draw')}>
          Draw & Import
        </button>
        <button type="button" className={tabButtonClass(tab === 'layers')} onClick={() => setTab('layers')}>
          Layers
        </button>
        {isHost && (
          <button type="button" className={tabButtonClass(tab === 'permissions')} onClick={() => setTab('permissions')}>
            Permissions
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {tab === 'items' && (
          <div className="flex flex-col gap-3">
            {selected && (
              <SelectedItemToolbar
                item={selected}
                onUpdate={onUpdateSelected}
                onDelete={onDeleteSelected}
                onDeselect={() => onSelect(null)}
              />
            )}

            <div>
              <input
                type="search"
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border-2 border-[#e0b8c8] bg-white px-2 py-1 font-mono text-sm text-[#5e3620]"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setCategory(undefined)}
                  className={`border px-2 py-0.5 font-mono text-xs ${!category ? 'border-[#ff3d8b] text-[#ff3d8b]' : 'border-[#e0b8c8] text-[#5e3620]'}`}
                >
                  All
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className={`border px-2 py-0.5 font-mono text-xs ${category === c.key ? 'border-[#ff3d8b] text-[#ff3d8b]' : 'border-[#e0b8c8] text-[#5e3620]'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="flex flex-col gap-1">
              {entries.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={() => onAddItem(entry.key)}
                    className="w-full border-2 border-[#e0b8c8] bg-white px-2 py-1.5 text-left font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
                  >
                    + {entry.label}
                  </button>
                </li>
              ))}
              {entries.length === 0 && <li className="font-mono text-sm italic text-[#5e3620]/60">No items match.</li>}
            </ul>
          </div>
        )}

        {tab === 'draw' && (
          <p className="font-mono text-sm text-[#5e3620]">
            Importing your own PNGs and drawing pixel art arrive in a later pass — see
            docs/ROOM_EDITOR.md Phase 3.
          </p>
        )}

        {tab === 'layers' && (
          <LayersList objects={objects} selectedId={selectedId} onSelect={onSelect} onUpdate={onUpdateSelected} />
        )}

        {tab === 'permissions' && isHost && (
          // Keyed on load-state so the form's local draft re-initializes once the async fetch
          // resolves (permissions starts null, then loads) — simpler and more correct than an
          // effect that copies the prop into state on every change.
          <PermissionsForm key={permissions ? 'loaded' : 'loading'} permissions={permissions} onSave={onSavePermissions} onResetLayout={onResetLayout} />
        )}
      </div>

      {!capabilities.includes('objects:edit-mode') && (
        <p className="border-t-2 border-[#e0b8c8] p-2 font-mono text-xs text-[#5e3620]/70">
          You&apos;re viewing edit mode read-only — the host hasn&apos;t given this link decorating rights.
        </p>
      )}
    </div>
  );
}

function SelectedItemToolbar({
  item,
  onUpdate,
  onDelete,
  onDeselect,
}: {
  item: RoomObjectApi;
  onUpdate: (patch: RoomObjectPatch) => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  const step = 0.25;
  return (
    <div className="flex flex-col gap-2 border-2 border-[#ff3d8b] bg-white p-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase text-[#5e3620]/70">{item.kind}</span>
        <button type="button" onClick={onDeselect} className="font-mono text-xs text-[#5e3620]">
          deselect
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onUpdate({ scale: Math.max(LIMITS.minObjectScale, item.scale - step) })}
          className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs"
        >
          Scale −
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ scale: Math.min(LIMITS.maxObjectScale, item.scale + step) })}
          className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs"
        >
          Scale +
        </button>
        <button type="button" onClick={() => onUpdate({ flipX: !item.flipX })} className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs">
          Flip
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ rotation: ((item.rotation + 90) % 360) as 0 | 90 | 180 | 270 })}
          className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs"
        >
          Rotate 90°
        </button>
        <button type="button" onClick={() => onUpdate({ z: item.z + 10 })} className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs">
          Forward
        </button>
        <button type="button" onClick={() => onUpdate({ z: Math.max(0, item.z - 10) })} className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs">
          Backward
        </button>
        <button type="button" onClick={() => onUpdate({ locked: !item.locked })} className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs">
          {item.locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ hidden: !item.hidden })}
          className="border-2 border-[#5e3620] px-2 py-1 font-mono text-xs"
        >
          {item.hidden ? 'Unhide' : 'Hide'}
        </button>
        <button type="button" onClick={onDelete} className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-2 py-1 font-mono text-xs text-[#fff6d5]">
          Delete
        </button>
      </div>
    </div>
  );
}

function LayersList({
  objects,
  selectedId,
  onSelect,
  onUpdate,
}: {
  objects: RoomObjectApi[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (patch: RoomObjectPatch) => void;
}) {
  void onUpdate;
  return (
    <ul className="flex flex-col gap-1">
      {objects.map((o) => (
        <li key={o.id}>
          <button
            type="button"
            onClick={() => onSelect(o.id)}
            className={`w-full border-2 px-2 py-1 text-left font-mono text-xs ${
              selectedId === o.id ? 'border-[#ff3d8b] text-[#ff3d8b]' : 'border-[#e0b8c8] text-[#5e3620]'
            } ${o.hidden ? 'opacity-50' : ''}`}
          >
            {o.kind} {o.locked ? '🔒' : ''} {o.hidden ? '(hidden)' : ''}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PermissionsForm({
  permissions,
  onSave,
  onResetLayout,
}: {
  permissions: RoomPermissions | null;
  onSave: (p: RoomPermissions) => void;
  onResetLayout: () => void;
}) {
  const [draft, setDraft] = useState<RoomPermissions | null>(permissions);

  if (!draft) return <p className="font-mono text-sm text-[#5e3620]">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between font-mono text-sm text-[#5e3620]">
        Freeze layout (only host can edit)
        <input
          type="checkbox"
          checked={draft.freezeLayout}
          onChange={(e) => setDraft({ ...draft, freezeLayout: e.target.checked })}
        />
      </label>

      <fieldset className="border-2 border-[#e0b8c8] p-2">
        <legend className="font-mono text-xs uppercase text-[#5e3620]/70">Contributors</legend>
        <label className="flex flex-col gap-1 font-mono text-sm text-[#5e3620]">
          Can decorate
          <select
            value={draft.contributors.canDecorate}
            onChange={(e) =>
              setDraft({ ...draft, contributors: { ...draft.contributors, canDecorate: e.target.value as 'off' | 'own' | 'any' } })
            }
            className="border-2 border-[#e0b8c8] bg-white p-1"
          >
            <option value="off">Off</option>
            <option value="own">Own items only</option>
            <option value="any">Any item</option>
          </select>
        </label>
        <label className="mt-2 flex items-center justify-between font-mono text-sm text-[#5e3620]">
          Can import PNGs
          <input
            type="checkbox"
            checked={draft.contributors.canImport}
            onChange={(e) => setDraft({ ...draft, contributors: { ...draft.contributors, canImport: e.target.checked } })}
          />
        </label>
        <label className="flex items-center justify-between font-mono text-sm text-[#5e3620]">
          Can draw
          <input
            type="checkbox"
            checked={draft.contributors.canDraw}
            onChange={(e) => setDraft({ ...draft, contributors: { ...draft.contributors, canDraw: e.target.checked } })}
          />
        </label>
        <label className="flex items-center justify-between font-mono text-sm text-[#5e3620]">
          Can move own presents
          <input
            type="checkbox"
            checked={draft.contributors.canMoveOwnPresents}
            onChange={(e) =>
              setDraft({ ...draft, contributors: { ...draft.contributors, canMoveOwnPresents: e.target.checked } })
            }
          />
        </label>
        <label className="mt-2 flex flex-col gap-1 font-mono text-sm text-[#5e3620]">
          Max items per contributor
          <input
            type="number"
            min={0}
            value={draft.contributors.maxItemsPerContributor}
            onChange={(e) =>
              setDraft({
                ...draft,
                contributors: { ...draft.contributors, maxItemsPerContributor: Number(e.target.value) || 0 },
              })
            }
            className="border-2 border-[#e0b8c8] bg-white p-1"
          />
        </label>
      </fieldset>

      <fieldset className="border-2 border-[#e0b8c8] p-2">
        <legend className="font-mono text-xs uppercase text-[#5e3620]/70">Celebrant</legend>
        <label className="flex items-center justify-between font-mono text-sm text-[#5e3620]">
          Can rearrange (after unlock)
          <input
            type="checkbox"
            checked={draft.celebrant.canRearrange}
            onChange={(e) => setDraft({ ...draft, celebrant: { canRearrange: e.target.checked } })}
          />
        </label>
      </fieldset>

      <button
        type="button"
        onClick={() => onSave(draft)}
        className="border-2 border-[#ff3d8b] bg-[#ff3d8b] px-3 py-1.5 font-mono text-sm text-[#fff6d5]"
      >
        Save permissions
      </button>

      <button
        type="button"
        onClick={onResetLayout}
        className="border-2 border-[#5e3620] bg-[#fff6d5] px-3 py-1.5 font-mono text-sm text-[#5e3620]"
      >
        Reset to default layout
      </button>
      <p className="font-mono text-xs text-[#5e3620]/60">
        Contributors have no accounts — &quot;own items only&quot; is by browser, not identity.
        Clearing browser data loses a contributor&apos;s edit rights over their own items; the
        host can always edit or delete anything.
      </p>
    </div>
  );
}
