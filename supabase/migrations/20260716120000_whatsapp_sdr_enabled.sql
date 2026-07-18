-- SDR — per-instance opt-in (Parte C).
--
-- Mirrors whatsapp_accounts.alerts_muted (20260630160000): a plain boolean
-- flag per account, default false. The real pilot (sdr-backstop-tick,
-- sdr-respond) already gates on sdr_settings.sdr_enabled (store-wide); this
-- adds a second, narrower gate so the dono can opt in specific WhatsApp
-- numbers instead of every number connected to a store.
--
-- Conservative default confirmed with the dono: false everywhere, including
-- for stores that already have the store-wide pilot switched on — no
-- instance receives the SDR until explicitly opted in here.

alter table public.whatsapp_accounts
  add column if not exists sdr_enabled boolean not null default false;
