import { describe, expect, it } from "vitest";
import { MEDIA_MAX_SIZE_BYTES, STORAGE_BUCKET_MAX_BYTES, formatMaxSizeMb } from "./mediaLimits";

describe("media upload limits", () => {
  it("pins the bucket ceiling to the whatsapp-media file_size_limit", () => {
    // Set by supabase/migrations/20260723180313_whatsapp_media_bucket_64mb.sql
    // and applied live in production: 67108864 bytes (64 MiB).
    expect(STORAGE_BUCKET_MAX_BYTES).toBe(67_108_864);
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

  it("accepts a 50 MB video — well past the old 16/25 MiB caps", () => {
    const fiftyMb = 50 * 1024 * 1024;
    expect(fiftyMb).toBeLessThanOrEqual(MEDIA_MAX_SIZE_BYTES.video);
  });

  it("keeps every kind at the storage ceiling so no format is arbitrarily poorer", () => {
    expect(MEDIA_MAX_SIZE_BYTES.video).toBe(STORAGE_BUCKET_MAX_BYTES);
    expect(MEDIA_MAX_SIZE_BYTES.image).toBe(STORAGE_BUCKET_MAX_BYTES);
    expect(MEDIA_MAX_SIZE_BYTES.audio).toBe(STORAGE_BUCKET_MAX_BYTES);
    expect(MEDIA_MAX_SIZE_BYTES.document).toBe(STORAGE_BUCKET_MAX_BYTES);
  });

  it("renders the cap as whole megabytes for the user-facing message", () => {
    expect(formatMaxSizeMb(67_108_864)).toBe(64);
    expect(formatMaxSizeMb(5 * 1024 * 1024)).toBe(5);
  });
});
