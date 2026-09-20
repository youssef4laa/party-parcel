import { localStorage } from './local';
import { s3Storage } from './s3';
import type { StorageProvider } from './types';

/**
 * `STORAGE_PROVIDER=local` (default, dev) or `s3` (real S3/R2, needs the S3_* env vars — see
 * .env.example). Both implement the same interface, so nothing else in the app branches on this.
 */
export function getStorageProvider(): StorageProvider {
  return process.env.STORAGE_PROVIDER === 's3' ? s3Storage : localStorage;
}

export type { StorageProvider } from './types';
