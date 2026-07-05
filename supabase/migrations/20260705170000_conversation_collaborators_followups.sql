-- Follow-ups for the conversation-collaborators feature, surfaced by code
-- review AFTER the first 4 migrations (20260704120000/120100/120200,
-- 20260705090000) were already applied to production. Everything here is a
-- NEW object or a full recreate — none of the applied files are edited.
--
-- (a) Put conversation_participants on the Realtime publication, or the
--     CollaboratorAddedPrompt (postgres_changes on that table) never fires.
-- (b) Populate added_by authoritatively (BEFORE INSERT), so the bell/card show
--     the real inviter instead of "Um atendente" (the client never sends it).
-- (c) Skip the bell on a self-add (new.added_by = new.seller_id), mirroring the
--     self-mention guard in notify_conversation_note_mentions.
-- (d) Widen search_conversation_messages with the same collaborator filter
--     branch + is_collaborator column the other list/search RPCs already gained
--     in 20260704120200, so message-content search under "Minhas conversas"
--     finds conversations where the caller only collaborates.

-- (a) ------------------------------------------------------------------------
-- Realtime CDC only emits for tables enumerated in the publication (it is NOT
-- FOR ALL TABLES — see 20260610013840, which added only conversations/messages).
alter publication supabase_realtime add table public.conversation_participants;

-- (b) ------------------------------------------------------------------------
-- The client upsert intentionally sends only {conversation_id, seller_id,
-- source}; resolve the inviter server-side from the JWT so it cannot be
-- spoofed and is always present for the notify trigger below. Only fill when
-- absent, preserving any explicit value a service_role/seed insert provides.
create or replace function public.set_conversation_participant_added_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.added_by is null then
    new.added_by := public.current_seller_id();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_set_participant_added_by on public.conversation_participants;
create trigger trg_set_participant_added_by
  before insert on public.conversation_participants
  for each row
  execute function public.set_conversation_participant_added_by();

-- (c) ------------------------------------------------------------------------
-- Recreate notify_conversation_participant_added (verbatim copy of the applied
-- 20260704120100 body) plus an early return when the added seller IS the
-- inviter — nobody should be bell-notified about adding themselves.
create or replace function public.notify_conversation_participant_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_added_by_name text;
begin
  if new.source <> 'manual' then
    return new;
  end if;

  -- Self-add: staff adding themselves as a collaborator shouldn't self-notify
  -- (mirrors notify_conversation_note_mentions skipping self-mentions).
  if new.added_by is not null and new.added_by = new.seller_id then
    return new;
  end if;

  select coalesce(nullif(s.attendant_name, ''), s.full_name)
    into v_added_by_name
  from public.sellers s
  where s.id = new.added_by;

  insert into public.notifications
    (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
     store_id, title, body, entity_ref, status, channels, source, created_at)
  select
    'conv-participant-' || new.conversation_id::text || '-' || new.seller_id::text,
    'event',
    'conversa.colaboradorAdicionado',
    'operational',
    'info',
    new.seller_id::text,
    'seller',
    c.store_id,
    coalesce(v_added_by_name, 'Um atendente') || ' adicionou você a uma conversa',
    null,
    jsonb_build_object('type', 'conversation', 'id', new.conversation_id::text),
    'unread',
    array['inApp']::text[],
    'rule',
    now()
  from public.conversations c
  where c.id = new.conversation_id;

  return new;
end;
$function$;

-- (d) ------------------------------------------------------------------------
-- search_conversation_messages: add the collaborator OR-branch to the
-- assignment filter and an is_collaborator column, matching the shape
-- 20260704120200 applied to search_conversations. Return type changes, so
-- DROP + CREATE (the argument signature is unchanged — callers unaffected).
drop function if exists public.search_conversation_messages(
  text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer
);

create function public.search_conversation_messages(
  p_search text,
  p_store_id uuid default null,
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_assigned_seller_id uuid default null,
  p_unassigned boolean default false,
  p_assigned_seller_ids uuid[] default null,
  p_include_queue boolean default false,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_order_dir text default 'desc',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid,
  channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean,
  tags text[], linked_order_id text, last_message_at timestamptz, unread_count integer,
  created_at timestamptz, queued_at timestamptz, matched_message_text text,
  matched_message_sent_at timestamptz, matched_message_direction text,
  matched_message_extra_count integer, is_collaborator boolean, total_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with esc as (
    select
      trim(coalesce(p_search, '')) as raw_term,
      replace(replace(replace(trim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_')
        as escaped_term
  ),
  candidate_conversations as (
    select c.*
    from public.conversations c
    where
      public.can_access_conversation(c.id)
      and (p_store_id is null or c.store_id = p_store_id)
      and (p_status is null or c.status = any (p_status))
      and (p_channel is null or c.channel = p_channel)
      and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
      and (
        ( p_assigned_seller_id is null
          and (p_assigned_seller_ids is null or cardinality(p_assigned_seller_ids) = 0)
          and not p_unassigned
          and not p_include_queue )
        or (p_assigned_seller_id is not null and c.assigned_seller_id = p_assigned_seller_id)
        or (p_assigned_seller_ids is not null and c.assigned_seller_id = any (p_assigned_seller_ids))
        or (p_assigned_seller_ids is not null
            and exists (
              select 1 from public.conversation_participants p
              where p.conversation_id = c.id
                and p.seller_id = any (p_assigned_seller_ids)
            ))
        or (p_unassigned and c.assigned_seller_id is null)
        or (p_include_queue and c.assigned_seller_id is null
              and c.is_sdr_active = false and c.status = 'aguardando')
      )
      and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
      and (p_tags is null or c.tags && p_tags)
      and (p_from_date is null or c.last_message_at >= p_from_date)
      and (p_to_date is null or c.last_message_at <= p_to_date)
  ),
  matched as (
    select
      m.conversation_id,
      m.text,
      m.sent_at,
      m.direction,
      row_number() over (
        partition by m.conversation_id order by m.sent_at desc, m.text desc
      ) as rn,
      count(*) over (partition by m.conversation_id) as match_count
    from public.messages m
    join candidate_conversations cc on cc.id = m.conversation_id
    cross join esc
    where length(esc.raw_term) > 0
      and m.text ilike ('%' || esc.escaped_term || '%') escape '\'
  )
  select
    cc.id,
    cc.store_id,
    cc.customer_id,
    cc.lead_id,
    cc.assigned_seller_id,
    cc.channel,
    cc.whatsapp_account_id,
    cc.status,
    cc.is_sdr_active,
    cc.tags,
    cc.linked_order_id,
    cc.last_message_at,
    cc.unread_count,
    cc.created_at,
    cc.queued_at,
    mm.text as matched_message_text,
    mm.sent_at as matched_message_sent_at,
    mm.direction as matched_message_direction,
    (mm.match_count - 1)::integer as matched_message_extra_count,
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = cc.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
    count(*) over () as total_count
  from candidate_conversations cc
  join matched mm on mm.conversation_id = cc.id and mm.rn = 1
  order by
    case when p_order_dir = 'asc' then cc.last_message_at end asc,
    case when p_order_dir <> 'asc' then cc.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.search_conversation_messages(
  text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer
) from public, anon;
grant execute on function public.search_conversation_messages(
  text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer
) to authenticated, service_role;
