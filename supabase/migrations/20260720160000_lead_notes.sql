-- Notes recorded against a lead. Mirrors customer_notes exactly (uuid
-- id/lead_id/author_id, no store_id of its own); RLS is DERIVED from the parent
-- leads' visibility — the subquery re-applies leads_select, so whoever can see
-- the lead can read/write its notes. Consistent with
-- 20260608220518_rls_policies_derived_global.sql.
create table if not exists public.lead_notes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  author_id   uuid not null references public.sellers (id),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists lead_notes_lead_id_idx on public.lead_notes (lead_id);
create index if not exists lead_notes_created_at_idx on public.lead_notes (created_at);

alter table public.lead_notes enable row level security;

drop policy if exists "lead_notes_select" on public.lead_notes;
create policy "lead_notes_select" on public.lead_notes for select to authenticated
  using (lead_id in (select id from public.leads where store_id = public.current_store_id()));

drop policy if exists "lead_notes_insert" on public.lead_notes;
create policy "lead_notes_insert" on public.lead_notes for insert to authenticated
  with check (lead_id in (select id from public.leads where store_id = public.current_store_id()));

drop policy if exists "lead_notes_update" on public.lead_notes;
create policy "lead_notes_update" on public.lead_notes for update to authenticated
  using (lead_id in (select id from public.leads where store_id = public.current_store_id()))
  with check (lead_id in (select id from public.leads where store_id = public.current_store_id()));

drop policy if exists "lead_notes_delete" on public.lead_notes;
create policy "lead_notes_delete" on public.lead_notes for delete to authenticated
  using (lead_id in (select id from public.leads where store_id = public.current_store_id()));
