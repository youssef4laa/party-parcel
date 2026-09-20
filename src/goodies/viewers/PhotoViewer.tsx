import GoodieCard from './GoodieCard';
import type { ViewerGoodie } from './types';

export default function PhotoViewer({ goodie }: { goodie: ViewerGoodie }) {
  const alt = typeof goodie.alt === 'string' && goodie.alt ? goodie.alt : 'A shared photo';
  return (
    <GoodieCard title="Photo(s)">
      <div className="flex flex-wrap justify-center gap-3">
        {goodie.assetUrls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs; not a candidate for next/image optimization
          <img
            key={i}
            src={url}
            alt={goodie.assetUrls.length > 1 ? `${alt} (${i + 1}/${goodie.assetUrls.length})` : alt}
            className="h-40 w-36 rotate-[-2deg] border-4 border-white bg-white object-cover shadow-[3px_3px_0_rgba(0,0,0,0.3)] even:rotate-[2deg]"
          />
        ))}
      </div>
      {typeof goodie.caption === 'string' && goodie.caption && (
        <p className="text-center font-mono text-sm italic">{goodie.caption}</p>
      )}
    </GoodieCard>
  );
}
