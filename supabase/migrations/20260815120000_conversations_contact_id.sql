-- Give a conversation a memory of WHO it is talking to.
--
-- THE GAP. `conversations` knows the COMPANY (`customer_id`) and, until the
-- lead is converted, the lead (`lead_id` — which the re-anchor clears). It has
-- never known the PERSON. The interlocutor's number is stored nowhere on the
-- row: there is no JID/chat registry, and `messages.author_id` holds the entity
-- id, not a line. So every surface resolved identity by falling back to the
-- company, and the moment a lead was linked the person vanished from the
-- screen — that is the whole shape of the bug repaired in the previous
-- migration, and this is its structural half.
--
-- `contact_id` closes it: the Agenda row already carries the person's name,
-- number, role and WhatsApp status, so the conversation only needs to point at
-- it. Identity becomes the person; the company becomes context.
--
-- Nullable on purpose. Roughly 8% of today's rows cannot be resolved to a
-- single contact without guessing (see the backfill), and a wrong pointer is
-- worse than none — those keep rendering exactly as they do now.

alter table public.conversations
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

comment on column public.conversations.contact_id is
  'The person on the other side — an Agenda contact. NULL when it could not be resolved without guessing; surfaces then fall back to the company/lead name as before.';

-- Every read path filters conversations first and joins the contact per row, so
-- the index serves the reverse question: "which threads is this person on".
create index if not exists conversations_contact_id_idx
  on public.conversations (contact_id)
  where contact_id is not null;

-- 1 ─────────────────────────────────────────────────────────────────────────
-- Backfill A: lead-anchored conversations take the contact of their own lead.
-- Exact, not inferred — the contact row IS that lead's person.
update public.conversations c
   set contact_id = ct.id
  from public.contacts ct
 where ct.lead_id = c.lead_id::uuid
   and c.contact_id is null;

-- Backfill B: already-converted conversations, ONLY where the customer has
-- exactly one contact. With two or more there is no way to tell which person
-- this thread belongs to, and inventing a link would put words in someone's
-- mouth — those stay NULL and degrade to today's behaviour.
update public.conversations c
   set contact_id = pick.contact_id
  from (
    -- `(array_agg(id))[1]`, not `min(id)`: there is no `min(uuid)` in Postgres.
    -- The HAVING already guarantees a single row per customer, so picking the
    -- first element is exact rather than arbitrary.
    select customer_id, (array_agg(id))[1] as contact_id
      from public.contacts
     where customer_id is not null
     group by customer_id
    having count(*) = 1
  ) pick
 where c.customer_id = pick.customer_id
   and c.lead_id is null
   and c.contact_id is null;

-- 2 ─────────────────────────────────────────────────────────────────────────
-- The conversation's contact is resolved SERVER-SIDE for every thread the
-- caller can reach (POOL included), which is why the header renders a real name
-- where a per-entity read would be RLS-blocked.
--
-- The identity rule changes here: THE PERSON IS THE IDENTITY, the company is
-- context. `name`/`phone` now prefer the contact, falling back to the lead and
-- then to the company exactly as before — so a row without `contact_id` renders
-- precisely as it does today. `company_id`/`company_name`/`role` are additive.
--
-- `ref_id` deliberately keeps seeding off customer/lead: it feeds the avatar's
-- stable hue, and re-seeding it would silently recolour every existing thread.
--
-- DROP before CREATE: this adds columns to the RETURN TYPE, and Postgres refuses
-- `create or replace` when the signature's output changes ("cannot change return
-- type of existing function"). Both statements run in the migration's single
-- transaction, so the function is never missing to a concurrent caller.
drop function if exists public.conversation_contacts(uuid[]);

create function public.conversation_contacts(p_ids uuid[])
returns table(
  conversation_id uuid,
  ref_id text,
  is_lead boolean,
  name text,
  phone text,
  avatar_url text,
  temperature text,
  company_id uuid,
  company_name text,
  role text
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
      nullif(btrim(ct.name), ''),
      nullif(btrim(l.name), ''),
      case when cu.type = 'B2B'
        then coalesce(nullif(cu.nome_fantasia, ''), nullif(cu.razao_social, ''), cu.full_name)
        else cu.full_name end
    ) as name,
    coalesce(nullif(ct.phone, ''), nullif(cu.phone, ''), nullif(l.phone, '')) as phone,
    coalesce(nullif(cu.avatar_url, ''), nullif(l.avatar_url, '')) as avatar_url,
    l.temperature::text as temperature,
    cu.id as company_id,
    case when cu.type = 'B2B'
      then coalesce(nullif(cu.nome_fantasia, ''), nullif(cu.razao_social, ''), cu.full_name)
      else cu.full_name end as company_name,
    nullif(btrim(ct.role), '') as role
  from public.conversations c
  left join public.customers cu on cu.id = c.customer_id
  left join public.leads l on l.id = c.lead_id::uuid
  left join public.contacts ct on ct.id = c.contact_id
  where c.id = any (p_ids)
    and public.can_access_conversation(c.id);
$function$;

-- Restore the grants the DROP above threw away. This is NOT boilerplate: a
-- freshly created function grants EXECUTE to PUBLIC by default, which would
-- hand this SECURITY DEFINER reader to `anon` — a role the original ACL
-- deliberately excluded. Revoke first, then grant exactly who had it.
revoke all on function public.conversation_contacts(uuid[]) from public;
revoke all on function public.conversation_contacts(uuid[]) from anon;
grant execute on function public.conversation_contacts(uuid[]) to authenticated;
grant execute on function public.conversation_contacts(uuid[]) to service_role;

-- 3 ─────────────────────────────────────────────────────────────────────────
-- Keep the pointer honest as data moves.
--
-- When a lead is converted, its conversations are re-anchored to the customer
-- and `lead_id` is cleared. `contact_id` must survive that: the person did not
-- change, only the company they now belong to. The re-anchor trigger already
-- hands the lead's contact to the customer (previous migration), so here we
-- only need to make sure conversations that had no pointer pick it up.
create or replace function public.attach_contact_to_lead_conversations()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- A contact gaining/keeping its lead: point that lead's conversations at it
  -- when they have no person yet. Never overwrites an existing pointer — a
  -- thread already tied to someone must not be reassigned behind the operator.
  if new.lead_id is not null then
    update public.conversations c
       set contact_id = new.id
     where c.lead_id = new.lead_id::text
       and c.contact_id is null;
  end if;

  -- Same for a contact linked to a customer whose threads have no person and
  -- who is that customer's ONLY contact — the unambiguous case.
  if new.customer_id is not null then
    update public.conversations c
       set contact_id = new.id
     where c.customer_id = new.customer_id
       and c.contact_id is null
       and not exists (
         select 1 from public.contacts other
          where other.customer_id = new.customer_id
            and other.id <> new.id
       );
  end if;

  return new;
end;
$function$;

drop trigger if exists contacts_attach_to_conversations on public.contacts;
create trigger contacts_attach_to_conversations
  after insert or update of lead_id, customer_id on public.contacts
  for each row
  execute function public.attach_contact_to_lead_conversations();
