-- PRD-120 — provider health monitoring + failover automation.
--
-- 1) public.whatsapp_health_tick(): pg_cron job (*/5) that evaluates each
--    account from the integration_logs error rate (15min window, attribution
--    by provider — integration_name = 'whatsapp_' || provider, the same
--    granularity the PRD's own view uses), transitions current_state,
--    auto-activates failover (policy=automatic, state down/paused) and
--    auto-restores after 30min continuously healthy. Thresholds mirror the
--    TS engine `src/providers/whatsapp/failover.ts` (conscious drift, like
--    the derived-notification rules).
--    DEVIATION (recorded): the PRD wants the cron to invoke an Edge Function
--    that also pings provider.healthCheck(). pg_net is NOT enabled in this
--    project (extension install needs explicit owner consent) and there are
--    no real credentials yet — the active healthCheck ping is deferred; the
--    tick is SQL-only (passive, log-based).
--
-- 2) public.whatsapp_provider_health(): owner-only silent-filter RPC (same
--    pattern as whatsapp_delivery_health) feeding the "Provedores WhatsApp"
--    section of /app/gestao/saude — per-account state + 24h call metrics.

create or replace function public.whatsapp_health_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acc record;
  v_total integer;
  v_errors integer;
  v_rate numeric;
  v_new_state text;
  v_actor uuid;
  v_now timestamptz := now();
