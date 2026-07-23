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

  -- Per-seller carteira + Atendimento ("2 portões" / Turnstile, v0.110.0): o
  -- atendente vê os clientes da PRÓPRIA carteira E os clientes vinculados a uma
  -- conversa que ele acessa (can_access_conversation) — mesmo sem ser dono da
  -- carteira. O leak PROIBIDO é um cliente de outro seller/pool SEM nenhuma
  -- conversa acessível que o justifique. @see docs/dev/conversation-access-model.md
  if (select count(*) from public.customers) = 0 then
    raise exception 'lucas: should see his own customers';
  end if;
  if (select count(*) from public.customers cu
        where cu.seller_id is distinct from lucas
          and not exists (
            select 1 from public.conversations c
            where c.customer_id = cu.id
              and public.can_access_conversation(c.id)
          )) <> 0 then
    raise exception 'lucas: must not see other sellers'' customers without an accessible conversation (cross-leak)';
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

  -- Seed-robust: os fixtures de conversa (own/pool/other) são esperados sempre;
  -- sem eles não há o que exercer no teste de escrita. As mídias específicas
  -- (own_media/other_media) podem não existir em todo seed (ex.: prod sem mídia
  -- vinculada a conversa de outro vendedor) — cada bloco abaixo é guardado pela
  -- presença do seu próprio fixture.
  if own_conv is null or pool_conv is null or other_conv is null then
    raise exception '#48: missing conversation fixtures for the media write test';
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

  -- UPDATE own media -> 1 row (guardado pela presença de mídia própria no seed).
  if own_media is not null then
    update public.media_assets set ocr_text = 'rls' where id = own_media;
    get diagnostics n = row_count;
    if n <> 1 then raise exception '#48: UPDATE of own media affected % rows (want 1)', n; end if;
  end if;

  -- Outro vendedor: UPDATE/DELETE não devem atingir linhas (RLS filtra).
  -- Guardado pela presença de mídia alheia no seed.
  if other_media is not null then
    update public.media_assets set ocr_text = 'rls' where id = other_media;
    get diagnostics n = row_count;
    if n <> 0 then raise exception '#48: UPDATE of another seller media affected % rows (want 0)', n; end if;

    delete from public.media_assets where id = other_media;
    get diagnostics n = row_count;
    if n <> 0 then raise exception '#48: DELETE of another seller media affected % rows (want 0)', n; end if;
  end if;
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

-- Reset role first (not in the plan doc verbatim — added while applying it).
-- The multi-instância block just above never resets after its own last
-- check, so this section would otherwise silently inherit LUCAS's leftover
-- impersonation. Two concrete breakages that would cause, once the guarded
-- checks below actually run (i.e. right after this plan's migrations are
-- deployed): (1) the `test.cp_other_conv`/`test.cp_other_seller` capture
-- below would run under lucas's own conversations RLS, which may not include
-- a conversation assigned to a DIFFERENT seller, silently degrading the
-- whole section into a permanent no-op; (2) the seed-insert immediately
-- below targets that same conversation — one lucas has no relationship to —
-- so cp_insert's WITH CHECK would reject it with a hard RLS-violation error
-- instead of the graceful test.cp_ready skip this guard exists to provide.
-- Mirrors why the multi-instância block's own "Captura (como admin) uma
-- conversa atribuída a OUTRO seller" step (above) resets/captures as admin
-- rather than as lucas.
reset role;

-- ---------------------------------------------------------------------------
-- Colaboradores por demanda (2026-07-04): self-delete allowed, third-party
-- delete of someone else's participant row denied for non-staff/non-assignee.
-- Guard: this plan's migrations (source column + cp_insert/cp_delete split)
-- are not auto-applied by merging — the DB deploy workflow applies migrations
-- separately, so pré-merge this whole section is SKIPPED (mirrors "Bloco A1"'s
-- guard further below, `if not exists (select 1 from information_schema.
-- columns where ... column_name = 'is_active')`, for the identical
-- same-plan-pending-migration situation).
-- ---------------------------------------------------------------------------
select set_config(
  'test.cp_ready',
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'conversation_participants' and column_name = 'source'
  ) then 'true' else '' end,
  true
);

-- A conversation NOT assigned to lucas — BOTH checks below seed a row on it,
-- so neither can be explained by the pre-existing "assignee" OR-arm: on this
-- conversation, lucas is a mere collaborator, never the owner. This also
-- isolates the self-delete check from the third-party check (the original
-- design reused lucas's OWN conversation for self-delete, which confounded
-- the new "own row" arm with the pre-existing "assignee" arm — a regression
-- that silently dropped just the new arm would have gone undetected there).
select set_config('test.cp_other_conv', coalesce((
  select c.id::text
  from public.conversations c
  where c.assigned_seller_id is not null
    and c.assigned_seller_id <> '5a6400ed-5aec-4bf1-b641-31635f15c887'
    and c.store_id = '00000000-0000-0000-0000-000000000001'
  limit 1
), ''), true);

select set_config('test.cp_other_seller', coalesce((
  select c.assigned_seller_id::text
  from public.conversations c
  where c.id::text = current_setting('test.cp_other_conv', true)
), ''), true);

do $$
declare
  probe text := current_setting('test.cp_other_conv', true);
  other_seller text := current_setting('test.cp_other_seller', true);
begin
  if current_setting('test.cp_ready', true) is distinct from 'true' then
    return; -- migration ainda não aplicada em prod: pula
  end if;
  if probe is null or probe = '' or other_seller is null or other_seller = '' then
    return; -- seed sem conversa atribuída a outro seller: nada a provar
  end if;
  -- Seed BOTH probe rows on the same conversation: lucas himself (for the
  -- self-delete check) and that conversation's real assignee (for the
  -- third-party-delete check).
  insert into public.conversation_participants (conversation_id, seller_id, added_by, source)
  values
    (probe::uuid, '5a6400ed-5aec-4bf1-b641-31635f15c887', other_seller::uuid, 'manual'),
    (probe::uuid, other_seller::uuid, other_seller::uuid, 'manual')
  on conflict (conversation_id, seller_id) do nothing;
end $$;

