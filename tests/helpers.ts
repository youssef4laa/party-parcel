import { createHmac } from 'crypto';
import type { APIRequestContext } from '@playwright/test';
import 'dotenv/config';

export async function seedRoom(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
) {
  const res = await request.post('/api/dev/seed-room', { data: overrides });
  if (!res.ok()) throw new Error(`seed-room failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return body as { roomId: string; eventAt: string; links: { admin: string; contribute: string; celebrate: string } };
}

export function tokenFromLink(link: string) {
  return link.replace(/^\/r\//, '');
}

/** Replicates the HMAC scheme in src/server/storage/local.ts so tests can craft signed URLs
 * (e.g. a deliberately-expired one) without needing an export from server-only code. */
export function signAssetUrl(key: string, exp: number) {
  const secret = process.env.ASSET_SIGNING_SECRET;
  if (!secret) throw new Error('ASSET_SIGNING_SECRET not set in test environment');
  const sig = createHmac('sha256', secret).update(`${key}.${exp}`).digest('base64url');
  return `/api/assets/${key}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export function parseAssetUrl(url: string) {
  const m = url.match(/\/api\/assets\/([^?]+)\?exp=(\d+)&sig=/);
  if (!m) throw new Error(`Could not parse asset URL: ${url}`);
  return { key: m[1], exp: Number(m[2]) };
}

/** A tiny valid 4x4 JPEG (generated with sharp), base64-inlined so tests don't depend on fixture files. */
export const TINY_JPEG_BASE64 =
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCeALU9/9k=';

/** Runs the real two-phase presigned upload flow (init -> PUT -> finalize) against a contribute token. */
export async function uploadPhoto(request: APIRequestContext, contributeToken: string) {
  const buffer = Buffer.from(TINY_JPEG_BASE64, 'base64');
  const init = await request.post(`/api/rooms/${contributeToken}/uploads`, {
    data: { kind: 'photo', contentType: 'image/jpeg' },
  });
  if (!init.ok()) throw new Error(`upload init failed: ${init.status()} ${await init.text()}`);
  const { uploadUrl, key } = await init.json();

  const put = await request.put(uploadUrl, { data: buffer, headers: { 'Content-Type': 'image/jpeg' } });
  if (!put.ok()) throw new Error(`upload PUT failed: ${put.status()} ${await put.text()}`);

  const final = await request.post(`/api/rooms/${contributeToken}/uploads/${key}/finalize`, {
    data: { kind: 'photo' },
  });
  if (!final.ok()) throw new Error(`upload finalize failed: ${final.status()} ${await final.text()}`);
  return final.json() as Promise<{ assetKey: string; mime: string; size: number; sha256: string }>;
}

export async function createBoxWithPhoto(request: APIRequestContext, contributeToken: string, fromName: string) {
  const { assetKey } = await uploadPhoto(request, contributeToken);
  const res = await request.post(`/api/rooms/${contributeToken}/boxes`, {
    data: {
      fromName,
      design: {
        shape: 'cube',
        pattern: 'solid',
        baseColor: '#f4a6c1',
        accentColor: '#ff3d8b',
        ribbon: 'vertical',
        ribbonColor: '#fff6d5',
        bow: 'classic',
        tag: 'none',
        tagText: '',
        sticker: 'none',
        topper: 'none',
      },
      x: 500,
      y: 600,
      goodies: [{ type: 'photo', assetKeys: [assetKey], sizeBytes: 500 }],
    },
  });
  if (!res.ok()) throw new Error(`create box failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<{ id: string; deleteToken: string }>;
}
