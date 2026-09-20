import GoodieCard from './GoodieCard';
import { SAFE_LINK_PROPS, type ViewerGoodie } from './types';

export default function NewsViewer({ goodie }: { goodie: ViewerGoodie }) {
  const preview = (goodie.preview as { title?: string; image?: string; source?: string } | undefined) ?? {};
  const url = typeof goodie.url === 'string' ? goodie.url : '#';

  return (
    <GoodieCard title="News Clipping">
      <a href={url} {...SAFE_LINK_PROPS} className="flex flex-col gap-2 font-mono text-[#5e3620]">
        {preview.image && (
          // eslint-disable-next-line @next/next/no-img-element -- external preview image from an arbitrary site, not a local/optimizable asset
          <img src={preview.image} alt="" className="h-32 w-full border border-[#5e3620]/30 object-cover grayscale" />
        )}
        <p className="font-pixel text-xs leading-relaxed">{preview.title ?? url}</p>
        {preview.source && <p className="text-xs uppercase tracking-widest text-[#5e3620]/60">{preview.source}</p>}
      </a>
    </GoodieCard>
  );
}