-- (1) Self-delete: lucas removes his OWN participant row on a conversation he
-- does NOT own — isolates the new "seller_id = current_seller_id()" OR-arm
-- from the pre-existing "assignee" arm (which does not apply here).
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  probe text := current_setting('test.cp_other_conv', true);
begin
  if current_setting('test.cp_ready', true) is distinct from 'true' then
    return;
  end if;
  if probe is null or probe = '' then
    return;
  end if;
  delete from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887';
end $$;

reset role;

do $$
declare
  probe text := current_setting('test.cp_other_conv', true);
  remaining int;
begin
  if current_setting('test.cp_ready', true) is distinct from 'true' then
    return;
  end if;
  if probe is null or probe = '' then
    return;
  end if;
  select count(*) into remaining
  from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887';
  if remaining <> 0 then
    raise exception 'conversation_participants: self-delete did not remove the row (cp_delete regression)';
  end if;
end $$;

-- (2) Third-party delete: lucas (non-staff, not this row's seller, not this
-- conversation's assignee) must NOT be able to delete the OTHER seller's
-- participant row.
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  probe text := current_setting('test.cp_other_conv', true);
  other_seller text := current_setting('test.cp_other_seller', true);
begin
  if current_setting('test.cp_ready', true) is distinct from 'true' then
    return;
  end if;
  if probe is null or probe = '' or other_seller is null or other_seller = '' then
    return;
  end if;
  delete from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = other_seller::uuid;
end $$;

reset role;

-- Verify as admin — cp_select's USING clause shares cp_delete's three OR-arms,
-- so this row is INVISIBLE to lucas too; checking "remaining" while still
-- impersonating him would always read 0 regardless of whether the DELETE
-- above actually succeeded or was blocked, making the assertion vacuously
-- fail every run. Check the row's real persistence outside his impersonation.
do $$
declare
  probe text := current_setting('test.cp_other_conv', true);
  other_seller text := current_setting('test.cp_other_seller', true);
  remaining int;
begin
  if current_setting('test.cp_ready', true) is distinct from 'true' then
    return;
  end if;
  if probe is null or probe = '' or other_seller is null or other_seller = '' then
    return;
  end if;
  select count(*) into remaining
  from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = other_seller::uuid;
  if remaining <> 1 then
    raise exception 'conversation_participants: unrelated seller was able to delete someone else''s collaborator row (cp_delete regression)';
  end if;
end $$;

-- Cleanup: remove both throwaway rows (belt-and-suspenders; the whole script
-- rolls back anyway).
do $$
declare
  probe text := current_setting('test.cp_other_conv', true);
  other_seller text := current_setting('test.cp_other_seller', true);
begin
  if current_setting('test.cp_ready', true) is distinct from 'true' then
    return;
  end if;
  if probe is null or probe = '' or other_seller is null or other_seller = '' then
    return;
  end if;
  delete from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id in ('5a6400ed-5aec-4bf1-b641-31635f15c887', other_seller::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- Bloco A1 (gestão multi-loja): escrita de IDENTIDADE da loja é Owner-only.
-- A policy stores_update usa is_staff() (= owner OU manager), então a defesa
-- contra um Gestor alterar/desativar lojas via PATCH direto é o GRANT por
-- coluna: authenticated só pode atualizar `settings`; as demais colunas mudam
-- apenas pelas RPCs SECURITY DEFINER owner-only.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"manager","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  -- Guard: o Bloco A1 só existe após a migration 20260622130000_store_crud_owner_rpc.
  -- O CI roda contra prod e o workflow "DB deploy" aplica a migration apenas no
  -- merge, então pré-merge este bloco é PULADO (será validado no 1º run pós-deploy).
  -- Espelha o guard de objeto-ausente da seção multi-instância acima.
  if not exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'stores' and column_name = 'is_active') then
    return;
  end if;
  -- (a) Coluna de identidade: UPDATE direto deve ser NEGADO (column grant).
  begin
    update public.stores set name = name
      where id = '00000000-0000-0000-0000-000000000001';
    raise exception 'manager: direct UPDATE of stores.name should be denied';
  exception
    when insufficient_privilege then null; -- esperado
  end;
  -- (b) is_active: também negado (impede burlar a guarda da matriz).
  begin
    update public.stores set is_active = false
      where id = '00000000-0000-0000-0000-000000000001';
    raise exception 'manager: direct UPDATE of stores.is_active should be denied';
  exception
    when insufficient_privilege then null; -- esperado
  end;
  -- (c) settings: PERMITIDO (edição de configurações pelo Gestor).
  update public.stores set settings = settings
    where id = '00000000-0000-0000-0000-000000000001';
end $$;

reset role;

-- Fail-CLOSED: um JWT sem app_metadata.role NAO pode criar/editar lojas. O gate
-- usa `current_app_role() is distinct from 'owner'`, tratando role NULL como
-- nao-owner (a forma `<> 'owner'` deixaria passar: NULL <> 'owner' = NULL).
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated","app_metadata":{"store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $chk$
begin
  -- Guard: pula até a migration A1 estar aplicada em prod (ver nota acima).
  if to_regprocedure('public.create_store(uuid,text,text,text,text,uuid,text[],jsonb)') is null then
    return;
  end if;
  begin
    perform public.create_store(
      gen_random_uuid(), 'Probe', 'filial', '00.000.000/0001-00', 'Rua',
      null, array['parts']::text[], '{}'::jsonb
    );
    raise exception 'null-role: create_store should be denied (fail-closed)';
  exception when insufficient_privilege then null; -- esperado (42501)
  end;
end $chk$;
reset role;

-- ---------------------------------------------------------------------------
-- PR #194 — customers.seller_id is now nullable. Imported pending_review
-- anchors have NO wallet owner; the load-bearing invariant is that a NULL owner
-- stays invisible-by-wallet to a non-staff seller (`seller_id = current_seller_id()`
-- is never true for NULL) — visibility comes only from instance access
-- (can_access_conversation) or is_staff(). Insert one ownerless anchor as the
-- owner, then assert lucas (non-staff, no conversation to it) cannot see it
-- while the owner can. Rolled back with the suite.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $pr194$
declare
  anchor uuid := gen_random_uuid();
begin
  -- Owner (is_staff) may create an ownerless anchor: INSERT with_check passes on is_staff().
  insert into public.customers (id, store_id, type, phone, full_name, seller_id, status, tags)
    values (anchor, '00000000-0000-0000-0000-000000000001', 'B2C', '+550000000194',
            '+550000000194', null, 'ativo', array['pending_review']);
  if (select count(*) from public.customers where id = anchor) <> 1 then
    raise exception 'pr194: owner (staff) should see the ownerless anchor it just created';
  end if;
  perform set_config('pr194.anchor', anchor::text, true);
end $pr194$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $pr194$
declare
  anchor uuid := nullif(current_setting('pr194.anchor', true), '')::uuid;
begin
  if anchor is null then
    raise exception 'pr194: ownerless anchor fixture missing (owner block did not run)';
  end if;
  -- No conversation exists for the anchor, so neither wallet (NULL = me is never
  -- true) nor instance access (can_access_conversation) can reveal it.
  if (select count(*) from public.customers where id = anchor) <> 0 then
    raise exception 'pr194: non-staff seller must NOT see an ownerless (seller_id null) customer by wallet';
  end if;
end $pr194$;
reset role;

-- ---------------------------------------------------------------------------
-- Conversão manual de contato pendente (convert_pending_contact / mark_contact_not_customer).
-- Gated por is_staff() OU acesso à conversa. Guard: pula até a migration existir.
-- Fixtures criados como owner; convertidos como lucas (não-staff). Rolled back com a suíte.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $conv$
declare
  anchor_ok uuid := gen_random_uuid();   -- tem conversa acessível ao lucas
  anchor_no uuid := gen_random_uuid();   -- sem conversa → lucas não acessa
  conv_ok uuid := gen_random_uuid();
begin
  if to_regprocedure('public.convert_pending_contact(uuid,text,text,text,text,text,text,text,uuid)') is null then
    return; -- migration ainda não aplicada em prod; pula (ver Rollout).
  end if;
  insert into public.customers (id, store_id, type, phone, full_name, seller_id, status, tags)
    values (anchor_ok, '00000000-0000-0000-0000-000000000001', 'B2C', '+550000000291', '+550000000291', null, 'ativo', array['pending_review']),
           (anchor_no, '00000000-0000-0000-0000-000000000001', 'B2C', '+550000000292', '+550000000292', null, 'ativo', array['pending_review']);
  -- Conversa atribuída ao lucas, sem número (whatsapp_account_id null) → can_access_conversation = true para ele.
  insert into public.conversations (id, store_id, customer_id, assigned_seller_id, whatsapp_account_id, channel, status, last_message_at)
    values (conv_ok, '00000000-0000-0000-0000-000000000001', anchor_ok, '5a6400ed-5aec-4bf1-b641-31635f15c887', null, 'whatsapp', 'aguardando', now());
  perform set_config('conv.anchor_ok', anchor_ok::text, true);
  perform set_config('conv.anchor_no', anchor_no::text, true);
end $conv$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $conv$
declare
  anchor_ok uuid := nullif(current_setting('conv.anchor_ok', true), '')::uuid;
  anchor_no uuid := nullif(current_setting('conv.anchor_no', true), '')::uuid;
  v_seller uuid;
  v_tags text[];
begin
  if anchor_ok is null then
    return; -- migration não aplicada (fixtures não criados); pula.
  end if;

  -- (1) Não-staff COM acesso à conversa: converte com sucesso e vira o dono.
  perform public.convert_pending_contact(anchor_ok, 'B2C', 'Cliente Convertido', null, null, null, null, null, null);
  select seller_id, tags into v_seller, v_tags from public.customers where id = anchor_ok;
  if v_seller is distinct from '5a6400ed-5aec-4bf1-b641-31635f15c887'::uuid then
    raise exception 'convert: non-staff converter must become the wallet owner';
  end if;
  if v_tags @> array['pending_review'] then
    raise exception 'convert: pending_review tag must be removed after conversion';
  end if;

  -- (2) Idempotência: converter de novo deve falhar (já não é pendente).
  begin
    perform public.convert_pending_contact(anchor_ok, 'B2C', 'X', null, null, null, null, null, null);
    raise exception 'convert: second conversion should be rejected (not pending)';
  exception when others then
    if sqlstate <> '22023' then raise; end if; -- esperado: 22023
  end;

  -- (3) Não-staff SEM conversa acessível: negado (42501).
  begin
    perform public.convert_pending_contact(anchor_no, 'B2C', 'Y', null, null, null, null, null, null);
    raise exception 'convert: non-staff without an accessible conversation must be denied';
  exception when insufficient_privilege then null; -- esperado: 42501
  end;
end $conv$;
reset role;

-- ---------------------------------------------------------------------------
-- Fix 20260629130000: mark_contact_not_customer audit correto + restore_pending_contact
-- (undo de descarte: reviewed_not_customer → pending_review).
-- Guard: pula até a migration existir (restore_pending_contact presente).
-- Fixtures criados como owner; operações como lucas (não-staff COM conversa). Rolled back com a suíte.
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $mark$
declare
  anchor_mark uuid := gen_random_uuid();
  conv_mark uuid := gen_random_uuid();
begin
  if to_regprocedure('public.restore_pending_contact(uuid)') is null then
    return; -- migration ainda não aplicada em prod; pula.
  end if;
  insert into public.customers (id, store_id, type, phone, full_name, seller_id, status, tags)
    values (anchor_mark, '00000000-0000-0000-0000-000000000001', 'B2C', '+550000000293', '+550000000293', null, 'ativo', array['pending_review']);
  -- Conversa atribuída ao lucas, sem número (whatsapp_account_id null) → can_access_conversation = true para ele.
  insert into public.conversations (id, store_id, customer_id, assigned_seller_id, whatsapp_account_id, channel, status, last_message_at)
    values (conv_mark, '00000000-0000-0000-0000-000000000001', anchor_mark, '5a6400ed-5aec-4bf1-b641-31635f15c887', null, 'whatsapp', 'aguardando', now());
  perform set_config('mark.anchor_mark', anchor_mark::text, true);
end $mark$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $mark$
declare
  anchor_mark uuid := nullif(current_setting('mark.anchor_mark', true), '')::uuid;
  v_tags text[];
begin
  if anchor_mark is null then
    return; -- migration não aplicada (fixtures não criados); pula.
  end if;

  -- (1) Não-staff COM acesso à conversa: descarta o contato.
  perform public.mark_contact_not_customer(anchor_mark);
  select tags into v_tags from public.customers where id = anchor_mark;
  if not (v_tags @> array['reviewed_not_customer']) then
    raise exception 'mark: tag reviewed_not_customer must be present after mark';
  end if;
  if v_tags @> array['pending_review'] then
    raise exception 'mark: tag pending_review must be removed after mark';
  end if;

  -- (2) Restaura o contato (undo discard): pending_review retorna.
  perform public.restore_pending_contact(anchor_mark);
  select tags into v_tags from public.customers where id = anchor_mark;
  if not (v_tags @> array['pending_review']) then
    raise exception 'restore: tag pending_review must be present after restore';
  end if;
  if v_tags @> array['reviewed_not_customer'] then
    raise exception 'restore: tag reviewed_not_customer must be removed after restore';
  end if;

  -- (3) Idempotência: restaurar de novo deve falhar (já não é reviewed_not_customer).
  begin
    perform public.restore_pending_contact(anchor_mark);
    raise exception 'restore: second restore should be rejected (not reviewed_not_customer)';
  exception when others then
    if sqlstate <> '22023' then raise; end if; -- esperado: 22023
  end;
end $mark$;
reset role;

-- ============================================================================
-- webhook_deliveries: owner-only read; writes are service_role only (no
-- insert policies — Edge Functions bypass RLS).
-- ============================================================================

insert into public.webhook_deliveries (integration_name, endpoint, http_status, outcome, trace_id)
values ('whatsapp_waha', '/waha-webhook', 200, 'processed', 'rls-regression');

select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.webhook_deliveries where trace_id = 'rls-regression') <> 1 then
    raise exception '#webhook_deliveries: owner should read webhook_deliveries';
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
  if (select count(*) from public.webhook_deliveries) <> 0 then
    raise exception '#webhook_deliveries: non-owner must not read webhook_deliveries';
  end if;
  begin
    insert into public.webhook_deliveries (integration_name, endpoint, http_status, outcome)
    values ('whatsapp_waha', '/rls-regression/deny', 200, 'processed');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#webhook_deliveries: authenticated must not insert into webhook_deliveries';
  end if;
