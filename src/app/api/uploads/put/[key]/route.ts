import { NextRequest, NextResponse } from 'next/server';
import { verifyUploadSignature, writeTempUpload } from '@/server/storage/local';
import { jsonError } from '@/server/http';

/**
 * The "presigned PUT URL" for the local storage provider — mirrors what a real S3/R2 presigned
 * PUT would do (bounded, time-limited, one specific key), just self-hosted instead of at a
 * bucket. Only ever used when STORAGE_PROVIDER=local.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ct = req.nextUrl.searchParams.get('ct') ?? '';
  const max = Number(req.nextUrl.searchParams.get('max') ?? 0);
  const exp = Number(req.nextUrl.searchParams.get('exp') ?? 0);
  const sig = req.nextUrl.searchParams.get('sig') ?? '';

  if (!max || !exp || !sig || !verifyUploadSignature(key, ct, max, exp, sig)) {
    return jsonError(403, 'This upload link has expired.');
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.length > max) {
    return jsonError(413, 'File is larger than the allowed upload size.');
  }

  await writeTempUpload(key, buffer);
  return NextResponse.json({ ok: true });
}
