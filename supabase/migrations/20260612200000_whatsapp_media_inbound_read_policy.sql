-- Inbound WhatsApp media is uploaded by the webhook (service_role) under the
-- path `conversations/<conversationId>/<messageId>/media.<ext>`, so its first
-- path segment is `conversations` rather than the store id. The existing
-- store-prefixed SELECT policy (storage_whatsapp_media_select) never matches
-- it, so the app (an `authenticated` user, NOT service_role) cannot sign or
-- download received media — hence inbound audio/image/document never play.
--
-- This adds a second SELECT policy authorizing reads of those inbound objects
-- when the owning conversation belongs to the caller's store. Scope stays the
-- caller's own store (via conversations.store_id = current_store_id); security
-- is unchanged — only received media becomes readable to people who already
-- see the conversation. Comparison is text-vs-text (no uuid cast) so a
-- malformed path can never raise inside policy evaluation.
create policy "storage_whatsapp_media_select_inbound"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'whatsapp-media'
  and (storage.foldername(name))[1] = 'conversations'
  and (storage.foldername(name))[2] in (
    select c.id::text
    from public.conversations c
    where c.store_id = public.current_store_id()
  )
);
