-- Digit-normalized search (spec: docs/superpowers/specs/2026-07-16-phone-digit-search-design.md).
--
-- Free-text search matched phone/CNPJ/CPF as literal substrings of the raw
-- columns, so a term typed WITH the BR 9th mobile digit (or with punctuation)
-- never found a contact stored without it — WhatsApp JIDs drop the 9 for
-- numbers registered before the rollout (e.g. +553388884188).
--
-- 1) Generated *_digits columns (PostgREST .or() only filters real columns,
--    not expressions) + pg_trgm GIN indexes so %term% stays indexable.
-- 2) search_conversations gains p_search_digit_variants text[] default null:
--    the frontend expands the term into digit candidates (with/without the 9,
--    src/shared/utils/digitSearch.ts) and the SQL matches them against
--    phone_digits. Candidates are digits-only by construction — no LIKE
--    wildcard escaping needed. Old frontends omit the param → null → the
--    behavior is exactly the previous one.

-- 1) Generated columns + indexes --------------------------------------------

alter table public.customers
  add column phone_digits text generated always as
    (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored,
  add column cnpj_digits text generated always as
    (regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) stored,
  add column cpf_digits text generated always as
    (regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) stored;

alter table public.leads
  add column phone_digits text generated always as
    (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored;

create index customers_phone_digits_trgm_idx
  on public.customers using gin (phone_digits extensions.gin_trgm_ops);
create index customers_cnpj_digits_trgm_idx
  on public.customers using gin (cnpj_digits extensions.gin_trgm_ops);
create index customers_cpf_digits_trgm_idx
  on public.customers using gin (cpf_digits extensions.gin_trgm_ops);
create index leads_phone_digits_trgm_idx
  on public.leads using gin (phone_digits extensions.gin_trgm_ops);

-- 2) search_conversations + p_search_digit_variants -------------------------
-- Signature change ⇒ drop by the exact prior signature first: an overload
-- would break PostgREST's function resolution whenever optional keys are
-- omitted from the JSON body (documented trap in buildSearchRpcParams).

drop function if exists public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer, uuid[], boolean
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
  p_include_queue boolean default false,
  p_search_digit_variants text[] default null
)
returns table (
  id uuid,
  store_id uuid,
  customer_id uuid,
  lead_id text,
  assigned_seller_id uuid,
  channel text,
  whatsapp_account_id uuid,
  status text,
  is_sdr_active boolean,
  tags text[],
  linked_order_id text,
  last_message_at timestamptz,
  unread_count integer,
  created_at timestamptz,
  queued_at timestamptz,
  ad_referral jsonb,
  is_collaborator boolean,
  total_count bigint
)
language sql
stable security definer
set search_path = ''
as $$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  ),
  q as (select '%' || coalesce(trim(p_search), '') || '%' as term)
  select
    c.id, c.store_id, c.customer_id, c.lead_id, c.assigned_seller_id, c.channel,
    c.whatsapp_account_id, c.status, c.is_sdr_active, c.tags, c.linked_order_id,
    c.last_message_at, c.unread_count, c.created_at, c.queued_at, c.ad_referral,
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
    count(*) over () as total_count
  from public.conversations c, q
  where
    c.store_id = public.current_store_id()
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
    )
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
        and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term
             or (p_search_digit_variants is not null and exists (
                   select 1 from unnest(p_search_digit_variants) as v(variant)
                   where cu.phone_digits like '%' || v.variant || '%'))))
      or exists (select 1 from public.leads l where l.id::text = c.lead_id
        and (l.name ilike q.term or l.phone ilike q.term
             or (p_search_digit_variants is not null and exists (
                   select 1 from unnest(p_search_digit_variants) as v(variant)
                   where l.phone_digits like '%' || v.variant || '%'))))
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- DROP FUNCTION clears prior grants; PostgREST callers rely on execute
-- rights on the authenticated role (postgres/service_role kept for parity).
grant execute on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer, uuid[], boolean, text[]
) to authenticated, postgres, service_role;

notify pgrst, 'reload schema';
