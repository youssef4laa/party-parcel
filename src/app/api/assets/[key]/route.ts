import { NextRequest, NextResponse } from 'next/server';
import { getStorageProvider } from '@/server/storage';
import { verifyAssetSignature } from '@/server/storage/local';
import { sniffMime } from '@/server/mimeSniff';
import { jsonError } from '@/server/http';

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const exp = Number(req.nextUrl.searchParams.get('exp'));
  const sig = req.nextUrl.searchParams.get('sig') ?? '';
  if (!exp || !sig || !verifyAssetSignature(key, exp, sig)) {
    return jsonError(403, 'This link has expired.');
  }

  const buffer = await getStorageProvider().get(key);
  if (!buffer) return jsonError(404, 'Not found.');

  const mime = sniffMime(buffer) ?? 'application/octet-stream';
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
