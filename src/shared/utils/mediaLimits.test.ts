import { describe, expect, it } from "vitest";
import { MEDIA_MAX_SIZE_BYTES, STORAGE_BUCKET_MAX_BYTES, formatMaxSizeMb } from "./mediaLimits";

describe("media upload limits", () => {
  it("pins the bucket ceiling to the whatsapp-media file_size_limit", () => {
    // Declared in supabase/migrations/20260610014819_storage_106_buckets_policies.sql
    // and verified live in production: 26214400 bytes.
    expect(STORAGE_BUCKET_MAX_BYTES).toBe(26_214_400);
  });

  it("never lets a per-kind cap exceed what Storage would accept", () => {
    for (const [kind, cap] of Object.entries(MEDIA_MAX_SIZE_BYTES)) {
      expect(cap, `${kind} cap must fit in the bucket`).toBeLessThanOrEqual(
        STORAGE_BUCKET_MAX_BYTES,
      );
    }
  });

  it("accepts a 20 MB video — the size that used to be silently rejected", () => {
    const twentyMb = 20 * 1024 * 1024;
    expect(twentyMb).toBeLessThanOrEqual(MEDIA_MAX_SIZE_BYTES.video);
  });

  it("keeps every kind at the storage ceiling so no format is arbitrarily poorer", () => {
    expect(MEDIA_MAX_SIZE_BYTES.video).toBe(STORAGE_BUCKET_MAX_BYTES);
    expect(MEDIA_MAX_SIZE_BYTES.image).toBe(STORAGE_BUCKET_MAX_BYTES);
    expect(MEDIA_MAX_SIZE_BYTES.audio).toBe(STORAGE_BUCKET_MAX_BYTES);
    expect(MEDIA_MAX_SIZE_BYTES.document).toBe(STORAGE_BUCKET_MAX_BYTES);
  });

  it("renders the cap as whole megabytes for the user-facing message", () => {
    expect(formatMaxSizeMb(26_214_400)).toBe(25);
    expect(formatMaxSizeMb(5 * 1024 * 1024)).toBe(5);
  });
});
