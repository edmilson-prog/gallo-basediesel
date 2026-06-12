-- Real-inbox follow-up (PR #69): archiving the Fase-1 seed conversations
-- (tagged `demo-seed`) left their fictitious outbound messages in the table.
-- The per-account WhatsApp delivery RPCs join `conversations` → `messages`
-- WITHOUT excluding those archived seed rows, so the Admin → WhatsApp KPI card
-- and the saúde dashboard counted 64 "Enviadas (30d)" / 2 "Falhas" that are
-- pure demo noise (the connected Evolution account had 0 real sends).
--
-- Fix: both delivery RPCs now ignore `demo-seed` conversations. Real
-- conversations are never tagged `demo-seed`, so every real send still counts
-- regardless of conversation status (an archived REAL conversation keeps its
-- throughput). Null-safe guard: `(...) is not true` keeps rows whose `tags`
-- is null or lacks the marker. No data is touched — the seed dataset stays
-- intact for future consultation; it is only filtered out of real metrics.

-- 1) whatsapp_account_metrics (PR #67 / settings KPI card, 30-day window).
create or replace function public.whatsapp_account_metrics(
  p_account_id uuid,
  p_days integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.current_app_role() in ('owner', 'manager') then
    (
      select jsonb_build_object(
        'windowDays', p_days,
        'sent', count(*) filter (where m.status in ('sent', 'delivered', 'read')),
        'failed', count(*) filter (where m.status = 'failed'),
        'lastOutboundAt', max(m.sent_at)
      )
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where c.whatsapp_account_id = p_account_id
        and m.direction = 'out'
        and m.sent_at > now() - make_interval(days => p_days)
        and ('demo-seed' = any(c.tags)) is not true
    )
  else null end;
$$;

comment on function public.whatsapp_account_metrics(uuid, integer) is
  'Per-account outbound WhatsApp metrics (sent/failed/last over N days). Staff-only silent filter. Excludes demo-seed conversations.';

revoke execute on function public.whatsapp_account_metrics(uuid, integer) from public, anon;
grant execute on function public.whatsapp_account_metrics(uuid, integer) to authenticated;

-- 2) whatsapp_delivery_health (PRD-118 / saúde dashboard, sliding hour window).
create or replace function public.whatsapp_delivery_health(p_hours integer default 24)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.current_app_role() = 'owner' then
    jsonb_build_object(
      'windowHours', p_hours,
      'accounts', coalesce((
        select jsonb_agg(acc order by acc->>'label')
        from (
          select jsonb_build_object(
            'accountId', wa.id,
            'label', wa.label,
            'provider', wa.provider,
            'total', count(m.id),
            'queued', count(*) filter (where m.status = 'queued'),
            'sent', count(*) filter (where m.status in ('sent', 'delivered', 'read')),
            'delivered', count(*) filter (where m.status in ('delivered', 'read')),
            'read', count(*) filter (where m.status = 'read'),
            'failed', count(*) filter (where m.status = 'failed')
          ) as acc
          from public.whatsapp_accounts wa
          join public.conversations c on c.whatsapp_account_id = wa.id
          join public.messages m on m.conversation_id = c.id
          where m.direction = 'out'
            and m.sent_at > now() - make_interval(hours => p_hours)
            and ('demo-seed' = any(c.tags)) is not true
          group by wa.id, wa.label, wa.provider
        ) t
      ), '[]'::jsonb),
      'topFailures', coalesce((
        select jsonb_agg(f)
        from (
          select jsonb_build_object(
            'failureCode', coalesce(m.failure_code, 'unknown'),
            'failureReason', max(m.failure_reason),
            'count', count(*)
          ) as f
          from public.messages m
          join public.conversations c on c.id = m.conversation_id
          where m.direction = 'out'
            and m.status = 'failed'
            and m.sent_at > now() - make_interval(hours => p_hours)
            and ('demo-seed' = any(c.tags)) is not true
          group by coalesce(m.failure_code, 'unknown')
          order by count(*) desc
          limit 5
        ) tf
      ), '[]'::jsonb)
    )
  else null end;
$$;

comment on function public.whatsapp_delivery_health(integer) is
  'PRD-118: WhatsApp delivery health (per-account aggregates + top failure codes). Owner-only silent filter. Excludes demo-seed conversations.';

revoke execute on function public.whatsapp_delivery_health(integer) from public, anon;
grant execute on function public.whatsapp_delivery_health(integer) to authenticated;
