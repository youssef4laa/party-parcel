'use client';

import { useState } from 'react';
import { catalogEntriesFor, type CatalogCategory } from '@/room/objectCatalog';
import type { CustomItemApi, PresentPatch, RoomObjectApi, RoomObjectPatch, RoomPermissions } from '@/room/api';
import type { PlacedBox } from '@/contribute/types';
import { LIMITS } from '@/config/limits';
import CakeEditor from './CakeEditor';
import DecorEditor, { hasDecorEditor } from './DecorEditor';
import DrawImportTab from './DrawImportTab';
import MyItems from './MyItems';

type Tab = 'items' | 'draw' | 'layers' | 'presents' | 'permissions';

const CATEGORIES: { key: CatalogCategory; label: string }[] = [
  { key: 'furniture', label: 'Furniture' },
  { key: 'plants', label: 'Plants & trees' },
  { key: 'lights', label: 'Lights' },
  { key: 'decor', label: 'Party decor' },
];

const toolButtonClass = (active: boolean) =>
  `border-2 px-1.5 py-0.5 font-mono text-[11px] disabled:opacity-40 ${
    active ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]' : 'border-[#5e3620] bg-[#fff6d5] text-[#5e3620]'
  }`;

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
  age,
  customItems,
  onCreateCustomItem,
  onReplaceCustomItem,
  onDeleteCustomItem,
  onPlaceCustomItem,
  presents,
  selectedPresentId,
  onSelectPresent,
  onUpdatePresent,
  canMovePresent,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  snapOn,
  onToggleSnap,
  freeScale,
  onToggleFreeScale,
  placeAnywhere,
  onTogglePlaceAnywhere,
  onStepScale,
  onDuplicate,
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
  /** The celebrant's age, if known — only used to offer a "match age" shortcut in the Cake
   * section's candle-count field. */
  age?: number;
  /** The room's "My items" library. */
  customItems: CustomItemApi[];
  onCreateCustomItem: (png: Blob, opts: { source: 'import' | 'drawing'; name: string }) => Promise<CustomItemApi>;
  onReplaceCustomItem: (itemId: string, png: Blob, opts: { source: 'import' | 'drawing'; name: string }) => Promise<CustomItemApi>;
  onDeleteCustomItem: (itemId: string) => Promise<void>;
  onPlaceCustomItem: (item: CustomItemApi) => void;
  /** Placed presents and their move/resize controls. */
  presents: PlacedBox[];
  selectedPresentId: string | null;
  onSelectPresent: (id: string | null) => void;
  onUpdatePresent: (patch: PresentPatch) => void;
  /** Display hint for whether THIS browser may move a given present (the server re-checks). */
  canMovePresent: (box: PlacedBox) => boolean;
  /** Undo/redo of every edit made in this session. */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  snapOn: boolean;
  onToggleSnap: () => void;
  /** Off by default: scale moves in whole-number steps so pixels stay crisp. */
  freeScale: boolean;
  onToggleFreeScale: () => void;
  /** Host only (`onTogglePlaceAnywhere` is undefined for everyone else): lifts the zone limit. */
  placeAnywhere: boolean;
  onTogglePlaceAnywhere?: () => void;
  onStepScale: (dir: 1 | -1) => void;
  onDuplicate: () => void;
}) {
  // Someone who may only move presents (no room-object rights) gets just the Presents tab — the
  // catalog, library and layers would be buttons that the server refuses.
  const canEditObjects = capabilities.includes('objects:edit-mode');
  const [tab, setTab] = useState<Tab>(capabilities.includes('objects:edit-mode') ? 'items' : 'presents');
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

      <div className="flex flex-wrap items-center gap-1 border-b-2 border-[#e0b8c8] px-2 py-1.5" role="toolbar" aria-label="Edit tools">
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" className={toolButtonClass(false)}>
          ↶ Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" className={toolButtonClass(false)}>
          ↷ Redo
        </button>
        {canEditObjects && (
          <>
            <button type="button" onClick={onToggleSnap} aria-pressed={snapOn} title="Snap moves to a 16px grid" className={toolButtonClass(snapOn)}>
              Snap to grid
            </button>
            <button
              type="button"
              onClick={onToggleFreeScale}
              aria-pressed={freeScale}
              title="Off: whole-number sizes so pixels stay crisp. On: any size."
              className={toolButtonClass(freeScale)}
            >
              Free scale
            </button>
            {onTogglePlaceAnywhere && (
              <button
                type="button"
                onClick={onTogglePlaceAnywhere}
                aria-pressed={placeAnywhere}
                title="Host only: ignore each item's zone (floor / wall / ceiling / tabletop)"
                className={toolButtonClass(placeAnywhere)}
              >
                Place anywhere
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex gap-1 border-b-2 border-[#e0b8c8] p-2">
        {canEditObjects && (
          <>
            <button type="button" className={tabButtonClass(tab === 'items')} onClick={() => setTab('items')}>
              Items
            </button>
            <button type="button" className={tabButtonClass(tab === 'draw')} onClick={() => setTab('draw')}>
              Draw & Import
            </button>
            <button type="button" className={tabButtonClass(tab === 'layers')} onClick={() => setTab('layers')}>
              Layers
            </button>
          </>
        )}
        <button type="button" className={tabButtonClass(tab === 'presents')} onClick={() => setTab('presents')}>
          Presents
        </button>
        {isHost && (
          <button type="button" className={tabButtonClass(tab === 'permissions')} onClick={() => setTab('permissions')}>
            Permissions
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {tab === 'items' && canEditObjects && (
          <div className="flex flex-col gap-3">
            {selected && (
              <SelectedItemToolbar
                item={selected}
                onStepScale={onStepScale}
                onDuplicate={onDuplicate}
                label={selected.kind === 'custom' ? customItems.find((i) => i.id === selected.assetId)?.name || 'Custom item' : selected.kind}
                onUpdate={onUpdateSelected}
                onDelete={onDeleteSelected}
                onDeselect={() => onSelect(null)}
              />
            )}
            {selected && hasDecorEditor(selected.kind) && <DecorEditor key={selected.id} item={selected} onUpdate={onUpdateSelected} />}
            {selected?.kind === 'cake' && <CakeEditor key={selected.id} item={selected} onUpdate={onUpdateSelected} age={age} />}

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

            {customItems.length > 0 && <MyItems items={customItems} objects={objects} onPlace={onPlaceCustomItem} />}
          </div>
        )}

        {tab === 'draw' && canEditObjects && (
          <DrawImportTab
            capabilities={capabilities}
            items={customItems}
            objects={objects}
            onCreate={onCreateCustomItem}
            onReplace={onReplaceCustomItem}
            onDelete={onDeleteCustomItem}
            onPlace={onPlaceCustomItem}
          />
        )}

        {tab === 'presents' && (
          <PresentsTab
            presents={presents}
            selectedId={selectedPresentId}
            onSelect={onSelectPresent}
            onUpdate={onUpdatePresent}
            canMove={canMovePresent}
          />
        )}

        {tab === 'layers' && canEditObjects && (
          <LayersList objects={objects} selectedId={selectedId} onSelect={onSelect} onUpdate={onUpdateSelected} customItems={customItems} />
        )}

        {tab === 'permissions' && isHost && (
          // Keyed on load-state so the form's local draft re-initializes once the async fetch
          // resolves (permissions starts null, then loads) — simpler and more correct than an
          // effect that copies the prop into state on every change.
          <PermissionsForm key={permissions ? 'loaded' : 'loading'} permissions={permissions} onSave={onSavePermissions} onResetLayout={onResetLayout} />
        )}
      </div>

      {!capabilities.includes('objects:edit-mode') && !capabilities.some((c) => c.startsWith('presents:move')) && (
        <p className="border-t-2 border-[#e0b8c8] p-2 font-mono text-xs text-[#5e3620]/70">
          You&apos;re viewing edit mode read-only — the host hasn&apos;t given this link decorating rights.
        </p>
      )}
    </div>
  );
}

function PresentsTab({
  presents,
  selectedId,
  onSelect,
  onUpdate,
  canMove,
}: {
  presents: PlacedBox[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (patch: PresentPatch) => void;
  canMove: (box: PlacedBox) => boolean;
}) {
  const step = 0.25;
  const selected = presents.find((p) => p.id === selectedId) ?? null;
  const movable = selected ? canMove(selected) : false;
  const scale = selected?.scale ?? 1;
  const z = selected?.z ?? 0;
  const btn = 'border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620] disabled:opacity-40';

  return (
    <div className="flex flex-col gap-3" data-testid="presents-tab">
      <p className="font-mono text-xs text-[#5e3620]/70">
        Drag a present in the room to move it, or pick one here. Only its position, size, and stacking
        can change — what&apos;s inside stays sealed.
      </p>

      {selected && (
        <div className="flex flex-col gap-2 border-2 border-[#ff3d8b] bg-white p-2" data-testid="present-toolbar">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase text-[#5e3620]/70">Present from {selected.fromName}</span>
            <button type="button" onClick={() => onSelect(null)} className="font-mono text-xs text-[#5e3620]">
              deselect
            </button>
          </div>
          <p className="font-mono text-xs text-[#5e3620]" data-testid="present-readout">
            size {selected.design.size ?? 'M'} · scale {scale}× · layer {z}
          </p>
          {!movable && <p className="font-mono text-xs text-[#d1266a]">This present isn&apos;t yours to move.</p>}
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn} disabled={!movable || scale <= LIMITS.minPresentScale} onClick={() => onUpdate({ scale: scale - step })}>
              Scale −
            </button>
            <button type="button" className={btn} disabled={!movable || scale >= LIMITS.maxPresentScale} onClick={() => onUpdate({ scale: scale + step })}>
              Scale +
            </button>
            <button type="button" className={btn} disabled={!movable} onClick={() => onUpdate({ z: z + 1 })}>
              Forward
            </button>
            <button type="button" className={btn} disabled={!movable || z <= 0} onClick={() => onUpdate({ z: Math.max(0, z - 1) })}>
              Backward
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {presents.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className={`w-full border-2 px-2 py-1 text-left font-mono text-xs ${
                selectedId === p.id ? 'border-[#ff3d8b] text-[#ff3d8b]' : 'border-[#e0b8c8] text-[#5e3620]'
              }`}
            >
              🎁 From {p.fromName}
              {!canMove(p) && <span className="opacity-60"> (locked)</span>}
            </button>
          </li>
        ))}
        {presents.length === 0 && <li className="font-mono text-sm italic text-[#5e3620]/60">No presents yet.</li>}
      </ul>
    </div>
  );
}

function SelectedItemToolbar({
  item,
  label,
  onUpdate,
  onDelete,
  onDeselect,
  onStepScale,
  onDuplicate,
}: {
  item: RoomObjectApi;
  onStepScale: (dir: 1 | -1) => void;
  onDuplicate: () => void;
  /** What to call the item: its catalog kind, or for a custom item the library name. */
  label: string;
  onUpdate: (patch: RoomObjectPatch) => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-2 border-[#ff3d8b] bg-white p-2" data-testid="object-toolbar">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase text-[#5e3620]/70">{label}</span>
        <button type="button" onClick={onDeselect} className="font-mono text-xs text-[#5e3620]">
          deselect
        </button>
      </div>
      <p className="font-mono text-xs text-[#5e3620]" data-testid="object-readout">
        scale {item.scale}× · x {Math.round(item.x)}, y {Math.round(item.y)} · {item.zone}
      </p>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onStepScale(-1)}
          disabled={item.scale <= LIMITS.minObjectScale}
          className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620] disabled:opacity-40"
        >
          Scale −
        </button>
        <button
          type="button"
          onClick={() => onStepScale(1)}
          disabled={item.scale >= LIMITS.maxObjectScale}
          className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620] disabled:opacity-40"
        >
          Scale +
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          title="Copy this item (Ctrl/Cmd+D)"
          className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620]"
        >
          Duplicate
        </button>
        <button type="button" onClick={() => onUpdate({ flipX: !item.flipX })} className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620]">
          Flip
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ rotation: ((item.rotation + 90) % 360) as 0 | 90 | 180 | 270 })}
          className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620]"
        >
          Rotate 90°
        </button>
        <button type="button" onClick={() => onUpdate({ z: item.z + 10 })} className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620]">
          Forward
        </button>
        <button type="button" onClick={() => onUpdate({ z: Math.max(0, item.z - 10) })} className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620]">
          Backward
        </button>
        <button type="button" onClick={() => onUpdate({ locked: !item.locked })} className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620]">
          {item.locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ hidden: !item.hidden })}
          className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-xs text-[#5e3620]"
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
  customItems,
}: {
  objects: RoomObjectApi[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (patch: RoomObjectPatch) => void;
  customItems: CustomItemApi[];
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
            {o.kind === 'custom' ? customItems.find((i) => i.id === o.assetId)?.name || 'custom item' : o.kind} {o.locked ? '🔒' : ''} {o.hidden ? '(hidden)' : ''}
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
