-- PRD-118 — WhatsApp status tracking: invalid-number flag, semantic failure
-- code and the owner-only delivery-health aggregate for /app/gestao/saude.

-- 1) customers.whatsapp_status: set to 'invalid' by the webhook on Meta error
--    131026 (number is not on WhatsApp); cleared MANUALLY by staff only.
alter table public.customers
  add column if not exists whatsapp_status text not null default 'unknown'
    check (whatsapp_status in ('unknown', 'valid', 'invalid', 'blocked'));

comment on column public.customers.whatsapp_status is
  'PRD-118: WhatsApp number validity. invalid = Meta 131026 seen; manual revalidation only.';

-- 2) messages.failure_code: semantic provider error code (e.g. Meta numeric
--    code as text) alongside the human failure_reason added by PRD-114.
alter table public.messages
  add column if not exists failure_code text;

comment on column public.messages.failure_code is
  'PRD-118: provider error code of a failed dispatch/status (e.g. ''131026'').';

-- 3) Recent-outbound partial index: serves the delivery-health window scan.
create index if not exists idx_messages_outbound_sent_at
  on public.messages (sent_at desc)
  where direction = 'out';

-- 4) whatsapp_delivery_health: per-account delivery aggregates + top failure
--    codes over a sliding window. SECURITY DEFINER with the same owner-only
--    silent filter as the system_health_* RPCs (PRD-110) — the host dashboard
--    route is Owner-only.
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
          where m.direction = 'out'
            and m.status = 'failed'
            and m.sent_at > now() - make_interval(hours => p_hours)
          group by coalesce(m.failure_code, 'unknown')
          order by count(*) desc
          limit 5
        ) tf
      ), '[]'::jsonb)
    )
  else null end;
$$;

comment on function public.whatsapp_delivery_health(integer) is
  'PRD-118: WhatsApp delivery health (per-account aggregates + top failure codes). Owner-only silent filter.';

revoke execute on function public.whatsapp_delivery_health(integer) from public, anon;
grant execute on function public.whatsapp_delivery_health(integer) to authenticated;
