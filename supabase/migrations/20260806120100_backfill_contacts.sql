-- Backfill the Agenda from the two places contacts live today.
--
-- Idempotent: guarded by NOT EXISTS on the origin key, so re-running never
-- duplicates. Nothing is merged automatically — the 4 ninth-digit collisions
-- and the 70 customers sharing a phone all land as their own row and go to the
-- duplicate queue in phase 3. Merging without human review is how history gets
-- lost.

-- Source A — customers with a NON-EMPTY phone (1.978 rows).
-- Careful: `phone is not null` alone returns 3.170, but 1.192 of those are the
-- empty string.
insert into public.contacts (
  store_id, name, role, phone, email, city, uf,
  customer_id, owner_seller_id, source, has_whatsapp, last_contact_at, division
)
select
  c.store_id,
  coalesce(
    nullif(trim(c.contact_name), ''),
    nullif(trim(c.nome_fantasia), ''),
    nullif(trim(c.razao_social), ''),
    nullif(trim(c.full_name), ''),
    c.phone
  ) as name,
  case when nullif(trim(c.contact_name), '') is not null then 'Contato' else null end as role,
  c.phone,
  nullif(trim(c.email), ''),
  nullif(trim(c.address ->> 'city'), ''),
  -- `customers.address` stores the state under the key `state`, not `uf`
  -- (verified against production: 3.166 rows carry `state`, 0 carry `uf`).
  -- The contacts column is named `uf`; the source key is `state`.
  nullif(trim(c.address ->> 'state'), ''),
  c.id,
  c.seller_id,
  case when c.dintec_codcli is not null then 'dintec' else 'manual' end,
  coalesce(c.whatsapp_status, '') in ('valid', 'active', 'ok'),
  c.last_purchase_at,
  'parts'
from public.customers c
where nullif(trim(coalesce(c.phone, '')), '') is not null
  and not exists (
    select 1 from public.contacts ct where ct.customer_id = c.id
  );

-- Source B — unconverted leads become LOOSE contacts (3.385 rows).
insert into public.contacts (
  store_id, name, phone, email,
  lead_id, owner_seller_id, source, has_whatsapp, last_contact_at, division
)
select
  l.store_id,
  coalesce(nullif(trim(l.name), ''), l.phone) as name,
  l.phone,
  nullif(trim(l.email), ''),
  l.id,
  l.seller_id,
  case lower(coalesce(l.origin, ''))
    when 'whatsapp'   then 'whatsapp'
    when 'storefront' then 'storefront'
    when 'portal_b2b' then 'portal_b2b'
    when 'balcao'     then 'balcao'
    when 'csv'        then 'csv'
    else 'manual'
  end,
  true,
  l.updated_at,
  'parts'
from public.leads l
where l.converted_to_customer_id is null
  and nullif(trim(coalesce(l.phone, '')), '') is not null
  and not exists (
    select 1 from public.contacts ct where ct.lead_id = l.id
  );
