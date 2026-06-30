-- WhatsApp — per-account "silenciar alertas de desconexão".
--
-- Adds whatsapp_accounts.alerts_muted: when true, the Owner has shelved an
-- intentionally offline instance, so its disconnection/health alerts are
-- suppressed everywhere. The frontend already hides the card/global banner and
-- the TopBar indicator for muted accounts; this migration closes the loop on
-- the SERVER-SIDE in-app notifications.
--
-- SURGICAL: only the *notification* INSERTs are guarded. State transitions,
-- audit_logs and failover auto-activate/restore stay intact — muting silences
-- the alarm, it does not stop monitoring or failover.

alter table public.whatsapp_accounts
  add column if not exists alerts_muted boolean not null default false;

-- 1) Connection trigger (PR #67): skip the "desconectado" critical notification
--    when the account is muted. The reconnect (info) stays — it is good news and
--    signals the mute can be lifted.
create or replace function public.notify_whatsapp_connection_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager uuid;
begin
  if new.status = old.status then
    return new;
  end if;
  -- Only transitions in/out of `connected` are operationally meaningful
  -- (pending shuffles during setup are noise).
  if old.status <> 'connected' and new.status <> 'connected' then
    return new;
  end if;

  select s.manager_id into v_manager from public.stores s where s.id = new.store_id;
  if v_manager is null then
    return new;
  end if;

  if old.status = 'connected' and new.status = 'disconnected'
     and not coalesce(new.alerts_muted, false) then
    insert into public.notifications
      (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
       store_id, title, body, status, channels, source, created_at)
    values
      ('whatsapp-connection-' || new.id || '-down-' || extract(epoch from now())::bigint,
       'event', 'whatsapp_connection', 'system', 'critical', v_manager::text, 'seller',
       new.store_id,
       'WhatsApp "' || new.label || '" desconectado',
       'A sessão do WhatsApp caiu — mensagens não saem nem chegam por esta conta. Reconecte pelo QR code em Configurações → WhatsApp.',
       'unread', array['inApp']::text[], 'rule', now());
  elsif new.status = 'connected' then
    insert into public.notifications
      (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
       store_id, title, body, status, channels, source, created_at)
    values
      ('whatsapp-connection-' || new.id || '-up-' || extract(epoch from now())::bigint,
       'event', 'whatsapp_connection', 'system', 'info', v_manager::text, 'seller',
       new.store_id,
       'WhatsApp "' || new.label || '" conectado',
       'A conta está ativa e pronta para enviar e receber mensagens.',
       'unread', array['inApp']::text[], 'rule', now());
  end if;
  return new;
end;
$$;

comment on function public.notify_whatsapp_connection_change() is
  'Notifies the store manager (in-app) when a WhatsApp account connects/disconnects. PR #67. Skips the disconnect alert when alerts_muted.';

-- 2) Health tick (PRD-120): skip the provider-state notification when muted.
--    The state transition, audit log and failover automation are unchanged.
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
           a.failover_policy, a.failover_account_id, a.is_failover_active, a.alerts_muted
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
      -- recovery). Suppressed when the Owner muted this account's alerts.
      if v_actor is not null and not coalesce(acc.alerts_muted, false) then
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
  'PRD-120: per-account state evaluation (integration_logs error rate) + failover auto-activate/restore. Runs from pg_cron only. Skips the provider-state notification when alerts_muted.';

revoke all on function public.whatsapp_health_tick() from public, anon, authenticated;
