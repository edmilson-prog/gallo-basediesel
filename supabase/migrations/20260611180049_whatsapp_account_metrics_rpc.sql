-- PRD-119 follow-up (Evolution QR connect, PR #67): per-account outbound
-- delivery metrics for the Admin → Integrações → WhatsApp screen, inspired by
-- the SIGPRO instance card (Enviadas/Falhas 30d, último envio).
--
-- SECURITY DEFINER with a STAFF (owner|manager) silent filter — same pattern
-- as whatsapp_delivery_health (PRD-118), but staff-wide because the accounts
-- screen actions (whatsapp-connect edge) are already staff-gated.
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
    )
  else null end;
$$;

comment on function public.whatsapp_account_metrics(uuid, integer) is
  'Per-account outbound WhatsApp metrics (sent/failed/last over N days). Staff-only silent filter.';

revoke execute on function public.whatsapp_account_metrics(uuid, integer) from public, anon;
grant execute on function public.whatsapp_account_metrics(uuid, integer) to authenticated;
