/**
 * The full registry of placeable room object kinds — metadata only (no canvas/Pixi here, so this
 * module is safe to import server-side for validation too). Actual procedural sprites live in
 * scene/objectSprites.ts (client-only). The catalog implements the items named in
 * docs/ROOM_EDITOR.md's section 1c.
 */
export type RoomZone = 'floor' | 'wall' | 'ceiling' | 'tabletop' | 'anywhere';
export const ROOM_ZONES: RoomZone[] = ['floor', 'wall', 'ceiling', 'tabletop', 'anywhere'];

export type CatalogCategory = 'scenery' | 'furniture' | 'plants' | 'lights' | 'decor' | 'special';

export type CatalogEntry = {
  key: string;
  label: string;
  category: CatalogCategory;
  defaultZone: RoomZone;
  /** True for the handful of kinds with bespoke interactive behavior (cake, cat, balloon, star,
   * frame, camera) wired in RoomCanvas — everything else is a plain placeable decoration. */
  special?: boolean;
  /** True if this kind has an editable configJson (custom text, color, etc.) beyond position. */
  configurable?: boolean;
  /** Shown in the catalog browser's search/filter UI. `special` (legacy scene) entries are
   * hidden from the "add new item" catalog — they already exist in every room's default layout. */
  hiddenFromCatalog?: boolean;
};