end $$;

reset role;

set local role anon;

do $$
declare
  blocked boolean := false;
begin
  begin
    insert into public.webhook_deliveries (integration_name, endpoint, http_status, outcome)
    values ('whatsapp_waha', '/rls-regression/deny-anon', 200, 'processed');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#webhook_deliveries: anon must not insert into webhook_deliveries';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Idle-conversation alerts (spec 2026-07-16): summary RPC + triggers.
-- Schema per supabase/migrations/20260716190000_idle_conversation_alerts.sql
-- (verified against supabase/migrations/20260608151417_create_messages_table.sql):
-- messages.direction is 'in'/'out' (NOT 'inbound'/'outbound'), the text column
-- is `text` (NOT `content`), there is no `created_at`-as-business-timestamp —
-- the column that drives awaiting_reply_since is `sent_at`. messages has no
-- store_id column. NOT NULL columns without a default that the INSERT below
-- must satisfy: conversation_id, direction, author_type, provider, status,
-- sent_at (id defaults to gen_random_uuid(), text defaults to '').
-- ---------------------------------------------------------------------------
-- Trigger unit-check (as superuser, before impersonation): inbound sets, outbound clears.
do $$
declare
  v_conv uuid;
  v_since timestamptz;
begin
  select id into v_conv from public.conversations
   where status in ('aguardando','em_andamento','aguardando_cliente') limit 1;
  if v_conv is null then
    raise notice 'idle-alerts: no open conversation in fixtures — skipping trigger check';
    return;
  end if;
  update public.conversations set awaiting_reply_since = null where id = v_conv;
  insert into public.messages (conversation_id, direction, author_type, provider, text, status, sent_at)
    values (v_conv, 'in', 'customer', 'mock', 'rls-test inbound', 'delivered', now());
  select awaiting_reply_since into v_since from public.conversations where id = v_conv;
  if v_since is null then
    raise exception 'idle-alerts: inbound message should set awaiting_reply_since';
  end if;
  insert into public.messages (conversation_id, direction, author_type, provider, text, status, sent_at)
    values (v_conv, 'out', 'seller', 'mock', 'rls-test outbound', 'sent', now());
  select awaiting_reply_since into v_since from public.conversations where id = v_conv;
  if v_since is not null then
    raise exception 'idle-alerts: outbound message should clear awaiting_reply_since';
  end if;
