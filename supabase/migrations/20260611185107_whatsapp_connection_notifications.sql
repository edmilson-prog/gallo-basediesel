-- PR #67 follow-up: in-app notification on WhatsApp connection transitions.
--
-- Single choke point for EVERY path that flips whatsapp_accounts.status
-- (whatsapp-connect edge, webhook connection.update, logout): an AFTER UPDATE
-- trigger notifies the store manager. SECURITY DEFINER so the insert clears
-- the notifications RLS regardless of who performed the update. Recipient and
-- payload shape mirror the PRD-120 health tick inserts.
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

  if old.status = 'connected' and new.status = 'disconnected' then
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

drop trigger if exists whatsapp_accounts_notify_connection on public.whatsapp_accounts;
create trigger whatsapp_accounts_notify_connection
  after update of status on public.whatsapp_accounts
  for each row execute function public.notify_whatsapp_connection_change();

comment on function public.notify_whatsapp_connection_change() is
  'Notifies the store manager (in-app) when a WhatsApp account connects/disconnects. PR #67.';
