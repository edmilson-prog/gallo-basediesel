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
-- Issue #48 — media_assets write scoping. A seller may INSERT media for their
-- own / pool conversations, never for another seller's; and may UPDATE/DELETE
-- only media it can see (own). Inserts here are rolled back with the suite.
-- ---------------------------------------------------------------------------
-- A foreign (other-seller) conversation/media id must be captured while
-- unimpersonated — a seller cannot SELECT them.
select set_config('t48.other_conv',
  (select id::text from public.conversations
     where assigned_seller_id is not null
       and assigned_seller_id <> '5a6400ed-5aec-4bf1-b641-31635f15c887' limit 1), true);
select set_config('t48.other_media',
  (select m.id::text from public.media_assets m
     join public.conversations c on c.id = m.conversation_id
     where c.assigned_seller_id is not null
       and c.assigned_seller_id <> '5a6400ed-5aec-4bf1-b641-31635f15c887' limit 1), true);

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  store uuid := '00000000-0000-0000-0000-000000000001';
  own_conv  uuid;
  pool_conv uuid;
  own_media uuid;
  other_conv  uuid := nullif(current_setting('t48.other_conv', true), '')::uuid;
  other_media uuid := nullif(current_setting('t48.other_media', true), '')::uuid;
  n int;
  blocked boolean;
begin
  select id into own_conv
    from public.conversations
    where assigned_seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887' limit 1;
  select id into pool_conv from public.conversations where assigned_seller_id is null limit 1;
  select m.id into own_media
    from public.media_assets m
    join public.conversations c on c.id = m.conversation_id
    where c.assigned_seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887' limit 1;

  if own_conv is null or own_media is null or other_conv is null or other_media is null then
    raise exception '#48: missing seed fixtures for the media write test';
  end if;

  -- INSERT into own conversation -> allowed.
  insert into public.media_assets
    (id, store_id, conversation_id, kind, mime_type, size_bytes, author_type, direction,
     created_at, storage_ref, persisted, sensitivity)
    values (gen_random_uuid(), store, own_conv, 'image', 'image/jpeg', 1, 'seller', 'out',
            now(), 'rls-own', true, 'normal');

  -- INSERT into a pool conversation -> allowed (archival/upload of triaged pool).
  insert into public.media_assets
    (id, store_id, conversation_id, kind, mime_type, size_bytes, author_type, direction,
     created_at, storage_ref, persisted, sensitivity)
    values (gen_random_uuid(), store, pool_conv, 'image', 'image/jpeg', 1, 'seller', 'out',
            now(), 'rls-pool', true, 'normal');

  -- INSERT into another seller's conversation -> blocked by with_check (no injection).
  blocked := false;
  begin
    insert into public.media_assets
      (id, store_id, conversation_id, kind, mime_type, size_bytes, author_type, direction,
       created_at, storage_ref, persisted, sensitivity)
      values (gen_random_uuid(), store, other_conv, 'image', 'image/jpeg', 1, 'seller', 'out',
              now(), 'rls-inject', true, 'normal');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#48: INSERT into another seller''s conversation must be blocked';
  end if;

  -- UPDATE own media -> 1 row; another seller's -> 0 rows (RLS filters it out).
  update public.media_assets set ocr_text = 'rls' where id = own_media;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '#48: UPDATE of own media affected % rows (want 1)', n; end if;

  update public.media_assets set ocr_text = 'rls' where id = other_media;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '#48: UPDATE of another seller media affected % rows (want 0)', n; end if;

  -- DELETE another seller's media -> 0 rows.
  delete from public.media_assets where id = other_media;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '#48: DELETE of another seller media affected % rows (want 0)', n; end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Issue #44 — the server-side derived reconciler is not callable by clients.
-- public.reconcile_derived_notifications() is SECURITY DEFINER with EXECUTE
-- revoked; only the pg_cron scheduler (postgres) runs it. A signed-in seller
-- must be denied (guards against a future migration re-granting EXECUTE).
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare denied boolean := false;
begin
  begin
    perform public.reconcile_derived_notifications();
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception '#44: reconcile_derived_notifications() must not be callable by authenticated';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- PRD-108 — BI materialized views are not directly readable; the *_read()
-- RPCs re-apply store/seller scoping (staff = whole store, seller = own rows,
-- executive KPIs = staff-only).
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
  n int; blocked boolean := false;