end $$;

-- business-time fn sanity: no schedule ⇒ raw diff.
do $$
begin
  if public.idle_business_seconds(null, now() - interval '2 hours', now()) not between 7100 and 7300 then
    raise exception 'idle_business_seconds: raw diff expected for null schedule';
  end if;
end $$;

-- SQL≡JS parity: SAME fixtures as idleBusinessTime.test.ts (Mon-Fri 08-18 SP).
-- Monday 07:00→09:00 SP = 3600s; Saturday 10:00 → Monday 09:00 SP = 3600s;
-- Monday 08:00 → Wednesday 18:00 SP = 108000s (3 × 10h).
do $$
declare
  sched jsonb := '[
    {"weekday":1,"openAt":"08:00","closeAt":"18:00","enabled":true},
    {"weekday":2,"openAt":"08:00","closeAt":"18:00","enabled":true},
    {"weekday":3,"openAt":"08:00","closeAt":"18:00","enabled":true},
    {"weekday":4,"openAt":"08:00","closeAt":"18:00","enabled":true},
    {"weekday":5,"openAt":"08:00","closeAt":"18:00","enabled":true}
  ]'::jsonb;
begin
  if public.idle_business_seconds(sched,
       '2026-07-13T07:00:00-03:00'::timestamptz, '2026-07-13T09:00:00-03:00'::timestamptz) <> 3600 then
    raise exception 'parity: Monday 07-09 should yield 3600s';
  end if;
  if public.idle_business_seconds(sched,
       '2026-07-11T10:00:00-03:00'::timestamptz, '2026-07-13T09:00:00-03:00'::timestamptz) <> 3600 then
    raise exception 'parity: weekend skip should yield 3600s';
  end if;
  if public.idle_business_seconds(sched,
       '2026-07-13T08:00:00-03:00'::timestamptz, '2026-07-15T18:00:00-03:00'::timestamptz) <> 108000 then
    raise exception 'parity: Mon 08 → Wed 18 should yield 108000s';
  end if;
