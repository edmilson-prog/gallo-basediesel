-- messages — conversation utterances (PRD-100+). IMMUTABLE: created_at only,
-- no updated_at. text PK ('msg-...'); faker → no seed.
create table if not exists public.messages (
  id              text primary key,
  conversation_id text not null references public.conversations (id),
  direction       text not null,
  author_type     text not null,
  author_id       text,
  provider        text not null,
  text            text not null default '',
  media_type      text,
  media_url       text,
  status          text not null,
  sent_at         timestamptz not null,
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id);
create index if not exists messages_conversation_sent_at_idx on public.messages (conversation_id, sent_at);
create index if not exists messages_sent_at_idx on public.messages (sent_at);

alter table public.messages enable row level security;

drop policy if exists "messages_select_poc_temp" on public.messages;
create policy "messages_select_poc_temp"
  on public.messages for select to anon, authenticated using (true);
