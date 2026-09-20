import type { Metadata } from 'next';
import RoomTokenPage from '@/room/RoomTokenPage';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="h-full w-full flex-1">
      <RoomTokenPage token={token} />
    </div>
  );
}