end $$;

-- Arrange (superuser, rolled back): force idleAlerts ON for the matriz store and
-- plant a positive control — an OWNER-assigned conversation with a pending reply —
-- so the LUCAS leak check below cannot pass vacuously (0-rows-for-everyone).
do $$
declare
  v_owner_conv uuid;
begin
  update public.stores
     set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{idleAlerts}',
       '{"enabled":true,"level1Hours":1,"level2Hours":8,"level3Hours":24,"notifyManagerOnLevel3":true}'::jsonb)
   where id = '00000000-0000-0000-0000-000000000001';

  select id into v_owner_conv from public.conversations
   where store_id = '00000000-0000-0000-0000-000000000001'
     and assigned_seller_id = '57706ecc-01b5-4a96-b403-0359a4bb767f'
     and status in ('aguardando','em_andamento','aguardando_cliente')
   limit 1;
  if v_owner_conv is null then
    raise notice 'idle-alerts leak check: no owner-assigned open conversation in fixtures — positive control skipped';
    return;
  end if;
  -- 30h raw (not the 3h originally proposed): this static file has no DB
  -- access to confirm whether the owner's sellers.work_schedule is populated
  -- in the real seed. idle_business_seconds() only ever REDUCES the raw diff
  -- when a schedule is present (business time <= raw time), so 30h raw clears
  -- the level1Hours=1 threshold above regardless of schedule; 3h raw would
  -- not be safe under an unknown/possibly-restrictive schedule.
  update public.conversations set awaiting_reply_since = now() - interval '30 hours'
   where id = v_owner_conv;
end $$;

-- Summary RPC as LUCAS: must never return a conversation assigned to another seller.
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $$
begin
  if exists (
    select 1 from public.idle_conversations_summary() s
    join public.conversations c on c.id = s.conversation_id
    where c.assigned_seller_id is distinct from '5a6400ed-5aec-4bf1-b641-31635f15c887'::uuid
  ) then
    raise exception 'idle summary: leaked another seller''s conversation';
  end if;

  if exists (
    select 1 from public.idle_conversations_summary() s
    join public.conversations c on c.id = s.conversation_id
    where c.assigned_seller_id = '57706ecc-01b5-4a96-b403-0359a4bb767f'::uuid
  ) then
    raise exception 'idle summary: returned the OWNER''s planted conversation to lucas';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Offline-rescue (spec 2026-07-17): RLS de conversation_rescues + claim RPC.
-- Schema per supabase/migrations/20260717170000_conversation_rescues.sql.
-- ---------------------------------------------------------------------------

-- Arrange (superuser, rolled back): plant a broadcasting rescue on a
-- conversation LUCAS cannot access (owner-assigned instance), so the SELECT
-- leak check below cannot pass vacuously.
do $$
declare
  v_owner_conv uuid;
  v_account uuid;
  v_rescue uuid;
begin
  select id, whatsapp_account_id into v_owner_conv, v_account from public.conversations
   where store_id = '00000000-0000-0000-0000-000000000001'
     and assigned_seller_id = '57706ecc-01b5-4a96-b403-0359a4bb767f'
     and whatsapp_account_id is not null
   limit 1;
  if v_owner_conv is null then
    raise notice 'conversation-rescue: no owner-assigned conversation with an account in fixtures — skipping';
    return;
  end if;

  insert into public.conversation_rescues
    (conversation_id, store_id, whatsapp_account_id, absent_seller_id, absence_kind, contact_name)
  values
    (v_owner_conv, '00000000-0000-0000-0000-000000000001', v_account,
     '57706ecc-01b5-4a96-b403-0359a4bb767f', 'schedule', 'Cliente RLS-test')
  returning id into v_rescue;

  perform set_config('rls_regression.rescue_id', v_rescue::text, false);
end $$;

-- LUCAS must not see a rescue on a conversation he cannot access.
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $$
declare
  v_rescue_id uuid := nullif(current_setting('rls_regression.rescue_id', true), '')::uuid;
begin
  if v_rescue_id is null then
    return; -- positive control was skipped above (no fixture) — nothing to assert
  end if;
  if exists (select 1 from public.conversation_rescues where id = v_rescue_id) then
    raise exception 'conversation_rescues: lucas should not see a rescue on a conversation he cannot access';
  end if;

  -- Claiming it must also fail closed (RPC re-checks can_access_conversation).
  begin
    perform public.claim_conversation_rescue(v_rescue_id);
    raise exception 'claim_conversation_rescue: lucas should not be able to claim an inaccessible rescue';
  exception
    when insufficient_privilege then null; -- expected: 42501
  end;
end $$;
reset role;

-- Second claim on an already-claimed rescue must fail (concorrência otimista).
do $$
declare
  v_rescue_id uuid := nullif(current_setting('rls_regression.rescue_id', true), '')::uuid;
begin
  if v_rescue_id is null then
    return;
  end if;
  update public.conversation_rescues set status = 'claimed', claimed_by_seller_id = '57706ecc-01b5-4a96-b403-0359a4bb767f'
   where id = v_rescue_id;
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","seller_id":"57706ecc-01b5-4a96-b403-0359a4bb767f","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $$
declare
  v_rescue_id uuid := nullif(current_setting('rls_regression.rescue_id', true), '')::uuid;
begin
  if v_rescue_id is null then
    return;
  end if;
  begin
    perform public.claim_conversation_rescue(v_rescue_id);
    raise exception 'claim_conversation_rescue: claiming an already-claimed rescue should fail';
  exception when others then
    if sqlstate <> 'P0004' then raise; end if; -- expected: P0004
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- lead_via_conversation (lead fiche spec, 2026-07-20): the fiche of a
-- lead-anchored POOL conversation resolves gated ONCE by
-- can_access_conversation — even when the lead is OWNERLESS and therefore
-- hidden from non-staff on direct select (leads_select's third branch,
-- seller_handles_lead, only covers ASSIGNED conversations — the pool variant
-- was deliberately reverted in 20260619170000 for per-row RLS perf).
-- Fixture created inline (seed-robust): ownerless lead + accountless POOL
-- conversation (assigned null + account null → the legacy-pool access branch).
-- ---------------------------------------------------------------------------
do $$
declare
  v_lead uuid := gen_random_uuid();
  v_conv uuid := gen_random_uuid();
