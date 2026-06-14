-- Attendant display name (assinatura do atendente nos atendimentos).
-- When set, this short name is prepended to outbound WhatsApp messages so the
-- customer knows who is talking (e.g. "*Edmilson:* ..."). NULL = no signature.
alter table public.sellers add column if not exists attendant_name text;
