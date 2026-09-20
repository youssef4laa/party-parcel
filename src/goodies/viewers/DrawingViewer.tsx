import GoodieCard from './GoodieCard';
import type { ViewerGoodie } from './types';

export default function DrawingViewer({ goodie }: { goodie: ViewerGoodie }) {
  const url = goodie.assetUrls[0];
  return (
    <GoodieCard title="A Drawing">
      <div className="mx-auto border-8 border-[#8a5a35] bg-white p-1 shadow-[3px_3px_0_rgba(0,0,0,0.3)]">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
          <img src={url} alt="A hand-drawn picture" className="h-56 w-56 object-contain" style={{ imageRendering: 'pixelated' }} />
        )}
      </div>
    </GoodieCard>
  );
}
