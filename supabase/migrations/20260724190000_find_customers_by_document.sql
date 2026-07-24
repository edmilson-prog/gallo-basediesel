-- find_customers_by_document: duplicate guard for the lead→customer conversion.
--
-- Converting a lead used to create a second customer for a CNPJ that already
-- existed (37 duplicate CNPJs in production at the time of writing). A
-- client-side check through `customers` cannot fix it: the SELECT policy only
-- exposes a non-staff seller's OWN customers plus the ones tied to a
-- conversation they handle, so the lookup would report "not found" for a
-- customer owned by another seller and the duplicate would be created anyway.
--
-- This SECURITY DEFINER function answers the narrow question "does this store
-- already have a customer with this document?" for any authenticated member of
-- the store, returning only the fields needed to identify the match and offer
-- the "link to existing customer" path — no address, e-mail or financials.
--
-- Documents are compared digits-only on both sides so masked input
-- ("88.961.974/0001-82") matches stored values in any format.

create or replace function public.find_customers_by_document(p_document text)
returns table (
  id           uuid,
  type         text,
  display_name text,
  seller_id    uuid,
  seller_name  text
)
language sql
stable
security definer
set search_path to ''
as $$
  with needle as (
    select regexp_replace(coalesce(p_document, ''), '\D', '', 'g') as digits
  )
  select c.id,
         c.type,
         coalesce(nullif(c.nome_fantasia, ''), nullif(c.razao_social, ''), c.full_name, '—') as display_name,
         c.seller_id,
         s.full_name as seller_name
    from public.customers c
    left join public.sellers s on s.id = c.seller_id
   cross join needle n
   where n.digits <> ''
     and c.store_id = public.current_store_id()
     and (
       regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = n.digits
       or regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = n.digits
     )
   order by c.created_at asc
   limit 5;
$$;

revoke all on function public.find_customers_by_document(text) from public, anon;
grant execute on function public.find_customers_by_document(text) to authenticated;

-- Keep the lookup off a sequential scan as the catalog grows. regexp_replace is
-- IMMUTABLE, so both expressions are indexable.
create index if not exists customers_cnpj_digits_idx
  on public.customers ((regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')))
  where cnpj is not null;

create index if not exists customers_cpf_digits_idx
  on public.customers ((regexp_replace(coalesce(cpf, ''), '\D', '', 'g')))
  where cpf is not null;
