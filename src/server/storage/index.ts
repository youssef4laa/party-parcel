import { localStorage } from './local';
import type { StorageProvider } from './types';

/**
 * Only `local` (disk-backed) ships today — see DECISIONS.md. Swap in a real S3-compatible
 * provider here (behind the same `StorageProvider` interface) once credentials exist; nothing
 * else in the app needs to change.
 */
export function getStorageProvider(): StorageProvider {
  return localStorage;
}

export type { StorageProvider } from './types';
