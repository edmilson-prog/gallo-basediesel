-- Sub-projeto B (spec 2026-07-17): resgate de conversa com responsável ausente.
-- Tabela + RLS + RPC de claim (concorrência otimista) + notificação ao ausente.
-- A criação dos registros (broadcast) e o fallback forçado são feitos pela
-- Edge Function conversation-rescue-tick (Task 7), via service_role — que
-- bypassa RLS, então não precisa de policy de INSERT/UPDATE para ela.

create table public.conversation_rescues (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  store_id uuid not null references public.stores(id),
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  absent_seller_id uuid not null references public.sellers(id),
  absence_kind text not null check (absence_kind in ('schedule', 'temporary')),
  contact_name text not null,
  last_inbound_preview text,
  status text not null default 'broadcasting'
    check (status in ('broadcasting', 'claimed', 'forced', 'cancelled')),
  broadcast_at timestamptz not null default now(),
  claimed_by_seller_id uuid references public.sellers(id),
  claimed_at timestamptz,
  forced_seller_id uuid references public.sellers(id),
  forced_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now()
);

-- Só 1 resgate ativo por conversa (a Edge Function também confia nisso para
-- não duplicar broadcasts a cada tick).
create unique index conversation_rescues_active_idx
  on public.conversation_rescues (conversation_id)
  where status = 'broadcasting';

create index conversation_rescues_store_id_idx on public.conversation_rescues (store_id);
create index conversation_rescues_absent_seller_id_idx on public.conversation_rescues (absent_seller_id);

alter table public.conversation_rescues enable row level security;

-- Leitura: mesmo portão da instância usado em toda a Inbox — se o seller pode
-- ver a conversa, pode ver (e potencialmente reclamar) o resgate dela.
create policy conversation_rescues_select on public.conversation_rescues
  for select to authenticated
  using (public.can_access_conversation(conversation_id));

-- Sem policy de INSERT/UPDATE/DELETE para `authenticated` — escrita só via
-- service_role (a Edge Function) ou a RPC SECURITY DEFINER abaixo.

-- ---------------------------------------------------------------------------
-- claim_conversation_rescue: primeiro a clicar assume (concorrência otimista).
-- ---------------------------------------------------------------------------
create or replace function public.claim_conversation_rescue(p_rescue_id uuid)
returns public.conversation_rescues
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.conversation_rescues;
  v_seller uuid := public.current_seller_id();
begin
  if v_seller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row from public.conversation_rescues where id = p_rescue_id;
  if not found then
    raise exception 'rescue not found' using errcode = 'P0002';
  end if;

  if not public.can_access_conversation(v_row.conversation_id) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  update public.conversation_rescues
     set status = 'claimed',
         claimed_by_seller_id = v_seller,
         claimed_at = now()
   where id = p_rescue_id
     and status = 'broadcasting'
  returning * into v_row;

  if not found then
    raise exception 'already claimed' using errcode = 'P0004';
  end if;

  update public.conversations
     set assigned_seller_id = v_seller
   where id = v_row.conversation_id;

  insert into public.audit_logs (id, store_id, actor_id, action, resource, resource_id, after)
  values (gen_random_uuid(), v_row.store_id, v_seller, 'conversation_rescue_claim', 'conversation',
          v_row.conversation_id::text, jsonb_build_object('rescueId', p_rescue_id));

  return v_row;
end;
$function$;

revoke all on function public.claim_conversation_rescue(uuid) from public, anon;
grant execute on function public.claim_conversation_rescue(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notificação in-app ao ausente quando o resgate resolve (claim ou forced).
-- Mesmo padrão direto-via-trigger de notify_conversation_participant_added
-- (20260704120100) — evento pontual, não passa pelo reconciler.
-- ---------------------------------------------------------------------------
create or replace function public.notify_conversation_rescue_resolved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_new_seller_id uuid;
  v_new_seller_name text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status not in ('claimed', 'forced') then
    return new;
  end if;

  v_new_seller_id := coalesce(new.claimed_by_seller_id, new.forced_seller_id);

  select coalesce(nullif(s.attendant_name, ''), s.full_name)
    into v_new_seller_name
  from public.sellers s
  where s.id = v_new_seller_id;

  insert into public.notifications
    (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
     store_id, title, body, entity_ref, status, channels, source, created_at)
  values (
    'conv-rescue-' || new.id::text,
    'event',
    'conversa.resgatada',
    'operational',
    'info',
    new.absent_seller_id::text,
    'seller',
    new.store_id,
    coalesce(new.contact_name, 'Cliente') || ' — conversa assumida por ' ||
      coalesce(v_new_seller_name, 'outro atendente'),
    'Você estava ausente quando o cliente entrou em contato.',
    jsonb_build_object('type', 'conversation', 'id', new.conversation_id::text),
    'unread',
    array['inApp']::text[],
    'rule',
    now()
  );

  return new;
end;
$function$;

drop trigger if exists conversation_rescues_notify_resolved on public.conversation_rescues;
create trigger conversation_rescues_notify_resolved
  after update on public.conversation_rescues
  for each row
  execute function public.notify_conversation_rescue_resolved();
