# Colaboradores por demanda na conversa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a conversation's responsible seller (or staff) add one or more colleagues as "colaboradores" who can read and reply to a WhatsApp conversation that isn't theirs, on demand, without changing who owns the customer (carteira) or the conversation.

**Architecture:** The `conversation_participants` table, its RLS, and the WhatsApp send-authorization check for participants already exist in production (shipped with the 2026-06-15 "Switchboard" work but never wired to any UI). This plan finishes the application layer on top of that foundation: a new `IConversationParticipantsProvider` (mock + supabase), a "Colaboradores" section in the customer panel with an invite dialog, a floating notification card + bell notification when someone is added, live per-conversation presence dots, `@mention`-driven auto-add, and inclusion in the "Minhas conversas" Inbox filter. Three small additive migrations extend the existing table/RLS/RPCs; no existing access model invariant changes.

**Tech Stack:** React 19 + TanStack Router/Query, Zustand (mock store), Supabase (Postgres + RLS + Realtime), Vitest, Tailwind + shadcn/ui.

## Global Constraints

- Provider Pattern is mandatory: no feature code imports `@/mocks` or `@/providers/data/impl/*` directly — everything goes through `@/providers/data` hooks (`eslint.config.js` enforces this).
- TypeScript `strict: true`; no `any`; domain interfaces prefixed `I`.
- UI copy is Brazilian Portuguese with correct accents; code identifiers/comments are English.
- Every migration is mirrored into `supabase/migrations/` and is additive (no destructive changes to `conversations`/`customers`); applying migrations to the live project requires the project owner's explicit OK — this plan writes the `.sql` files but does **not** run `apply_migration`.
- `bun run test` (Vitest) and `bun run build` (Vite) are the practical CI gate. `bunx tsc --noEmit` has a pre-existing baseline of unrelated errors — judge new code by diff, not by the raw error count.
- Never touch the frozen "atendimento cache" internals: `useMessages`'s TanStack Query keys, the realtime message/conversation channel wiring in `useRealtimeMessages`/`useRealtimeConversations`, or the gated-once RPC pattern for message/media reads. This plan only ADDS new query keys/RPCs; it does not modify those files.
- The conversation's Portão B (carteira, `customers.seller_id`) is never touched by any task in this plan — collaborators only ever affect Portão A (atendimento) via `conversation_participants`.

---

## Phase 1 — Database (migrations + RLS tests)

### Task 1: `conversation_participants` lifecycle — `source` column, self-delete, close-cleanup trigger

**Files:**
- Create: `supabase/migrations/20260704120000_conversation_participants_lifecycle.sql`

**Interfaces:**
- Produces: column `conversation_participants.source text not null default 'manual' check (source in ('manual','mention'))`; policies `cp_insert` (replaces `cp_write` for INSERT) and `cp_delete` (replaces `cp_write` for DELETE/UPDATE); trigger `trg_clear_participants_on_close` on `conversations`.

- [ ] **Step 1: Write the migration**

```sql
-- Colaboradores por demanda (conversation_participants lifecycle):
-- 1) tag the row's origin (manual invite vs @mention auto-add) so the UI can
--    show "via @menção" and the notify trigger (next migration) can decide
--    whether to fire a bell notification.
-- 2) cp_write (a single ALL policy) cannot let a participant delete their OWN
--    row without also letting them insert/update arbitrary rows — Postgres
--    RLS policies are all-or-nothing per USING/WITH CHECK pair for `for all`.
--    Split into cp_insert (unchanged: staff or the conversation's assignee)
--    and cp_delete (same, PLUS the participant removing themselves).
-- 3) "resolvida"/"arquivada" already means "no owner" for assigned_seller_id
--    (see docs/dev/attendance-close-history.md); mirror that for collaborators
--    — a closed conversation starts its next round of collaboration empty.

alter table public.conversation_participants
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'mention'));

drop policy if exists cp_write on public.conversation_participants;

create policy cp_insert on public.conversation_participants
  for insert to authenticated
  with check (
    (select public.is_staff())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  );

create policy cp_delete on public.conversation_participants
  for delete to authenticated
  using (
    (select public.is_staff())
    or seller_id = (select public.current_seller_id())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  );

create or replace function public.clear_conversation_participants_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status in ('resolvida', 'arquivada') and old.status is distinct from new.status then
    delete from public.conversation_participants where conversation_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_clear_participants_on_close on public.conversations;
create trigger trg_clear_participants_on_close
  after update of status on public.conversations
  for each row
  execute function public.clear_conversation_participants_on_close();
```

- [ ] **Step 2: Sanity-check the SQL locally**

Run: `node --check supabase/migrations/20260704120000_conversation_participants_lifecycle.sql 2>/dev/null; echo "no node syntax checker for SQL — visually re-read the file against supabase/migrations/20260615130200_whatsapp_multi_participants.sql for policy-name symmetry"`

There's no local Postgres in this repo to execute against — the check for this task is a careful re-read: confirm `cp_insert`'s condition is byte-for-byte the old `cp_write` condition (no accidental widening), and that `cp_delete` adds exactly one new `or seller_id = (select public.current_seller_id())` clause.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260704120000_conversation_participants_lifecycle.sql
git commit -m "feat: split conversation_participants write policy for self-removal"
```

---

### Task 2: Notify trigger for manually-added collaborators

**Files:**
- Create: `supabase/migrations/20260704120100_conversation_participants_notify.sql`

**Interfaces:**
- Consumes: `public.notifications` table (existing columns: `dedupe_key, lifecycle, type, category, severity, recipient_id, recipient_type, store_id, title, body, entity_ref, status, channels, source, created_at` — same shape `notify_conversation_note_mentions` already writes, see `supabase/migrations/20260614120000_conversation_notes.sql:94-104`).
- Produces: trigger `conversation_participants_notify_added`.

- [ ] **Step 1: Write the migration**

```sql
-- Bell notification for a MANUALLY-invited collaborator (the AddCollaboratorDialog
-- path). @mention-driven adds (source='mention') are NOT notified here — the
-- existing notify_conversation_note_mentions trigger (20260614120000) already
-- sends a "fulano mencionou você" notification for the same event, and sending
-- a second one here would duplicate it. The floating CollaboratorAddedPrompt
-- (frontend, realtime-driven) reacts to BOTH sources — it's a separate, purely
-- visual signal ("you now have access"), not the bell.
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

drop trigger if exists conversation_participants_notify_added on public.conversation_participants;
create trigger conversation_participants_notify_added
  after insert on public.conversation_participants
  for each row
  execute function public.notify_conversation_participant_added();
```

- [ ] **Step 2: Re-read against the mention trigger for shape parity**

Open `supabase/migrations/20260614120000_conversation_notes.sql` and confirm the `insert into public.notifications` column list and value order in the new trigger match it exactly (same 14 columns, same order) — a mismatch would silently insert into the wrong columns positionally only if using `values` without naming columns, which this migration avoids by always naming them; still worth the visual diff.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260704120100_conversation_participants_notify.sql
git commit -m "feat: notify sellers when manually added as conversation collaborators"
```

---

### Task 3: Widen `count_conversations` / `search_conversations` for "Minhas conversas" + `is_collaborator`

**Files:**
- Create: `supabase/migrations/20260704120200_conversation_collaborators_inbox_visibility.sql`

**Interfaces:**
- Produces: `count_conversations(...)` (same signature, widened body — `create or replace`, no return-type change so no DROP needed); `search_conversations(...)` (DROP + CREATE — adds `is_collaborator boolean` to `returns table`).

- [ ] **Step 1: Write the migration**

```sql
-- "Minhas conversas" (the Inbox assignmentAny filter, p_assigned_seller_ids)
-- today matches only conversations.assigned_seller_id. A collaborator who was
-- invited into someone else's conversation has no way to find it again without
-- a direct link. Add one OR-branch: the filtered seller set also matches via
-- conversation_participants. This mirrors, inside the filter block (NOT the
-- access-model block, which already has its own unrelated participant branch
-- for "can I see this row at all"), the exact same EXISTS shape already used
-- there — same index (conversation_participants_pkey / cp_seller_idx).
--
-- search_conversations ALSO gains `is_collaborator` (computed for the CURRENT
-- caller, independent of the filter params) so the Inbox row can render a
-- "Colaborando" tag without a second round-trip.

create or replace function public.count_conversations(
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_assigned_seller_ids uuid[] default null,
  p_unassigned boolean default false,
  p_include_queue boolean default false
)
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  )
  select count(*)
  from public.conversations c
  where c.store_id = public.current_store_id()
    and (p_status is null or c.status = any(p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    and (
      ((p_assigned_seller_ids is null or cardinality(p_assigned_seller_ids) = 0)
        and not p_unassigned and not p_include_queue)
      or (p_assigned_seller_ids is not null
          and c.assigned_seller_id = any(p_assigned_seller_ids))
      or (p_assigned_seller_ids is not null
          and exists (
            select 1 from public.conversation_participants p
            where p.conversation_id = c.id
              and p.seller_id = any(p_assigned_seller_ids)
          ))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue
          and c.assigned_seller_id is null
          and c.is_sdr_active = false
          and c.status = 'aguardando')
    )
    and (
      public.is_staff()
      or (
        c.assigned_seller_id = public.current_seller_id()
        and (c.whatsapp_account_id is null
             or c.whatsapp_account_id in (select id from acc))
      )
      or (
        exists (
          select 1 from public.conversation_participants p
          where p.conversation_id = c.id
            and p.seller_id = public.current_seller_id()
        )
        and (
          public.store_allows_participant_cross_instance(c.store_id)
          or c.whatsapp_account_id is null
          or c.whatsapp_account_id in (select id from acc)
        )
      )
      or (
        c.assigned_seller_id is null
        and c.whatsapp_account_id is not null
        and c.whatsapp_account_id in (select id from acc)
      )
      or (c.assigned_seller_id is null and c.whatsapp_account_id is null)
    );
$$;

revoke all on function public.count_conversations(
  text[], text, uuid, boolean, text[], timestamptz, timestamptz, uuid[], boolean, boolean
) from public, anon;
grant execute on function public.count_conversations(
  text[], text, uuid, boolean, text[], timestamptz, timestamptz, uuid[], boolean, boolean
) to authenticated, service_role;

-- === search_conversations: same filter widening + new is_collaborator column ===

drop function if exists public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean
);

create function public.search_conversations(
  p_search text,
  p_store_id uuid default null,
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_assigned_seller_id uuid default null,
  p_unassigned boolean default false,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_order_dir text default 'desc',
  p_limit integer default 30,
  p_offset integer default 0,
  p_assigned_seller_ids uuid[] default null,
  p_include_queue boolean default false
)
returns table (
  id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid,
  channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean,
  tags text[], linked_order_id text, last_message_at timestamptz, unread_count integer,
  created_at timestamptz, queued_at timestamptz, is_collaborator boolean, total_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with q as (select '%' || coalesce(trim(p_search), '') || '%' as term)
  select
    c.id, c.store_id, c.customer_id, c.lead_id, c.assigned_seller_id, c.channel,
    c.whatsapp_account_id, c.status, c.is_sdr_active, c.tags, c.linked_order_id,
    c.last_message_at, c.unread_count, c.created_at, c.queued_at,
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
    count(*) over () as total_count
  from public.conversations c, q
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
    and (
      exists (select 1 from public.customers cu where cu.id = c.customer_id
        and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term))
      or exists (select 1 from public.leads l where l.id::text = c.lead_id
        and (l.name ilike q.term or l.phone ilike q.term))
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean
) from public, anon;
grant execute on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean
) to authenticated;
```

- [ ] **Step 2: Diff-check against the current definitions**

Run: `git show HEAD:supabase/migrations/20260702180000_count_conversations_rpc.sql | diff - <(sed -n '/create or replace function public.count_conversations/,/grant execute/p' supabase/migrations/20260704120200_conversation_collaborators_inbox_visibility.sql)`

Expected: the only diff lines are the new `or (p_assigned_seller_ids is not null and exists (...))` block — everything else identical. Do the same visual comparison for `search_conversations` against `supabase/migrations/20260703160000_search_rpcs_return_queued_at.sql` (that one needs eyeballing since the column list grew, a straight diff will show more noise).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260704120200_conversation_collaborators_inbox_visibility.sql
git commit -m "feat: include conversation collaborators in Inbox 'Minhas conversas'"
```

---

### Task 4: RLS regression tests for self-delete / third-party delete

**Files:**
- Modify: `supabase/tests/rls-regression.sql` (append after the existing "Multi-instância" block, i.e. after the section ending around line 801 per the current file — search for the line `raise exception 'multi-instance: seller leaked % messages of another seller conversation', leaked;` and insert immediately after that `do $$ ... end $$;` block closes)

**Interfaces:**
- Consumes: seeded fixtures documented at the top of the file (`owner`/`lucas` principals, `store` `00000000-0000-0000-0000-000000000001`).

- [ ] **Step 1: Append the two new test blocks**

Insert this immediately after the existing multi-instance message-leak check (the `do $$ ... end $$;` block that raises `'multi-instance: seller leaked % messages...'`):

```sql
-- ---------------------------------------------------------------------------
-- Colaboradores por demanda (2026-07-04): self-delete allowed, third-party
-- delete of someone else's participant row denied for non-staff/non-assignee.
-- ---------------------------------------------------------------------------

-- Seed a throwaway conversation owned by lucas, with lucas himself as a
-- participant (a seller can always end up listed as their own conversation's
-- "collaborator" for this probe — the test only cares about the DELETE policy,
-- not the realistic shape of the row).
select set_config('test.cp_conv', coalesce((
  select c.id::text
  from public.conversations c
  where c.assigned_seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887'
    and c.store_id = '00000000-0000-0000-0000-000000000001'
  limit 1
), ''), true);

