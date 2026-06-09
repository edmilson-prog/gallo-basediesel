-- =============================================================================
-- RLS regression tests — Fase 2 (Mock → Supabase cutover), roadmap #5
-- =============================================================================
--
-- Plain-SQL assertion harness (no pgTAP dependency, so it needs no extension in
-- the database). Each check raises an exception on failure; the whole run is
-- wrapped in a transaction and rolled back, so it never persists data. A clean
-- run ends with the row 'ALL RLS REGRESSION TESTS PASSED'.
--
-- Run locally / in CI against a database seeded with the standard fixtures:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql
--
-- It exercises the real policies by impersonating each principal via
-- `set local role` + a forged `request.jwt.claims` (the same mechanism the
-- Custom Access Token Hook feeds at runtime). Assertions are written as
-- seed-robust INVARIANTS (>0 / =0 / no-cross-leak) rather than exact counts,
-- so they survive changes in seed volume.
--
-- Seeded fixtures (matriz store):
--   owner  auth=9a418578-2671-4141-a15a-d39b2fd13af7  seller=57706ecc-01b5-4a96-b403-0359a4bb767f  role=owner
--   lucas  auth=154c3c64-15c0-41ec-824c-9fbfc3cc9ac4  seller=5a6400ed-5aec-4bf1-b641-31635f15c887  role=seller_internal
--   store  00000000-0000-0000-0000-000000000001
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Principal: OWNER (staff) — sees the whole store.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if not public.is_staff() then
    raise exception 'owner: is_staff() should be true';
  end if;
  if (select count(*) from public.customers) = 0 then
    raise exception 'owner: should see customers';
  end if;
  if (select count(*) from public.expenses) = 0 then
    raise exception 'owner: should see expenses (staff-only financials)';
  end if;
  if (select count(*) from public.audit_logs) = 0 then
    raise exception 'owner: should see audit_logs';
  end if;
  if (select count(*) from public.carteira_transfers) = 0 then
    raise exception 'owner: should see carteira_transfers';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Principal: LUCAS (seller_internal, non-staff) — own carteira + pool only.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  lucas uuid := '5a6400ed-5aec-4bf1-b641-31635f15c887';
begin
  if public.is_staff() then
    raise exception 'lucas: is_staff() must be false';
  end if;

  -- Per-seller carteira: sees own, never another seller's rows.
  if (select count(*) from public.customers) = 0 then
    raise exception 'lucas: should see his own customers';
  end if;
  if (select count(*) from public.customers where seller_id <> lucas) <> 0 then
    raise exception 'lucas: must not see other sellers'' customers (cross-leak)';
  end if;
  if (select count(*) from public.orders) = 0 then
    raise exception 'lucas: should see his own orders';
  end if;
  if (select count(*) from public.orders where seller_id <> lucas) <> 0 then
    raise exception 'lucas: must not see other sellers'' orders (cross-leak)';
  end if;

  -- Staff-only financials → 0 for a seller.
  if (select count(*) from public.expenses) <> 0 then
    raise exception 'lucas: must see 0 expenses (staff-only)';
  end if;
  if (select count(*) from public.cash_flow_entries) <> 0 then
    raise exception 'lucas: must see 0 cash_flow_entries (staff-only)';
  end if;
  if (select count(*) from public.distribution_traces) <> 0 then
    raise exception 'lucas: must see 0 distribution_traces (staff-only)';
  end if;

  -- Issue #43 — audit/transfers staff-only; media scoped to own.
  if (select count(*) from public.audit_logs) <> 0 then
    raise exception 'lucas: must see 0 audit_logs (#43 staff+financeiro only)';
  end if;
  if (select count(*) from public.carteira_transfers) <> 0 then
    raise exception 'lucas: must see 0 carteira_transfers (#43 staff only)';
  end if;
  if (select count(*) from public.media_assets m
        where not (
          (m.customer_id is not null
             and m.customer_id in (select id from public.customers where seller_id = lucas))
          or (m.conversation_id is not null
             and m.conversation_id in (select id from public.conversations where assigned_seller_id = lucas))
        )) <> 0 then
    raise exception 'lucas: must only see media tied to his own customers/conversations (#43)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Principal: ANON (public storefront, logged out).
-- ---------------------------------------------------------------------------
set local role anon;

do $$
begin
  if (select count(*) from public.parts) = 0 then
    raise exception 'anon: should see the public (active) catalog';
  end if;
  if (select count(*) from public.parts where active = false) <> 0 then
    raise exception 'anon: must not see inactive parts';
  end if;
  if (select count(*) from public.orders) <> 0 then
    raise exception 'anon: must see 0 orders';
  end if;
  if (select count(*) from public.stores) <> 0 then
    raise exception 'anon: must see 0 stores';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Fail-closed: an authenticated principal with no app_metadata (unknown sub)
-- resolves to a null identity and must see nothing.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.customers) <> 0 then
    raise exception 'fail-closed: principal without app_metadata must see 0 customers';
  end if;
  if (select count(*) from public.parts) <> 0 then
    raise exception 'fail-closed: principal without store must see 0 parts';
  end if;
end $$;

reset role;

select 'ALL RLS REGRESSION TESTS PASSED' as result;

rollback;
