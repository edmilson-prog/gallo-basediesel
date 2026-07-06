-- Backfill: null out assigned_seller_id on conversations already in the
-- terminal axis (resolvida/arquivada) that still carry a stale assignee.
--
-- Root cause: these rows were closed via the pre-PR #227 code path (a plain
-- status update, with no unassign) before the close_conversation RPC
-- migration (20260703171000) landed in production on 2026-07-04 00:29 UTC.
-- Investigation confirmed all affected rows are dated 2026-07-03 17:50-20:38
-- UTC, hours before the fix; no conversation closed since then has drifted
-- (verified again on 2026-07-06 — count unchanged at 17, all pre-fix).
--
-- The conversation_activity_capture trigger (20260703170000) fires
-- automatically on this UPDATE and records an 'assignment' event per row
-- (actor_kind='system', since this runs outside any seller's JWT session) —
-- preserving who was assigned before the null, no manual insert needed.
update public.conversations
   set assigned_seller_id = null
 where status in ('resolvida', 'arquivada')
   and assigned_seller_id is not null;