begin
  for acc in
    select a.id, a.store_id, a.label, a.provider, a.current_state, a.state_changed_at,
           a.failover_policy, a.failover_account_id, a.is_failover_active
      from public.whatsapp_accounts a
  loop
    select count(*),
           count(*) filter (where il.http_status is null or il.http_status >= 400)
      into v_total, v_errors
      from public.integration_logs il
     where il.integration_name = 'whatsapp_' || acc.provider
       and il.direction = 'outbound'
       and il.created_at > v_now - interval '15 minutes';

    -- RF-020 ladder (mirrors evaluateAccountState): paused is sticky; below
    -- 5 calls the window has no statistical meaning — keep the known state.
    if acc.current_state = 'paused' then
      v_new_state := 'paused';
    elsif v_total < 5 then
      v_new_state := acc.current_state;
    else
      v_rate := v_errors::numeric / v_total;
      v_new_state := case
        when v_rate >= 0.7 then 'down'
        when v_rate >= 0.1 then 'degraded'
        else 'healthy'
      end;
    end if;

    -- Audit actor: the store manager (system transitions need a uuid actor).
    select s.manager_id into v_actor from public.stores s where s.id = acc.store_id;

    if v_new_state <> acc.current_state then
      update public.whatsapp_accounts
         set current_state = v_new_state, state_changed_at = v_now
       where id = acc.id;

      if v_actor is not null then
        insert into public.audit_logs (store_id, actor_id, action, resource, resource_id, before, after)
        values (acc.store_id, v_actor, 'provider_state_changed', 'whatsapp_account', acc.id::text,
                jsonb_build_object('state', acc.current_state),
                jsonb_build_object('state', v_new_state, 'errorRate', v_rate, 'calls', v_total, 'source', 'health_tick'));
      end if;

      -- RF-080: in-app alert to the manager on degraded/down (informative on
      -- recovery). Email stays gated on the Resend activation (#52).
      if v_actor is not null then
        insert into public.notifications
          (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
           store_id, title, body, status, channels, source, created_at)
        values
          ('whatsapp-provider-state-' || acc.id || '-' || extract(epoch from v_now)::bigint,
           'event', 'whatsapp_provider_state', 'system',
           case when v_new_state in ('down', 'paused') then 'critical'
                when v_new_state = 'degraded' then 'warning' else 'info' end,
           v_actor::text, 'seller', acc.store_id,
           'Conta WhatsApp "' || acc.label || '" mudou para ' || v_new_state,
           'Taxa de erro nos últimos 15 minutos: ' || coalesce(round(v_rate * 100)::text, '–') || '% (' || v_total || ' chamadas).',
           'unread', array['inApp']::text[], 'rule', v_now);
      end if;

      acc.current_state := v_new_state;
      acc.state_changed_at := v_now;
    end if;

    -- RF-030: auto-activate (policy=automatic, state down/paused).
    if acc.failover_policy = 'automatic'
       and acc.failover_account_id is not null
       and not acc.is_failover_active
       and acc.current_state in ('down', 'paused') then
      update public.whatsapp_accounts set is_failover_active = true where id = acc.id;
      if v_actor is not null then
        insert into public.audit_logs (store_id, actor_id, action, resource, resource_id, after)
        values (acc.store_id, v_actor, 'failover_activated', 'whatsapp_account', acc.id::text,
                jsonb_build_object('toAccountId', acc.failover_account_id, 'reason', acc.current_state, 'source', 'health_tick'));
        insert into public.notifications
          (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
           store_id, title, body, status, channels, source, created_at)
        values
          ('whatsapp-failover-on-' || acc.id || '-' || extract(epoch from v_now)::bigint,
           'event', 'whatsapp_failover', 'system', 'critical', v_actor::text, 'seller', acc.store_id,
           'Failover ATIVADO para a conta "' || acc.label || '"',
           'Novos envios desta conta passam a sair pela conta reserva até a restauração.',
           'unread', array['inApp']::text[], 'rule', v_now);
      end if;

    -- RF-031: auto-restore after >= 30min continuously healthy.
    elsif acc.is_failover_active
       and acc.current_state = 'healthy'
       and acc.state_changed_at is not null
       and acc.state_changed_at <= v_now - interval '30 minutes' then
      update public.whatsapp_accounts set is_failover_active = false where id = acc.id;
      if v_actor is not null then
        insert into public.audit_logs (store_id, actor_id, action, resource, resource_id, after)
        values (acc.store_id, v_actor, 'failover_deactivated', 'whatsapp_account', acc.id::text,
                jsonb_build_object('reason', 'auto-restore', 'source', 'health_tick'));
        insert into public.notifications
          (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
           store_id, title, body, status, channels, source, created_at)
        values
          ('whatsapp-failover-off-' || acc.id || '-' || extract(epoch from v_now)::bigint,
           'event', 'whatsapp_failover', 'system', 'info', v_actor::text, 'seller', acc.store_id,
           'Failover desativado — conta "' || acc.label || '" restaurada',
           'O provedor ficou saudável por 30 minutos; os envios voltaram à conta principal.',
           'unread', array['inApp']::text[], 'rule', v_now);
      end if;
    end if;
  end loop;
end;
$$;

comment on function public.whatsapp_health_tick() is
  'PRD-120: per-account state evaluation (integration_logs error rate) + failover auto-activate/restore. Runs from pg_cron only.';

revoke all on function public.whatsapp_health_tick() from public, anon, authenticated;

select cron.schedule('whatsapp-health-tick', '*/5 * * * *',
  $cmd$ select public.whatsapp_health_tick(); $cmd$);

-- 2) Owner-only provider-health snapshot (RF-060/070, house pattern: RPC with
--    silent owner filter instead of a view + RLS).
create or replace function public.whatsapp_provider_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.current_app_role() = 'owner' then
    coalesce((
      select jsonb_agg(acc order by acc->>'label')
      from (
        select jsonb_build_object(
          'accountId', a.id,
          'label', a.label,
          'provider', a.provider,
          'status', a.status,
          'currentState', a.current_state,
          'stateChangedAt', a.state_changed_at,
          'failoverPolicy', a.failover_policy,
          'failoverAccountId', a.failover_account_id,
          'failoverLabel', fb.label,
          'isFailoverActive', a.is_failover_active,
          'totalCalls24h', coalesce(m.total_calls, 0),
          'errorCalls24h', coalesce(m.error_calls, 0),
          'latencyP95Ms', m.latency_p95
        ) as acc
        from public.whatsapp_accounts a
        left join public.whatsapp_accounts fb on fb.id = a.failover_account_id
        left join lateral (
          select count(*) as total_calls,
                 count(*) filter (where il.http_status is null or il.http_status >= 400) as error_calls,
                 round(percentile_cont(0.95) within group (order by il.latency_ms))::int as latency_p95
            from public.integration_logs il
           where il.integration_name = 'whatsapp_' || a.provider
             and il.direction = 'outbound'
             and il.created_at > now() - interval '24 hours'
        ) m on true
      ) t
    ), '[]'::jsonb)
  else null end;
$$;

comment on function public.whatsapp_provider_health() is
  'PRD-120: per-account provider health (state + 24h call metrics by provider). Owner-only silent filter.';

revoke execute on function public.whatsapp_provider_health() from public, anon;
grant execute on function public.whatsapp_provider_health() to authenticated;
