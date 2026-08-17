-- Preserve the person's telephone identity when a lead is linked to an EXISTING
-- customer.
--
-- THE BUG. Converting a lead into an existing customer discarded the person
-- behind the conversation. `convert_lead_mark` stamps
-- `leads.converted_to_customer_id`, which fires
-- `reanchor_converted_lead_conversations`: the conversations are re-pointed at
-- the customer and their `lead_id` is CLEARED. Nothing carried the lead's name
-- or phone across. The agenda contact that already held both stayed behind
-- pointing at a converted lead, with `customer_id` still null — invisible from
-- the customer's side.
--
-- The damage becomes visible when the destination customer has no phone of its
-- own (1.194 rows arrived from the ERP with `phone = ''`): every surface reads
-- the address off `customers.phone`, so the conversation lost its number
-- entirely and the header showed the company's name with no way to call back.
-- When the customer DID have a phone the loss was silent — the second number
-- simply never existed.
--
-- Three changes, in order of durability:
--   1. The re-anchor trigger hands the lead's agenda contact to the customer
--      (creating one when the lead had none) and adopts the lead's phone as the
--      customer's WhatsApp anchor when the customer has no anchor yet.
--   2. `conversation_contacts` stops letting an EMPTY phone win the fallback.
--   3. A backfill repairs the conversions that already happened.

-- 1 ─────────────────────────────────────────────────────────────────────────
-- Re-anchor trigger: steps (a) through (d) are unchanged; (e), (f) and (g) are
-- new. Kept as one CREATE OR REPLACE because the body must stay contiguous.
create or replace function public.reanchor_converted_lead_conversations()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Serialize concurrent conversions targeting the same customer: two leads
  -- linked to one customer at once would both pass step (b)'s EXISTS check on
  -- their own snapshots and collide in step (c).
  perform pg_advisory_xact_lock(
    hashtextextended('lead-reanchor:' || new.converted_to_customer_id::text, 0)
  );

  -- a) The lead's own surplus OPEN conversations per account (pre-index race
  --    leftovers): keep the newest, archive the rest — after re-anchoring,
  --    the partial unique index allows only one open row per (customer,
  --    account).
  with ranked as (
    select id,
           row_number() over (
             partition by whatsapp_account_id
             order by last_message_at desc nulls last, created_at desc, id
           ) as rn
      from public.conversations
     where lead_id = new.id::text
       and whatsapp_account_id is not null
       and status not in ('resolvida', 'arquivada')
  )
  update public.conversations c
     set status = 'arquivada',
         assigned_seller_id = null,
         is_sdr_active = false,
         updated_at = now()
    from ranked r
   where c.id = r.id
     and r.rn > 1;

  -- b) Lead conversations whose destination customer ALREADY has an open
  --    conversation on the same account: archive them (they would violate the
  --    unique index, and traffic already flows to the customer's thread —
  --    their history migrates with the re-anchor in step c).
  update public.conversations c
     set status = 'arquivada',
         assigned_seller_id = null,
         is_sdr_active = false,
         updated_at = now()
   where c.lead_id = new.id::text
     and c.whatsapp_account_id is not null
     and c.status not in ('resolvida', 'arquivada')
     and exists (
       select 1
         from public.conversations k
        where k.customer_id = new.converted_to_customer_id
          and k.whatsapp_account_id = c.whatsapp_account_id
          and k.status not in ('resolvida', 'arquivada')
     );

  -- c) Re-anchor everything that pointed at the lead (any status) — the
  --    conversation history shows up under the customer from now on. On the
  --    rare concurrent webhook INSERT committing between (b)'s snapshot and
  --    this UPDATE, the unique index raises 23505 — re-run the (b) archive
  --    against the fresh snapshot and retry once.
  begin
    update public.conversations
       set customer_id = new.converted_to_customer_id,
           lead_id = null
     where lead_id = new.id::text
       and customer_id is null;
  exception when unique_violation then
    update public.conversations c
       set status = 'arquivada',
           assigned_seller_id = null,
           is_sdr_active = false,
           updated_at = now()
     where c.lead_id = new.id::text
       and c.whatsapp_account_id is not null
       and c.status not in ('resolvida', 'arquivada')
       and exists (
         select 1
           from public.conversations k
          where k.customer_id = new.converted_to_customer_id
            and k.whatsapp_account_id = c.whatsapp_account_id
            and k.status not in ('resolvida', 'arquivada')
       );
    update public.conversations
       set customer_id = new.converted_to_customer_id,
           lead_id = null
     where lead_id = new.id::text
       and customer_id is null;
  end;

  -- d) The activity-trail rows captured while the conversations were
  --    lead-anchored carry customer_id NULL — re-point them so the ficha's
  --    Histórico shows the migrated timeline under the destination customer.
  update public.conversation_activity
     set customer_id = new.converted_to_customer_id,
         lead_id = null
   where lead_id = new.id::text;

  -- e) Hand the lead's agenda contact to the destination customer. That row
  --    already carries the person's name, phone and WhatsApp flag — the very
  --    identity step (c) just detached from the conversation. `lead_id` is kept
  --    so the origin stays auditable.
  update public.contacts
     set customer_id = new.converted_to_customer_id,
         updated_at = now()
   where lead_id = new.id
     and customer_id is null;

  -- f) The lead never had a contact row (the webhook and import paths do not
  --    all create one) — materialise it, so the number is reachable from the
  --    customer. Skipped when the customer already knows this number under
  --    another contact: there is no unique index on (customer_id, phone_digits)
  --    to lean on, so the guard is explicit.
  insert into public.contacts (
    store_id, name, phone, email, customer_id, lead_id, owner_seller_id,
    source, has_whatsapp
  )
  select
    new.store_id,
    coalesce(nullif(btrim(new.name), ''), new.phone),
    new.phone,
    nullif(btrim(coalesce(new.email, '')), ''),
    new.converted_to_customer_id,
    new.id,
    new.seller_id,
    'whatsapp',
    true
  where nullif(btrim(coalesce(new.phone, '')), '') is not null
    and not exists (
      select 1 from public.contacts c where c.lead_id = new.id
    )
    and not exists (
      select 1 from public.contacts c
       where c.customer_id = new.converted_to_customer_id
         and c.phone_digits = regexp_replace(new.phone, '\D', '', 'g')
    );

  -- g) Adopt the lead's number as the customer's WhatsApp anchor when the
  --    customer has none. `customers.phone` is what every surface reads to
  --    address a conversation, and an empty anchor is what made the number
  --    disappear from the header. Only ever FILLS a blank — an existing anchor
  --    is never overwritten, so linking a second person cannot hijack the
  --    company's main number.
  update public.customers
     set phone = new.phone
   where id = new.converted_to_customer_id
     and coalesce(nullif(btrim(phone), ''), '') = ''
     and nullif(btrim(coalesce(new.phone, '')), '') is not null;

  return new;
