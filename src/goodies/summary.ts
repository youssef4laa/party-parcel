import type { GoodieItem } from '@/contribute/types';

/** A short receipt-line description for the packing list — never raw HTML, just plain text. */
export function summarizeGoodie(g: GoodieItem): string {
  switch (g.type) {
    case 'note':
      return g.text.slice(0, 50);
    case 'photo':
      return `${g.assetKeys.length} photo${g.assetKeys.length === 1 ? '' : 's'}${g.caption ? ` — ${g.caption}` : ''}`;
    case 'song':
      return g.dedication || g.url || 'uploaded song';
    case 'video':
      return g.url || 'uploaded video';
    case 'gift':
      return g.message.slice(0, 50);
    case 'voice':
      return `${g.durationSeconds || '?'}s voice message`;
    case 'drawing':
      return 'a drawing';
    case 'location':
      return g.placeName;
    case 'coupon':
      return g.title;
    case 'news':
      return g.url;
    default:
      return '';
  }
}