begin
  if (select count(*) from public.mv_sales_by_seller_month_read() where seller_id <> lucas) <> 0 then
    raise exception '#108: seller must not see other sellers'' MV rows';
  end if;
  if (select count(*) from public.mv_executive_kpis_read()) <> 0 then
    raise exception '#108: executive KPIs MV must be staff-only';
  end if;
  begin
    perform count(*) from public.mv_sales_by_seller_month;
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#108: direct SELECT on the MV must be denied to authenticated';
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

-- ---------------------------------------------------------------------------
-- PRD-110: system health RPCs — owner-only (silent filter) + anon denied.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.system_health_cron_jobs()) = 0 then
    raise exception '#110: owner should see the pg_cron job roster';
  end if;
  if public.system_health_db_stats() is null then
    raise exception '#110: owner should see db stats';
  end if;
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  blocked boolean := false;
begin
  if (select count(*) from public.system_health_cron_jobs()) <> 0 then
    raise exception '#110: non-owner must get an empty cron roster';
  end if;
  if public.system_health_db_stats() is not null then
    raise exception '#110: non-owner must get null db stats';
  end if;
  -- health_ping is service_role-only: authenticated must be denied execute.
  begin
    perform public.health_ping();
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#110: health_ping must not be executable by authenticated';
  end if;
end $$;

reset role;

set local role anon;

do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.system_health_cron_jobs();
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#110: system_health_cron_jobs must not be executable by anon';
  end if;
end $$;

reset role;

-- ============================================================================
-- PRDs 112/113 — integration_logs: owner-only read; writes are service_role
-- only (no insert policies — Edge Functions bypass RLS).
-- ============================================================================

insert into public.integration_logs (integration_name, endpoint, http_status, latency_ms, trace_id)
values ('whatsapp_meta', '/rls-regression/messages', 200, 1, 'rls-regression');

select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.integration_logs where trace_id = 'rls-regression') <> 1 then
    raise exception '#112: owner should read integration_logs';
  end if;
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  blocked boolean := false;
begin
  if (select count(*) from public.integration_logs) <> 0 then
    raise exception '#112: non-owner must not read integration_logs';
  end if;
  -- No write policies exist: authenticated insert must be denied.
  begin
    insert into public.integration_logs (integration_name, endpoint)
    values ('whatsapp_meta', '/rls-regression/deny');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#112: authenticated must not insert into integration_logs';
  end if;
end $$;

reset role;

set local role anon;

do $$
declare
  blocked boolean := false;
begin
  begin
    insert into public.integration_logs (integration_name, endpoint)
    values ('whatsapp_meta', '/rls-regression/deny-anon');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#112: anon must not insert into integration_logs';
  end if;
end $$;

reset role;

-- ============================================================================
-- PRD-118 — whatsapp_delivery_health: owner-only (silent filter) + anon denied.
-- ============================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if public.whatsapp_delivery_health(24) is null then
    raise exception '#118: owner should see the whatsapp delivery health aggregate';
  end if;
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if public.whatsapp_delivery_health(24) is not null then
    raise exception '#118: non-owner must get null delivery health';
  end if;
end $$;

reset role;

set local role anon;

do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.whatsapp_delivery_health(24);
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#118: whatsapp_delivery_health must not be executable by anon';
  end if;
end $$;

reset role;

-- ============================================================================
-- PRD-119 — whatsapp_accounts: SELECT store-wide, writes staff-only.
-- ============================================================================

-- Non-staff seller (Lucas): reads the store accounts, cannot update them.
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  visible integer;
  touched integer;
begin
  select count(*) into visible from public.whatsapp_accounts;
  if visible = 0 then
    raise exception '#119: seller must still READ the store whatsapp accounts (conversation UI)';
  end if;

  update public.whatsapp_accounts set label = label;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception '#119: non-staff seller must not update whatsapp_accounts (touched %)', touched;
  end if;