begin
  insert into public.leads (id, store_id, seller_id, name, phone, stage, temperature, origin, conversations, tags)
  values (
    v_lead, '00000000-0000-0000-0000-000000000001', null,
    'RLS Fixture — lead sem dono', '+5555999990000',
    '{"id":"stage-novo","name":"Novo","color":"#5b6b7a","order":1}'::jsonb,
    'frio', 'whatsapp', '{}', '{}'
  );
  insert into public.conversations (id, store_id, lead_id, assigned_seller_id, channel, status, last_message_at)
  values (
    v_conv, '00000000-0000-0000-0000-000000000001', v_lead::text,
    null, 'whatsapp', 'aguardando', now()
  );
  perform set_config('rls_regression.lead_fiche_conv', v_conv::text, true);
  perform set_config('rls_regression.lead_fiche_lead', v_lead::text, true);
end $$;

-- Second fixture: an EXISTING conversation lucas cannot access (assigned to the
-- OWNER's seller, accountless → not pool, not lucas's) anchoring the same lead.
-- This exercises the can_access_conversation gate itself on the negative path —
-- an unknown-uuid probe alone would pass vacuously via the join.
do $$
declare
  v_conv2 uuid := gen_random_uuid();
begin
  insert into public.conversations (id, store_id, lead_id, assigned_seller_id, channel, status, last_message_at)
  values (
    v_conv2, '00000000-0000-0000-0000-000000000001',
    current_setting('rls_regression.lead_fiche_lead', true),
    '57706ecc-01b5-4a96-b403-0359a4bb767f', 'whatsapp', 'em_andamento', now()
  );
  perform set_config('rls_regression.lead_fiche_conv_denied', v_conv2::text, true);
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $$
declare
  v_conv uuid := current_setting('rls_regression.lead_fiche_conv', true)::uuid;
  v_lead uuid := current_setting('rls_regression.lead_fiche_lead', true)::uuid;
begin
  -- Sanity: the direct read must stay hidden (ownerless lead on a POOL
  -- conversation, non-staff) — proves the RPC is the thing granting
  -- visibility, not a widened policy.
  if exists (select 1 from public.leads where id = v_lead) then
    raise exception 'lead_via_conversation: ownerless pool lead should be RLS-hidden from lucas on direct select';
  end if;
  -- The conversation-gated RPC must resolve the lead.
  if (select count(*) from public.lead_via_conversation(v_conv)) <> 1 then
    raise exception 'lead_via_conversation: lucas should read the ownerless lead via the accessible pool conversation';
  end if;
  -- An unknown conversation yields zero rows.
  if (select count(*) from public.lead_via_conversation(gen_random_uuid())) <> 0 then
    raise exception 'lead_via_conversation: unknown conversation must yield no rows';
  end if;
  -- An EXISTING conversation lucas cannot access (assigned to another seller,
  -- no instance) must ALSO yield zero rows — the gate itself, not the join.
  if (select count(*)
        from public.lead_via_conversation(
          current_setting('rls_regression.lead_fiche_conv_denied', true)::uuid)) <> 0 then
    raise exception 'lead_via_conversation: inaccessible conversation must yield no rows (gate)';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- lead_notes (2026-07-20): notes inherit the parent lead's visibility. The
-- derived RLS re-applies leads_select via the store subquery, so lucas (owner
-- of the fixture lead, store ...0001) reads his note, while a seller scoped to
-- a different store sees nothing.
-- ---------------------------------------------------------------------------
reset role;
do $$
declare v_lead uuid := gen_random_uuid();
begin
  insert into public.leads (id, store_id, seller_id, name, phone, stage, temperature, origin, conversations, tags)
  values (v_lead, '00000000-0000-0000-0000-000000000001', '5a6400ed-5aec-4bf1-b641-31635f15c887',
          'RLS Fixture — lead notes', '+5555999991111',
          '{"id":"stage-novo","name":"Novo","color":"#5b6b7a","order":1}'::jsonb, 'frio', 'whatsapp', '{}', '{}');
  insert into public.lead_notes (lead_id, author_id, content)
  values (v_lead, '5a6400ed-5aec-4bf1-b641-31635f15c887', 'nota do lucas');
  perform set_config('rls_regression.lead_note_lead', v_lead::text, true);
end $$;

-- positive: owner lucas reads his lead note
select set_config('request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.lead_notes where lead_id = current_setting('rls_regression.lead_note_lead', true)::uuid) <> 1 then
    raise exception 'lead_notes: owner lucas should read his lead note';
  end if;
end $$;
reset role;

-- negative: a seller scoped to a different store must not see the note
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"00000000-0000-0000-0000-0000000000bb","store_id":"00000000-0000-0000-0000-000000000002"}}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.lead_notes where lead_id = current_setting('rls_regression.lead_note_lead', true)::uuid) <> 0 then
    raise exception 'lead_notes: cross-store seller must not see the note';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Multi-funnel model for leads (spec 2026-07-23-leads-multi-funil-design.md).
