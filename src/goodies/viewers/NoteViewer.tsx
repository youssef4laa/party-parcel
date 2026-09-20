import GoodieCard from './GoodieCard';
import type { ViewerGoodie } from './types';

const PAPER_BG: Record<string, string> = { lined: '#f7f7ea', cream: '#fff6d5', pink: '#fde3ee' };
const FONT_FAMILY: Record<string, string> = {
  typewriter: 'var(--font-mono)',
  handwritten: 'cursive',
  pixel: 'var(--font-pixel)',
};

export default function NoteViewer({ goodie }: { goodie: ViewerGoodie }) {
  const paperStyle = (goodie.paperStyle as string) ?? 'cream';
  const font = (goodie.font as string) ?? 'typewriter';
  return (
    <GoodieCard title="A Note">
      <div
        className="whitespace-pre-wrap border border-[#5e3620]/20 p-4 text-base leading-relaxed"
        style={{
          backgroundColor: PAPER_BG[paperStyle] ?? PAPER_BG.cream,
          fontFamily: FONT_FAMILY[font] ?? FONT_FAMILY.typewriter,
          backgroundImage:
            paperStyle === 'lined' ? 'repeating-linear-gradient(#f7f7ea 0 27px, #cfd0b8 27px 28px)' : undefined,
        }}
      >
        {/* React escapes this text node automatically — never dangerouslySetInnerHTML */}
        {String(goodie.text ?? '')}
      </div>
    </GoodieCard>
  );
}
