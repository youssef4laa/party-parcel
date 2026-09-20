'use client';

import { useCallback, useMemo, useState } from 'react';
import BoxPreview from './BoxPreview';
import { renderBox } from './renderBox';
import { nearestSwatch } from './colorUtils';
import {
  BOX_PRESETS,
  DEFAULT_DESIGN,
  SWATCHES,
  type BoxDesign,
  type BowStyle,
  type BoxPattern,
  type BoxShape,
  type RibbonStyle,
  type StickerShape,
  type TagShape,
  type TopperShape,
} from './types';

const SHAPES: { value: BoxShape; label: string }[] = [
  { value: 'cube', label: 'Cube' },
  { value: 'tall', label: 'Tall' },
  { value: 'flat', label: 'Flat' },
];

const PATTERNS: { value: BoxPattern; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'gingham', label: 'Gingham' },
  { value: 'polka', label: 'Polka Dots' },
  { value: 'stars', label: 'Stars' },
  { value: 'hearts', label: 'Hearts' },
  { value: 'stripes', label: 'Stripes' },
  { value: 'checker', label: 'Checker' },
  { value: 'plaid', label: 'Plaid' },
  { value: 'sparkle', label: 'Sparkle' },
];

const RIBBONS: { value: RibbonStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'cross', label: 'Cross' },
];

const BOWS: { value: BowStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'classic', label: 'Classic' },
  { value: 'big', label: 'Big' },
  { value: 'double', label: 'Double' },
  { value: 'ruffle', label: 'Ruffle' },
  { value: 'knot', label: 'Knot' },
];

const TAGS: { value: TagShape; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'heart', label: 'Heart' },
  { value: 'star', label: 'Star' },
  { value: 'round', label: 'Round' },
];

const STICKERS: { value: StickerShape; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'heart', label: 'Heart' },
  { value: 'star', label: 'Star' },
  { value: 'sparkle', label: 'Sparkle' },
  { value: 'paw', label: 'Paw' },
];

const TOPPERS: { value: TopperShape; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'flower', label: 'Flower' },
  { value: 'leaf', label: 'Leaf' },
  { value: 'candle', label: 'Candle' },
];

function randomOf<T>(arr: { value: T }[]): T {
  return arr[Math.floor(Math.random() * arr.length)].value;
}

function randomSwatch() {
  return SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
}

function designsEqual(a: BoxDesign, b: BoxDesign) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function matchingPresetName(design: BoxDesign) {
  return BOX_PRESETS.find((p) => designsEqual(p.design, design))?.name ?? 'Custom design';
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-4 font-pixel text-[10px] text-[#ff3d8b] first:mt-0">{children}</h3>;
}

function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`border-2 px-2 py-1 font-mono text-sm transition-colors ${
            value === opt.value
              ? 'border-[#ff3d8b] bg-[#ff3d8b] text-[#fff6d5]'
              : 'border-[#e0b8c8] bg-[#fff6d5] text-[#5e3620] hover:border-[#ff3d8b]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Color ${hex}`}
          aria-pressed={value.toLowerCase() === hex.toLowerCase()}
          onClick={() => onChange(hex)}
          className={`h-7 w-7 border-2 ${
            value.toLowerCase() === hex.toLowerCase() ? 'border-[#ff3d8b]' : 'border-[#5e3620]/30'
          }`}
          style={{ backgroundColor: hex }}
        />
      ))}
      <label className="relative h-7 w-7 cursor-pointer border-2 border-dashed border-[#5e3620]/50 text-center text-xs leading-6">
        +
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(nearestSwatch(e.target.value, SWATCHES))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Custom color (snaps to nearest swatch)"
        />
      </label>
    </div>
  );
}

export type BoxDesignerProps = {
  initialDesign?: BoxDesign;
  onChange?: (design: BoxDesign) => void;
  onSave?: (design: BoxDesign) => void;
  saveLabel?: string;
};

