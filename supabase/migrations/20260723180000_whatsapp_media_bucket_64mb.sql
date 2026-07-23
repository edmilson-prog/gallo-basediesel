-- Raise the whatsapp-media bucket file_size_limit 25 MiB -> 64 MiB.
--
-- The composer's attachment cap is pinned to this value
-- (src/shared/utils/mediaLimits.ts). A 25 MiB ceiling rejected videos the
-- store routinely sends: a WAHA video is dispatched via /api/sendFile (as a
-- document, whose WhatsApp limit is ~100 MB), and WAHA itself accepts up to
-- ~128 MiB over gRPC. 64 MiB matches the WhatsApp engines' own declared
-- maxMediaSizeBytes and leaves comfortable headroom below those ceilings while
-- staying infra-safe for the WAHA container.
--
-- Non-destructive and backward-compatible: only widens what Storage accepts,
-- so it can be applied before the frontend cap ships.

update storage.buckets
set file_size_limit = 67108864 -- 64 * 1024 * 1024
where id = 'whatsapp-media';