-- Schema/RLS/RPCs per supabase/migrations/20260723120000_lead_funnels_schema.sql,
-- 20260723121000_lead_funnels_rls.sql, 20260723123000_lead_funnels_rpcs.sql.
-- These four migrations are VERSIONED but NOT YET APPLIED to the target
-- database (see the plan's rollout note) — every case below is guarded
-- behind test.funnels_ready and is a clean skip until they ship, mirroring
-- the "Bloco A1" / restore_pending_contact not-yet-applied guards above.
-- ---------------------------------------------------------------------------
reset role;

select set_config(
  'test.funnels_ready',
  case when to_regprocedure('public.accessible_lead_funnel_ids(uuid)') is not null then 'true' else '' end,
  true
);

-- lead_funnel_entries visibility mirrors leads exactly (store scope + own-row
-- OR is_staff) — a non-staff seller must never read another seller's
-- membership.
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
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return; -- multi-funnel migrations not yet applied in prod; pula
  end if;
  if (select count(*) from public.lead_funnel_entries) = 0 then
    raise notice 'lead_funnel_entries: lucas has no visible memberships in fixtures — cross-leak check is vacuous';
  end if;
  if (select count(*) from public.lead_funnel_entries where seller_id <> lucas) <> 0 then
    raise exception 'lead_funnel_entries: lucas must not read another seller''s membership (cross-leak)';
  end if;
end $$;

reset role;

-- accessible_lead_funnel_ids: the default funnel is reachable by everyone,
-- with no explicit lead_funnel_access grant (the backfill guarantees exactly
-- one default funnel per store).
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;
  if (select count(*)
        from public.accessible_lead_funnel_ids('00000000-0000-0000-0000-000000000001') a
        join public.lead_funnels f on f.id = a.funnel_id
       where f.is_default) <> 1 then
    raise exception 'accessible_lead_funnel_ids: the default funnel must be reachable with no explicit grant';
  end if;
end $$;

reset role;

-- Arrange (superuser, rolled back): a lead owned by lucas, with a membership
-- in a funnel that is neither default, nor open_to_store, nor explicitly
-- granted to him. This funnel filters the BOARD (accessible_lead_funnel_ids),
-- never the lead's own existence — without this a seller's own lead would
-- vanish with no explanation the moment it lands in a funnel he can't open.
do $$
declare
  v_lead uuid := gen_random_uuid();
  v_funnel uuid;
  v_stage uuid;
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;

  insert into public.leads (id, store_id, seller_id, name, phone, stage, temperature, origin, conversations, tags)
  values (v_lead, '00000000-0000-0000-0000-000000000001', '5a6400ed-5aec-4bf1-b641-31635f15c887',
          'RLS Fixture — lead em funil restrito', '+5555999992222',
          '{"id":"stage-novo","name":"Novo","color":"#5b6b7a","order":1}'::jsonb, 'frio', 'whatsapp', '{}', '{}');

  insert into public.lead_funnels (store_id, name, is_default, open_to_store, position)
  values ('00000000-0000-0000-0000-000000000001', 'RLS Fixture — funil restrito', false, false, 99)
  returning id into v_funnel;

  insert into public.lead_funnel_stages (funnel_id, name, position, kind)
  values (v_funnel, 'Entrada', 0, 'entrada') returning id into v_stage;
  insert into public.lead_funnel_stages (funnel_id, name, position, kind)
  values (v_funnel, 'Convertido', 1, 'ganho');
  insert into public.lead_funnel_stages (funnel_id, name, position, kind)
  values (v_funnel, 'Perdido', 2, 'perda');

  insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id)
  values (v_lead, v_funnel, v_stage);

  perform set_config('rls_regression.funnel_restricted_lead', v_lead::text, true);
  perform set_config('rls_regression.funnel_restricted_id', v_funnel::text, true);
  perform set_config('rls_regression.funnel_restricted_stage', v_stage::text, true);
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  v_lead uuid := nullif(current_setting('rls_regression.funnel_restricted_lead', true), '')::uuid;
  v_funnel uuid := nullif(current_setting('rls_regression.funnel_restricted_id', true), '')::uuid;
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;
  if v_lead is null then
    raise notice 'skipped: restricted-funnel fixture was not created';
    return;
  end if;

  -- Sanity: confirm the funnel really is inaccessible to lucas (no default,
  -- no open_to_store, no explicit grant) — otherwise the assertion below
  -- would pass vacuously for the wrong reason.
  if exists (
    select 1 from public.accessible_lead_funnel_ids('00000000-0000-0000-0000-000000000001') a
     where a.funnel_id = v_funnel
  ) then
    raise exception 'lead_funnel_entries fixture: restricted funnel unexpectedly accessible to lucas';
  end if;

  -- The load-bearing invariant: lucas still reads his OWN membership even
  -- though the funnel it lives in is closed to him.
  if (select count(*) from public.lead_funnel_entries where lead_id = v_lead and funnel_id = v_funnel) <> 1 then
    raise exception 'lead_funnel_entries: lucas must still read his own membership in a funnel he cannot open';
  end if;
end $$;

reset role;

-- Composite FK: a membership cannot reference a stage from another funnel.
-- Reuses the restricted-funnel fixture arranged above (its stage) against the
-- store's default funnel — a pairing that cannot exist in lead_funnel_stages.
do $$
declare
  v_lead uuid := nullif(current_setting('rls_regression.funnel_restricted_lead', true), '')::uuid;
  restricted_stage uuid := nullif(current_setting('rls_regression.funnel_restricted_stage', true), '')::uuid;
  default_funnel uuid;
  blocked boolean := false;
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;
  if v_lead is null or restricted_stage is null then
    raise notice 'skipped: restricted-funnel fixture was not created';
    return;
  end if;

  select f.id into default_funnel from public.lead_funnels f
   where f.store_id = '00000000-0000-0000-0000-000000000001' and f.is_default limit 1;
  if default_funnel is null then
    raise notice 'skipped: default funnel not backfilled yet';
    return;
  end if;

  begin
    insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id)
    values (v_lead, default_funnel, restricted_stage);
    raise exception 'lead_funnel_entries: composite FK did not reject a stage from another funnel';
  exception
    when foreign_key_violation then
      raise notice 'ok: composite FK rejected the cross-funnel stage';
  end;
end $$;

-- Cleanup (superuser): remove the restricted-funnel fixture used by both
-- checks above (belt-and-suspenders; the whole script rolls back anyway).
do $$
declare
  v_lead uuid := nullif(current_setting('rls_regression.funnel_restricted_lead', true), '')::uuid;
  v_funnel uuid := nullif(current_setting('rls_regression.funnel_restricted_id', true), '')::uuid;
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;
  if v_lead is null then
    return;
  end if;
  delete from public.lead_funnels where id = v_funnel; -- cascades stages + entries
  delete from public.leads where id = v_lead;
end $$;

