-- Persist the contact's WhatsApp profile name (pushName) in its own column,
-- separate from the editable display name. The webhook writes it on every
-- inbound message (even after a manual rename), so the platform can always
-- show "Nome no WhatsApp: X" and offer to restore it.
alter table public.customers
  add column if not exists whatsapp_name text;

comment on column public.customers.whatsapp_name is
  'Contact''s most recent WhatsApp profile name (pushName), persisted by the webhook on every inbound message — independent of the editable display name (full_name / nome_fantasia). Lets the platform show and restore the WhatsApp name after a manual rename.';
