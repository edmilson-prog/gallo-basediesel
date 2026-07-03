-- Paired-count parity check for count_conversations (migration 20260702180000).
-- Run via MCP (postgres role) AFTER the migration is applied, once per persona.
-- For each persona: simulate the JWT claims, then compare the RLS-visible
-- count (per-row can_access_conversation — slow but authoritative) with the
-- RPC's set-predicate count. `match` must be true for every filter shape.
--
-- Replace the claims below per persona (owner / seller_internal e.g. tiago).
--
-- ⚠️ RUN AS A SINGLE TRANSACTION. The `begin`/`rollback` below are load-bearing:
-- `set local role` and `set_config(..., is_local => true)` are TRANSACTION-scoped.
-- If the statements run one-by-one under autocommit (a runner that splits them,
-- or copy-paste line by line), those SETs are discarded before the SELECT — the
-- rls_count subquery would then run as the RLS-bypassing postgres role while the
-- RPC sees NULL claims (current_store_id() NULL → 0), giving a meaningless
-- parity result. Send the whole file as one statement / transaction. It is
-- read-only, so it ends in `rollback`.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '5e38abb6-abcd-4e4d-838a-867078e99892',
  'role', 'authenticated',
  'app_metadata', json_build_object(
    'seller_id', '97834e8d-e1b5-4bb7-9f25-2e58e641fdab',
    'store_id', '00000000-0000-0000-0000-000000000001',
    'role', 'seller_internal'
  )
)::text, true);
set local statement_timeout = '120s';

with shapes as (
  select * from (values
    -- (label, status[], seller_ids uuid[], unassigned, queue)
    ('todas-exceto-arquivadas',
      array['aguardando','em_andamento','aguardando_cliente','resolvida'],
      null::uuid[], false, false),
    ('incidente: me+unassigned+queue',
      array['aguardando','em_andamento','aguardando_cliente','resolvida'],
      array['97834e8d-e1b5-4bb7-9f25-2e58e641fdab']::uuid[], true, true),
    ('so-fila', array['aguardando'], null::uuid[], false, true)
  ) as t(label, p_status, p_seller_ids, p_unassigned, p_queue)
)
select
  s.label,
  (select count(*) from public.conversations c
    where c.status = any(s.p_status)
      and (
        (s.p_seller_ids is null and not s.p_unassigned and not s.p_queue)
        or (s.p_seller_ids is not null and c.assigned_seller_id = any(s.p_seller_ids))
        or (s.p_unassigned and c.assigned_seller_id is null)
        or (s.p_queue and c.assigned_seller_id is null
            and c.is_sdr_active = false and c.status = 'aguardando')
      )
  ) as rls_count,
  public.count_conversations(
    p_status => s.p_status,
    p_assigned_seller_ids => s.p_seller_ids,
    p_unassigned => s.p_unassigned,
    p_include_queue => s.p_queue
  ) as rpc_count,
  (select count(*) from public.conversations c
    where c.status = any(s.p_status)
      and (
        (s.p_seller_ids is null and not s.p_unassigned and not s.p_queue)
        or (s.p_seller_ids is not null and c.assigned_seller_id = any(s.p_seller_ids))
        or (s.p_unassigned and c.assigned_seller_id is null)
        or (s.p_queue and c.assigned_seller_id is null
            and c.is_sdr_active = false and c.status = 'aguardando')
      )
  ) = public.count_conversations(
    p_status => s.p_status,
    p_assigned_seller_ids => s.p_seller_ids,
    p_unassigned => s.p_unassigned,
    p_include_queue => s.p_queue
  ) as match
from shapes s;

rollback;
