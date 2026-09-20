import { resolveVideoEmbed } from '@/goodies/embeds';
import GoodieCard from './GoodieCard';
import { EMBED_SANDBOX, SAFE_LINK_PROPS, type ViewerGoodie } from './types';

export default function VideoViewer({ goodie }: { goodie: ViewerGoodie }) {
  const url = typeof goodie.url === 'string' ? goodie.url : undefined;
  const assetUrl = goodie.assetUrls[0];

  return (
    <GoodieCard title="A Video" tone="dark">
      <div className="border-8 border-[#7a5230] bg-black p-2">
        {assetUrl ? (
          <video controls src={assetUrl} className="aspect-video w-full bg-black" />
        ) : url ? (
          (() => {
            const embed = resolveVideoEmbed(url);
            if (embed.kind === 'link') {
              return (
                <a href={embed.url} {...SAFE_LINK_PROPS} className="block p-4 text-center font-mono text-sm text-[#fff6d5] underline">
                  {embed.url}
                </a>
              );
            }
            return (
              <iframe
                src={embed.embedSrc}
                className="aspect-video w-full border-0"
                sandbox={EMBED_SANDBOX}
                allow="encrypted-media; autoplay; fullscreen"
                loading="lazy"
                title="Video player"
              />
            );
          })()
        ) : null}
      </div>
      <div className="mx-auto h-2 w-16 rounded-b bg-[#7a5230]" />
    </GoodieCard>
  );
}
