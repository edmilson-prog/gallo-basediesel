-- Ad-source detection (Click-to-WhatsApp Ads): flags conversations that
-- began (or most recently resumed) via a WhatsApp ad/post referral. Set by
-- the webhook (Evolution v2, Evolution-Go, WAHA) whenever an inbound message
-- carries WhatsApp's contextInfo.externalAdReplyInfo — overwritten on every
-- later message that also carries one (latest-wins), left untouched by
-- messages that don't. NULL means "no known ad referral" (the vast majority
-- of conversations). No app-facing write path ever sets this column.
alter table public.conversations
  add column if not exists ad_referral jsonb;