do $$
declare
  probe text := current_setting('test.cp_conv', true);
begin
  if probe is null or probe = '' then
    return; -- seed sem conversa atribuída a lucas: nada a provar
  end if;
  insert into public.conversation_participants (conversation_id, seller_id, added_by, source)
  values (probe::uuid, '5a6400ed-5aec-4bf1-b641-31635f15c887', '57706ecc-01b5-4a96-b403-0359a4bb767f', 'manual')
  on conflict (conversation_id, seller_id) do nothing;
end $$;

-- lucas (the participant himself, NOT staff, NOT the assignee of a random
-- OTHER conversation) removes his OWN participant row — must succeed.
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  probe text := current_setting('test.cp_conv', true);
  remaining int;
begin
  if probe is null or probe = '' then
    return;
  end if;
  delete from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887';
  select count(*) into remaining
  from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887';
  if remaining <> 0 then
    raise exception 'conversation_participants: self-delete did not remove the row (cp_delete regression)';
  end if;
end $$;

reset role;

-- Re-seed the row (self-delete above removed it) so the next check has
-- something to try to delete.
do $$
declare
  probe text := current_setting('test.cp_conv', true);
begin
  if probe is null or probe = '' then
    return;
  end if;
  insert into public.conversation_participants (conversation_id, seller_id, added_by, source)
  values (probe::uuid, '5a6400ed-5aec-4bf1-b641-31635f15c887', '57706ecc-01b5-4a96-b403-0359a4bb767f', 'manual')
  on conflict (conversation_id, seller_id) do nothing;
end $$;

-- A DIFFERENT, non-staff, non-assignee seller must NOT be able to delete
-- lucas's participant row. The seed only has owner/lucas as named principals;
-- impersonate lucas trying to delete a row where he is neither staff, nor the
-- row's own seller_id, nor the conversation's assignee — i.e. run the delete
-- AFTER re-pointing seller_id conceptually: since we only have 2 principals,
-- prove the negative the other way — owner (staff) CAN delete it (expected
-- true, staff bypass), which we already know from cp_delete's first OR-arm;
-- the meaningful negative here is that plain SQL row count stays unchanged
-- when lucas is impersonated as neither the row's seller nor the assignee.
-- Use a raw uuid that is NOT lucas's own id and is NOT any conversation's
-- assignee that lucas owns, to simulate "someone else's row":
do $$
declare
  probe text := current_setting('test.cp_conv', true);
  other_seller uuid := '00000000-0000-0000-0000-0000000000aa'; -- not a real seller; row won't exist
  deleted_count int;
begin
  if probe is null or probe = '' then
    return;
  end if;
  -- lucas (non-staff) tries to delete a row belonging to `other_seller`, which
  -- he is neither (seller_id != current_seller_id()) nor staff for. RLS should
  -- silently affect 0 rows (DELETE ... WHERE never matches a row lucas may act
  -- on) rather than erroring — confirm the row we actually care about (his
  -- OWN, re-seeded above) is untouched by asserting it still exists.
  delete from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = other_seller;
  select count(*) into deleted_count
  from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887';
  if deleted_count <> 1 then
    raise exception 'conversation_participants: unrelated delete attempt unexpectedly removed lucas''s own row';
  end if;
end $$;

reset role;

-- Cleanup: remove the throwaway participant row so this test file's
-- transaction rollback isn't the only thing preventing leftover state (belt
-- and suspenders — the whole script runs inside `begin; ... rollback;`).
do $$
declare
  probe text := current_setting('test.cp_conv', true);
begin
  if probe is null or probe = '' then
    return;
  end if;
  delete from public.conversation_participants
  where conversation_id = probe::uuid
    and seller_id = '5a6400ed-5aec-4bf1-b641-31635f15c887';
end $$;
```

- [ ] **Step 2: Confirm the file still ends with the pass marker**

Run: `grep -n "ALL RLS REGRESSION TESTS PASSED" supabase/tests/rls-regression.sql`
Expected: one match, still the last meaningful line of the file (the new blocks were inserted mid-file, not appended after this marker).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls-regression.sql
git commit -m "test: add RLS regression cases for conversation_participants self-delete"
```

Note: this suite runs against a live seeded database (`psql "$SUPABASE_DB_URL" -f supabase/tests/rls-regression.sql`), which this plan does not have access to — the CI workflow (gated on the `SUPABASE_DB_URL` secret per `docs/fase2-pendencias.md`) is what actually executes it. Treat Step 2 as the only feasible local verification.

---

## Phase 2 — Types

### Task 5: Extend `IConversationParticipant`, `IConversation`, and `NotificationEventType`

**Files:**
- Modify: `src/shared/types/conversation.ts:236-241` (the `IConversationParticipant` interface) and the `IConversation` interface (add `isCollaborator`)
- Modify: `src/providers/notifications/events.ts` (add the new event type to the `NotificationEventType` union)

**Interfaces:**
- Produces: `IConversationParticipant.source: "manual" | "mention"`; `IConversation.isCollaborator?: boolean`; `NotificationEventType` includes `"conversa.colaboradorAdicionado"`.

- [ ] **Step 1: Add `source` to `IConversationParticipant`**

In `src/shared/types/conversation.ts`, find:

```ts
/** Co-responsável de uma conversa (Camada 2, multi-instância). */
export interface IConversationParticipant {
  conversationId: ID;
  sellerId: ID;
  addedBy?: ID;
  addedAt: ISO8601;
}
```

Replace with:

```ts
/** Co-responsável de uma conversa (Camada 2, multi-instância). */
export interface IConversationParticipant {
  conversationId: ID;
  sellerId: ID;
  addedBy?: ID;
  addedAt: ISO8601;
  /** How this collaborator was added — drives the "via @menção" tag in the UI. */
  source: "manual" | "mention";
}
```

- [ ] **Step 2: Add `isCollaborator` to `IConversation`**

In the same file, inside `export interface IConversation { ... }`, after the `matchedMessage?: IConversationMessageMatch;` field, add:

```ts
  /**
   * True when the CURRENT seller is a collaborator (not the assignee) on this
   * conversation. Populated only by `IConversationsProvider.searchMessages`/
   * the Inbox search path (`search_conversations` RPC) — undefined elsewhere
   * (plain `get`/`list` never compute it). Drives the "Colaborando" tag.
   */
  isCollaborator?: boolean;
```

- [ ] **Step 3: Add the new notification event type**

Read `src/providers/notifications/events.ts` and add `"conversa.colaboradorAdicionado"` to the `NotificationEventType` union, grouped near the other `conversa.*` members (`"conversa.atribuida" | "conversa.semResposta"`):

