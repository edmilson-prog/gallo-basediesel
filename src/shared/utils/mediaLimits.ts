/**
 * Single source of truth for outbound media size caps.
 *
 * Every attachment — composer, scheduled send, asset library — lands in the
 * private `whatsapp-media` Storage bucket, uploaded straight from the browser
 * (no Edge Function in between). So the bucket's `file_size_limit` is the only
 * hard ceiling in the path: past it Storage answers 413 and nothing we do on
 * the client helps. Below it, the WhatsApp engines are all more permissive
 * (Evolution/Evolution-Go/OpenWA declare 64 MiB), so the bucket is what binds.
 *
 * Raising these caps above STORAGE_BUCKET_MAX_BYTES requires altering the
 * bucket in the same change — see mediaLimits.test.ts, which enforces that.
 */

/**
 * `storage.buckets.file_size_limit` for `whatsapp-media`, in bytes (25 MiB).
 * Declared in `supabase/migrations/20260610014819_storage_106_buckets_policies.sql`.
 */
export const STORAGE_BUCKET_MAX_BYTES = 26_214_400;

/** Media kinds that can be attached to an outbound message. */
export type MediaUploadKind = "image" | "video" | "audio" | "document";

/**
 * Per-kind upload caps.
 *
 * These used to mirror the Meta Cloud API limits (5 MiB image / 16 MiB video),
 * which silently rejected files every other engine would have accepted — a
 * 20 MB video simply never left the browser. Meta is one engine among five and
 * is not the one in production, so the cap now tracks the real ceiling
 * instead. The Meta engine still enforces its own 16 MiB limit server-side
 * (`meta/MetaCloudProvider.ts`), which is where an engine-specific rule belongs.
 */
export const MEDIA_MAX_SIZE_BYTES: Record<MediaUploadKind, number> = {
  image: STORAGE_BUCKET_MAX_BYTES,
  video: STORAGE_BUCKET_MAX_BYTES,
  audio: STORAGE_BUCKET_MAX_BYTES,
  document: STORAGE_BUCKET_MAX_BYTES,
};

/** Whole megabytes for the "file too large" message shown to the user. */
export function formatMaxSizeMb(maxBytes: number): number {
  return Math.round(maxBytes / 1024 / 1024);
}
