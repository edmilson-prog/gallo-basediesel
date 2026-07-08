-- Incident 2026-07-07 (part 2): non-staff attachment upload returned 500 on
-- POST /rest/v1/media_assets (composer attach, useAttachmentUpload). Two
-- stacked defects in the media_assets policies — both predate the two-gates
-- access model (v0.110.0 Turnstile) and conversation collaborators (v0.135.0
-- Ripple):
--
--  (1) statement_timeout: the INSERT with_check's conversation branch was a
--      full-table IN-subselect over RLS'd conversations ("double RLS"):
--        conversation_id IN (SELECT id FROM conversations
--                            WHERE store_id = current_store_id()
--                              AND (assigned_seller_id = me OR assigned IS NULL))
--      The subselect runs UNDER conversations RLS, re-running
--      can_access_conversation once per store conversation. Measured under a
--      real seller_internal JWT: 2,665 SubPlan calls, 11,684 ms — while the
--      authenticated role's statement_timeout is 8 s -> 57014 -> PostgREST 500.
--      Sellers whose upload short-circuits on the carteira branch (payload
--      carries a customer_id in their own carteira) never build the heavy
--      hashed subplan, which is why only some attendants failed: the reporting
--      seller has an empty carteira and only pool/instance conversations, so
--      EVERY upload of his hit the slow branch.
--
--  (2) stale semantics: the SELECT policy's conversation branch only allowed
--      assigned_seller_id = me. A seller answering a pool conversation (or as
--      a collaborator/participant) could not read back the row they had just
--      inserted, so the upload's `.insert().select()` RETURNING — and the
--      follow-up signed-URL fetch by id — would fail even without the timeout.
--      Measured for the reporting seller on prod data: 0 of the 24 media
--      conversations he can access passed the old SELECT predicate.
--
-- Fix (same proven gated-once pattern as 20260702180000_count_conversations
-- and 20260707140000_sdr_search_rls_gated_once): the conversation branch of
-- all four policies becomes ONE direct call to
-- can_access_conversation(conversation_id) — evaluated once per media row,
-- never per conversations-table row. Semantics: conversation-scoped media now
-- follows conversation attendance access (two gates + participants), matching
-- the storage-bytes policy that already gates the actual file contents
-- (can_read_conversation_media, 20260620160000_media_signing_gated_once).
-- Algebraically a superset of
-- every old predicate — each old conversation branch was
-- "<subset condition> AND visible-under-conversations-RLS", and
-- conversations_select IS can_access_conversation — so no persona loses
-- access. The carteira branch is unchanged (bounded index probe over the
-- caller's own customers, 0.17 ms measured). Staff short-circuits on
-- is_staff() as before; service_role (webhook/edge) bypasses RLS entirely.

drop policy if exists media_assets_select on public.media_assets;
create policy media_assets_select on public.media_assets
  for select to authenticated
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (
        customer_id is not null
        and customer_id in (
          select c.id from public.customers c
          where c.seller_id = (select public.current_seller_id())
        )
      )
      or (
        conversation_id is not null
        and public.can_access_conversation(conversation_id)
      )
    )
  );

drop policy if exists media_assets_insert on public.media_assets;
create policy media_assets_insert on public.media_assets
  for insert to authenticated
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (
        customer_id is not null
        and customer_id in (
          select c.id from public.customers c
          where c.seller_id = (select public.current_seller_id())
        )
      )
      or (
        conversation_id is not null
        and public.can_access_conversation(conversation_id)
      )
    )
  );

drop policy if exists media_assets_update on public.media_assets;
create policy media_assets_update on public.media_assets
  for update to authenticated
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (
        customer_id is not null
        and customer_id in (
          select c.id from public.customers c
          where c.seller_id = (select public.current_seller_id())
        )
      )
      or (
        conversation_id is not null
        and public.can_access_conversation(conversation_id)
      )
    )
  )
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (
        customer_id is not null
        and customer_id in (
          select c.id from public.customers c
          where c.seller_id = (select public.current_seller_id())
        )
      )
      or (
        conversation_id is not null
        and public.can_access_conversation(conversation_id)
      )
    )
  );

drop policy if exists media_assets_delete on public.media_assets;
create policy media_assets_delete on public.media_assets
  for delete to authenticated
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (
        customer_id is not null
        and customer_id in (
          select c.id from public.customers c
          where c.seller_id = (select public.current_seller_id())
        )
      )
      or (
        conversation_id is not null
        and public.can_access_conversation(conversation_id)
      )
    )
  );
