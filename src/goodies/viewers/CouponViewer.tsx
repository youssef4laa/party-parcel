'use client';

import { useState } from 'react';
import { redeemCoupon } from '@/room/api';
import GoodieCard from './GoodieCard';
import type { ViewerGoodie } from './types';

export default function CouponViewer({
  goodie,
  boxId,
  celebrateToken,
  onRedeem,
}: {
  goodie: ViewerGoodie;
  boxId: string;
  celebrateToken: string;
  /** Overrides the default server-API redemption call — the static export (no server) passes a
   * localStorage-backed handler here instead; see src/export/StaticRoomApp.tsx. */
  onRedeem?: (goodieId: string) => Promise<{ redeemedAt: string }>;
}) {
  const [redeemedAt, setRedeemedAt] = useState<string | null>(goodie.redeemedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expiresAt = typeof goodie.expiresAt === 'string' ? goodie.expiresAt : undefined;
  // lazy useState initializer, not a direct Date.now() call during render — see NoteViewer's
  // sibling components for the same pattern used with Math.random() elsewhere in this codebase
  const [expired] = useState(() => (expiresAt ? new Date(expiresAt).getTime() < Date.now() : false));

  async function handleRedeem() {
    setBusy(true);
    setError(null);
    try {
      const res = onRedeem ? await onRedeem(goodie.id) : await redeemCoupon(boxId, goodie.id, celebrateToken);
      setRedeemedAt(res.redeemedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not redeem this coupon.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GoodieCard title="Coupon">
      <div className="relative border-2 border-dashed border-[#5e3620]/50 p-4 text-center">
        <p className="font-pixel text-xs">{String(goodie.title ?? '')}</p>
        {typeof goodie.finePrint === 'string' && goodie.finePrint && (
          <p className="mt-2 font-mono text-xs text-[#5e3620]/70">{goodie.finePrint}</p>
        )}
        {expiresAt && (
          <p className="mt-1 font-mono text-xs text-[#5e3620]/60">
            {expired ? 'Expired' : 'Expires'} {new Date(expiresAt).toLocaleDateString()}
          </p>
        )}

        {redeemedAt ? (
          <div className="mt-3 rotate-[-8deg] border-4 border-[#d1266a] px-3 py-1 font-pixel text-xs text-[#d1266a]">
            REDEEMED
            <div className="mt-1 font-mono text-[10px]">{new Date(redeemedAt).toLocaleString()}</div>
          </div>
        ) : expired ? (
          <p className="mt-3 font-mono text-sm text-[#5e3620]/60">This coupon has expired.</p>
        ) : (
          <button
            type="button"
            onClick={handleRedeem}
            disabled={busy}
            className="mt-3 border-2 border-[#ff3d8b] bg-[#ff3d8b] px-3 py-1 font-mono text-sm text-[#fff6d5] disabled:opacity-50"
          >
            {busy ? 'Redeeming...' : 'Redeem'}
          </button>
        )}
        {error && <p className="mt-2 font-mono text-xs text-[#d1266a]">{error}</p>}
      </div>
    </GoodieCard>
  );
}
