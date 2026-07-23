-- Re-anchor a converted lead's conversations to the destination customer.
--
-- Root cause (docs/dev/conversation-split-echo-after-close.md §4.3): every
-- webhook/import resolver checks customer BEFORE lead, so once a lead is
-- converted the phone resolves to the customer and the lead-anchored
-- conversations become invisible to the conversation lookups — the next
-- message (inbound OR echo) would mint a duplicate on the same account.
-- Both ConvertLeadModal modes ('link' and 'create') go through
-- leadsProvider.update(lead, { convertedToCustomerId }), so an AFTER UPDATE
-- trigger on leads.converted_to_customer_id covers every conversion path.
-- Mirrored in the mock layer (src/mocks/api/leads.ts).

create or replace function public.reanchor_converted_lead_conversations()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
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
     where lead_id = new.id
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
   where c.lead_id = new.id
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
  --    conversation history shows up under the customer from now on.
  update public.conversations
     set customer_id = new.converted_to_customer_id,
         lead_id = null
   where lead_id = new.id;

  return new;
end;
$$;

drop trigger if exists leads_reanchor_converted on public.leads;
create trigger leads_reanchor_converted
after update of converted_to_customer_id on public.leads
for each row
when (new.converted_to_customer_id is not null
      and new.converted_to_customer_id is distinct from old.converted_to_customer_id)
execute function public.reanchor_converted_lead_conversations();
