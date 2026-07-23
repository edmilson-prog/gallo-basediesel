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
 * `storage.buckets.file_size_limit` for `whatsapp-media`, in bytes (64 MiB).
 * Set by `supabase/migrations/20260723180000_whatsapp_media_bucket_64mb.sql`
 * (was 25 MiB in `…_storage_106_buckets_policies.sql`). Matches the WhatsApp
 * engines' own 64 MiB ceiling: a WAHA video goes out via `/api/sendFile` (as a
 * document, whose WhatsApp limit is ~100 MB), so 64 MiB is a comfortable,
 * infra-safe cap well under WAHA's own ~128 MiB gRPC ceiling.
 */
export const STORAGE_BUCKET_MAX_BYTES = 67_108_864;

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
