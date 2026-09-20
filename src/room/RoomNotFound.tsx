export default function RoomNotFound() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0d0d1f] p-6 text-center">
      <p className="font-pixel text-sm text-[#ff3d8b]">Party Parcel</p>
      <p className="max-w-sm font-mono text-lg text-[#fff6d5]">
        This link doesn&apos;t exist (or was typed wrong).
      </p>
    </div>
  );
}
