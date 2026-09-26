/**
 * Object storage behind an interface (mirrors the `PaymentProvider` pattern from section 9),
 * so the dev-friendly local disk implementation can be swapped for a real S3/R2 one in
 * production without touching call sites. See `local.ts` and `s3.ts`.
 *
 * Uploads are a two-phase presigned dance, the same shape for every provider:
 *   1. `createUploadTarget` — server issues a short-lived, size/type-bounded PUT URL for a
 *      fresh random key. The browser PUTs the raw bytes straight there (for S3/R2, straight to
 *      the bucket; for local, to our own signed-PUT route) — our app server never proxies the
 *      bytes on the way in.
 *   2. `finalizeUpload` — AFTER the PUT completes, the server reads the object back and hands
 *      the caller the raw bytes to sniff/validate/re-encode/hash. Nothing is trusted (or kept)
 *      until this step passes.
 */
export interface StorageProvider {
  /** Issue a presigned PUT target for a fresh random key, bounded to `maxBytes` and `contentType`. */
  createUploadTarget(opts: { contentType: string; maxBytes: number }): Promise<{ uploadUrl: string; key: string }>;
  /** Read back what was just PUT to `key` (for sniffing/validation) — undefined if nothing's there. */
  readUploadedObject(key: string): Promise<Buffer | undefined>;
  /** Discard a temporary upload (e.g. it failed validation). Idempotent. */
  discardUpload(key: string): Promise<void>;
  /** Store final, already-validated bytes under a fresh permanent key. */
  put(buffer: Buffer, contentType: string): Promise<{ storageKey: string; sha256: string }>;
  /** Read a permanent object back for server-side processing (never sent straight to a client). */
  get(storageKey: string): Promise<Buffer | null>;
  delete(storageKey: string): Promise<void>;
  /** A short-lived URL a client can fetch the object from, enforcing the birthday lock upstream. */
  signedGetUrl(storageKey: string, expiresInSeconds: number): Promise<string>;
}