end $$;

reset role;

-- Owner (staff): update reaches rows.
select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  touched integer;
begin
  update public.whatsapp_accounts set label = label;
  get diagnostics touched = row_count;
  if touched = 0 then
    raise exception '#119: staff (owner) must be able to update whatsapp_accounts';
  end if;
end $$;

reset role;

-- Anon: no write path at all.
set local role anon;

do $$
declare
  touched integer := 0;
  blocked boolean := false;
begin
  begin
    update public.whatsapp_accounts set label = label;
    get diagnostics touched = row_count;
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked and touched <> 0 then
    raise exception '#119: anon must not update whatsapp_accounts';
  end if;
end $$;

reset role;

-- ============================================================================
-- PRD-120 — whatsapp_provider_health: owner-only (silent filter) + anon denied.
-- ============================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if public.whatsapp_provider_health() is null then
    raise exception '#120: owner should see the whatsapp provider health snapshot';
  end if;
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if public.whatsapp_provider_health() is not null then
    raise exception '#120: non-owner must get null provider health';
  end if;
end $$;

reset role;

set local role anon;

do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.whatsapp_provider_health();
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#120: whatsapp_provider_health must not be executable by anon';
  end if;
end $$;

reset role;

-- The health tick must not be callable by app roles (cron-only).
set local role authenticated;

do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.whatsapp_health_tick();
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#120: whatsapp_health_tick must not be executable by authenticated';
  end if;
end $$;

reset role;

-- ============================================================================
-- Integrações & Chaves — Vault wrappers are service_role-only: no app role
-- (not even owner) may read, write or list integration secrets via PostgREST.
-- ============================================================================

select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  blocked boolean;
begin
  blocked := false;
  begin
    perform public.integration_secret_get('RESEND_API_KEY');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'chaves: integration_secret_get must not be executable by authenticated (owner included)';
  end if;

  blocked := false;
  begin
    perform public.integration_secret_set('RLS_TEST_KEY', 'value');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'chaves: integration_secret_set must not be executable by authenticated';
  end if;

  blocked := false;
  begin
    perform public.integration_secrets_status();
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'chaves: integration_secrets_status must not be executable by authenticated';
  end if;
end $$;

reset role;

set local role anon;

do $$
declare
  blocked boolean := false;
begin
  begin
    perform public.integration_secret_get('RESEND_API_KEY');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'chaves: integration_secret_get must not be executable by anon';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Multi-instância (2026-06-15): estruturas presentes; can_access fecha o pool
-- por instância e impede um seller de ler mensagens de conversa de OUTRO seller.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.can_access_conversation(uuid)') is null then
    raise exception 'multi-instance: can_access_conversation(uuid) is missing';
  end if;
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='whatsapp_account_access_rules') then
    raise exception 'multi-instance: whatsapp_account_access_rules table is missing';
  end if;
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='conversation_participants') then
    raise exception 'multi-instance: conversation_participants table is missing';
  end if;
end $$;

-- Captura (como admin) uma conversa atribuída a OUTRO seller, com mensagens.
select set_config('test.other_conv', coalesce((
  select c.id::text
  from public.conversations c
  where c.assigned_seller_id is not null
    and c.assigned_seller_id <> '5a6400ed-5aec-4bf1-b641-31635f15c887'
    and c.store_id = '00000000-0000-0000-0000-000000000001'
    and exists (select 1 from public.messages m where m.conversation_id = c.id)
  limit 1
), ''), true);

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  probe text := current_setting('test.other_conv', true);
  leaked int;
begin
  if probe is null or probe = '' then
    return; -- seed sem conversa de outro seller: nada a provar
  end if;
  select count(*) into leaked from public.messages where conversation_id = probe::uuid;
  if leaked <> 0 then
    raise exception 'multi-instance: seller leaked % messages of another seller conversation', leaked;
  end if;
end $$;

reset role;

select 'ALL RLS REGRESSION TESTS PASSED' as result;

rollback;