-- Arrange (superuser, rolled back): two leads for the derive-trigger test —
-- one owned by the store owner (lucas has no claim on it), one owned by
-- lucas himself.
do $$
declare
  v_victim uuid := gen_random_uuid();
  v_own uuid := gen_random_uuid();
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;

  insert into public.leads (id, store_id, seller_id, name, phone, stage, temperature, origin, conversations, tags)
  values
    (v_victim, '00000000-0000-0000-0000-000000000001', '57706ecc-01b5-4a96-b403-0359a4bb767f',
     'RLS Fixture — lead alheio (forge test)', '+5555999993333',
     '{"id":"stage-novo","name":"Novo","color":"#5b6b7a","order":1}'::jsonb, 'frio', 'whatsapp', '{}', '{}'),
    (v_own, '00000000-0000-0000-0000-000000000001', '5a6400ed-5aec-4bf1-b641-31635f15c887',
     'RLS Fixture — lead do lucas (forge test)', '+5555999994444',
     '{"id":"stage-novo","name":"Novo","color":"#5b6b7a","order":1}'::jsonb, 'frio', 'whatsapp', '{}', '{}');

  perform set_config('rls_regression.funnel_forge_victim_lead', v_victim::text, true);
  perform set_config('rls_regression.funnel_forge_own_lead', v_own::text, true);
end $$;

-- Derive trigger makes seller_id unforgeable: store_id/seller_id are always
-- overwritten from the lead itself (before-insert trigger), and the with
-- check re-evaluates AFTER that overwrite — so a forged value cannot buy a
-- non-staff caller access to someone else's lead; it fails the check outright
-- rather than landing and merely staying invisible. Mirrors the exact wording
-- of the design comment in 20260723121000_lead_funnels_rls.sql: "the with
-- check is evaluated against unforgeable values — a forged membership fails
-- it rather than passing."
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  lucas uuid := '5a6400ed-5aec-4bf1-b641-31635f15c887';
  victim_lead uuid := nullif(current_setting('rls_regression.funnel_forge_victim_lead', true), '')::uuid;
  own_lead uuid := nullif(current_setting('rls_regression.funnel_forge_own_lead', true), '')::uuid;
  target_funnel uuid;
  target_stage uuid;
  blocked boolean := false;
  new_entry uuid;
  landed_owner uuid;
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;
  if victim_lead is null or own_lead is null then
    raise notice 'skipped: forge-test lead fixtures were not created';
    return;
  end if;

  select f.id into target_funnel from public.lead_funnels f
   where f.store_id = '00000000-0000-0000-0000-000000000001' and f.is_default limit 1;
  select s.id into target_stage from public.lead_funnel_stages s
   where s.funnel_id = target_funnel and s.kind = 'entrada' limit 1;
  if target_funnel is null or target_stage is null then
    raise notice 'skipped: default funnel not backfilled yet';
    return;
  end if;

  -- (a) Forge seller_id = himself over a lead lucas does NOT own: the trigger
  -- re-derives seller_id to the real owner, which then fails the with check
  -- for a non-staff caller — insert rejected outright.
  begin
    insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id, seller_id)
    values (victim_lead, target_funnel, target_stage, lucas);
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'lead_funnel_entries: forging seller_id over another seller''s lead should be rejected';
  end if;

  -- (b) Forge seller_id = someone else over lucas's OWN lead: the trigger
  -- re-derives the real (his own) owner regardless of what was submitted —
  -- the forged value never survives.
  insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id, seller_id)
  values (own_lead, target_funnel, target_stage, '57706ecc-01b5-4a96-b403-0359a4bb767f')
  returning id into new_entry;

  select seller_id into landed_owner from public.lead_funnel_entries where id = new_entry;
  if landed_owner is distinct from lucas then
    raise exception 'derive trigger failed: forged entry landed on % instead of the real owner %', landed_owner, lucas;
  end if;
end $$;

reset role;

-- Cleanup (superuser): remove both forge-test leads (cascades any entries).
do $$
declare
  v1 uuid := nullif(current_setting('rls_regression.funnel_forge_victim_lead', true), '')::uuid;
  v2 uuid := nullif(current_setting('rls_regression.funnel_forge_own_lead', true), '')::uuid;
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;
  if v1 is null and v2 is null then
    return;
  end if;
  delete from public.leads where id in (v1, v2);
end $$;

-- Sync trigger: changing a lead's owner propagates to every membership.
-- Self-contained fixture (superuser, rolled back): a fresh lead owned by
-- lucas with one membership in the default funnel.
do $$
declare
  v_lead uuid := gen_random_uuid();
  default_funnel uuid;
  entry_stage uuid;
  mismatched int;
begin
  if current_setting('test.funnels_ready', true) is distinct from 'true' then
    return;
  end if;

  select f.id into default_funnel from public.lead_funnels f
   where f.store_id = '00000000-0000-0000-0000-000000000001' and f.is_default limit 1;
  if default_funnel is null then
    raise notice 'skipped: default funnel not backfilled yet';
    return;
  end if;
  select s.id into entry_stage from public.lead_funnel_stages s
   where s.funnel_id = default_funnel and s.kind = 'entrada' limit 1;

  insert into public.leads (id, store_id, seller_id, name, phone, stage, temperature, origin, conversations, tags)
  values (v_lead, '00000000-0000-0000-0000-000000000001', '5a6400ed-5aec-4bf1-b641-31635f15c887',
          'RLS Fixture — lead sync trigger', '+5555999995555',
          '{"id":"stage-novo","name":"Novo","color":"#5b6b7a","order":1}'::jsonb, 'frio', 'whatsapp', '{}', '{}');
  insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id)
  values (v_lead, default_funnel, entry_stage);

  update public.leads set seller_id = '57706ecc-01b5-4a96-b403-0359a4bb767f' where id = v_lead;

  select count(*) into mismatched
    from public.lead_funnel_entries
   where lead_id = v_lead and seller_id is distinct from '57706ecc-01b5-4a96-b403-0359a4bb767f'::uuid;
  if mismatched > 0 then
    raise exception 'sync trigger left % membership(s) on the old owner', mismatched;
  end if;

  -- Cleanup (belt-and-suspenders; the whole script rolls back anyway).
  delete from public.leads where id = v_lead; -- cascades the membership
end $$;

select 'ALL RLS REGRESSION TESTS PASSED' as result;

rollback;
