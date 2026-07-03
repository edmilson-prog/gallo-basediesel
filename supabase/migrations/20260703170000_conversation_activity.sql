-- conversation_activity: append-only attendance-lifecycle timeline.
-- Writes ONLY via the trigger (SECURITY DEFINER, owner = postgres, bypasses RLS).
-- Reads ONLY via get_customer_activity (SECURITY DEFINER, gated once). No
-- permissive client policy — RLS is fail-closed.

create table if not exists public.conversation_activity (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id text,
  store_id uuid not null references public.stores(id) on delete cascade,
  type text not null check (type in ('created','status','assignment','reopen')),
  from_status text,
  to_status text,
  from_seller_id uuid references public.sellers(id),
  to_seller_id uuid references public.sellers(id),
  actor_id uuid references public.sellers(id),
  actor_kind text not null check (actor_kind in ('seller','system')),
  created_at timestamptz not null default now()
);

create index if not exists conversation_activity_customer_idx
  on public.conversation_activity (customer_id, created_at);
create index if not exists conversation_activity_conversation_idx
  on public.conversation_activity (conversation_id, created_at);

alter table public.conversation_activity enable row level security;
-- No policy on purpose: client SELECT/INSERT denied; all access is via functions.

-- Trigger: capture every status/owner change on conversations. Mirror of the
-- pure engine deriveActivityDelta() (src/providers/data/engine/conversationActivity.ts).
create or replace function public.conversation_activity_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := public.current_seller_id();
  v_kind text := case when public.current_seller_id() is null then 'system' else 'seller' end;
  v_status_changed boolean;
  v_seller_changed boolean;
  v_type text;
begin
  if tg_op = 'INSERT' then
    insert into public.conversation_activity(
      conversation_id, customer_id, lead_id, store_id, type,
      from_status, to_status, from_seller_id, to_seller_id, actor_id, actor_kind)
    values (new.id, new.customer_id, new.lead_id, new.store_id, 'created',
            null, new.status, null, new.assigned_seller_id, v_actor, v_kind);
    return new;
  end if;

  v_status_changed := new.status is distinct from old.status;
  v_seller_changed := new.assigned_seller_id is distinct from old.assigned_seller_id;
  if not v_status_changed and not v_seller_changed then
    return new;
  end if;

  v_type := case
    when v_status_changed and new.status = 'aguardando'
         and old.status in ('resolvida','arquivada') and v_actor is null then 'reopen'
    when v_status_changed then 'status'
    else 'assignment'
  end;

  insert into public.conversation_activity(
    conversation_id, customer_id, lead_id, store_id, type,
    from_status, to_status, from_seller_id, to_seller_id, actor_id, actor_kind)
  values (
    new.id, new.customer_id, new.lead_id, new.store_id, v_type,
    case when v_status_changed then old.status end,
    case when v_status_changed then new.status end,
    case when v_seller_changed then old.assigned_seller_id end,
    case when v_seller_changed then new.assigned_seller_id end,
    v_actor, v_kind);
  return new;
end;
$$;

drop trigger if exists conversation_activity_capture on public.conversations;
create trigger conversation_activity_capture
  after insert or update on public.conversations
  for each row execute function public.conversation_activity_capture();

-- Read RPC: whole-customer timeline, gated once (staff OR carteira owner OR can
-- access ANY of the customer's conversations). Ordered by conversation then time.
create or replace function public.get_customer_activity(p_customer_id uuid)
returns table (
  id uuid, conversation_id uuid, customer_id uuid, lead_id text, store_id uuid,
  type text, from_status text, to_status text,
  from_seller_id uuid, to_seller_id uuid, actor_id uuid, actor_kind text,
  created_at timestamptz,
  conversation_channel text, conversation_status text, conversation_created_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select a.id, a.conversation_id, a.customer_id, a.lead_id, a.store_id,
         a.type, a.from_status, a.to_status, a.from_seller_id, a.to_seller_id,
         a.actor_id, a.actor_kind, a.created_at,
         c.channel, c.status, c.created_at
  from public.conversation_activity a
  join public.conversations c on c.id = a.conversation_id
  join public.customers cu on cu.id = a.customer_id
  where a.customer_id = p_customer_id
    and (
      public.is_staff()
      or cu.seller_id = public.current_seller_id()
      or exists (
        select 1 from public.conversations cc
        where cc.customer_id = p_customer_id
          and public.can_access_conversation(cc.id)
      )
    )
  order by a.conversation_id, a.created_at asc;
$$;

revoke all on function public.get_customer_activity(uuid) from public, anon;
grant execute on function public.get_customer_activity(uuid) to authenticated;
