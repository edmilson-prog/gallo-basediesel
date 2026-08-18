-- Fix: reanchor_converted_lead_conversations compared TEXT to UUID.
--
-- `conversations.lead_id` and `conversation_activity.lead_id` are TEXT, but the
-- trigger compared them against `new.id` (leads.id, UUID) — Postgres has no
-- `text = uuid` operator, so EVERY lead conversion raised 42883
-- (`operator does not exist: text = uuid`). PostgREST maps 42883 to HTTP 404,
-- which is why the client saw a misleading "404" on /rpc/convert_lead_mark and,
-- before that RPC existed, on PATCH /leads — the customer INSERT succeeded while
-- the lead UPDATE always rolled back, orphaning duplicate customers.
--
-- Broken since 20260723165546 (the migration that introduced this trigger); it
-- affects every conversion path and every role, staff included.
--
-- Only the comparisons are touched — each `new.id` that lands on a TEXT column
-- is cast to ::text. The body is otherwise byte-identical to 20260723165546.

create or replace function public.reanchor_converted_lead_conversations()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
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

  return new;
end;
$$;
