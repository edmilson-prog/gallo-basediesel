-- Conversation notes: an internal attendant message board pinned to a
-- conversation. Private to internal users (store-scoped RLS), never sent to the
-- customer / WhatsApp. Used for handoff context between attendants.
--
-- @mentions are stored as a uuid[] of seller ids; an AFTER INSERT trigger
-- (SECURITY DEFINER) fans them out into one in-app notification per mentioned
-- seller — non-staff cannot insert cross-recipient notifications under the
-- notifications RLS, so the server does it (mirrors the WhatsApp connection
-- notification trigger).

create table if not exists public.conversation_notes (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  store_id        uuid not null references public.stores(id),
  author_id       uuid not null references public.sellers(id),
  content         text not null,
  mentions        uuid[] not null default '{}',
  pinned          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.conversation_notes is
  'Internal attendant notes pinned to a conversation. Store-scoped, internal-only (never sent to the customer). mentions[] fans out to in-app notifications via trigger.';

create index if not exists conversation_notes_conversation_id_idx
  on public.conversation_notes (conversation_id);
create index if not exists conversation_notes_store_id_idx
  on public.conversation_notes (store_id);
create index if not exists conversation_notes_created_at_idx
  on public.conversation_notes (created_at);

alter table public.conversation_notes enable row level security;

-- SELECT: any authenticated member of the store. Customers are never sellers,
-- so they never satisfy current_store_id() in a seller session — notes stay
-- internal.
create policy "conversation_notes_select"
  on public.conversation_notes for select to authenticated
  using (store_id = (select public.current_store_id()));

-- INSERT: create as yourself, in your active store.
create policy "conversation_notes_insert"
  on public.conversation_notes for insert to authenticated
  with check (
    store_id = (select public.current_store_id())
    and author_id = (select public.current_seller_id())
  );

-- UPDATE: author edits own; staff (Owner/Gestor) edits any (also covers pin).
create policy "conversation_notes_update"
  on public.conversation_notes for update to authenticated
  using (
    store_id = (select public.current_store_id())
    and (author_id = (select public.current_seller_id()) or (select public.is_staff()))
  )
  with check (
    store_id = (select public.current_store_id())
    and (author_id = (select public.current_seller_id()) or (select public.is_staff()))
  );

-- DELETE: author deletes own; staff deletes any.
create policy "conversation_notes_delete"
  on public.conversation_notes for delete to authenticated
  using (
    store_id = (select public.current_store_id())
    and (author_id = (select public.current_seller_id()) or (select public.is_staff()))
  );

grant select, insert, update, delete on public.conversation_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Mentions → in-app notifications (one per mentioned seller).
create or replace function public.notify_conversation_note_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
  v_author text;
begin
  select coalesce(nullif(s.attendant_name, ''), s.full_name)
    into v_author
  from public.sellers s
  where s.id = new.author_id;

  foreach v_seller in array coalesce(new.mentions, '{}'::uuid[])
  loop
    -- Skip null entries and self-mentions.
    if v_seller is null or v_seller = new.author_id then
      continue;
    end if;
    insert into public.notifications
      (dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type,
       store_id, title, body, entity_ref, status, channels, source, created_at)
    values
      ('conv-note-' || new.id::text || '-' || v_seller::text,
       'event', 'nota.mencao', 'operational', 'info',
       v_seller::text, 'seller', new.store_id,
       coalesce(v_author, 'Um atendente') || ' mencionou você em uma anotação',
       left(new.content, 140),
       jsonb_build_object('type', 'conversation', 'id', new.conversation_id::text),
       'unread', array['inApp']::text[], 'rule', now());
  end loop;
  return new;
end;
$$;

comment on function public.notify_conversation_note_mentions() is
  'Fans out conversation-note @mentions into one in-app notification per mentioned seller (SECURITY DEFINER to clear the notifications RLS).';

drop trigger if exists conversation_notes_notify_mentions on public.conversation_notes;
create trigger conversation_notes_notify_mentions
  after insert on public.conversation_notes
  for each row execute function public.notify_conversation_note_mentions();
