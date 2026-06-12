-- Media backfill marks rows the provider can no longer serve as 'expired' so a
-- re-run skips them (instead of re-attempting a poison row forever). Widen the
-- check to allow it alongside the existing ok/failed.
alter table public.messages
  drop constraint if exists messages_media_download_status_check;
alter table public.messages
  add constraint messages_media_download_status_check
  check (media_download_status = any (array['ok'::text, 'failed'::text, 'expired'::text]));
