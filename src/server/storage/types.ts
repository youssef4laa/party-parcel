/**
 * Object storage behind an interface (mirrors the `PaymentProvider` pattern from section 9),
 * so the dev-friendly local disk implementation can be swapped for a real S3-compatible one in
 * production without touching call sites. See `local.ts` and DECISIONS.md.
 */
export interface StorageProvider {
  /** Store already-validated bytes under a fresh random key and return that key. */
  put(buffer: Buffer, contentType: string): Promise<{ storageKey: string; sha256: string }>;
  /** Read an object back for server-side processing (never sent straight to a client). */
  get(storageKey: string): Promise<Buffer | null>;
  delete(storageKey: string): Promise<void>;
  /** A short-lived URL a client can fetch the object from, enforcing the birthday lock upstream. */
  signedGetUrl(storageKey: string, expiresInSeconds: number): Promise<string>;
}
