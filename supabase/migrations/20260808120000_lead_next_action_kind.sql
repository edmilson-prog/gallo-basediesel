-- `leads.next_action_kind` — WHAT the next action is, beside WHEN it is due.
--
-- `next_action_at` alone answers "quando" and leaves "o quê" to whoever
-- remembers the conversation. The lead detail's "Agora" block offers four named
-- ways out of a stalled lead (ligar · orçamento · retomar · visita) and needs
-- somewhere to persist which one was agreed, or the label evaporates on reload
-- and the block degrades back into a bare deadline.
--
-- Nullable with no default and no backfill on purpose: rows written before this
-- column carry a date and no kind, which is a truthful state — nobody ever
-- recorded what the action was — and the UI renders the deadline alone for
-- them. Writing a default would invent a decision that was never taken.
--
-- The CHECK, not an enum type: the set is closed today but adding a fifth kind
-- to a check constraint is one migration, while `alter type ... add value`
-- cannot run inside a transaction block on older servers.
--
-- ⚠️ ROLLOUT — this migration gates the merge only partially. The frontend
-- reads the column through a capability probe (`supabase/leads.ts`): the first
-- `get` asks for it, and a 42703 makes the module fall back to the legacy
-- column list for the rest of the session. So merging before applying this
-- leaves the "Agora" block working with dates and no kind, rather than
-- breaking /app/leads. Apply it to restore the labels.

alter table public.leads
  add column if not exists next_action_kind text;

alter table public.leads
  drop constraint if exists leads_next_action_kind_check;

alter table public.leads
  add constraint leads_next_action_kind_check
  check (next_action_kind is null
         or next_action_kind in ('ligar', 'orcamento', 'retomar', 'visita'));

comment on column public.leads.next_action_kind is
  'Tipo da próxima ação combinada (ligar/orcamento/retomar/visita). Nulo quando só a data foi registrada.';
