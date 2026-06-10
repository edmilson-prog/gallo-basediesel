-- #44: move the derived-notification reconciler (PRD-008/014) server-side.
-- The 3 time-based conditions (cliente dormente / vendedor sobrecarregado /
-- conversa sem resposta) were computed client-side, gated to staff to satisfy
-- the notifications RLS. This replaces that with a pg_cron job running a
-- SECURITY DEFINER function, so notifications exist even with no client open.
-- User explicitly authorized enabling pg_cron (a persistent infra change).

create extension if not exists pg_cron;

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
      ||' sem compra' title
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
      manager_id rid, full_name||' está sobrecarregado — '||load||' conversas ativas (limite '||over_txt||')' title
    from loads where load>over_n and manager_id is not null
  ),
  semresp as (
    select cfg.store_id,'conversa-sem-resposta' hash,'conversa.semResposta' type,'operational' cat,
      cfg.manager_id rid, n.c||' conversa'||case when n.c=1 then '' else 's' end
      ||' sem resposta há mais de '||cfg.wait_txt||'h' title
    from cfg cross join lateral (select count(*) c from public.conversations cv
      where cv.store_id=cfg.store_id and cv.status='aguardando'
        and cv.last_message_at < now_ts-(cfg.wait_h*interval '1 hour')) n
    where cfg.con_on and cfg.manager_id is not null and n.c>0
  ),
  u as (select store_id,hash,type,cat,rid,title from dormente
        union all select store_id,hash,type,cat,rid,title from vendedor
        union all select store_id,hash,type,cat,rid,title from semresp)
  select distinct 'derived:'||hash||':'||rid::text dedupe_key, type, cat category,
    rid::text recipient_id, store_id, title from u where rid is not null;

  create temp table _scope on commit drop as
    select sel.id::text rid from public.sellers sel join public.stores s on s.id=sel.store_id
      where s.settings ? 'managerDashboard'
    union select s.manager_id::text from public.stores s
      where s.settings ? 'managerDashboard' and s.manager_id is not null;

  update public.notifications n set status='archived', expires_at=now_ts
   where n.lifecycle='derived' and n.status<>'archived'
     and n.recipient_id in (select rid from _scope)
     and n.dedupe_key not in (select dedupe_key from _cur);

  insert into public.notifications
    (dedupe_key,lifecycle,type,category,severity,recipient_id,recipient_type,store_id,title,status,channels,source,created_at)
  select c.dedupe_key,'derived',c.type,c.category,'warning',c.recipient_id,'seller',
         c.store_id,c.title,'unread',array['inApp']::text[],'rule',now_ts
    from _cur c where not exists (select 1 from public.notifications n
      where n.lifecycle='derived' and n.dedupe_key=c.dedupe_key);

  update public.notifications n set status='unread', expires_at=null
   where n.lifecycle='derived' and n.status='archived'
     and n.dedupe_key in (select dedupe_key from _cur);
end $fn$;

revoke all on function public.reconcile_derived_notifications() from public, anon, authenticated;

select cron.schedule('reconcile-derived-notifications','* * * * *',
  $cmd$ select public.reconcile_derived_notifications(); $cmd$);
