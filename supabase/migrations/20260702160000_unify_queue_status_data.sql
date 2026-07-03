-- One-time data reconciliation (spec 2026-07-02-unify-queue-assignment):
-- align production rows with the status<->assignment invariant BEFORE the
-- unified "Em fila" filter ships. Idempotent — safe to re-run after the new
-- webhook/import deploys. Archived conversations are never touched.
-- ⚠️ Apply MANUALLY via MCP with the owner's OK, LAST in the rollout order.

-- Unowned open conversations (no SDR) are, by definition, queued.
-- (~1,144 rows at 2026-07-02: unassigned em_andamento; none in aguardando_cliente.)
update public.conversations
   set status = 'aguardando', updated_at = now()
 where assigned_seller_id is null
   and is_sdr_active = false
   and status in ('em_andamento', 'aguardando_cliente');

-- Owned conversations are being attended — never 'aguardando'.
-- (~41 rows at 2026-07-02.)
update public.conversations
   set status = 'em_andamento', updated_at = now()
 where assigned_seller_id is not null
   and status = 'aguardando';
