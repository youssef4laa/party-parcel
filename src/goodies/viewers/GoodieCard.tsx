export default function GoodieCard({
  title,
  children,
  tone = 'cream',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'cream' | 'dark';
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-sm flex-col gap-2 border-4 p-4 shadow-[4px_4px_0_rgba(0,0,0,0.3)] ${
        tone === 'dark' ? 'border-[#ff3d8b] bg-[#241a2e] text-[#fff6d5]' : 'border-[#ff3d8b] bg-[#fff6d5] text-[#5e3620]'
      }`}
    >
      <h3 className="font-pixel text-[10px] text-[#ff3d8b]">{title}</h3>
      {children}
    </div>
  );
}
