-- Idle-conversation alerts (spec docs/superpowers/specs/2026-07-16-idle-conversation-alerts-design.md).
-- 1) awaiting_reply_since column + triggers + backfill + partial index
-- 2) idle_business_seconds (SQL mirror of src/features/idle-alerts/engine/idleBusinessTime.ts)
-- 3) idle_conversations_summary() gated-once RPC
-- 4) conversa.ociosa rule inside reconcile_derived_notifications()
--
-- Schema notes (verified against supabase/migrations/*, NOT assumed):
-- - public.messages.direction is 'in' | 'out' (NOT 'inbound'/'outbound') — see
--   20260608151417_create_messages_table.sql + every later migration that reads it
--   (e.g. 20260610143952_whatsapp_117_last_inbound_at.sql, 20260716183000).
-- - public.messages has no `content` column — the text column is `text`.
-- - public.messages canonical "when it happened" timestamp is `sent_at`, not
--   `created_at`. `created_at` is when OUR server persisted the row (can lag
--   `sent_at` for inbound — see the docblock in
--   src/providers/data/impl/supabase/messages.ts). Every existing ordering/
--   windowing use of messages in this codebase (indexes, last_inbound_at(),
--   analytics since/until, conversation_messages RPC) keys off `sent_at`, so
--   this migration follows that convention throughout.
-- - public.conversations.id / customers.id / messages.id / leads.id / sellers.id /
--   stores.id are all uuid (converted from the original faker text ids by
--   20260608174030_convert_transactional_pks_to_uuid.sql +
--   20260608182429_convert_reference_pks_to_uuid.sql). BUT
--   public.conversations.lead_id stays TEXT — it was never given an FK
--   (create_conversations_table.sql comment: "lead_id ... FK added later"), so
--   the uuid-conversion scripts never touched it. Every later migration that
--   joins leads to conversations casts `leads.id::text = conversations.lead_id`
--   (e.g. 20260615131000_search_conversations.sql) — mirrored below.
-- - public.sellers.work_schedule (jsonb) exists since
--   20260616170000_sellers_work_schedule.sql (PRD-212).
-- - public.current_seller_id() / public.current_store_id() exist (uuid-returning,
--   JWT-claim based) since 20260609114034_rls_helpers_drop_profiles_fallback.sql.
-- - public.notifications.severity / .channels have no CHECK constraint; 'critical'
--   and 'toast' are already valid per src/shared/types/notification.ts
--   (NotificationSeverity / NotificationChannel) and 'critical' is already used
--   by other reconciler-adjacent migrations (e.g. 20260610153000).
-- - public.reconcile_derived_notifications() has exactly ONE prior definition
--   (20260609232819_notif_44_server_side_derived_reconciler.sql) — that is the
--   verbatim base for the 3 existing rules below.

-- 1. Column ------------------------------------------------------------------
alter table public.conversations
  add column if not exists awaiting_reply_since timestamptz;

create index if not exists idx_conversations_awaiting_reply
  on public.conversations (store_id, assigned_seller_id)
  where awaiting_reply_since is not null
    and status in ('aguardando','em_andamento','aguardando_cliente');

-- Set on first unanswered inbound, clear on any outbound. SECURITY DEFINER: an
-- outbound send by a seller must be able to clear the conversation's flag even
-- though the RLS `conversations_update` policy is scoped by access model, not
-- by this column specifically (mirrors the SECURITY DEFINER trigger already on
-- this same table: public.sdr_pause_on_human_message(), see
-- 20260714120100_sdr_pause_on_human_message.sql).
create or replace function public.sync_conversation_awaiting_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'in' then
    update public.conversations
       set awaiting_reply_since = coalesce(awaiting_reply_since, new.sent_at)
     where id = new.conversation_id;
  elsif new.direction = 'out' then
    update public.conversations
       set awaiting_reply_since = null
     where id = new.conversation_id and awaiting_reply_since is not null;
  end if;
  return new;
end $$;

drop trigger if exists trg_messages_awaiting_reply on public.messages;
create trigger trg_messages_awaiting_reply
  after insert on public.messages
  for each row execute function public.sync_conversation_awaiting_reply();

-- Closing the conversation clears the pending flag. Runs BEFORE UPDATE on the
-- row already being updated by its own caller, so no elevated privilege is
-- needed here (mirrors public.set_conversation_queued_at(), the sibling
-- BEFORE-trigger on this same table — 20260703140000_conversation_queued_at.sql).
create or replace function public.clear_conversation_awaiting_reply_on_close()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('resolvida','arquivada') then
    new.awaiting_reply_since := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_conversations_awaiting_clear on public.conversations;
create trigger trg_conversations_awaiting_clear
  before update of status on public.conversations
  for each row execute function public.clear_conversation_awaiting_reply_on_close();

-- Backfill open conversations: first inbound after the last outbound.
update public.conversations cv
   set awaiting_reply_since = sub.first_unanswered
  from (
    select c.id,
      (select min(m.sent_at) from public.messages m
        where m.conversation_id = c.id and m.direction = 'in'
          and m.sent_at > coalesce(
            (select max(o.sent_at) from public.messages o
              where o.conversation_id = c.id and o.direction = 'out'),
            'epoch'::timestamptz)
      ) as first_unanswered
    from public.conversations c
    where c.status in ('aguardando','em_andamento','aguardando_cliente')
  ) sub
 where cv.id = sub.id and sub.first_unanswered is not null;

-- 2. Business-time function (STRICT parity with idleBusinessTime.ts) ---------
-- Accumulates fractional seconds across windows and floors ONCE at the very
-- end (mirrors the JS side's `Math.floor(total / 1000)` over a millisecond
-- accumulator) instead of flooring per-window — the two must agree even when
-- p_from/p_to carry sub-second precision.
create or replace function public.idle_business_seconds(
  p_schedule jsonb, p_from timestamptz, p_to timestamptz
) returns bigint language plpgsql immutable set search_path = '' as $$
declare
  v_from timestamptz;
  v_total numeric := 0;
  v_day date;
  v_last_day date;
  v_weekday int;
  v_win record;
  v_open int; v_close int;
  v_start timestamptz; v_end timestamptz;
  v_overlap numeric;
begin
  if p_to is null or p_from is null or p_to <= p_from then return 0; end if;
  -- 90-day clamp (mirror of CLAMP_DAYS).
  v_from := greatest(p_from, p_to - interval '90 days');

  if p_schedule is null or jsonb_typeof(p_schedule) <> 'array'
     or not exists (select 1 from jsonb_array_elements(p_schedule) w
                    where coalesce((w->>'enabled')::bool, false)) then
    return floor(extract(epoch from (p_to - v_from)))::bigint;
  end if;

  -- Walk São Paulo calendar days (fixed UTC-03:00).
  v_day := ((v_from at time zone 'utc') - interval '3 hours')::date;
  v_last_day := ((p_to at time zone 'utc') - interval '3 hours')::date;
  while v_day <= v_last_day loop
    v_weekday := extract(dow from v_day)::int;
    -- defensive parsing: mirror of timeToMinutes (invalid window ⇒ skipped, never fatal)
    for v_win in
      select w->>'openAt' open_at, w->>'closeAt' close_at
        from jsonb_array_elements(p_schedule) w
       where coalesce((w->>'enabled')::bool, false)
         and (w->>'weekday') ~ '^[0-6]$'
         and (w->>'weekday')::int = v_weekday
         and trim(w->>'openAt')  ~ '^\d{1,2}:\d{2}$'
         and trim(w->>'closeAt') ~ '^\d{1,2}:\d{2}$'
    loop
      v_open  := split_part(trim(v_win.open_at),  ':', 1)::int * 60 + split_part(trim(v_win.open_at),  ':', 2)::int;
      v_close := split_part(trim(v_win.close_at), ':', 1)::int * 60 + split_part(trim(v_win.close_at), ':', 2)::int;
      if v_open >= 24*60 or v_close >= 24*60
         or split_part(trim(v_win.open_at),':',2)::int > 59
         or split_part(trim(v_win.close_at),':',2)::int > 59 then continue; end if;
      if v_close <= v_open then continue; end if;
      -- Window instants back in UTC (+3h).
      v_start := (v_day::timestamp + make_interval(mins => v_open))  at time zone 'utc' + interval '3 hours';
      v_end   := (v_day::timestamp + make_interval(mins => v_close)) at time zone 'utc' + interval '3 hours';
      v_overlap := extract(epoch from (least(v_end, p_to) - greatest(v_start, v_from)));
      if v_overlap > 0 then v_total := v_total + v_overlap; end if;
    end loop;
    v_day := v_day + 1;
  end loop;
  return floor(v_total)::bigint;
end $$;

-- 3. Summary RPC (gated-once: resolves the seller ONCE from the JWT) ---------
-- SECURITY DEFINER + search_path pinned + EXECUTE revoked from public/anon:
-- same "gated-once" shape as public.count_conversations() (the RPC this one
-- is explicitly modeled after — see 20260702180000_count_conversations_rpc.sql).
create or replace function public.idle_conversations_summary()
returns table (
  conversation_id uuid,
  contact_name text,
  last_inbound_preview text,
  awaiting_reply_since timestamptz,
  business_seconds bigint,
  idle_level int
) language sql stable security definer set search_path = '' as $$
  with me as (
    select public.current_seller_id() sid, public.current_store_id() stid
  ),
  cfg as (
    select coalesce((s.settings->'idleAlerts'->>'enabled')::bool, false) idle_on,
           coalesce((s.settings->'idleAlerts'->>'level1Hours')::numeric, 2)  l1,
           coalesce((s.settings->'idleAlerts'->>'level2Hours')::numeric, 8)  l2,
           coalesce((s.settings->'idleAlerts'->>'level3Hours')::numeric, 24) l3
      from public.stores s join me on s.id = me.stid
  ),
  sched as (
    select sel.work_schedule ws from public.sellers sel join me on sel.id = me.sid
  ),
  base as (
    select c.id, c.awaiting_reply_since, c.customer_id, c.lead_id,
           public.idle_business_seconds((select ws from sched), c.awaiting_reply_since, now()) secs
      from public.conversations c
      join me on c.assigned_seller_id = me.sid
     where c.awaiting_reply_since is not null
       and c.status in ('aguardando','em_andamento','aguardando_cliente')
       and (select idle_on from cfg)
  )
  select b.id,
         coalesce(cu.nome_fantasia, cu.full_name, ld.name, 'Contato') contact_name,
         (select m.text from public.messages m
           where m.conversation_id = b.id and m.direction = 'in'
           order by m.sent_at desc limit 1) last_inbound_preview,
         b.awaiting_reply_since, b.secs,
         case when b.secs >= (select l3 from cfg) * 3600 then 3
              when b.secs >= (select l2 from cfg) * 3600 then 2
              else 1 end idle_level
    from base b
    left join public.customers cu on cu.id = b.customer_id
    left join public.leads ld on ld.id::text = b.lead_id
   where b.secs >= (select l1 from cfg) * 3600
   order by 6 desc, 5 desc
   limit 500;
$$;

revoke all on function public.idle_conversations_summary() from public, anon;
grant execute on function public.idle_conversations_summary() to authenticated;

-- 4. Reconciler: add the conversa.ociosa rule ---------------------------------
-- FULL replacement of reconcile_derived_notifications(): the 3 existing rules
-- (cfg/dormente/loads/vendedor/semresp/u — cliente.dormente,
-- vendedor.sobrecarregado, conversa.semResposta) are preserved VERBATIM from
-- the sole prior definition (20260609232819_notif_44_server_side_derived_reconciler.sql,
-- confirmed the only migration that ever defines this function), with ONLY a
-- mechanical extension: `_cur` gains `severity`/`channels` columns (sourced
-- per-row from each rule's `sev`/`chans`) so the new rule below can emit
-- 'critical'/['inApp','toast'] while the 3 old rules keep their original
-- hardcoded 'warning'/['inApp'] — same values, just no longer hardcoded once
-- at the final INSERT.
create or replace function public.reconcile_derived_notifications()
returns void language plpgsql security definer set search_path = public as $fn$
declare now_ts timestamptz := now();
begin
  create temp table _cur on commit drop as
  with cfg as (
    select s.id store_id, s.manager_id,
      coalesce((s.settings->'managerDashboard'->>'alertClienteADormenteEnabled')::bool,false) cli_on,
      coalesce((s.settings->'managerDashboard'->>'alertVendedorSobrecarregadoEnabled')::bool,false) ven_on,
      coalesce((s.settings->'managerDashboard'->>'alertConversaSemRespostaEnabled')::bool,false) con_on,
      coalesce((s.settings->'managerDashboard'->>'sellerOverloadThreshold')::int,15) over_n,
      coalesce(s.settings->'managerDashboard'->>'sellerOverloadThreshold','15') over_txt,
      coalesce((s.settings->'managerDashboard'->>'conversationWaitingHoursThreshold')::numeric,4) wait_h,
      coalesce(s.settings->'managerDashboard'->>'conversationWaitingHoursThreshold','4') wait_txt
    from public.stores s where s.settings ? 'managerDashboard'
  ),
  dormente as (
    select c.store_id, 'cliente-a-dormente-'||c.id hash, 'cliente.dormente' type,'commercial' cat, r.rid,
      'Cliente A dormente: '||case when c.type='B2B' then coalesce(c.nome_fantasia,c.full_name) else c.full_name end
      ||' — '||(case when c.last_purchase_at is null then 0
                else greatest(1,round(extract(epoch from (now_ts-c.last_purchase_at))/86400.0))::int end)
      ||' dia'||case when (case when c.last_purchase_at is null then 0
                else greatest(1,round(extract(epoch from (now_ts-c.last_purchase_at))/86400.0))::int end)=1 then '' else 's' end
      ||' sem compra' title,
      'warning' sev, array['inApp']::text[] chans
    from cfg join public.customers c on c.store_id=cfg.store_id
    cross join lateral (select distinct unnest(array_remove(array[c.seller_id,cfg.manager_id],null::uuid)) rid) r
    where cfg.cli_on and c.abc_class='A' and c.status='dormente'
  ),
  loads as (
    select cfg.store_id, sel.id sid, sel.full_name, cfg.manager_id, cfg.over_n, cfg.over_txt,
      count(cv.id) load from cfg
      join public.sellers sel on sel.store_id=cfg.store_id
      left join public.conversations cv on cv.assigned_seller_id=sel.id and cv.store_id=cfg.store_id
        and cv.status in ('aguardando','em_andamento','aguardando_cliente')
    where cfg.ven_on group by cfg.store_id,sel.id,sel.full_name,cfg.manager_id,cfg.over_n,cfg.over_txt
  ),
  vendedor as (
    select store_id,'vendedor-sobrecarregado-'||sid hash,'vendedor.sobrecarregado' type,'operational' cat,
      manager_id rid, full_name||' está sobrecarregado — '||load||' conversas ativas (limite '||over_txt||')' title,
      'warning' sev, array['inApp']::text[] chans
    from loads where load>over_n and manager_id is not null
  ),
  semresp as (
    select cfg.store_id,'conversa-sem-resposta' hash,'conversa.semResposta' type,'operational' cat,
      cfg.manager_id rid, n.c||' conversa'||case when n.c=1 then '' else 's' end
      ||' sem resposta há mais de '||cfg.wait_txt||'h' title,
      'warning' sev, array['inApp']::text[] chans
    from cfg cross join lateral (select count(*) c from public.conversations cv
      where cv.store_id=cfg.store_id and cv.status='aguardando'
        and cv.last_message_at < now_ts-(cfg.wait_h*interval '1 hour')) n
    where cfg.con_on and cfg.manager_id is not null and n.c>0
  ),
  u as (select store_id,hash,type,cat,rid,title,sev,chans from dormente
        union all select store_id,hash,type,cat,rid,title,sev,chans from vendedor
        union all select store_id,hash,type,cat,rid,title,sev,chans from semresp)
  select distinct 'derived:'||hash||':'||rid::text dedupe_key, type, cat category,
    rid::text recipient_id, store_id, title, sev severity, chans channels
    from u where rid is not null;

  -- conversa.ociosa (spec 2026-07-16) — ISOLATED exception-safe block: a
  -- failure here (e.g. malformed work_schedule jsonb) must never take down
  -- the 3 pre-existing derived rules above.
  begin
    insert into _cur (dedupe_key, type, category, recipient_id, store_id, title, severity, channels)
    with icfg as (
      select s.id store_id, s.manager_id,
        coalesce((s.settings->'idleAlerts'->>'enabled')::bool,false) idle_on,
        coalesce((s.settings->'idleAlerts'->>'level2Hours')::numeric,8)  l2_h,
        coalesce((s.settings->'idleAlerts'->>'level3Hours')::numeric,24) l3_h,
        coalesce((s.settings->'idleAlerts'->>'notifyManagerOnLevel3')::bool,true) mgr_on
      from public.stores s where s.settings ? 'idleAlerts'
    ),
    idle as (
      select cv.store_id, cv.assigned_seller_id sid, sel.full_name, icfg.manager_id,
        icfg.mgr_on, icfg.l2_h, icfg.l3_h,
        public.idle_business_seconds(sel.work_schedule, cv.awaiting_reply_since, now_ts) secs
      from icfg
      join public.conversations cv on cv.store_id=icfg.store_id
        and cv.awaiting_reply_since is not null
        and cv.assigned_seller_id is not null
        and cv.status in ('aguardando','em_andamento','aguardando_cliente')
      join public.sellers sel on sel.id=cv.assigned_seller_id
      where icfg.idle_on
    ),
    idle_lvl as (
      select store_id, sid, full_name, manager_id, mgr_on,
        case when secs >= l3_h*3600 then 3
             when secs >= l2_h*3600 then 2
             else 1 end lvl
      from idle
    ),
    ociosa_n2 as (
      select store_id,'conversa-ociosa-n2-'||sid hash,'conversa.ociosa' type,'operational' cat,
        sid rid,
        'Você tem '||count(*)||' conversa'||case when count(*)=1 then '' else 's' end
        ||' aguardando resposta há mais de um dia de trabalho' title,
        'warning' sev, array['inApp','toast']::text[] chans
      from idle_lvl where lvl=2 group by store_id,sid
    ),
    ociosa_n3 as (
      select store_id,'conversa-ociosa-n3-'||sid hash,'conversa.ociosa' type,'operational' cat,
        sid rid,
        'Você tem '||count(*)||' conversa'||case when count(*)=1 then '' else 's' end
        ||' crítica'||case when count(*)=1 then '' else 's' end
        ||' aguardando resposta há vários dias' title,
        'critical' sev, array['inApp','toast']::text[] chans
      from idle_lvl where lvl=3 group by store_id,sid
    ),
    ociosa_mgr as (
      select store_id,'conversa-ociosa-mgr-'||sid hash,'conversa.ociosa' type,'operational' cat,
        manager_id rid,
        full_name||' tem '||count(*)||' conversa'||case when count(*)=1 then '' else 's' end
        ||' crítica'||case when count(*)=1 then '' else 's' end
        ||' aguardando resposta' title,
        'critical' sev, array['inApp']::text[] chans
      from idle_lvl
      where lvl=3 and mgr_on and manager_id is not null and manager_id <> sid
      group by store_id,sid,full_name,manager_id
    ),
    iu as (select store_id,hash,type,cat,rid,title,sev,chans from ociosa_n2
           union all select store_id,hash,type,cat,rid,title,sev,chans from ociosa_n3
           union all select store_id,hash,type,cat,rid,title,sev,chans from ociosa_mgr)
    select distinct 'derived:'||hash||':'||rid::text, type, cat, rid::text, store_id, title, sev, chans
      from iu where rid is not null;
  exception when others then
    raise notice 'conversa.ociosa rule failed: %', sqlerrm;
  end;

  create temp table _scope on commit drop as
    select sel.id::text rid from public.sellers sel join public.stores s on s.id=sel.store_id
      where s.settings ? 'managerDashboard' or s.settings ? 'idleAlerts'
    union select s.manager_id::text from public.stores s
      where (s.settings ? 'managerDashboard' or s.settings ? 'idleAlerts')
        and s.manager_id is not null;

  update public.notifications n set status='archived', expires_at=now_ts
   where n.lifecycle='derived' and n.status<>'archived'
     and n.recipient_id in (select rid from _scope)
     and n.dedupe_key not in (select dedupe_key from _cur);

  insert into public.notifications
    (dedupe_key,lifecycle,type,category,severity,recipient_id,recipient_type,store_id,title,status,channels,source,created_at)
  select c.dedupe_key,'derived',c.type,c.category,c.severity,c.recipient_id,'seller',
         c.store_id,c.title,'unread',c.channels,'rule',now_ts
    from _cur c where not exists (select 1 from public.notifications n
      where n.lifecycle='derived' and n.dedupe_key=c.dedupe_key);

  update public.notifications n set status='unread', expires_at=null
   where n.lifecycle='derived' and n.status='archived'
     and n.dedupe_key in (select dedupe_key from _cur);
end $fn$;

revoke all on function public.reconcile_derived_notifications() from public, anon, authenticated;

-- NOTE: cron.schedule('reconcile-derived-notifications', ...) is NOT
-- re-executed here — the pg_cron job created by
-- 20260609232819_notif_44_server_side_derived_reconciler.sql already invokes
-- public.reconcile_derived_notifications() by name every minute, so this
-- CREATE OR REPLACE is picked up automatically on the next tick.
