import { resolveSongEmbed } from '@/goodies/embeds';
import GoodieCard from './GoodieCard';
import { EMBED_SANDBOX, SAFE_LINK_PROPS, type ViewerGoodie } from './types';

export default function SongViewer({ goodie }: { goodie: ViewerGoodie }) {
  const url = typeof goodie.url === 'string' ? goodie.url : undefined;
  const assetUrl = goodie.assetUrls[0];

  return (
    <GoodieCard title="A Song" tone="dark">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#fff6d5] bg-[#3a2a44]">
        <div className="h-3 w-3 rounded-full bg-[#fff6d5]" />
      </div>
      {assetUrl ? (
        <audio controls src={assetUrl} className="w-full" />
      ) : url ? (
        (() => {
          const embed = resolveSongEmbed(url);
          if (embed.kind === 'link') {
            return (
              <a href={embed.url} {...SAFE_LINK_PROPS} className="text-center font-mono text-sm underline">
                {embed.url}
              </a>
            );
          }
          return (
            <iframe
              src={embed.embedSrc}
              className="h-[152px] w-full border-0"
              sandbox={EMBED_SANDBOX}
              allow="encrypted-media; autoplay"
              loading="lazy"
              title="Song player"
            />
          );
        })()
      ) : null}
      {typeof goodie.dedication === 'string' && goodie.dedication && (
        <p className="text-center font-mono text-sm italic">&ldquo;{goodie.dedication}&rdquo;</p>
      )}
    </GoodieCard>
  );
}