export default function BoxDesigner({
  initialDesign = DEFAULT_DESIGN,
  onChange,
  onSave,
  saveLabel = 'Wrap it up',
}: BoxDesignerProps) {
  const [history, setHistory] = useState<BoxDesign[]>([initialDesign]);
  const [index, setIndex] = useState(0);
  const design = history[index];

  const commit = useCallback(
    (next: BoxDesign) => {
      setHistory((h) => [...h.slice(0, index + 1), next]);
      setIndex((i) => i + 1);
      onChange?.(next);
    },
    [index, onChange],
  );

  const update = useCallback(
    <K extends keyof BoxDesign>(key: K, value: BoxDesign[K]) => {
      commit({ ...design, [key]: value });
    },
    [design, commit],
  );

  const undo = () => setIndex((i) => Math.max(0, i - 1));
  const redo = () => setIndex((i) => Math.min(history.length - 1, i + 1));
  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  const reset = () => commit(DEFAULT_DESIGN);
  const randomize = () =>
    commit({
      shape: randomOf(SHAPES),
      pattern: randomOf(PATTERNS),
      baseColor: randomSwatch(),
      accentColor: randomSwatch(),
      ribbon: randomOf(RIBBONS),
      ribbonColor: randomSwatch(),
      bow: randomOf(BOWS),
      tag: randomOf(TAGS),
      tagText: design.tagText,
      sticker: randomOf(STICKERS),
      topper: randomOf(TOPPERS),
    });

  const applyPreset = (presetDesign: BoxDesign) => commit({ ...presetDesign, tagText: design.tagText });

  const exportPng = () => {
    const canvas = renderBox(design);
    const link = document.createElement('a');
    link.download = 'party-parcel-box.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const presetName = useMemo(() => matchingPresetName(design), [design]);

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="flex-1 md:max-w-sm">
        <SectionLabel>Shape</SectionLabel>
        <ChoiceRow options={SHAPES} value={design.shape} onChange={(v) => update('shape', v)} />

        <SectionLabel>Pattern</SectionLabel>
        <ChoiceRow options={PATTERNS} value={design.pattern} onChange={(v) => update('pattern', v)} />

        <SectionLabel>Base color</SectionLabel>
        <ColorPicker value={design.baseColor} onChange={(v) => update('baseColor', v)} />

        <SectionLabel>Accent / pattern color</SectionLabel>
        <ColorPicker value={design.accentColor} onChange={(v) => update('accentColor', v)} />

        <SectionLabel>Ribbon</SectionLabel>
        <ChoiceRow options={RIBBONS} value={design.ribbon} onChange={(v) => update('ribbon', v)} />

        <SectionLabel>Ribbon color</SectionLabel>
        <ColorPicker value={design.ribbonColor} onChange={(v) => update('ribbonColor', v)} />

        <SectionLabel>Bow</SectionLabel>
        <ChoiceRow options={BOWS} value={design.bow} onChange={(v) => update('bow', v)} />

        <SectionLabel>Tag</SectionLabel>
        <ChoiceRow options={TAGS} value={design.tag} onChange={(v) => update('tag', v)} />
        {design.tag !== 'none' && (
          <input
            type="text"
            maxLength={12}
            value={design.tagText}
            onChange={(e) => update('tagText', e.target.value.slice(0, 12))}
            placeholder="Tag text (12 chars)"
            className="mt-2 w-full border-2 border-[#e0b8c8] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] focus:border-[#ff3d8b] focus:outline-none"
          />
        )}

        <SectionLabel>Sticker / seal</SectionLabel>
        <ChoiceRow options={STICKERS} value={design.sticker} onChange={(v) => update('sticker', v)} />

        <SectionLabel>Topper</SectionLabel>
        <ChoiceRow options={TOPPERS} value={design.topper} onChange={(v) => update('topper', v)} />

        <SectionLabel>Presets</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {BOX_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p.design)}
              className="border-2 border-[#e0b8c8] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-3">
        <div className="border-4 border-[#ff3d8b] bg-[#fff6d5] p-3">
          <BoxPreview design={design} size={288} />
        </div>
        <p className="font-pixel text-[10px] text-[#5e3620]">{presetName}</p>

        <div className="flex flex-wrap justify-center gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] disabled:opacity-30"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] disabled:opacity-30"
          >
            ↷ Redo
          </button>
          <button
            type="button"
            onClick={randomize}
            className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
          >
            🎲 Randomize
          </button>
          <button
            type="button"
            onClick={reset}
            className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={exportPng}
            className="border-2 border-[#5e3620] bg-[#fff6d5] px-2 py-1 font-mono text-sm text-[#5e3620] hover:border-[#ff3d8b]"
          >
            Export PNG
          </button>
        </div>

        {onSave && (
          <button
            type="button"
            onClick={() => onSave(design)}
            className="mt-2 w-full max-w-xs border-4 border-[#ff3d8b] bg-[#ff3d8b] px-4 py-2 font-pixel text-xs text-[#fff6d5] shadow-[3px_3px_0_rgba(0,0,0,0.25)] hover:bg-[#d1266a]"
          >
            {saveLabel}
          </button>
        )}
      </div>
    </div>
  );
}
