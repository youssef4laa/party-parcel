import type { GoodieItem } from '@/contribute/types';
import type { GoodiePayload } from '@/goodies/schema';

/** `TPayload` is one variant of `GoodiePayload` (e.g. `NotePayload`); `initial` carries the
 * client bookkeeping fields (`id`/`sizeBytes`) an existing item already has. */
export type GoodieEditorProps<TPayload extends GoodiePayload = GoodiePayload> = {
  initial?: TPayload & { id: string; sizeBytes: number };
  roomToken?: string;
  onSave: (item: GoodieItem) => void;
  onCancel: () => void;
};