end;
$function$;

-- 2 ─────────────────────────────────────────────────────────────────────────
-- `coalesce` only skips NULL. The ERP import writes `phone = ''`, so the empty
-- string WON and the fallback to the lead's phone never ran. The name column
-- beside it already guarded with `nullif`; the phone did not.
create or replace function public.conversation_contacts(p_ids uuid[])
returns table(
  conversation_id uuid,
  ref_id text,
  is_lead boolean,
  name text,
  phone text,
  avatar_url text,
  temperature text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    c.id as conversation_id,
    coalesce(cu.id::text, l.id::text) as ref_id,
    (cu.id is null and l.id is not null) as is_lead,
    coalesce(
      case when cu.type = 'B2B'
        then coalesce(nullif(cu.nome_fantasia, ''), nullif(cu.razao_social, ''), cu.full_name)
        else cu.full_name end,
      l.name
    ) as name,
    coalesce(nullif(cu.phone, ''), nullif(l.phone, '')) as phone,
    coalesce(nullif(cu.avatar_url, ''), nullif(l.avatar_url, '')) as avatar_url,
    l.temperature::text as temperature
  from public.conversations c
  left join public.customers cu on cu.id = c.customer_id
  left join public.leads l on l.id = c.lead_id::uuid
  where c.id = any (p_ids)
    and public.can_access_conversation(c.id);
$function$;

-- 3 ─────────────────────────────────────────────────────────────────────────
-- Backfill: replay steps (e), (f) and (g) for conversions that already ran.
-- Idempotent — every statement is guarded, so re-running changes nothing.

-- e') Adopt the orphaned agenda contacts of already-converted leads.
update public.contacts ct
   set customer_id = l.converted_to_customer_id,
       updated_at = now()
  from public.leads l
 where ct.lead_id = l.id
   and l.converted_to_customer_id is not null
   and ct.customer_id is null;

-- f') Materialise a contact for converted leads that never had one.
insert into public.contacts (
  store_id, name, phone, email, customer_id, lead_id, owner_seller_id,
  source, has_whatsapp
)
select
  l.store_id,
  coalesce(nullif(btrim(l.name), ''), l.phone),
  l.phone,
  nullif(btrim(coalesce(l.email, '')), ''),
  l.converted_to_customer_id,
  l.id,
  l.seller_id,
  'whatsapp',
  true
from public.leads l
where l.converted_to_customer_id is not null
  and nullif(btrim(coalesce(l.phone, '')), '') is not null
  and not exists (select 1 from public.contacts c where c.lead_id = l.id)
  and not exists (
    select 1 from public.contacts c
     where c.customer_id = l.converted_to_customer_id
       and c.phone_digits = regexp_replace(l.phone, '\D', '', 'g')
  );

-- g') Fill the blank anchor of customers that absorbed a lead. Deterministic
--     pick (oldest conversion) so a re-run cannot land on a different lead.
update public.customers cu
   set phone = pick.phone
  from (
    select distinct on (l.converted_to_customer_id)
           l.converted_to_customer_id as customer_id,
           l.phone
      from public.leads l
     where l.converted_to_customer_id is not null
       and nullif(btrim(coalesce(l.phone, '')), '') is not null
     order by l.converted_to_customer_id, l.created_at, l.id
  ) pick
 where cu.id = pick.customer_id
   and coalesce(nullif(btrim(cu.phone), ''), '') = '';
