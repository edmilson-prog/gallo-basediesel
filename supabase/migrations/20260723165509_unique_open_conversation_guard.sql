-- One OPEN conversation per contact per WhatsApp account.
--
-- Root cause (docs/dev/conversation-split-echo-after-close.md §4.1): every
-- conversation-creating path (waha-webhook, whatsapp-webhook, importers, app
-- createOutbound) is check-then-insert and nothing serializes concurrent
-- events for the same contact — prod accumulated 10+ same-instant duplicate
-- pairs (gaps of 35 µs to 13 s), still occurring as of 2026-07-22. These
-- partial unique indexes make the database the arbiter; every writer now
-- recovers from a 23505 by reusing the winner row.
--
-- ⚠ Rollout order is INVERTED on purpose: deploy the new function/frontend
-- code FIRST, then apply this migration. The old webhook code turned an
-- insert failure into a silent 200 (message drop); the new code recovers a
-- 23505 by reusing the existing conversation and 503s (retryable) on other
-- transient failures. Applying the index against the old code would drop the
-- losing side of every race.

-- Close the cleanup→index race entirely: block concurrent conversation writes
-- for the (sub-second) duration of this migration — a webhook INSERT landing
-- between the cleanup's snapshot and the index build would abort the CREATE
-- UNIQUE INDEX with a 23505. Reads stay unaffected; if the apply still aborts
-- for any reason, simply re-run it (the cleanup recomputes and the indexes
-- are `if not exists`).
lock table public.conversations in share row exclusive mode;

-- 1) Data fix: archive all-but-newest OPEN conversation per (contact, account).
--    13 groups as of 2026-07-23 (webhook races, 9th-digit splits, legacy
--    anomalies) — recomputed at apply time. The kept conversation is the one
--    already receiving traffic (newest last_message_at — the same pick rule
--    the inbound lookup uses); the archived twin keeps its history reachable
--    (ficha → Histórico). Mirrors close_conversation(): unassign + drop
--    is_sdr_active in the same UPDATE, so conversation_activity_capture
--    records the transition (actor_kind = 'system').
with ranked as (
  select id,
         row_number() over (
           partition by coalesce(customer_id::text, lead_id), whatsapp_account_id
           order by last_message_at desc nulls last, created_at desc, id
         ) as rn
    from public.conversations
   where whatsapp_account_id is not null
     and status not in ('resolvida', 'arquivada')
     and (customer_id is not null or lead_id is not null)
)
update public.conversations c
   set status = 'arquivada',
       assigned_seller_id = null,
       is_sdr_active = false,
       updated_at = now()
  from ranked r
 where c.id = r.id
   and r.rn > 1;

-- 2) The guards. Partial: only OPEN conversations and only real WhatsApp
--    threads (account-less rows — ecommerce/distribution — stay unguarded by
--    design). ⚠ Coupled to CLOSED_CONVERSATION_STATUSES =
--    ('resolvida','arquivada') in the webhook code — adding a new terminal
--    status requires updating these predicates in the same change.
create unique index if not exists conversations_one_open_per_customer_account
  on public.conversations (customer_id, whatsapp_account_id)
  where customer_id is not null
    and whatsapp_account_id is not null
    and status not in ('resolvida', 'arquivada');

create unique index if not exists conversations_one_open_per_lead_account
  on public.conversations (lead_id, whatsapp_account_id)
  where lead_id is not null
    and whatsapp_account_id is not null
    and status not in ('resolvida', 'arquivada');
