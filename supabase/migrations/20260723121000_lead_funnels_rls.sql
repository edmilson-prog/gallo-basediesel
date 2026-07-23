-- RLS for the multi-funnel model. Membership visibility mirrors `leads` exactly;
-- the accessible-funnel filter is applied by the board query, NOT here, so a
-- seller never loses sight of their own lead just because it sits in a funnel
-- they cannot open.

alter table public.lead_funnels        enable row level security;
alter table public.lead_funnel_stages  enable row level security;
alter table public.lead_funnel_entries enable row level security;
alter table public.lead_funnel_access  enable row level security;

-- ---------- lead_funnels ----------
-- Reading that a funnel exists is not confidential; the leads inside it are.
-- Keeping SELECT open avoids a gated join for every label lookup.
create policy lead_funnels_select on public.lead_funnels
  for select to authenticated
  using (store_id = (select public.current_store_id()));

create policy lead_funnels_insert on public.lead_funnels
  for insert to authenticated
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy lead_funnels_update on public.lead_funnels
  for update to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy lead_funnels_delete on public.lead_funnels
  for delete to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));

-- ---------- lead_funnel_stages ----------
create policy lead_funnel_stages_select on public.lead_funnel_stages
  for select to authenticated
  using (exists (
    select 1 from public.lead_funnels f
     where f.id = funnel_id and f.store_id = (select public.current_store_id())
  ));

create policy lead_funnel_stages_write on public.lead_funnel_stages
  for all to authenticated
  using ((select public.is_staff()) and exists (
    select 1 from public.lead_funnels f
     where f.id = funnel_id and f.store_id = (select public.current_store_id())
  ))
  with check ((select public.is_staff()) and exists (
    select 1 from public.lead_funnels f
     where f.id = funnel_id and f.store_id = (select public.current_store_id())
  ));

-- ---------- lead_funnel_entries ----------
-- Same semantics as `leads`. store_id/seller_id are derived by the before-insert
-- trigger, so the with check is evaluated against unforgeable values — a forged
-- membership fails it rather than passing.
create policy lead_funnel_entries_select on public.lead_funnel_entries
  for select to authenticated
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  );

create policy lead_funnel_entries_insert on public.lead_funnel_entries
  for insert to authenticated
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  );

create policy lead_funnel_entries_update on public.lead_funnel_entries
  for update to authenticated
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  )
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  );

create policy lead_funnel_entries_delete on public.lead_funnel_entries
  for delete to authenticated
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or seller_id = (select public.current_seller_id()))
  );

-- ---------- lead_funnel_access ----------
create policy lead_funnel_access_select on public.lead_funnel_access
  for select to authenticated
  using (seller_id = (select public.current_seller_id()) or (select public.is_staff()));

create policy lead_funnel_access_write on public.lead_funnel_access
  for all to authenticated
  using ((select public.is_staff()) and exists (
    select 1 from public.lead_funnels f
     where f.id = funnel_id and f.store_id = (select public.current_store_id())
  ))
  with check ((select public.is_staff()) and exists (
    select 1 from public.lead_funnels f
     where f.id = funnel_id and f.store_id = (select public.current_store_id())
  ));

-- ---------- triggers ----------
-- INSERT: derive owner and store from the lead itself. Without this a seller
-- could insert a membership over someone else's lead carrying their own
-- seller_id and still satisfy the with check.
create or replace function public.derive_lead_funnel_entry_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lead_store uuid;
  lead_seller uuid;
  lead_value numeric;
begin
  select l.store_id, l.seller_id, l.estimated_value
    into lead_store, lead_seller, lead_value
    from public.leads l where l.id = new.lead_id;

  if lead_store is null then
    raise exception 'lead % not found', new.lead_id;
  end if;

  new.store_id  := lead_store;
  new.seller_id := lead_seller;
  if new.estimated_value is null then
    new.estimated_value := lead_value;
  end if;
  return new;
end $$;

create trigger lead_funnel_entries_derive_owner
  before insert on public.lead_funnel_entries
  for each row execute function public.derive_lead_funnel_entry_owner();

-- UPDATE on leads: keep every membership in sync with the wallet.
create or replace function public.sync_lead_funnel_entries_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.seller_id is distinct from old.seller_id
     or new.store_id is distinct from old.store_id then
    update public.lead_funnel_entries
       set seller_id = new.seller_id, store_id = new.store_id, updated_at = now()
     where lead_id = new.id;
  end if;
  return new;
end $$;

create trigger leads_sync_funnel_entries
  after update of seller_id, store_id on public.leads
  for each row execute function public.sync_lead_funnel_entries_owner();
