-- WhatsApp Evolution Go — HistorySync import staging (Phase 2 Etapa B).
--
-- `prepare` distills the captured HistorySync chunks (integration_logs) into one
-- row per importable 1:1 chat; `land` consumes pending rows (cursored) and reuses
-- landNormalizedChat. The row doubles as the UNDO manifest — it carries the exact
-- provider_message_ids that were imported, so "Desfazer importação" can remove
-- precisely what was landed without touching live messages.
--
-- Only the Edge Function (service_role, RLS-bypassing) writes. Owner may read for
-- transparency. Not a security boundary — operational staging.

create table if not exists public.whatsapp_go_history_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  phone text not null,
  contact_name text,
  messages jsonb not null default '[]'::jsonb, -- INormalizedRecord[]
  landed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, phone)
);

-- Partial index: the land cursor only ever scans not-yet-landed rows per account.
create index if not exists idx_wa_go_history_items_pending
  on public.whatsapp_go_history_items (account_id)
  where not landed;

alter table public.whatsapp_go_history_items enable row level security;

drop policy if exists wa_go_history_items_owner_read on public.whatsapp_go_history_items;
create policy wa_go_history_items_owner_read on public.whatsapp_go_history_items
  for select to authenticated
  using (public.current_app_role() = 'owner');

-- Undo: remove exactly what an import landed (set-based, atomic). The staging
-- rows are the manifest — their messages carry the provider_message_ids. Deletes
-- the imported messages, then any conversation of this account left empty (import
-- artifacts), then clears staging. Pending_review customers are intentionally
-- LEFT (filterable in Clientes) — deleting customers is too easy to get wrong.
-- service_role only (the edge); never callable by app roles.
create or replace function public.undo_go_history_import(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg_ids text[];
  v_removed_messages int := 0;
  v_removed_conversations int := 0;
begin
  select array_agg(distinct elem ->> 'providerMessageId')
    into v_msg_ids
  from public.whatsapp_go_history_items i,
       lateral jsonb_array_elements(i.messages) elem
  where i.account_id = p_account_id
    and elem ->> 'providerMessageId' is not null;

  if v_msg_ids is not null then
    with del as (
      delete from public.messages
      where provider_message_id = any(v_msg_ids)
      returning 1
    )
    select count(*) into v_removed_messages from del;
  end if;

  with empty_convs as (
    select c.id
    from public.conversations c
    where c.whatsapp_account_id = p_account_id
      and not exists (select 1 from public.messages m where m.conversation_id = c.id)
  ), del as (
    delete from public.conversations c
    using empty_convs e
    where c.id = e.id
    returning 1
  )
  select count(*) into v_removed_conversations from del;

  delete from public.whatsapp_go_history_items where account_id = p_account_id;

  return jsonb_build_object(
    'removedMessages', v_removed_messages,
    'removedConversations', v_removed_conversations
  );
end;
$$;

revoke all on function public.undo_go_history_import(uuid) from public, anon, authenticated;
