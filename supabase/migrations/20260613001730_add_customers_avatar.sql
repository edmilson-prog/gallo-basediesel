-- Contact profile photo (WhatsApp avatar) for the conversations inbox.
-- avatar_url: public URL in the 'avatars' Storage bucket, or NULL when the
--   contact has no photo / a private one.
-- avatar_synced_at: idempotency marker for the whatsapp-avatar-sync job —
--   NULL means "never attempted", so a re-run only processes pending contacts.
alter table public.customers
  add column if not exists avatar_url text,
  add column if not exists avatar_synced_at timestamptz;

comment on column public.customers.avatar_url is
  'Public URL of the contact''s WhatsApp profile photo (avatars bucket); NULL = none/private.';
comment on column public.customers.avatar_synced_at is
  'Last whatsapp-avatar-sync attempt for this contact; NULL = never attempted (idempotency).';
