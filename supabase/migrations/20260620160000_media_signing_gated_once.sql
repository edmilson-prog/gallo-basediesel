-- Fix A — make inbound WhatsApp media signing O(1) per object.
--
-- The previous storage_whatsapp_media_select_inbound policy authorized a read
-- with `(foldername(name))[2] IN (SELECT c.id FROM conversations WHERE
-- store_id = current_store_id())`. That subquery is subject to the RLS of
-- `conversations` (conversations_select = can_access_conversation per row), so
-- EVERY createSignedUrl scanned all ~800 conversations evaluating can_access
-- per row. Measured: ~2375 ms for a non-staff seller vs ~113 ms for an owner
-- (is_staff short-circuit), per signed URL — and the app signs one URL PER
-- media item. The object path already carries the conversation id
-- (`conversations/<convId>/<msgId>/media.<ext>`), so a single can_access check
-- is enough.
--
-- This helper extracts the conversation id and checks access ONCE. The cast is
-- guarded so a malformed path returns false instead of raising inside policy
-- evaluation (same safety intent as the old text-vs-text comparison).
create or replace function public.can_read_conversation_media(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  conv_id uuid;
begin
  if (storage.foldername(object_name))[1] is distinct from 'conversations' then
    return false;
  end if;
  begin
    conv_id := (storage.foldername(object_name))[2]::uuid;
  exception when others then
    return false;
  end;
  return public.can_access_conversation(conv_id);
end;
$$;

-- Same authorized set as before ("read media iff you can access its
-- conversation"), evaluated O(1) instead of O(conversations). No widening.
drop policy if exists "storage_whatsapp_media_select_inbound" on storage.objects;
create policy "storage_whatsapp_media_select_inbound"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and (storage.foldername(name))[1] = 'conversations'
  and public.can_read_conversation_media(name)
);
