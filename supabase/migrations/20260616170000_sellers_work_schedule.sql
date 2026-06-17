-- PRD-212: per-user work schedule + overrides + emergency grant.
--
-- All three columns are jsonb and nullable. `work_schedule` holds an array of
-- { weekday, openAt, closeAt, enabled }; `schedule_overrides` an array of
-- { date, type, reason?, openAt?, closeAt? }; `access_grant` a single
-- { grantedBy, grantedAt, expiresAt, reason? } or null. Absent work_schedule
-- means NO access restriction. Idempotent DDL so a re-run is a no-op.

alter table public.sellers
  add column if not exists work_schedule jsonb;

alter table public.sellers
  add column if not exists schedule_overrides jsonb;

alter table public.sellers
  add column if not exists access_grant jsonb;