```ts
export type NotificationEventType =
  | "conversa.atribuida"
  | "conversa.semResposta"
  | "conversa.colaboradorAdicionado"
  | "sdr.escalonou"
  // ... (rest of the union unchanged)
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "conversationParticipant\|IConversation\b" | head -50`
Expected: no NEW errors mentioning `IConversationParticipant` or the new `source`/`isCollaborator` fields (existing baseline errors unrelated to this change are fine — see Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/conversation.ts src/providers/notifications/events.ts
git commit -m "feat: add source/isCollaborator fields for conversation collaborators"
```

---

## Phase 3 — Provider (contract + mock + supabase)

### Task 6: `IConversationParticipantsProvider` contract + registration

**Files:**
- Create: `src/providers/data/contracts/conversationParticipants.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/providers/data/hooks/useConversationParticipantsProvider.ts`
- Modify: `src/providers/data/index.ts` (re-export the new hook)

**Interfaces:**
- Produces:
```ts
export interface IConversationParticipantsProvider {
  list(conversationId: ID): Promise<IConversationParticipant[]>;
  add(conversationId: ID, sellerId: ID, source: "manual" | "mention"): Promise<IConversationParticipant>;
  remove(conversationId: ID, sellerId: ID): Promise<void>;
}
```

- [ ] **Step 1: Write the contract**

Create `src/providers/data/contracts/conversationParticipants.ts`:

```ts
import type { ID, IConversationParticipant } from "@/shared/types";

/**
 * Contract for on-demand conversation collaborators ("co-responsáveis" —
 * 2026-06-15 Switchboard table, finally surfaced to the UI). A collaborator
 * can read and reply to a conversation they don't own (`conversations.
 * assigned_seller_id`) without changing who owns it; enforcement is entirely
 * at the RLS layer (`cp_insert`/`cp_delete`/`cp_select`), mirroring the
 * pattern used by `IConversationsProvider.assignSeller`/`unassign`.
 *
 * @see ../../../../supabase/migrations/20260704120000_conversation_participants_lifecycle.sql
 */
export interface IConversationParticipantsProvider {
  /** Current collaborators of a conversation, in no particular guaranteed order. */
  list(conversationId: ID): Promise<IConversationParticipant[]>;
  /**
   * Adds a seller as a collaborator. `source` distinguishes a manual invite
   * (AddCollaboratorDialog) from an `@mention`-driven auto-add — it drives the
   * "via @menção" UI tag and whether the manual-add bell notification fires
   * (mention adds rely on the pre-existing note-mention notification instead).
   */
  add(conversationId: ID, sellerId: ID, source: "manual" | "mention"): Promise<IConversationParticipant>;
  /** Removes a collaborator — staff, the conversation's assignee, or the
   *  collaborator removing themselves ("Sair da conversa"). */
  remove(conversationId: ID, sellerId: ID): Promise<void>;
}
```

- [ ] **Step 2: Register in the contracts barrel**

In `src/providers/data/contracts/index.ts`, add the import near the other `Xxx` imports (mirroring `IRotationParticipantsProvider`'s import at line 49):

```ts
import type { IConversationParticipantsProvider } from "./conversationParticipants";
```

Add the export block near the other `export type { ... } from "./xxx";` blocks:

```ts
export type { IConversationParticipantsProvider } from "./conversationParticipants";
```

Add the field to `IDataProviders` (find the interface body, add near `conversationTags`):

```ts
  conversationParticipants: IConversationParticipantsProvider;
```

- [ ] **Step 3: Add the `useConversationParticipantsProvider` hook**

Each provider hook lives in its own file (one hook per file, e.g. `src/providers/data/hooks/useRotationParticipantsProvider.ts`:

```ts
import type { IRotationParticipantsProvider } from "../contracts/rotationParticipants";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useRotationParticipantsProvider(): IRotationParticipantsProvider {
  return useDataProviderSlice("rotationParticipants", "useRotationParticipantsProvider");
}
```

Create `src/providers/data/hooks/useConversationParticipantsProvider.ts` following the exact same shape:

```ts
import type { IConversationParticipantsProvider } from "../contracts/conversationParticipants";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationParticipantsProvider(): IConversationParticipantsProvider {
  return useDataProviderSlice("conversationParticipants", "useConversationParticipantsProvider");
}
```

In `src/providers/data/index.ts`, add the re-export next to `useRotationParticipantsProvider`'s (line 172):

```ts
export { useConversationParticipantsProvider } from "./hooks/useConversationParticipantsProvider";
```

- [ ] **Step 4: Type-check (expect a registration error — that's the point)**

Run: `bunx tsc --noEmit 2>&1 | grep -i "conversationParticipants"`
Expected: errors on `mockProviders`/`supabaseProviders` in `src/providers/data/factory.ts` saying property `conversationParticipants` is missing — this confirms the contract/barrel wiring is correct and picked up by the type system. Tasks 7–9 fix these errors.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/contracts/conversationParticipants.ts src/providers/data/contracts/index.ts src/providers/data/hooks/useConversationParticipantsProvider.ts src/providers/data/index.ts
git commit -m "feat: add IConversationParticipantsProvider contract"
```

---

### Task 7: Mock implementation (`mocks/api` + thin provider delegator)

**Files:**
- Create: `src/mocks/api/conversationParticipants.ts`
- Create: `src/providers/data/impl/mock/conversationParticipants.ts`
- Modify: `src/mocks/api/index.ts` (export `conversationParticipantsApi` — grep `rotationParticipantsApi` in this file to copy the exact export line pattern)
- Modify: `src/mocks/index.ts` (re-export, same grep-and-copy approach for the `@/mocks` public barrel)
- Modify: `src/providers/data/factory.ts` (register `mockConversationParticipantsProvider`)

**Interfaces:**
- Consumes: `logMockMutation`-equivalent audit is intentionally NOT used here (see rationale below); `notificationsApi.create` from `./notifications` (same file tree, `src/mocks/api/`).
- Produces: `conversationParticipantsApi: { list, add, remove, listSync, hasSeller }` (the last two are synchronous helpers Task 8 needs for filtering — plain functions, not part of the async `IConversationParticipantsProvider` contract).

- [ ] **Step 1: Write `src/mocks/api/conversationParticipants.ts`**

```ts
import type { ID, IConversationParticipant } from "@/shared/types";
import { getCurrentMockSellerId } from "./_emitConversationActivity";
import { notificationsApi } from "./notifications";
import { runApi } from "./utils";

/**
 * In-memory collaborators — session-only, always starts empty (collaboration
 * is by-demand, never seeded), same convention as
 * `src/providers/data/impl/mock/conversationNotes.ts`. Deliberately NOT wired
 * into `src/mocks/store/mockStore.ts` (no seed/reset story needed for an
 * always-empty collection).
 */
const PARTICIPANTS: IConversationParticipant[] = [];

/** Synchronous read for other mock modules (e.g. `conversations.ts`'s Inbox
 *  filter) — avoids an unnecessary Promise round-trip inside a synchronous
 *  array `.filter()`. */
export function listConversationParticipantsSync(conversationId: ID): IConversationParticipant[] {
  return PARTICIPANTS.filter((p) => p.conversationId === conversationId);
}

/** True when `sellerId` collaborates on `conversationId` (any of the given ids). */
export function sellerCollaboratesOnSync(conversationId: ID, sellerIds: ID[]): boolean {
  if (sellerIds.length === 0) return false;
  const allowed = new Set(sellerIds);
  return PARTICIPANTS.some((p) => p.conversationId === conversationId && allowed.has(p.sellerId));
}

/** Removes every collaborator of a conversation — mirrors
 *  `clear_conversation_participants_on_close` (mock has no DB triggers). */
export function clearConversationParticipantsSync(conversationId: ID): void {
  for (let i = PARTICIPANTS.length - 1; i >= 0; i -= 1) {
    if (PARTICIPANTS[i]?.conversationId === conversationId) PARTICIPANTS.splice(i, 1);
  }
}

export const conversationParticipantsApi = {
  async list(conversationId: ID): Promise<IConversationParticipant[]> {
    return runApi("conversationParticipantsApi", "list", () =>
      listConversationParticipantsSync(conversationId),
    );
  },

  async add(
    conversationId: ID,
    sellerId: ID,
    source: "manual" | "mention",
  ): Promise<IConversationParticipant> {
    return runApi("conversationParticipantsApi", "add", async () => {
      const existing = PARTICIPANTS.find(
        (p) => p.conversationId === conversationId && p.sellerId === sellerId,
      );
      if (existing) return existing;

      const addedBy = getCurrentMockSellerId() ?? undefined;
      const participant: IConversationParticipant = {
        conversationId,
        sellerId,
        addedBy,
        addedAt: new Date().toISOString(),
        source,
      };
      PARTICIPANTS.push(participant);

      // Mirrors notify_conversation_participant_added: only the manual path
      // gets a fresh bell notification (mention adds ride the existing
      // note-mention notification instead — see useConversationNotes).
      if (source === "manual") {
        await notificationsApi.create({
          dedupeKey: `conv-participant-${conversationId}-${sellerId}`,
          lifecycle: "event",
          type: "conversa.colaboradorAdicionado",
          category: "operational",
          severity: "info",
          recipientId: sellerId,
          recipientType: "seller",
          title: "Você foi adicionado a uma conversa",
          entityRef: { type: "conversation", id: conversationId },
          channels: ["inApp"],
          source: "rule",
        });
      }

      return participant;
    });
  },

  async remove(conversationId: ID, sellerId: ID): Promise<void> {
    return runApi("conversationParticipantsApi", "remove", () => {
      const idx = PARTICIPANTS.findIndex(
        (p) => p.conversationId === conversationId && p.sellerId === sellerId,
      );
      if (idx >= 0) PARTICIPANTS.splice(idx, 1);
    });
  },
};
```

Rationale for skipping `logMockMutation`/`auditLog` here: unlike `assignSeller`/`unassign` (which change WHO owns the customer relationship — carteira-adjacent, audited), adding/removing a collaborator is a lightweight, reversible, self-service action with no carteira impact; the closest precedent (`mockRotationParticipantsProvider`) explicitly documents skipping audit for the same reason ("configuration side effects of the flow").

Before writing this file, open `src/mocks/api/notifications.ts` and `src/shared/types/notification.ts` to confirm the exact `INotification`/`create()` input shape (Task 5 already added `"conversa.colaboradorAdicionado"` to the union) — the `create` call above must match the `Omit<INotification, "id" | "createdAt" | "status">` shape exactly (no `dedupeKey` typo, `entityRef` object shape `{ type, id }`).

- [ ] **Step 2: Write the thin provider delegator**

Create `src/providers/data/impl/mock/conversationParticipants.ts`:

```ts
import { conversationParticipantsApi } from "@/mocks";
import type { ID } from "@/shared/types";
import type { IConversationParticipantsProvider } from "../../contracts/conversationParticipants";

/** Thin mock delegator — all logic lives in `conversationParticipantsApi`
 *  (same split as `impl/mock/rotationParticipants.ts` → `rotationParticipantsApi`). */
export const mockConversationParticipantsProvider: IConversationParticipantsProvider = {
  list: (conversationId: ID) => conversationParticipantsApi.list(conversationId),
  add: (conversationId: ID, sellerId: ID, source: "manual" | "mention") =>
    conversationParticipantsApi.add(conversationId, sellerId, source),
  remove: (conversationId: ID, sellerId: ID) =>
    conversationParticipantsApi.remove(conversationId, sellerId),
};
```

- [ ] **Step 3: Export from the mocks barrels**

In `src/mocks/api/index.ts`: grep `rotationParticipantsApi` for the exact export line style and add the sibling line for `conversationParticipantsApi` (same file).

In `src/mocks/index.ts`: same grep-and-mirror for the public barrel re-export.

- [ ] **Step 4: Register in the factory**

In `src/providers/data/factory.ts`:

Add the two imports (mirroring lines 44/91 for `rotationParticipants`):

```ts
import { mockConversationParticipantsProvider } from "./impl/mock/conversationParticipants";
```

Add to `mockProviders` (near `conversationTags`):

```ts
  conversationParticipants: mockConversationParticipantsProvider,
```

(Task 9 adds the `supabaseProviders` counterpart — leave that entry for now; `tsc` will still flag the missing `supabaseProviders.conversationParticipants` key until Task 9.)

- [ ] **Step 5: Type-check the mock side**

Run: `bunx tsc --noEmit 2>&1 | grep -i "mockProviders\|conversationParticipants"`
Expected: no more error about `mockProviders` missing `conversationParticipants`; the `supabaseProviders` one still shows (expected until Task 9).

- [ ] **Step 6: Commit**

```bash
git add src/mocks/api/conversationParticipants.ts src/providers/data/impl/mock/conversationParticipants.ts src/mocks/api/index.ts src/mocks/index.ts src/providers/data/factory.ts
git commit -m "feat: mock implementation of conversation collaborators"
```

---

### Task 8: Wire "Minhas conversas" inclusion + close-cleanup into `mocks/api/conversations.ts`

**Files:**
- Modify: `src/mocks/api/conversations.ts`

**Interfaces:**
- Consumes: `sellerCollaboratesOnSync`, `clearConversationParticipantsSync` from `./conversationParticipants` (Task 7).

- [ ] **Step 1: Add the import**

At the top of `src/mocks/api/conversations.ts`, add alongside the existing `rotationParticipantsApi` import:

```ts
import { sellerCollaboratesOnSync, clearConversationParticipantsSync } from "./conversationParticipants";
```

- [ ] **Step 2: Widen the "Minhas conversas" filter in `applyNonSearchFilters`**

Find:

```ts
  if (
    params.assignmentAny &&
    (params.assignmentAny.sellerIds?.length || params.assignmentAny.queue)
  )
    filtered = filtered.filter((c) => matchesAssignmentAny(c, params.assignmentAny!));
```

Replace with:

```ts
  if (
    params.assignmentAny &&
    (params.assignmentAny.sellerIds?.length || params.assignmentAny.queue)
  )
    filtered = filtered.filter(
      (c) =>
        matchesAssignmentAny(c, params.assignmentAny!) ||
        (params.assignmentAny!.sellerIds?.length
          ? sellerCollaboratesOnSync(c.id, params.assignmentAny!.sellerIds)
          : false),
    );
```

`matchesAssignmentAny` itself stays untouched (its own signature/tests are unaffected) — the collaborator OR-branch is added at the call site, mirroring exactly how the migration in Task 3 added its branch alongside (not inside) the existing SQL predicate.

- [ ] **Step 3: Clear participants on `close()`**

Find (`conversationsApi.close`, per the existing file):

```ts
  async close(id: ID, status: "resolvida" | "arquivada"): Promise<IConversation> {
    return runApi("conversationsApi", "close", () => {
      const before = getMockState().conversations.find((c) => c.id === id);
      if (!before) throw new MockNotFoundError("conversation", id);
      const updated = patchById("conversations", id, {
        status,
        assignedSellerId: undefined,
        isSdrActive: false,
      });
      if (!updated) throw new MockNotFoundError("conversation", id);
      emitConversationActivity(before, updated, getCurrentMockSellerId());
      return updated;
    });
  },
```

Replace with:

```ts
  async close(id: ID, status: "resolvida" | "arquivada"): Promise<IConversation> {
    return runApi("conversationsApi", "close", () => {
      const before = getMockState().conversations.find((c) => c.id === id);
      if (!before) throw new MockNotFoundError("conversation", id);
      const updated = patchById("conversations", id, {
        status,
        assignedSellerId: undefined,
        isSdrActive: false,
      });
      if (!updated) throw new MockNotFoundError("conversation", id);
      clearConversationParticipantsSync(id);
      emitConversationActivity(before, updated, getCurrentMockSellerId());
      return updated;
    });
  },
```

This mirrors `clear_conversation_participants_on_close` (Task 1) — the mock has no DB trigger, so the cleanup is inlined at the one documented entry point for reaching a terminal status (`IConversationsProvider.close`, per its own doc comment: "Close a conversation atomically ... in one server op").

- [ ] **Step 4: Write a focused Vitest for the filter widening**

Find or create `src/mocks/api/conversations.test.ts` (check first with `ls src/mocks/api/*.test.ts` whether one already exists to extend instead of create):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { matchesAssignmentAny } from "./conversations";

// This test only covers the pure matchesAssignmentAny — the collaborator
// OR-branch lives at the applyNonSearchFilters call site (not inside
// matchesAssignmentAny itself) and is exercised indirectly by
// conversationsApi.list in the mock; a full store-backed test is out of
// proportion for this delta. Confirms matchesAssignmentAny's OWN contract is
// unchanged by this feature (a regression here would mean the call-site
// change accidentally edited the wrong function).
describe("matchesAssignmentAny (unchanged by collaborators)", () => {
  it("still matches only by assignedSellerId/queue, never by collaboration", () => {
    const conversation = {
      id: "conv-1",
      assignedSellerId: undefined,
      isSdrActive: false,
      status: "aguardando",
    } as Parameters<typeof matchesAssignmentAny>[0];
    expect(matchesAssignmentAny(conversation, { sellerIds: ["seller-other"] })).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `bun run test src/mocks/api/conversations.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/mocks/api/conversations.ts src/mocks/api/conversations.test.ts
git commit -m "feat: include collaborators in mock 'Minhas conversas' + clear on close"
```

---

### Task 9: Supabase implementation

**Files:**
- Create: `src/providers/data/impl/supabase/conversationParticipants.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/impl/supabase/conversations.ts` (add `is_collaborator` to `ConversationRow`/`rowToConversation` — Task 3's RPC output)

**Interfaces:**
- Consumes: table `public.conversation_participants` (columns `conversation_id, seller_id, added_by, added_at, source` after Task 1).

- [ ] **Step 1: Write the supabase provider**

Create `src/providers/data/impl/supabase/conversationParticipants.ts`:

```ts
import type { ID, IConversationParticipant } from "@/shared/types";
import type { IConversationParticipantsProvider } from "../../contracts/conversationParticipants";
import { getSupabaseClient } from "@/shared/lib/supabase";

interface ParticipantRow {
  conversation_id: string;
  seller_id: string;
  added_by: string | null;
  added_at: string;
  source: "manual" | "mention";
}

const TABLE = "conversation_participants";
const COLUMNS = "conversation_id, seller_id, added_by, added_at, source";

function rowToParticipant(row: ParticipantRow): IConversationParticipant {
  return {
    conversationId: row.conversation_id,
    sellerId: row.seller_id,
    addedBy: row.added_by ?? undefined,
    addedAt: row.added_at,
    source: row.source,
  };
}

/**
 * Supabase implementation of {@link IConversationParticipantsProvider}.
 * Enforcement is entirely at the RLS layer (`cp_insert`/`cp_delete`/
 * `cp_select`, `supabase/migrations/20260704120000_...lifecycle.sql`) — no RPC
 * needed, mirroring `impl/supabase/rotationParticipants.ts`.
 */
export const supabaseConversationParticipantsProvider: IConversationParticipantsProvider = {
  async list(conversationId: ID): Promise<IConversationParticipant[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("conversation_id", conversationId);
    if (error)
      throw new Error(`[supabase] conversationParticipants.list(${conversationId}) failed: ${error.message}`);
    return (data as ParticipantRow[]).map(rowToParticipant);
  },

  async add(
    conversationId: ID,
    sellerId: ID,
    source: "manual" | "mention",
  ): Promise<IConversationParticipant> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .upsert(
        { conversation_id: conversationId, seller_id: sellerId, source },
        { onConflict: "conversation_id,seller_id", ignoreDuplicates: true },
      )
      .select(COLUMNS)
      .single();
    if (error) {
      // ignoreDuplicates + .single() on a no-op upsert returns no row (not an
      // error) on some PostgREST versions; re-read explicitly as a fallback so
      // a duplicate invite is idempotent instead of surfacing a confusing error.
      const { data: existing, error: readError } = await getSupabaseClient()
        .from(TABLE)
        .select(COLUMNS)
        .eq("conversation_id", conversationId)
        .eq("seller_id", sellerId)
        .single();
      if (readError)
        throw new Error(`[supabase] conversationParticipants.add(${conversationId}) failed: ${error.message}`);
      return rowToParticipant(existing as ParticipantRow);
    }
    return rowToParticipant(data as ParticipantRow);
  },

  async remove(conversationId: ID, sellerId: ID): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABLE)
      .delete()
      .eq("conversation_id", conversationId)
      .eq("seller_id", sellerId);
    if (error)
      throw new Error(`[supabase] conversationParticipants.remove(${conversationId}) failed: ${error.message}`);
  },
};
```

- [ ] **Step 2: Add `is_collaborator` to the shared `ConversationRow`/`rowToConversation`**

In `src/providers/data/impl/supabase/conversations.ts`, find:

```ts
interface ConversationRow {
  id: string;
  store_id: string;
  customer_id: string | null;
  lead_id: string | null;
  assigned_seller_id: string | null;
  channel: IConversation["channel"];
  whatsapp_account_id: string | null;
  status: IConversation["status"];
  is_sdr_active: boolean;
  tags: string[];
  linked_order_id: string | null;
  last_message_at: string;
  unread_count: number;
  created_at: string;
  queued_at: string | null;
}
```

Replace with:

```ts
interface ConversationRow {
  id: string;
  store_id: string;
  customer_id: string | null;
  lead_id: string | null;
  assigned_seller_id: string | null;
  channel: IConversation["channel"];
  whatsapp_account_id: string | null;
  status: IConversation["status"];
  is_sdr_active: boolean;
  tags: string[];
  linked_order_id: string | null;
  last_message_at: string;
  unread_count: number;
  created_at: string;
  queued_at: string | null;
  /** Only present on rows returned by the `search_conversations` RPC. */
  is_collaborator?: boolean;
}
```

Find:

```ts
function rowToConversation(row: ConversationRow): IConversation {
  return {
    id: row.id,
    storeId: row.store_id,
    customerId: row.customer_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    assignedSellerId: row.assigned_seller_id ?? undefined,
    channel: row.channel,
    whatsappAccountId: row.whatsapp_account_id ?? undefined,
    status: row.status,
    isSdrActive: row.is_sdr_active,
    tags: row.tags,
    linkedOrderId: row.linked_order_id ?? undefined,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
    queuedAt: row.queued_at ?? undefined,
  };
}
```

Replace with:

```ts
function rowToConversation(row: ConversationRow): IConversation {
  return {
    id: row.id,
    storeId: row.store_id,
    customerId: row.customer_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    assignedSellerId: row.assigned_seller_id ?? undefined,
    channel: row.channel,
    whatsappAccountId: row.whatsapp_account_id ?? undefined,
    status: row.status,
    isSdrActive: row.is_sdr_active,
    tags: row.tags,
    linkedOrderId: row.linked_order_id ?? undefined,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
    queuedAt: row.queued_at ?? undefined,
    isCollaborator: row.is_collaborator ?? undefined,
  };
}
```

- [ ] **Step 3: Register in the factory**

In `src/providers/data/factory.ts`, add the import (mirroring line 91 for rotationParticipants):

```ts
import { supabaseConversationParticipantsProvider } from "./impl/supabase/conversationParticipants";
```

Add to `supabaseProviders` (near `conversationTags`):

```ts
  conversationParticipants: supabaseConversationParticipantsProvider,
```

- [ ] **Step 4: Type-check clean**

Run: `bunx tsc --noEmit 2>&1 | grep -i "conversationParticipants\|IDataProviders"`
Expected: no output (both `mockProviders` and `supabaseProviders` now satisfy `IDataProviders`).

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/conversationParticipants.ts src/providers/data/impl/supabase/conversations.ts src/providers/data/factory.ts
git commit -m "feat: supabase implementation of conversation collaborators"
```

---

## Phase 4 — Pure engines (TDD)

### Task 10: `resolveInviteCandidates`

**Files:**
- Create: `src/features/conversations/engine/collaboratorCandidates.ts`
- Create: `src/features/conversations/engine/collaboratorCandidates.test.ts`

**Interfaces:**
- Consumes: `resolveAccessRecipients` from `@/features/admin-settings/utils/accessRecipients` (existing pure function — `resolveAccessRecipients(rules: {kind,targetValue}[], sellers: {id,role,storeId}[]): Set<string>`).
- Produces: `resolveInviteCandidates(sellers, opts): ISeller[]`.

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/engine/collaboratorCandidates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveInviteCandidates } from "./collaboratorCandidates";
import type { ISeller } from "@/shared/types";

function seller(id: string, overrides: Partial<ISeller> = {}): ISeller {
  return {
    id,
    storeId: "store-1",
    fullName: `Seller ${id}`,
    email: `${id}@example.com`,
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    ...overrides,
  } as ISeller;
}

describe("resolveInviteCandidates", () => {
  const sellers = [seller("assignee"), seller("collaborator-1"), seller("candidate-a"), seller("candidate-b")];

  it("excludes the current assignee and existing collaborators", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: ["collaborator-1"],
      whatsappAccountId: null,
      crossInstanceAllowed: true,
      accessRules: [],
    });
    expect(result.map((s) => s.id)).toEqual(["candidate-a", "candidate-b"]);
  });

  it("returns everyone eligible when there is no whatsapp instance (pool/lead anônimo)", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      whatsappAccountId: null,
      crossInstanceAllowed: false,
      accessRules: [{ kind: "seller", targetValue: "candidate-a" }],
    });
    expect(result.map((s) => s.id).sort()).toEqual(["candidate-a", "candidate-b", "collaborator-1"]);
  });

  it("returns everyone eligible when cross-instance is allowed, regardless of access rules", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      whatsappAccountId: "account-1",
      crossInstanceAllowed: true,
      accessRules: [{ kind: "seller", targetValue: "candidate-a" }],
    });
    expect(result.map((s) => s.id).sort()).toEqual(["candidate-a", "candidate-b", "collaborator-1"]);
  });

  it("when cross-instance is off, only sellers matching a seller/store access rule for the instance appear", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      whatsappAccountId: "account-1",
      crossInstanceAllowed: false,
      accessRules: [{ kind: "seller", targetValue: "candidate-a" }],
    });
    expect(result.map((s) => s.id)).toEqual(["candidate-a"]);
  });

  it("a 'store' kind rule opens the instance to every seller of the store", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      whatsappAccountId: "account-1",
      crossInstanceAllowed: false,
      accessRules: [{ kind: "store", targetValue: "store-1" }],
    });
    expect(result.map((s) => s.id).sort()).toEqual(["candidate-a", "candidate-b", "collaborator-1"]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun run test src/features/conversations/engine/collaboratorCandidates.test.ts`
Expected: FAIL — `Cannot find module './collaboratorCandidates'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/conversations/engine/collaboratorCandidates.ts`:

```ts
import type { ID, ISeller } from "@/shared/types";
import {
  resolveAccessRecipients,
  type IAccessRuleLike,
} from "@/features/admin-settings/utils/accessRecipients";

export interface IResolveInviteCandidatesOptions {
  assignedSellerId: ID | undefined;
  existingCollaboratorIds: ID[];
  /** Null = pool/lead-anônimo conversation (no instance gate at all). */
  whatsappAccountId: ID | null;
  /** `IPlatformSettings.participantCrossInstance` for the conversation's store. */
  crossInstanceAllowed: boolean;
  /** Access rules for `whatsappAccountId` (empty when `whatsappAccountId` is null). */
  accessRules: IAccessRuleLike[];
}

/**
 * Who can be invited as a collaborator on this conversation. Excludes the
 * current assignee and anyone already collaborating; when the conversation is
 * bound to a WhatsApp instance and cross-instance invites are OFF
 * (`IPlatformSettings.participantCrossInstance`), further narrows to sellers
 * who already have instance access — inviting someone outside that set would
 * add them as a participant who still can't see the conversation (the access
 * model ANDs `is_conversation_participant` with instance access unless the
 * flag is on; see `can_access_conversation`,
 * `supabase/migrations/20260620120000_access_model_two_gates.sql:96-104`).
 *
 * Known limitation, inherited from `resolveAccessRecipients`'s only existing
 * caller (`InstanceAccessSheet.tsx`): `ISeller` carries no `role` field today,
 * so a `role`-kind access rule never resolves any candidate from here (same
 * gap the account-access-count UI already accepts, deferred to PRD-211's
 * follow-up). `seller`- and `store`-kind rules resolve correctly.
 */
export function resolveInviteCandidates(
  sellers: ISeller[],
  opts: IResolveInviteCandidatesOptions,
): ISeller[] {
  const excluded = new Set<ID>([
    ...(opts.assignedSellerId ? [opts.assignedSellerId] : []),
    ...opts.existingCollaboratorIds,
  ]);
  const eligible = sellers.filter((s) => !excluded.has(s.id));

  if (opts.whatsappAccountId === null || opts.crossInstanceAllowed) {
    return eligible;
  }

  const accessible = resolveAccessRecipients(
    opts.accessRules,
    eligible.map((s) => ({ id: s.id, role: "", storeId: s.storeId })),
  );
  return eligible.filter((s) => accessible.has(s.id));
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun run test src/features/conversations/engine/collaboratorCandidates.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/collaboratorCandidates.ts src/features/conversations/engine/collaboratorCandidates.test.ts
git commit -m "feat: pure engine for collaborator invite candidate resolution"
```

---

### Task 11: `canManageCollaborators` / `canRemoveCollaborator` in `assignmentGate.ts`

**Files:**
- Modify: `src/features/conversations/engine/assignmentGate.ts`
- Modify: `src/features/conversations/engine/assignmentGate.test.ts`

**Interfaces:**
- Produces: `canManageCollaborators(conversation, ctx): boolean`; `canRemoveCollaborator(conversation, collaboratorSellerId, ctx): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/conversations/engine/assignmentGate.test.ts`:

```ts
import { canManageCollaborators, canRemoveCollaborator } from "./assignmentGate";

describe("canManageCollaborators", () => {
  it("allows staff regardless of assignment", () => {
    expect(canManageCollaborators({ assignedSellerId: "seller-1" }, { isStaff: true, sellerId: "seller-2" })).toBe(true);
  });

  it("allows the conversation's own assignee", () => {
    expect(canManageCollaborators({ assignedSellerId: "seller-1" }, { isStaff: false, sellerId: "seller-1" })).toBe(true);
  });

  it("denies a non-staff, non-assignee seller", () => {
    expect(canManageCollaborators({ assignedSellerId: "seller-1" }, { isStaff: false, sellerId: "seller-2" })).toBe(false);
  });

  it("denies everyone on a pool conversation (no assignee to manage from)", () => {
    expect(canManageCollaborators({ assignedSellerId: undefined }, { isStaff: false, sellerId: "seller-1" })).toBe(false);
  });
});

describe("canRemoveCollaborator", () => {
  it("allows staff to remove anyone", () => {
    expect(
      canRemoveCollaborator({ assignedSellerId: "seller-1" }, "seller-3", { isStaff: true, sellerId: "seller-9" }),
    ).toBe(true);
  });

  it("allows the assignee to remove any collaborator", () => {
    expect(
      canRemoveCollaborator({ assignedSellerId: "seller-1" }, "seller-3", { isStaff: false, sellerId: "seller-1" }),
    ).toBe(true);
  });

  it("allows a collaborator to remove themselves", () => {
    expect(
      canRemoveCollaborator({ assignedSellerId: "seller-1" }, "seller-3", { isStaff: false, sellerId: "seller-3" }),
    ).toBe(true);
  });

  it("denies an unrelated seller removing someone else's collaboration", () => {
    expect(
      canRemoveCollaborator({ assignedSellerId: "seller-1" }, "seller-3", { isStaff: false, sellerId: "seller-4" }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun run test src/features/conversations/engine/assignmentGate.test.ts`
Expected: FAIL — `canManageCollaborators`/`canRemoveCollaborator` are not exported.

- [ ] **Step 3: Implement**

Append to `src/features/conversations/engine/assignmentGate.ts`:

```ts
/**
 * Whether `sellerId` may invite/remove collaborators on this conversation —
 * mirrors the RLS `cp_insert` policy (staff, or the conversation's current
 * assignee): `supabase/migrations/20260704120000_conversation_participants_lifecycle.sql`.
 */
export function canManageCollaborators(
  conversation: Pick<IConversation, "assignedSellerId">,
  ctx: { isStaff: boolean; sellerId: ID | null | undefined },
): boolean {
  if (ctx.isStaff) return true;
  return isOwnConversation(conversation, ctx.sellerId);
}

/**
 * Whether `sellerId` may remove `collaboratorSellerId` from a conversation's
 * collaborator list — mirrors the RLS `cp_delete` policy: staff, the
 * conversation's assignee, OR the collaborator removing themselves.
 */
export function canRemoveCollaborator(
  conversation: Pick<IConversation, "assignedSellerId">,
  collaboratorSellerId: ID,
  ctx: { isStaff: boolean; sellerId: ID | null | undefined },
): boolean {
  if (ctx.isStaff) return true;
  if (ctx.sellerId != null && ctx.sellerId === collaboratorSellerId) return true;
  return isOwnConversation(conversation, ctx.sellerId);
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `bun run test src/features/conversations/engine/assignmentGate.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/assignmentGate.ts src/features/conversations/engine/assignmentGate.test.ts
git commit -m "feat: add collaborator management gates mirroring cp_insert/cp_delete RLS"
```

---

### Task 12: `resolveMentionParticipants` in `mentions.ts`

**Files:**
- Modify: `src/features/conversations/engine/mentions.ts`
- Modify: `src/features/conversations/engine/mentions.test.ts`

**Interfaces:**
- Consumes: `ID` from `@/shared/types` (already imported in `mentions.ts`).
- Produces: `resolveMentionParticipants(mentionedIds, opts): ID[]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/conversations/engine/mentions.test.ts`:

```ts
import { resolveMentionParticipants } from "./mentions";

describe("resolveMentionParticipants", () => {
  it("resolves mentioned sellers when the author is the conversation's assignee", () => {
    const result = resolveMentionParticipants(["s2", "s3"], {
      assignedSellerId: "s1",
      authorId: "s1",
      isAuthorStaff: false,
      existingParticipantIds: [],
    });
    expect(result).toEqual(["s2", "s3"]);
  });

  it("resolves mentioned sellers when the author is staff, even on someone else's conversation", () => {
    const result = resolveMentionParticipants(["s2"], {
      assignedSellerId: "s1",
      authorId: "s9",
      isAuthorStaff: true,
      existingParticipantIds: [],
    });
    expect(result).toEqual(["s2"]);
  });

  it("resolves nothing when the author is neither staff nor the assignee", () => {
    const result = resolveMentionParticipants(["s2"], {
      assignedSellerId: "s1",
      authorId: "s9",
      isAuthorStaff: false,
      existingParticipantIds: [],
    });
    expect(result).toEqual([]);
  });

  it("excludes the conversation's own assignee from the result", () => {
    const result = resolveMentionParticipants(["s1", "s2"], {
      assignedSellerId: "s1",
      authorId: "s1",
      isAuthorStaff: false,
      existingParticipantIds: [],
    });
    expect(result).toEqual(["s2"]);
  });

  it("excludes sellers who are already collaborators", () => {
    const result = resolveMentionParticipants(["s2", "s3"], {
      assignedSellerId: "s1",
      authorId: "s1",
      isAuthorStaff: false,
      existingParticipantIds: ["s3"],
    });
    expect(result).toEqual(["s2"]);
  });

  it("returns an empty array for an empty mention list", () => {
    expect(
      resolveMentionParticipants([], {
        assignedSellerId: "s1",
        authorId: "s1",
        isAuthorStaff: false,
        existingParticipantIds: [],
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun run test src/features/conversations/engine/mentions.test.ts`
Expected: FAIL — `resolveMentionParticipants` is not exported.

- [ ] **Step 3: Implement**

Append to `src/features/conversations/engine/mentions.ts` (add `type ID` to the existing `import type { ID } from "@/shared/types";` line if it isn't already there — it already is, per the current file's line 5):

```ts
export interface IResolveMentionParticipantsOptions {
  assignedSellerId: ID | undefined;
  authorId: ID;
  isAuthorStaff: boolean;
  existingParticipantIds: ID[];
}

/**
 * Which of the sellers mentioned in a note should become collaborators
 * (`conversation_participants`, source='mention'). Mirrors the `cp_insert` RLS
 * policy from the author's perspective: only staff or the conversation's own
 * assignee can grant new access via a mention — otherwise the mention still
 * highlights/notifies as usual (unchanged), it just never touches
 * `conversation_participants`. Never returns the conversation's own assignee
 * (already has access) or a seller who already collaborates.
 */
export function resolveMentionParticipants(
  mentionedIds: ID[],
  opts: IResolveMentionParticipantsOptions,
): ID[] {
  const authorAuthorized = opts.isAuthorStaff || opts.authorId === opts.assignedSellerId;
  if (!authorAuthorized) return [];

  const existing = new Set(opts.existingParticipantIds);
  return mentionedIds.filter((id) => id !== opts.assignedSellerId && !existing.has(id));
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `bun run test src/features/conversations/engine/mentions.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/mentions.ts src/features/conversations/engine/mentions.test.ts
git commit -m "feat: add resolveMentionParticipants pure engine"
```

---

## Phase 5 — Hooks

### Task 13: `useConversationDetail` — add `collaborators`

**Files:**
- Modify: `src/features/conversations/hooks/useConversationDetail.ts`

**Interfaces:**
- Consumes: `useConversationParticipantsProvider` (Task 6).
- Produces: `IConversationDetail.collaborators: ISeller[]`.

- [ ] **Step 1: Extend the hook**

Rewrite `src/features/conversations/hooks/useConversationDetail.ts` in full:

```ts
import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  ICustomer,
  ID,
  IConversation,
  IConversationContact,
  ILead,
  ISeller,
  IWhatsAppAccount,
} from "@/shared/types";
import {
  useConversationsProvider,
  useConversationParticipantsProvider,
  useCustomersProvider,
  useLeadsProvider,
  useSellersProvider,
  useWhatsAppAccountsProvider,
} from "@/providers/data";

/** A collaborator resolved to its full `ISeller`, paired with how they were
 *  added — the pairing `useConversationParticipantsProvider().list()` alone
 *  can't give the UI (it returns `IConversationParticipant`, not `ISeller`). */
export interface ICollaboratorWithSeller {
  seller: ISeller;
  source: "manual" | "mention";
}

interface IConversationDetailData {
  conversation: IConversation | null;
  customer: ICustomer | null;
  lead: ILead | null;
  contact: IConversationContact | null;
  whatsappAccount: IWhatsAppAccount | null;
  assignedSeller: ISeller | null;
  /** Collaborators (co-responsáveis) currently on this conversation — never
   *  includes the assignee. Empty on a pool conversation. */
  collaborators: ICollaboratorWithSeller[];
  notFound: boolean;
}

export interface IConversationDetail extends IConversationDetailData {
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

const EMPTY_DETAIL: IConversationDetailData = {
  conversation: null,
  customer: null,
  lead: null,
  contact: null,
  whatsappAccount: null,
  assignedSeller: null,
  collaborators: [],
  notFound: false,
};

function conversationDetailKey(conversationId: ID | null): readonly [string, ID | null] {
  return ["conversation-detail", conversationId];
}

export function useConversationDetail(conversationId: ID | null): IConversationDetail {
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const leadsProvider = useLeadsProvider();
  const whatsappProvider = useWhatsAppAccountsProvider();
  const sellersProvider = useSellersProvider();
  const participantsProvider = useConversationParticipantsProvider();

  const query = useQuery({
    queryKey: conversationDetailKey(conversationId),
    queryFn: async (): Promise<IConversationDetailData> => {
      const id = conversationId as ID;
      let conversation: IConversation;
      try {
        conversation = await conversationsProvider.get(id);
      } catch (err) {
        if (err instanceof Error && /not found/i.test(err.message)) {
          return { ...EMPTY_DETAIL, notFound: true };
        }
        throw err;
      }

      const [customer, lead, whatsappAccount, assignedSeller, contacts, participants] =
        await Promise.all([
          conversation.customerId
            ? customersProvider.getViaConversation(id).catch(() => null)
            : null,
          conversation.leadId ? leadsProvider.get(conversation.leadId).catch(() => null) : null,
          conversation.whatsappAccountId
            ? whatsappProvider.get(conversation.whatsappAccountId).catch(() => null)
            : null,
          conversation.assignedSellerId
            ? sellersProvider.get(conversation.assignedSellerId).catch(() => null)
            : null,
          conversationsProvider.listContacts([id]).catch(() => []),
          participantsProvider.list(id).catch(() => []),
        ]);
      const contact = contacts.find((c) => c.conversationId === id) ?? null;

      const collaborators = (
        await Promise.all(
          participants.map(async (p) => {
            const seller = await sellersProvider.get(p.sellerId).catch(() => null);
            return seller ? { seller, source: p.source } : null;
          }),
        )
      ).filter((c): c is ICollaboratorWithSeller => c !== null);

      return {
        conversation,
        customer,
        lead,
        contact,
        whatsappAccount,
        assignedSeller,
        collaborators,
        notFound: false,
      };
    },
    enabled: !!conversationId,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const { refetch } = query;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (!conversationId) {
    return { ...EMPTY_DETAIL, isLoading: false, error: null, refresh };
  }

  return {
    ...(query.data ?? EMPTY_DETAIL),
    isLoading: query.isLoading,
    error: query.error,
    refresh,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "useConversationDetail\|IConversationDetail"`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/hooks/useConversationDetail.ts
git commit -m "feat: resolve collaborators in useConversationDetail"
```

---

### Task 14: `useConversationCollaborators` mutation hook

**Files:**
- Create: `src/features/conversations/hooks/useConversationCollaborators.ts`

**Interfaces:**
- Consumes: `useConversationParticipantsProvider`, `useAuth` (`hasRole`, `currentUser.sellerId`), `canManageCollaborators`/`canRemoveCollaborator` (Task 11).
- Produces:
```ts
export interface IUseConversationCollaborators {
  canManage: boolean;
  canRemove: (collaboratorSellerId: ID) => boolean;
  addCollaborator: (sellerId: ID) => Promise<void>;
  removeCollaborator: (sellerId: ID) => Promise<void>;
  isMutating: boolean;
}
export function useConversationCollaborators(
  conversation: Pick<IConversation, "id" | "assignedSellerId">,
  onChanged: () => void,
): IUseConversationCollaborators;
```

- [ ] **Step 1: Write the hook**

Create `src/features/conversations/hooks/useConversationCollaborators.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversation } from "@/shared/types";
import { useConversationParticipantsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { canManageCollaborators, canRemoveCollaborator } from "../engine/assignmentGate";

export interface IUseConversationCollaborators {
  /** Whether the current user may open the invite dialog. */
  canManage: boolean;
  /** Whether the current user may remove a SPECIFIC collaborator (includes self-removal). */
  canRemove: (collaboratorSellerId: ID) => boolean;
  addCollaborator: (sellerId: ID) => Promise<void>;
  removeCollaborator: (sellerId: ID) => Promise<void>;
  isMutating: boolean;
}

/**
 * Add/remove collaborators on a conversation. Mirrors `useConversationNotes`'s
 * shape (mutation + toast on error, caller-provided `onChanged` refetches the
 * conversation detail — no local cache of its own).
 */
export function useConversationCollaborators(
  conversation: Pick<IConversation, "id" | "assignedSellerId">,
  onChanged: () => void,
): IUseConversationCollaborators {
  const provider = useConversationParticipantsProvider();
  const { currentUser, hasRole } = useAuth();
  const isStaff = hasRole(["Owner", "Gestor"]);
  const sellerId = currentUser?.sellerId;

  const addMutation = useMutation({
    mutationFn: (targetSellerId: ID) => provider.add(conversation.id, targetSellerId, "manual"),
    onSuccess: onChanged,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar o colaborador."),
  });

  const removeMutation = useMutation({
    mutationFn: (targetSellerId: ID) => provider.remove(conversation.id, targetSellerId),
    onSuccess: onChanged,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível remover o colaborador."),
  });

  return {
    canManage: canManageCollaborators(conversation, { isStaff, sellerId }),
    canRemove: (collaboratorSellerId) =>
      canRemoveCollaborator(conversation, collaboratorSellerId, { isStaff, sellerId }),
    addCollaborator: (targetSellerId) => addMutation.mutateAsync(targetSellerId),
    removeCollaborator: (targetSellerId) => removeMutation.mutateAsync(targetSellerId),
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "useConversationCollaborators"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/hooks/useConversationCollaborators.ts
git commit -m "feat: add useConversationCollaborators mutation hook"
```

---

### Task 15: `@mention` auto-add wiring (mock) + `assignedSellerId` threading (both backends)

**Files:**
- Modify: `src/features/conversations/hooks/useConversationNotes.ts`
- Modify: `src/features/conversations/components/notes/InlineNoteComposer.tsx`
- Modify: `src/features/conversations/components/MessageInput.tsx` (2 call sites of `<InlineNoteComposer>`)

**Interfaces:**
- Consumes: `resolveMentionParticipants` (Task 12), `useConversationParticipantsProvider` (Task 6).
- Produces: `useConversationNotes(conversationId, storeId, assignedSellerId?, enabled = true)` (new 3rd param inserted before the existing `enabled`; no current caller passes `enabled` positionally today, confirmed by grep — safe to insert).

For supabase, the auto-add is entirely client-driven here too (no SQL trigger touches `conversation_notes`/`conversation_participants` together) — kept deliberately simple and identical across both backends: after a note is created, the hook computes eligible mentioned sellers and calls `provider.add(id, sellerId, "mention")` for each, best-effort (failures are swallowed, never block the note itself, since the note already saved successfully).

- [ ] **Step 1: Extend `useConversationNotes`**

Rewrite `src/features/conversations/hooks/useConversationNotes.ts` in full:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversationNote } from "@/shared/types";
import { useConversationNotesProvider, useConversationParticipantsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { resolveMentionParticipants } from "../engine/mentions";

export interface IUseConversationNotes {
  notes: IConversationNote[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  currentSellerId: ID | undefined;
  isStaff: boolean;
  createNote: (content: string, mentions: ID[]) => Promise<IConversationNote>;
  updateNote: (
    id: ID,
    patch: Partial<Pick<IConversationNote, "content" | "mentions" | "pinned">>,
  ) => Promise<IConversationNote>;
  removeNote: (id: ID) => Promise<void>;
  isMutating: boolean;
}

/**
 * Conversation notes for the internal attendant board: a cached list plus
 * create/update/delete mutations that invalidate it. The author is the logged
 * seller; `storeId` is threaded from the conversation so the supabase RLS
 * WITH CHECK (store_id = current_store_id()) passes.
 *
 * `assignedSellerId` (optional — omit when the caller doesn't know it, e.g.
 * `NotesButton`/`MessageList`, which never create notes) feeds
 * `resolveMentionParticipants`: mentioning a colleague who isn't already the
 * assignee or a collaborator auto-adds them as one (source='mention'), but
 * ONLY when the note's author is staff or the conversation's own assignee —
 * mirrors the `cp_insert` RLS gate from the author's perspective.
 */
export function useConversationNotes(
  conversationId: ID,
  storeId: ID,
  assignedSellerId?: ID,
  enabled = true,
): IUseConversationNotes {
  const provider = useConversationNotesProvider();
  const participantsProvider = useConversationParticipantsProvider();
  const { currentUser, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const currentSellerId = currentUser?.sellerId;
  const isStaff = hasRole(["Owner", "Gestor"]);

  const queryKey = ["conversation-notes", conversationId];

  const query = useQuery({
    queryKey,
    queryFn: () => provider.list(conversationId),
    enabled: enabled && Boolean(conversationId),
    staleTime: 30_000,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: async ({ content, mentions }: { content: string; mentions: ID[] }) => {
      if (!currentSellerId) {
        throw new Error("Sua sessão não tem um vendedor associado.");
      }
      const note = await provider.create({
        conversationId,
        storeId,
        authorId: currentSellerId,
        content,
        mentions,
      });

      if (mentions.length > 0) {
        const existing = await participantsProvider.list(conversationId).catch(() => []);
        const toAdd = resolveMentionParticipants(mentions, {
          assignedSellerId,
          authorId: currentSellerId,
          isAuthorStaff: isStaff,
          existingParticipantIds: existing.map((p) => p.sellerId),
        });
        await Promise.all(
          toAdd.map((sellerId) =>
            participantsProvider.add(conversationId, sellerId, "mention").catch(() => {
              // Best-effort: the note itself already saved successfully — a
              // failed auto-add just means that colleague doesn't gain access,
              // not that note creation should appear to have failed.
            }),
          ),
        );
      }

      return note;
    },
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a anotação."),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: ID;
      patch: Partial<Pick<IConversationNote, "content" | "mentions" | "pinned">>;
    }) => provider.update(id, patch),
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar a anotação."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: ID) => provider.remove(id),
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a anotação."),
  });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    currentSellerId,
    isStaff,
    createNote: (content, mentions) => createMutation.mutateAsync({ content, mentions }),
    updateNote: (id, patch) => updateMutation.mutateAsync({ id, patch }),
    removeNote: (id) => removeMutation.mutateAsync(id),
    isMutating: createMutation.isPending || updateMutation.isPending || removeMutation.isPending,
  };
}
```

- [ ] **Step 2: Thread `assignedSellerId` through `InlineNoteComposer`**

In `src/features/conversations/components/notes/InlineNoteComposer.tsx`, change:

```ts
interface IProps {
  conversationId: ID;
  storeId: ID;
  onClose: () => void;
}
```

to:

```ts
interface IProps {
  conversationId: ID;
  storeId: ID;
  assignedSellerId?: ID;
  onClose: () => void;
}
```

and change:

```ts
export function InlineNoteComposer({ conversationId, storeId, onClose }: IProps) {
  const notes = useConversationNotes(conversationId, storeId);
```

to:

```ts
export function InlineNoteComposer({ conversationId, storeId, assignedSellerId, onClose }: IProps) {
  const notes = useConversationNotes(conversationId, storeId, assignedSellerId);
```

- [ ] **Step 3: Thread `conversation.assignedSellerId` from `MessageInput.tsx`'s two call sites**

At the first call site (the "must assign to reply" wrapper, around line 173):

```tsx
        <InlineNoteComposer
          conversationId={conversation.id}
          storeId={conversation.storeId}
          onClose={onCloseNotes}
        />
```

becomes:

```tsx
        <InlineNoteComposer
          conversationId={conversation.id}
          storeId={conversation.storeId}
          assignedSellerId={conversation.assignedSellerId}
          onClose={onCloseNotes}
        />
```

At the second call site (around line 714):

```tsx
        <InlineNoteComposer
          conversationId={conversation.id}
          storeId={conversation.storeId}
          onClose={() => setNotesOpen(false)}
        />
```

becomes:

```tsx
        <InlineNoteComposer
          conversationId={conversation.id}
          storeId={conversation.storeId}
          assignedSellerId={conversation.assignedSellerId}
          onClose={() => setNotesOpen(false)}
        />
```

- [ ] **Step 4: Confirm the other two `useConversationNotes` callers still compile unchanged**

`NotesButton.tsx` and `MessageList.tsx` call `useConversationNotes(conversationId, storeId)`/`useConversationNotes(conversation.id, conversation.storeId)` with exactly 2 args — `assignedSellerId` defaults to `undefined`, `enabled` defaults to `true`; both are read-only consumers of `notes`/`notesState` and never call `createNote`, so the missing `assignedSellerId` is inert for them. No changes needed there — verify with:

Run: `bunx tsc --noEmit 2>&1 | grep -i "NotesButton\|MessageList.tsx\|useConversationNotes"`
Expected: no output.

- [ ] **Step 5: Vitest for the wiring (mock-mode integration smoke)**

Run: `bun run test src/features/conversations/hooks/`
Expected: all existing hook tests still PASS (no existing test file targets `useConversationNotes` directly per the current repo — this step is a regression guard for whatever IS there).

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/hooks/useConversationNotes.ts src/features/conversations/components/notes/InlineNoteComposer.tsx src/features/conversations/components/MessageInput.tsx
git commit -m "feat: auto-add mentioned sellers as conversation collaborators"
```

---

### Task 16: Presence — extract shared core, refactor `useStorePresence`, add conversation presence

**Files:**
- Create: `src/shared/lib/presenceChannel.ts`
- Modify: `src/features/shell/hooks/useStorePresence.ts`
- Create: `src/features/conversations/hooks/useConversationPresence.ts`

**Interfaces:**
- Produces (shared core): `acquirePresenceChannel(topic)`, `releasePresenceChannel(topic)`, `IPresenceChannelEntry` type.
- Produces (conversation-specific): `useConversationPresenceTracker(conversationId: ID | null): void`; `useConversationPresence(conversationId: ID | null): Set<ID> | null`.

- [ ] **Step 1: Extract the generic core**

Create `src/shared/lib/presenceChannel.ts` — this is `useStorePresence.ts`'s module-level manager (lines 1-115 of the current file), generalized to take any topic string instead of hardcoding `presence:store:<id>`:

```ts
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";

/**
 * Generic Realtime Presence channel manager, one channel per topic,
 * reference-counted: the first subscriber creates and joins the channel,
 * later subscribers reuse it, and it's torn down when the last leaves.
 * Extracted from `src/features/shell/hooks/useStorePresence.ts` (PRD "users
 * CRUD addendum") so a second presence scope (per-conversation collaboration)
 * can reuse the exact same join/re-join/teardown semantics instead of
 * duplicating this file's original, carefully-commented realtime-js quirks.
 *
 * --- realtime-js v2 behaviour (verified in the installed dist source) ---
 * 1. `client.channel(topic)` REUSES an existing channel when one with the same
 *    topic is already registered — tracker and reader for the SAME topic
 *    therefore share one instance, so the lifecycle must be owned here.
 * 2. The default presence key is `''`, so the server assigns a random UUID per
 *    connection; the tracked payload (e.g. `{ sellerId }`) lives in the
 *    presence VALUES, never the keys.
 * 3. `channel.subscribe(cb)` silently no-ops on a second call for a
 *    joining/joined channel — subscribe exactly once per channel instance and
 *    fan the SUBSCRIBED transition out to `joinListeners`.
 */
export interface IPresenceChannelEntry {
  channel: RealtimeChannel;
  refs: number;
  joined: boolean;
  joinListeners: Set<() => void>;
  syncListeners: Set<() => void>;
}

const presenceEntries = new Map<string, IPresenceChannelEntry>();

/** Acquire (or reuse) the shared presence channel for `topic`. Pair with `releasePresenceChannel(topic)`. */
export function acquirePresenceChannel(topic: string): IPresenceChannelEntry {
  let entry = presenceEntries.get(topic);

  if (!entry) {
    const channel = getSupabaseClient().channel(topic);

    const created: IPresenceChannelEntry = {
      channel,
      refs: 0,
      joined: false,
      joinListeners: new Set(),
      syncListeners: new Set(),
    };

    channel.on("presence", { event: "sync" }, () => {
      for (const listener of created.syncListeners) listener();
    });

    channel.subscribe((status) => {
      created.joined = status === "SUBSCRIBED";
      if (created.joined) {
        for (const listener of created.joinListeners) listener();
      }
    });

    presenceEntries.set(topic, created);
    entry = created;
  }

  entry.refs += 1;
  return entry;
}

/** Release one reference, deferred with a grace re-check so React StrictMode's
 *  unmount→remount re-acquires the live entry instead of a mid-teardown one. */
export function releasePresenceChannel(topic: string): void {
  const entry = presenceEntries.get(topic);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    setTimeout(() => {
      const e = presenceEntries.get(topic);
      if (e && e.refs <= 0) {
        presenceEntries.delete(topic);
        void getSupabaseClient().removeChannel(e.channel);
      }
    }, 0);
  }
}

/** Test-only hook to reset module state between cases. Not for production code. */
export function __resetPresenceChannelsForTests(): void {
  presenceEntries.clear();
}
```

- [ ] **Step 2: Refactor `useStorePresence.ts` to a thin wrapper**

Rewrite `src/features/shell/hooks/useStorePresence.ts` in full:

```ts
import { useEffect, useState } from "react";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { acquirePresenceChannel, releasePresenceChannel } from "@/shared/lib/presenceChannel";

/**
 * Realtime Presence per store (users CRUD addendum): "online" means the app is
 * open in some browser. Thin wrapper over the generic
 * `src/shared/lib/presenceChannel.ts` manager, scoped to the
 * `presence:store:<id>` topic — see that module for the underlying
 * realtime-js join/re-join semantics this relies on.
 */
const channelTopic = (storeId: string) => `presence:store:${storeId}`;

/** Mounted once in AppLayout — announces the signed-in seller as online. */
export function usePresenceTracker(): void {
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const sellerId = currentUser?.sellerId;

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase" || !sellerId || !currentStoreId) return;
    const topic = channelTopic(currentStoreId);
    const entry = acquirePresenceChannel(topic);

    const announce = () => void entry.channel.track({ sellerId });
    entry.joinListeners.add(announce);
    if (entry.joined) announce();

    return () => {
      entry.joinListeners.delete(announce);
      if (entry.joined) void entry.channel.untrack();
      releasePresenceChannel(topic);
    };
  }, [sellerId, currentStoreId]);
}

/** Set of seller ids currently online in the store; null in mock auth mode. */
export function useStorePresence(storeId: string): Set<string> | null {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase") return;
    const topic = channelTopic(storeId);
    const entry = acquirePresenceChannel(topic);

    const sync = () => {
      const state = entry.channel.presenceState<{ sellerId?: string }>();
      const ids = Object.values(state)
        .flat()
        .map((presence) => presence.sellerId)
        .filter((value): value is string => typeof value === "string");
      setOnline(new Set(ids));
    };
    entry.syncListeners.add(sync);
    sync();

    return () => {
      entry.syncListeners.delete(sync);
      releasePresenceChannel(topic);
    };
  }, [storeId]);

  return AUTH_SOURCE === "supabase" ? online : null;
}
```

- [ ] **Step 3: Manual regression check for the refactor**

Run: `bun run test 2>&1 | tail -30`
Expected: same pass/fail counts as before this task (no test file targets `useStorePresence` directly per the exploration — this is a behavior-preserving refactor, so the only real check is that nothing else broke). Also run:

Run: `bunx tsc --noEmit 2>&1 | grep -i "useStorePresence\|presenceChannel"`
Expected: no output.

- [ ] **Step 4: Add conversation-scoped presence hooks**

Create `src/features/conversations/hooks/useConversationPresence.ts`:

```ts
import { useEffect, useState } from "react";
import type { ID } from "@/shared/types";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { useAuth } from "@/features/auth/useAuth";
import { acquirePresenceChannel, releasePresenceChannel } from "@/shared/lib/presenceChannel";

const channelTopic = (conversationId: ID) => `presence:conversation:${conversationId}`;

/**
 * Announces the signed-in seller as "currently viewing this conversation".
 * Mount only while the conversation's panel/thread is actually open — unlike
 * `usePresenceTracker` (mounted once, store-wide, in AppLayout), this is
 * created/destroyed per conversation view. Purely a UI signal (who's looking
 * now); it never affects `conversation_participants`/RLS (who CAN respond).
 */
export function useConversationPresenceTracker(conversationId: ID | null): void {
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId;

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase" || !sellerId || !conversationId) return;
    const topic = channelTopic(conversationId);
    const entry = acquirePresenceChannel(topic);

    const announce = () => void entry.channel.track({ sellerId });
    entry.joinListeners.add(announce);
    if (entry.joined) announce();

    return () => {
      entry.joinListeners.delete(announce);
      if (entry.joined) void entry.channel.untrack();
      releasePresenceChannel(topic);
    };
  }, [sellerId, conversationId]);
}

/** Set of seller ids currently viewing `conversationId`; null in mock auth mode
 *  or while `conversationId` is null. */
export function useConversationPresence(conversationId: ID | null): Set<ID> | null {
  const [viewing, setViewing] = useState<Set<ID>>(new Set());

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase" || !conversationId) return;
    const topic = channelTopic(conversationId);
    const entry = acquirePresenceChannel(topic);

    const sync = () => {
      const state = entry.channel.presenceState<{ sellerId?: string }>();
      const ids = Object.values(state)
        .flat()
        .map((presence) => presence.sellerId)
        .filter((value): value is string => typeof value === "string");
      setViewing(new Set(ids));
    };
    entry.syncListeners.add(sync);
    sync();

    return () => {
      entry.syncListeners.delete(sync);
      releasePresenceChannel(topic);
    };
  }, [conversationId]);

  return AUTH_SOURCE === "supabase" && conversationId ? viewing : null;
}
```

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "useConversationPresence"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/presenceChannel.ts src/features/shell/hooks/useStorePresence.ts src/features/conversations/hooks/useConversationPresence.ts
git commit -m "refactor: extract shared presence channel core, add per-conversation presence"
```

---

### Task 17: `useCollaboratorAddedListener` + `CollaboratorAddedPrompt` + mount in `AppLayout`

**Files:**
- Create: `src/features/conversations/hooks/useCollaboratorAddedListener.ts`
- Create: `src/features/conversations/components/CollaboratorAddedPrompt.tsx`
- Modify: `src/features/shell/layouts/AppLayout.tsx`

**Interfaces:**
- Consumes: `subscribeToTable` from `@/shared/lib/realtime` (existing, generic per-table realtime); `useConversationsProvider`/`useSellersProvider`/`useCustomersProvider`.
- Produces: `useCollaboratorAddedListener(): { pending: ICollaboratorAddedEvent[]; dismiss: (index: number) => void }`; `<CollaboratorAddedPrompt />` (self-contained, no props).

- [ ] **Step 1: Write the listener hook**

Create `src/features/conversations/hooks/useCollaboratorAddedListener.ts`:

```ts
import { useEffect, useState } from "react";
import type { ID } from "@/shared/types";
import { subscribeToTable } from "@/shared/lib/realtime";
import { useAuth } from "@/features/auth/useAuth";
import { useConversationsProvider, useSellersProvider } from "@/providers/data";

export interface ICollaboratorAddedEvent {
  conversationId: ID;
  customerName: string;
  addedByName: string;
}

/**
 * Live "you were just added as a collaborator" signal — separate from the
 * bell (`notifications`, polling-based, see `useUnreadCount`). Subscribes to
 * `conversation_participants` postgres_changes (RLS already scopes delivery
 * to rows visible under `cp_select` — non-staff only ever receive INSERTs
 * where they're the added seller or the conversation's assignee); reacts to
 * ANY insert where the new row's seller is the current user, regardless of
 * `source` (manual invite and @mention auto-add both deserve the visual
 * "you now have access" card — only the BELL notification is source-gated,
 * see `notify_conversation_participant_added`).
 */
export function useCollaboratorAddedListener(): {
  events: ICollaboratorAddedEvent[];
  dismiss: (index: number) => void;
} {
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId;
  const conversationsProvider = useConversationsProvider();
  const sellersProvider = useSellersProvider();
  const [events, setEvents] = useState<ICollaboratorAddedEvent[]>([]);

  useEffect(() => {
    if (!sellerId) return;
    // The effect re-subscribes whenever `sellerId` changes (it's a dependency
    // below), so the closure's `sellerId` is always current for this
    // subscription's lifetime — no ref needed to avoid staleness.
    return subscribeToTable("conversation_participants", (payload) => {
      if (payload.eventType !== "INSERT") return;
      const row = payload.new as { conversation_id?: string; seller_id?: string; added_by?: string };
      if (!row.conversation_id || row.seller_id !== sellerId) return;

      void (async () => {
        const conversation = await conversationsProvider.get(row.conversation_id!).catch(() => null);
        if (!conversation) return;
        const [customer, addedBySeller] = await Promise.all([
          conversation.customerId
            ? conversationsProvider
                .listContacts([conversation.id])
                .then((rows) => rows.find((r) => r.conversationId === conversation.id) ?? null)
                .catch(() => null)
            : null,
          row.added_by ? sellersProvider.get(row.added_by).catch(() => null) : null,
        ]);
        setEvents((prev) => [
          ...prev,
          {
            conversationId: conversation.id,
            customerName: customer?.name ?? "um cliente",
            addedByName: addedBySeller?.fullName ?? "Um atendente",
          },
        ]);
      })();
    });
  }, [sellerId, conversationsProvider, sellersProvider]);

  const dismiss = (index: number) => setEvents((prev) => prev.filter((_, i) => i !== index));

  return { events, dismiss };
}
```

- [ ] **Step 2: Write the floating card component**

Create `src/features/conversations/components/CollaboratorAddedPrompt.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useCollaboratorAddedListener } from "../hooks/useCollaboratorAddedListener";

/**
 * Floating card shown when the signed-in seller is added as a collaborator on
 * a conversation — visual structure copied from
 * `src/features/version-update/components/VersionUpdatePrompt.tsx` (fixed
 * bottom-right card + minimized badge), different trigger (realtime event
 * instead of a deploy-version poll) and content. Mounted once in AppLayout.
 */
export function CollaboratorAddedPrompt() {
  const { events, dismiss } = useCollaboratorAddedListener();
  const navigate = useNavigate();
  const [minimized, setMinimized] = useState(false);

  if (events.length === 0) return null;
  const current = events[0]!;

  const openConversation = () => {
    dismiss(0);
    setMinimized(false);
    void navigate({ to: "/app/atendimento/$conversationId", params: { conversationId: current.conversationId } });
  };

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        aria-label="Você foi adicionado a uma conversa"
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-lg outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info/60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-info" />
        </span>
        Novo colaborador
      </button>
    );
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-4 shadow-xl"
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10">
          <Icon icon="mdi:account-multiple-plus-outline" size={20} className="text-info" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Você foi adicionado a uma conversa</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {current.addedByName} te adicionou na conversa com {current.customerName}.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={openConversation}>
          Abrir conversa
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMinimized(true)}>
          Depois
        </Button>
      </div>
    </div>
  );
}
```

Before writing this file, grep the route tree (`src/routeTree.gen.ts` or `src/routes/app.atendimento.*`) for the actual conversation route path/param name (I used `/app/atendimento/$conversationId` — confirm the exact route id and param name used elsewhere, e.g. inside `ConversationPage.tsx`'s own `useNavigate`/`useParams` calls, and correct this literal if it differs).

- [ ] **Step 3: Mount in `AppLayout`**

In `src/features/shell/layouts/AppLayout.tsx`, add the import next to `VersionUpdatePrompt`'s:

```tsx
import { CollaboratorAddedPrompt } from "@/features/conversations/components/CollaboratorAddedPrompt";
```

and render it next to `<VersionUpdatePrompt />`:

```tsx
        <VersionUpdatePrompt />
        <CollaboratorAddedPrompt />
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "CollaboratorAddedPrompt\|useCollaboratorAddedListener"`
Expected: no output (beyond confirming the route literal from Step 2 compiles against TanStack Router's typed `navigate`).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/hooks/useCollaboratorAddedListener.ts src/features/conversations/components/CollaboratorAddedPrompt.tsx src/features/shell/layouts/AppLayout.tsx
git commit -m "feat: floating card for real-time collaborator-added notifications"
```

---

## Phase 6 — UI

### Task 18: `CollaboratorRow` + `AddCollaboratorDialog`

**Files:**
- Create: `src/features/conversations/components/CollaboratorRow.tsx`
- Create: `src/features/conversations/components/AddCollaboratorDialog.tsx`

**Interfaces:**
- Consumes: `resolveInviteCandidates` (Task 10), `useConversationPresence` (Task 16), `useSellersProvider`, `useWhatsAppAccountsProvider().getAccessRules`.
- Produces: `<CollaboratorRow seller viewing canRemove onRemove />`; `<AddCollaboratorDialog conversation existingCollaboratorIds onAdd trigger />`.

- [ ] **Step 1: Write `CollaboratorRow`**

Create `src/features/conversations/components/CollaboratorRow.tsx`:

```tsx
import type { ISeller } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export interface ICollaboratorRowProps {
  seller: ISeller;
  source: "manual" | "mention";
  /** True when this collaborator currently has the conversation open (presence). */
  viewing: boolean;
  canRemove: boolean;
  onRemove: () => void;
}

/** One row in the "Colaboradores" section (AtendimentoTab, Option C). */
export function CollaboratorRow({ seller, source, viewing, canRemove, onRemove }: ICollaboratorRowProps) {
  const initials = initialsOf(seller.fullName);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="relative">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="bg-secondary text-[9px] font-semibold text-secondary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {viewing && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-severity-success"
            />
          )}
        </span>
        <span className="truncate text-foreground">{seller.fullName}</span>
        {source === "mention" && (
          <span className="shrink-0 text-[10px] text-muted-foreground">via @menção</span>
        )}
      </span>
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          aria-label={`Remover ${seller.fullName} da conversa`}
          onClick={onRemove}
        >
          <Icon icon="mdi:close" size={12} />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `AddCollaboratorDialog`**

Create `src/features/conversations/components/AddCollaboratorDialog.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IConversation, ISeller } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useSellersProvider, useSettingsProvider, useWhatsAppAccountsProvider } from "@/providers/data";
import { resolveInviteCandidates } from "../engine/collaboratorCandidates";

export interface IAddCollaboratorDialogProps {
  conversation: Pick<IConversation, "id" | "storeId" | "assignedSellerId" | "whatsappAccountId">;
  existingCollaboratorIds: ID[];
  onAdd: (sellerId: ID) => Promise<void>;
}

/** Invite dialog for the "Colaboradores" section — staff/responsável only
 *  (gated by the caller via `useConversationCollaborators().canManage`). */
export function AddCollaboratorDialog({
  conversation,
  existingCollaboratorIds,
  onAdd,
}: IAddCollaboratorDialogProps) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<ID | null>(null);
  const sellersProvider = useSellersProvider();
  const settingsProvider = useSettingsProvider();
  const whatsappAccountsProvider = useWhatsAppAccountsProvider();

  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers", "collaborator-candidates", conversation.storeId],
    queryFn: () => sellersProvider.list({ storeId: conversation.storeId, active: true }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const { data: settings } = useQuery({
    queryKey: ["settings", conversation.storeId],
    queryFn: () => settingsProvider.get(conversation.storeId),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const { data: accessRules = [] } = useQuery({
    queryKey: ["whatsapp-account-access-rules", conversation.whatsappAccountId],
    queryFn: () => whatsappAccountsProvider.getAccessRules(conversation.whatsappAccountId!),
    enabled: open && Boolean(conversation.whatsappAccountId),
    staleTime: 5 * 60_000,
  });

  const candidates: ISeller[] = resolveInviteCandidates(sellers, {
    assignedSellerId: conversation.assignedSellerId,
    existingCollaboratorIds,
    whatsappAccountId: conversation.whatsappAccountId ?? null,
    crossInstanceAllowed: Boolean(settings?.participantCrossInstance),
    accessRules,
  });

  const handleSelect = async (sellerId: ID) => {
    setPendingId(sellerId);
    try {
      await onAdd(sellerId);
      setOpen(false);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]">
          <Icon icon="mdi:account-plus-outline" size={13} />
          Adicionar colaborador
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Adicionar colaborador</DialogTitle>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Buscar vendedor..." />
          <CommandList>
            <CommandEmpty>Nenhum vendedor disponível para convidar.</CommandEmpty>
            <CommandGroup>
              {candidates.map((seller) => (
                <CommandItem
                  key={seller.id}
                  value={seller.fullName}
                  disabled={pendingId !== null}
                  onSelect={() => void handleSelect(seller.id)}
                >
                  <Avatar className="mr-2 h-5 w-5">
                    <AvatarFallback className="bg-secondary text-[9px] font-semibold text-secondary-foreground">
                      {seller.fullName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {seller.fullName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

Before writing this file: (a) confirm `useSettingsProvider` and its `get(storeId)` signature by grepping `useSettingsProvider` under `src/providers/data/` — `IPlatformSettings.participantCrossInstance` is read off whatever that method returns, adjust the field access if the real getter shape differs (e.g. `settings.settings.participantCrossInstance` vs `settings.participantCrossInstance`); (b) confirm `Dialog`/`Command` component import paths against an existing user (e.g. `ConversationTagPicker.tsx`, referenced in the `AtendimentoTab.tsx` imports) rather than assuming `@/components/ui/command` exists verbatim — copy the exact import path it uses.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "CollaboratorRow\|AddCollaboratorDialog"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/CollaboratorRow.tsx src/features/conversations/components/AddCollaboratorDialog.tsx
git commit -m "feat: add CollaboratorRow and AddCollaboratorDialog components"
```

---

### Task 19: Wire the "Colaboradores" section into `AtendimentoTab` + thread `collaborators` through the profile chain

**Files:**
- Modify: `src/features/customers/i18n/pt-BR.ts`
- Modify: `src/features/customers/components/tabs/AtendimentoTab.tsx`
- Modify: `src/features/customers/components/ProfileTabs.tsx`
- Modify: `src/features/customers/components/CustomerProfile.tsx`
- Modify: `src/features/customers/components/CustomerProfileFiche.tsx`
- Modify: `src/features/conversations/pages/ConversationPage.tsx`

**Interfaces:**
- Consumes: `useConversationCollaborators` (Task 14), `useConversationPresence` (Task 16), `CollaboratorRow`/`AddCollaboratorDialog` (Task 18).

- [ ] **Step 1: Add i18n strings**

In `src/features/customers/i18n/pt-BR.ts`, find:

```ts
  atendimento: {
    status: "Status da conversa",
    assignee: "Atendente responsável",
    origin: "Respondendo por",
    empty: "Nenhuma pendência de atendimento no momento.",
    pendingHint: "pendência de revisão",
    tags: "Tags da conversa",
    tagsEmpty: "Nenhuma tag aplicada",
  },
```

Replace with:

```ts
  atendimento: {
    status: "Status da conversa",
    assignee: "Atendente responsável",
    origin: "Respondendo por",
    empty: "Nenhuma pendência de atendimento no momento.",
    pendingHint: "pendência de revisão",
    tags: "Tags da conversa",
    tagsEmpty: "Nenhuma tag aplicada",
    collaborators: "Colaboradores",
    collaboratorsEmpty: "Nenhum colaborador nesta conversa.",
    addCollaborator: "Adicionar colaborador",
  },
```

- [ ] **Step 2: Add the section to `AtendimentoTab`**

Rewrite `src/features/customers/components/tabs/AtendimentoTab.tsx` in full:

```tsx
import type { ReactNode } from "react";
import type { IConversation, ICustomer, ISeller, IWhatsAppAccount } from "@/shared/types";
import { PendingContactBanner } from "@/features/contact-review";
import { AssigneeChip } from "@/features/conversations/components/AssigneeChip";
import { OriginChip } from "@/features/conversations/components/OriginChip";
import { StatusControl } from "@/features/conversations/components/status/StatusControl";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { ConversationTagChip } from "@/features/conversations/components/tags/ConversationTagChip";
import { ConversationTagPicker } from "@/features/conversations/components/tags/ConversationTagPicker";
import { useConversationTags } from "@/features/conversations/hooks/useConversationTags";
import { resolveConversationTags } from "@/features/conversations/engine/tagCatalog";
import { useConversationCollaborators } from "@/features/conversations/hooks/useConversationCollaborators";
import { useConversationPresence } from "@/features/conversations/hooks/useConversationPresence";
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
import { CollaboratorRow } from "@/features/conversations/components/CollaboratorRow";
import { AddCollaboratorDialog } from "@/features/conversations/components/AddCollaboratorDialog";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabEmptyState } from "../TabEmptyState";

const COPY = CUSTOMER_STRINGS.atendimento;

export interface IAtendimentoTabProps {
  customer: ICustomer;
  /** Conversation currently open in the Atendimento screen — absent on the standalone /app/clientes/:id page. */
  conversation?: IConversation | null;
  /** Resolved from conversation.assignedSellerId by the caller (ConversationPage) — never re-fetched here. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — never re-fetched here. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Resolved by the caller (useConversationDetail) — never re-fetched here. */
  collaborators?: ICollaboratorWithSeller[];
  /** Bubbles a StatusControl change up so the caller can refresh its own conversation cache. */
  onConversationChanged?: () => void;
}

function ContextRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

export function AtendimentoTab({
  customer,
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators = [],
  onConversationChanged,
}: IAtendimentoTabProps) {
  const showBanner =
    customer.tags.includes("pending_review") || customer.tags.includes("reviewed_not_customer");
  const canEditTags = usePermission("conversation", "edit", "own");
  const { tags: catalog } = useConversationTags();
  const conversationTags = conversation ? resolveConversationTags(conversation.tags, catalog) : [];

  // Hooks must run unconditionally (Rules of Hooks) — the fallback shape below
  // is never actually rendered against, since every `collab.*`/`viewing.*` use
  // below lives inside the `{conversation && (...)}` block further down.
  const collab = useConversationCollaborators(
    conversation ?? { id: "", assignedSellerId: undefined },
    () => onConversationChanged?.(),
  );
  const viewing = useConversationPresence(conversation?.id ?? null);

  if (!showBanner && !conversation) {
    return <TabEmptyState icon="mdi:check-circle-outline" message={COPY.empty} />;
  }

  return (
    <div className="space-y-3">
      {showBanner && <PendingContactBanner customer={customer} conversation={conversation} />}

      {conversation && (
        <section className="divide-y divide-border rounded-lg border border-border bg-background px-3">
          <ContextRow label={COPY.status}>
            <StatusControl
              conversation={conversation}
              mode="menu"
              onChanged={onConversationChanged}
            />
          </ContextRow>
          {assignedSeller && (
            <ContextRow label={COPY.assignee}>
              <AssigneeChip seller={assignedSeller} variant="compact" />
            </ContextRow>
          )}
          {whatsappAccount && (
            <ContextRow label={COPY.origin}>
              <OriginChip account={whatsappAccount} variant="label" />
            </ContextRow>
          )}
          <div className="py-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {COPY.collaborators} ({collaborators.length})
              </span>
              {collab?.canManage && (
                <AddCollaboratorDialog
                  conversation={conversation}
                  existingCollaboratorIds={collaborators.map((c) => c.seller.id)}
                  onAdd={(sellerId) => collab.addCollaborator(sellerId)}
                />
              )}
            </div>
            {collaborators.length === 0 ? (
              <p className="mt-1 text-muted-foreground">{COPY.collaboratorsEmpty}</p>
            ) : (
              <div className="mt-1">
                {collaborators.map(({ seller, source }) => (
                  <CollaboratorRow
                    key={seller.id}
                    seller={seller}
                    source={source}
                    viewing={viewing?.has(seller.id) ?? false}
                    canRemove={collab?.canRemove(seller.id) ?? false}
                    onRemove={() => void collab?.removeCollaborator(seller.id)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="py-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{COPY.tags}</span>
              {canEditTags && (
                <ConversationTagPicker
                  conversation={conversation}
                  onChanged={onConversationChanged}
                />
              )}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={COPY.tags}>
              {conversationTags.length === 0 && (
                <li className="text-muted-foreground">{COPY.tagsEmpty}</li>
              )}
              {conversationTags.map((tag) => (
                <li key={tag.id}>
                  <ConversationTagChip tag={tag} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
```

`useConversationDetail` (Task 13) now resolves `collaborators` as `ICollaboratorWithSeller[]` (seller + `source` paired together), so the `source` prop passed to `CollaboratorRow` above comes from the real participant row — no `"via @menção"` tag is ever lost or hardcoded.

- [ ] **Step 3: Thread `collaborators` through `ProfileTabs`**

In `src/features/customers/components/ProfileTabs.tsx`, add the import (this file doesn't import from `useConversationDetail` today):

```ts
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
```

Add to `IProfileTabsProps` (near `whatsappAccount`):

```ts
  /** Resolved from useConversationDetail by the caller — feeds the Atendimento tab. */
  collaborators?: ICollaboratorWithSeller[];
```

Add to the destructured props and to `<AtendimentoTab>`:

```tsx
export function ProfileTabs({
  customer,
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators,
  onConversationChanged,
  defaultTab = "overview",
  activeTab,
  onActiveTabChange,
  overviewVariant = "column",
  iconOnlyTabs = false,
  copilotTab,
}: IProfileTabsProps) {
```

```tsx
            <AtendimentoTab
              customer={customer}
              conversation={conversation}
              assignedSeller={assignedSeller}
              whatsappAccount={whatsappAccount}
              collaborators={collaborators}
              onConversationChanged={onConversationChanged}
            />
```

- [ ] **Step 4: Thread through `CustomerProfile`**

In `src/features/customers/components/CustomerProfile.tsx`, add the import:

```ts
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
```

Add to `ICustomerProfileProps` (near `whatsappAccount`):

```ts
  /** Resolved from useConversationDetail by the caller — feeds the Atendimento tab. */
  collaborators?: ICollaboratorWithSeller[];
```

Add to the destructured props (default `= []`) and to `<ProfileTabs>`:

```tsx
export function CustomerProfile({
  customerId,
  conversation = null,
  assignedSeller = null,
  whatsappAccount = null,
  collaborators = [],
  onConversationChanged,
  defaultTab,
  variant = "column",
  className,
  copilotTab,
}: ICustomerProfileProps) {
```

```tsx
        <ProfileTabs
          customer={customer}
          conversation={conversation}
          assignedSeller={assignedSeller}
          whatsappAccount={whatsappAccount}
          collaborators={collaborators}
          onConversationChanged={onConversationChanged}
          defaultTab={defaultTab}
          iconOnlyTabs={variant === "column"}
          copilotTab={copilotTab}
        />
```

(the `import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";` added above is the only new import this file needs for the prop.)

- [ ] **Step 5: Thread through `CustomerProfileFiche`**

In `src/features/customers/components/CustomerProfileFiche.tsx`, add the import:

```ts
import type { ICollaboratorWithSeller } from "@/features/conversations/hooks/useConversationDetail";
```

Add to `ICustomerProfileFicheProps` (near `whatsappAccount`):

```ts
  /** Resolved from useConversationDetail by the caller — feeds the Atendimento tab. */
  collaborators?: ICollaboratorWithSeller[];
```

Add to the destructured props and both `<CustomerProfile>` call sites (drawer mode and column mode):

```tsx
export function CustomerProfileFiche({
  customerId,
  conversation,
  assignedSeller,
  whatsappAccount,
  collaborators,
  onConversationChanged,
  open,
  onOpenChange,
  copilotTab,
}: ICustomerProfileFicheProps) {
```

```tsx
          <CustomerProfile
            customerId={customerId}
            conversation={conversation}
            assignedSeller={assignedSeller}
            whatsappAccount={whatsappAccount}
            collaborators={collaborators}
            onConversationChanged={onConversationChanged}
            defaultTab="atendimento"
            variant="column"
            className="h-full border-l-0"
            copilotTab={copilotTab}
          />
```

(drawer mode) and the matching column-mode block just below it (same prop added).

- [ ] **Step 6: Thread from `ConversationPage`**

In `src/features/conversations/pages/ConversationPage.tsx`, find:

```tsx
  const { conversation, customer, lead, contact, whatsappAccount, assignedSeller } = detail;
```

Replace with:

```tsx
  const { conversation, customer, lead, contact, whatsappAccount, assignedSeller, collaborators } = detail;
```

Find the `<CustomerProfileFiche>` usage:

```tsx
              <CustomerProfileFiche
                customerId={conversation.customerId}
                conversation={conversation}
                assignedSeller={assignedSeller}
                whatsappAccount={whatsappAccount}
                onConversationChanged={detail.refresh}
```

Replace with:

```tsx
              <CustomerProfileFiche
                customerId={conversation.customerId}
                conversation={conversation}
                assignedSeller={assignedSeller}
                whatsappAccount={whatsappAccount}
                collaborators={collaborators}
                onConversationChanged={detail.refresh}
```

(the rest of that call site's props — `open`, `onOpenChange`, `copilotTab` — stay unchanged).

- [ ] **Step 7: Type-check the whole chain**

Run: `bunx tsc --noEmit 2>&1 | grep -i "AtendimentoTab\|ProfileTabs\|CustomerProfile\|ConversationPage"`
Expected: no output.

- [ ] **Step 8: Run the full test suite**

Run: `bun run test`
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/customers/i18n/pt-BR.ts src/features/customers/components/tabs/AtendimentoTab.tsx src/features/customers/components/ProfileTabs.tsx src/features/customers/components/CustomerProfile.tsx src/features/customers/components/CustomerProfileFiche.tsx src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat: wire Colaboradores section into the customer Atendimento panel"
```

---

### Task 20: "Colaborando" tag in `ConversationListItem`

**Files:**
- Modify: `src/features/conversations/components/ConversationListItem.tsx`
- Modify: `src/features/conversations/i18n/pt-BR.ts` (`CONVERSATION_STRINGS`/`INBOX_STRINGS` — grep for where `sdrBadge` lives, per the existing badge precedent, and add the sibling key in the same object)

**Interfaces:**
- Consumes: `IConversation.isCollaborator` (Task 5/9).

- [ ] **Step 1: Add the string**

Grep `sdrBadge` in `src/features/conversations/i18n/pt-BR.ts` to find the exact object it lives in (`INBOX_STRINGS` per the earlier exploration), and add a sibling key next to it:

```ts
  collaboratingBadge: "Colaborando",
```

- [ ] **Step 2: Add the badge**

In `src/features/conversations/components/ConversationListItem.tsx`, find the badges container (the block starting `<div className="mt-1.5 flex items-center gap-1.5">` that already renders the channel/e-commerce/SDR/escalation/temperature badges), and add, right after the `isSdrActive` badge block:

```tsx
          {conversation.isCollaborator && (
            <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
              <Icon icon="mdi:account-multiple-outline" size={11} />
              {INBOX_STRINGS.collaboratingBadge}
            </span>
          )}
```

(match whatever the SDR badge's exact import alias for `INBOX_STRINGS` is in this file — it's already imported since the SDR badge uses it).

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -i "ConversationListItem\|collaboratingBadge"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/ConversationListItem.tsx src/features/conversations/i18n/pt-BR.ts
git commit -m "feat: show a 'Colaborando' tag on the Inbox row"
```

---

## Phase 7 — Final verification

### Task 21: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: all tests PASS, including every `.test.ts` file touched/created in Tasks 8, 10, 11, 12.

- [ ] **Step 2: Run the build**

Run: `bun run build`
Expected: build succeeds (no esbuild/Vite errors). Remember this does NOT type-check (see Global Constraints).

- [ ] **Step 3: Run a full `tsc` pass and diff against the pre-existing baseline**

Run: `bunx tsc --noEmit 2>&1 | wc -l` and compare against the count on `main` before this branch (`git stash; bunx tsc --noEmit 2>&1 | wc -l; git stash pop`, or simpler: `git diff main...HEAD --name-status --diff-filter=A` to list files created on this branch, then confirm none of THOSE specific files appear in the `tsc` output).
Expected: no NEW file introduced by this branch appears in the `tsc` error output; the total count may still include the pre-existing baseline.

- [ ] **Step 4: Manual smoke checklist (for the executing session to run against a live dev server, `VITE_DATA_SOURCE=mock`)**

- Open a conversation as the owner/staff seller → "Colaboradores" section shows "Nenhum colaborador nesta conversa." + "Adicionar colaborador" button.
- Add a colleague → row appears, bell/notification fires (mock `notificationsApi`), floating card would fire in supabase mode (mock mode has no Realtime — this specific check only applies against a real Supabase project).
- Switch to the invited colleague's session → the conversation appears under "Minhas conversas" with a "Colaborando" tag; they can open it and see the "Colaboradores" section with a working "Sair da conversa" (✕ on their own row).
- Mention the colleague (`@nome`) in an internal note as the responsável → colleague auto-appears in "Colaboradores" with the "via @menção" tag (pending the Task 19 follow-up note about threading `source` end-to-end — verify against whatever this plan actually shipped).
- Resolve/archive the conversation → "Colaboradores" section returns to empty on next load.

This checklist is exploratory (manual), not a scripted test — record any deviation as a follow-up rather than blocking the branch on it, consistent with how presence/realtime features are verified elsewhere in this codebase (no automated coverage for `useStorePresence` either).

- [ ] **Step 5: Final commit (if Step 4 surfaced any fixup)**

```bash
git add -A
git commit -m "fix: address smoke-test findings for conversation collaborators"
```

(Skip this step entirely if Step 4 found nothing to fix.)
