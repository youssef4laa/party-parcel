import type { GoodieType } from '@/contribute/types';
import type { GoodieEditorProps } from './types';
import NoteEditor from './NoteEditor';
import PhotoEditor from './PhotoEditor';
import SongEditor from './SongEditor';
import VideoEditor from './VideoEditor';
import GiftEditor from './GiftEditor';
import VoiceEditor from './VoiceEditor';
import DrawingEditor from './DrawingEditor';
import LocationEditor from './LocationEditor';
import CouponEditor from './CouponEditor';
import NewsEditor from './NewsEditor';

export type { GoodieEditorProps } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each editor narrows its own payload type; the host only needs to render *some* editor for a given type
export const GOODIE_EDITORS: Record<GoodieType, React.ComponentType<GoodieEditorProps<any>>> = {
  note: NoteEditor,
  photo: PhotoEditor,
  song: SongEditor,
  video: VideoEditor,
  gift: GiftEditor,
  voice: VoiceEditor,
  drawing: DrawingEditor,
  location: LocationEditor,
  coupon: CouponEditor,
  news: NewsEditor,
};