const catalog: CatalogEntry[] = [
  // --- Legacy scene elements — "every existing element" from docs/ROOM_EDITOR.md 1a, now
  // data-driven RoomObjects instead of hardcoded scene-builder code. Hidden from the "add new
  // item" catalog since a fresh room already has one of each (see defaultLayout.ts) — a host who
  // deletes one can still bring it back via "Reset to default layout".
  { key: 'window', label: 'Window', category: 'scenery', defaultZone: 'wall', hiddenFromCatalog: true },
  // The room's own "HAPPY BIRTHDAY!" banner: its text comes from the room, not from this object, so a
  // second copy would just repeat it. Extra banners with their OWN words are the `banner-text` kind below.
  { key: 'banner', label: 'Banner', category: 'scenery', defaultZone: 'ceiling', hiddenFromCatalog: true },
  { key: 'garland', label: 'Garland', category: 'scenery', defaultZone: 'ceiling', hiddenFromCatalog: true },
  { key: 'lantern', label: 'Paper lantern (ceiling)', category: 'scenery', defaultZone: 'ceiling', hiddenFromCatalog: true },
  { key: 'curtain-left', label: 'Curtain (left)', category: 'scenery', defaultZone: 'wall', hiddenFromCatalog: true },
  { key: 'curtain-right', label: 'Curtain (right)', category: 'scenery', defaultZone: 'wall', hiddenFromCatalog: true },
  { key: 'table', label: 'Table', category: 'furniture', defaultZone: 'floor', hiddenFromCatalog: true },
  { key: 'chair', label: 'Chair', category: 'furniture', defaultZone: 'floor' },
  { key: 'rug', label: 'Rug', category: 'furniture', defaultZone: 'floor' },
  { key: 'shelf', label: 'Shelf', category: 'furniture', defaultZone: 'wall', hiddenFromCatalog: true },
  { key: 'frame-mountain', label: 'Framed picture (mountain)', category: 'scenery', defaultZone: 'wall', hiddenFromCatalog: true, special: true },
  { key: 'frame-tulip', label: 'Framed picture (tulip)', category: 'scenery', defaultZone: 'wall', hiddenFromCatalog: true, special: true },
  { key: 'balloon', label: 'Balloon', category: 'decor', defaultZone: 'ceiling', configurable: true, special: true },
  { key: 'star', label: 'Hanging star', category: 'scenery', defaultZone: 'ceiling', special: true },
  { key: 'camera', label: 'Photobooth camera', category: 'special', defaultZone: 'wall', hiddenFromCatalog: true, special: true },
  { key: 'cat', label: 'Cat', category: 'special', defaultZone: 'floor', hiddenFromCatalog: true, special: true },
  { key: 'cake', label: 'Birthday cake', category: 'special', defaultZone: 'tabletop', configurable: true, special: true },
  { key: 'cupcake-stand', label: 'Cupcake stand', category: 'furniture', defaultZone: 'tabletop', hiddenFromCatalog: true },
  { key: 'vase', label: 'Flower vase', category: 'furniture', defaultZone: 'tabletop', hiddenFromCatalog: true },
  { key: 'snack-bowl', label: 'Snack bowl', category: 'furniture', defaultZone: 'tabletop', hiddenFromCatalog: true },
  { key: 'cups', label: 'Cups', category: 'furniture', defaultZone: 'tabletop', hiddenFromCatalog: true },

  // --- Custom items (Phase 3): one catalog kind for every imported PNG / drawing. WHICH image it
  // shows is the object's `assetId` (a CustomItem row), not its kind — so there's one entry here,
  // not one per item. Placed from the "My items" library, never the built-in catalog browser.
  { key: 'custom', label: 'Custom item', category: 'special', defaultZone: 'anywhere', hiddenFromCatalog: true },

  // --- Furniture (Phase 1c) ---
  { key: 'sofa', label: 'Sofa', category: 'furniture', defaultZone: 'floor' },
  { key: 'armchair', label: 'Armchair', category: 'furniture', defaultZone: 'floor' },
  { key: 'bookshelf', label: 'Bookshelf', category: 'furniture', defaultZone: 'wall' },
  { key: 'side-table', label: 'Side table', category: 'furniture', defaultZone: 'floor' },
  { key: 'bean-bag', label: 'Bean bag', category: 'furniture', defaultZone: 'floor' },
  { key: 'dresser', label: 'Dresser', category: 'furniture', defaultZone: 'floor' },
  { key: 'bench', label: 'Bench', category: 'furniture', defaultZone: 'floor' },
  { key: 'cushions', label: 'Cushions', category: 'furniture', defaultZone: 'anywhere' },
  { key: 'rug-round', label: 'Rug (round, small)', category: 'furniture', defaultZone: 'floor' },
  { key: 'rug-stripes', label: 'Rug (striped, medium)', category: 'furniture', defaultZone: 'floor' },
  { key: 'rug-checker', label: 'Rug (checkered, large)', category: 'furniture', defaultZone: 'floor' },
  { key: 'rug-runner', label: 'Rug (runner, long)', category: 'furniture', defaultZone: 'floor' },

  // --- Plants and trees (Phase 1c) ---
  { key: 'potted-plant', label: 'Potted plant', category: 'plants', defaultZone: 'anywhere' },
  { key: 'tall-tree', label: 'Tall indoor tree', category: 'plants', defaultZone: 'floor' },
  { key: 'pine-tree', label: 'Pine tree', category: 'plants', defaultZone: 'floor' },
  { key: 'palm', label: 'Palm tree', category: 'plants', defaultZone: 'floor' },
  { key: 'flower-pots', label: 'Flower pots', category: 'plants', defaultZone: 'anywhere' },
  { key: 'hanging-plant', label: 'Hanging plant', category: 'plants', defaultZone: 'ceiling' },

  // --- Lights (Phase 1c) ---
  { key: 'string-lights', label: 'String lights', category: 'lights', defaultZone: 'ceiling' },
  { key: 'paper-lantern-decor', label: 'Paper lantern', category: 'lights', defaultZone: 'ceiling' },
  { key: 'floor-lamp', label: 'Floor lamp', category: 'lights', defaultZone: 'floor' },
  { key: 'table-lamp', label: 'Table lamp', category: 'lights', defaultZone: 'tabletop' },
  { key: 'disco-ball', label: 'Disco ball', category: 'lights', defaultZone: 'ceiling' },
  { key: 'neon-sign', label: 'Neon sign', category: 'lights', defaultZone: 'wall', configurable: true },
  { key: 'candles', label: 'Candles', category: 'lights', defaultZone: 'tabletop' },
  { key: 'spotlight', label: 'Spotlight', category: 'lights', defaultZone: 'ceiling' },

  // --- Party decor (Phase 1c) ---
  { key: 'streamers', label: 'Streamers', category: 'decor', defaultZone: 'ceiling' },
  { key: 'balloon-cluster', label: 'Balloon cluster', category: 'decor', defaultZone: 'anywhere' },
  { key: 'pinata', label: 'Piñata', category: 'decor', defaultZone: 'ceiling' },
  { key: 'party-hat', label: 'Party hat', category: 'decor', defaultZone: 'anywhere' },
  { key: 'banner-text', label: 'Banner (your words)', category: 'decor', defaultZone: 'ceiling', configurable: true },
  { key: 'confetti', label: 'Confetti', category: 'decor', defaultZone: 'anywhere' },
  { key: 'poster', label: 'Poster (star)', category: 'decor', defaultZone: 'wall' },
  { key: 'poster-cake', label: 'Poster (cake)', category: 'decor', defaultZone: 'wall' },
  { key: 'photo-string', label: 'Photo string', category: 'decor', defaultZone: 'wall' },
];

export const OBJECT_CATALOG: Record<string, CatalogEntry> = Object.fromEntries(catalog.map((e) => [e.key, e]));

export function isKnownKind(kind: string): boolean {
  return kind in OBJECT_CATALOG;
}

export function catalogEntriesFor(category?: CatalogCategory, search?: string): CatalogEntry[] {
  const q = search?.trim().toLowerCase();
  return catalog.filter((e) => {
    if (e.hiddenFromCatalog) return false;
    if (category && e.category !== category) return false;
    if (q && !e.label.toLowerCase().includes(q) && !e.key.includes(q)) return false;
    return true;
  });
}
