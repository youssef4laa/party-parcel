import { createHash, randomBytes } from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider } from './types';

/**
 * S3-compatible provider — works with real AWS S3 or Cloudflare R2 (R2 is S3-API-compatible;
 * point `S3_ENDPOINT` at your R2 account endpoint and it just works). Selected via
 * `STORAGE_PROVIDER=s3`; see `.env.example` for the required vars.
 *
 * NOT exercised against a real bucket in this environment (no credentials available) — the SDK
 * calls are standard presigned-URL usage, but this file is implemented-and-reviewed, not
 * integration-tested.
 */
function client() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? 'auto';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not set');
  }
  return new S3Client({
    region,
    endpoint,
    // R2 (and most S3-compatible services) need path-style addressing.
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucket() {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error('S3_BUCKET is not set');
  return b;
}

const TMP_PREFIX = 'tmp-uploads/';
const PERM_PREFIX = 'uploads/';

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  // AWS SDK v3's GetObjectCommand response body is a web/node stream depending on runtime;
  // `transformToByteArray` (present on both) is the portable way to read it fully.
  const stream = body as { transformToByteArray: () => Promise<Uint8Array> };
  return Buffer.from(await stream.transformToByteArray());
}

export const s3Storage: StorageProvider = {
  async createUploadTarget({ contentType, maxBytes }) {
    void maxBytes; // S3 presigned PUT can't enforce a max size itself — finalize() enforces it after the fact.
    const key = randomBytes(16).toString('hex');
    const uploadUrl = await getSignedUrl(
      client(),
      new PutObjectCommand({ Bucket: bucket(), Key: TMP_PREFIX + key, ContentType: contentType }),
      { expiresIn: 300 },
    );
    return { uploadUrl, key };
  },

  async readUploadedObject(key) {
    try {
      const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: TMP_PREFIX + key }));
      return await bodyToBuffer(res.Body);
    } catch {
      return undefined;
    }
  },

  async discardUpload(key) {
    await client()
      .send(new DeleteObjectCommand({ Bucket: bucket(), Key: TMP_PREFIX + key }))
      .catch(() => {});
  },

  async put(buffer, contentType) {
    const storageKey = randomBytes(16).toString('hex');
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    await client().send(
      new PutObjectCommand({ Bucket: bucket(), Key: PERM_PREFIX + storageKey, Body: buffer, ContentType: contentType }),
    );
    return { storageKey, sha256 };
  },

  async get(storageKey) {
    try {
      const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: PERM_PREFIX + storageKey }));
      return await bodyToBuffer(res.Body);
    } catch {
      return null;
    }
  },

  async delete(storageKey) {
    await client()
      .send(new DeleteObjectCommand({ Bucket: bucket(), Key: PERM_PREFIX + storageKey }))
      .catch(() => {});
  },

  async signedGetUrl(storageKey, expiresInSeconds) {
    return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: PERM_PREFIX + storageKey }), {
      expiresIn: expiresInSeconds,
    });
  },
};
