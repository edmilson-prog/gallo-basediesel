-- Allow a seller to TRANSFER (reassign) a conversation that is currently theirs
-- to another seller, from the floating quick-actions / kebab. The UPDATE policy's
-- USING already restricts a non-staff seller to rows assigned to them (or
-- unassigned); previously the WITH CHECK forced the *new* row to stay assigned to
-- the same seller, which blocked any hand-off. Relax WITH CHECK so the new row may
-- be assigned to any (non-null) seller in the store.
--
-- Additive: every previously allowed write is still allowed (assigned_seller_id =
-- current_seller_id() implies IS NOT NULL). A non-staff seller still cannot
-- unassign-to-pool (set null) or touch another seller's conversation (USING is
-- unchanged). Archiving one's own conversation already passed WITH CHECK and is
-- unaffected.

alter policy conversations_update on public.conversations
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or assigned_seller_id is not null
    )
  );
