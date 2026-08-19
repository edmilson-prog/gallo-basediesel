-- PRD-217 (Provenance) Phase 2 — propagates customer_id and reads the backfill.
--
-- Three objects:
--   1. convert_lead_mark recreated with RN-05 (stamps customer_id on the touches);
--   2. ad_backfill_delivery_window — PRECISE source for the backfill;
--   3. ad_backfill_orphan_conversations — APPROXIMATE source for the backfill.
--
-- The last two only READ. Writing remains the exclusive job of
-- record_ad_touch (Phase 1), which is idempotent via its unique indexes.

-- ── RN-05: propagation on conversion ────────────────────────────────────────
-- Body identical to what runs in production (pg_get_functiondef, 2026-08-18) plus
-- the final update. The store and authorization guards are the access control
-- for the conversion: do not change them.
--
-- The update bypasses ad_touches' RLS on purpose, and does so by construction:
-- the table has no `force row level security` and is owned by postgres, and
-- this function is SECURITY DEFINER under the same owner. Verified against the catalog.
create or replace function public.convert_lead_mark(
  p_lead_id     uuid,
  p_customer_id uuid,
  p_stage       jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_seller uuid;
  v_store  uuid;
begin
  select seller_id, store_id into v_seller, v_store from leads where id = p_lead_id;
  if not found then
    raise exception 'lead % not found', p_lead_id using errcode = 'P0002';
  end if;

  -- Same-store guard (mirror of the RLS store predicate).
  if v_store is distinct from current_store_id() then
    raise exception 'cross-store conversion blocked' using errcode = '42501';
  end if;

  -- Authorization: staff, the lead owner, or the assigned attendant of a
  -- conversation anchored on this lead.
  if not (is_staff() or v_seller = current_seller_id() or seller_handles_lead(p_lead_id)) then
    raise exception 'not authorized to convert lead %', p_lead_id using errcode = '42501';
  end if;

  -- Target customer must exist in the same store (guards "link" mode and a
  -- freshly-inserted customer alike).
  if not exists (select 1 from customers c where c.id = p_customer_id and c.store_id = v_store) then
    raise exception 'customer % not found in store', p_customer_id using errcode = 'P0002';
  end if;

  update leads
     set stage = p_stage, converted_to_customer_id = p_customer_id, updated_at = now()
   where id = p_lead_id;

  -- PRD-217 RN-05: the ad touches collected while this was still a lead now
  -- belong to the customer. `customer_id is null` is not an optimization: a
  -- touch already stamped must never be rewritten, so a second conversion
  -- pointing the same lead at a different customer cannot rewrite history.
  -- ad_touches.lead_id and leads.id are both uuid — no cast needed here (the
  -- text column is conversations.lead_id, which this statement never touches).
  update public.ad_touches
     set customer_id = p_customer_id
   where lead_id = p_lead_id
     and customer_id is null;
end;
$function$;

-- ── Backfill, precise source ────────────────────────────────────────────────
-- webhook_deliveries stores the raw WAHA payload since 19/07/2026. Each
-- externalAdReply node carries a base64 thumbnail (~2.8 KB) that nobody reads:
-- the function strips it before returning.
--
-- Why this exists instead of the query living in the script: PostgREST cannot
-- express a jsonb-path coalesce, and shipping 127 thousand raw payloads to the
-- client is not viable. Why it is windowed: scanning the whole table at once
-- blows the statement_timeout (measured — one day costs ~1.5 s; the script
-- windows by day).
--
-- The three paths are NOT hypothetical: extendedTextMessage (277) and
-- imageMessage (2) were both observed in production in an 8-day sample.
create or replace function public.ad_backfill_delivery_window(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  message_id        uuid,
  conversation_id   uuid,
  occurred_at       timestamptz,
  external_ad_reply jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with hits as (
    select distinct on (wd.request_payload #>> '{payload,id}')
      wd.request_payload #>> '{payload,id}' as provider_message_id,
      -- The provider timestamp is the click's real moment. It has never been
      -- absent in the observed sample, but a null here would violate
      -- ad_touches.occurred_at NOT NULL, so fall back to the delivery time.
      coalesce(
        to_timestamp(nullif(wd.request_payload #>> '{payload,timestamp}', '')::bigint),
        wd.created_at
      ) as occurred_at,
      coalesce(
        wd.request_payload #> '{payload,_data,Message,extendedTextMessage,contextInfo,externalAdReply}',
        wd.request_payload #> '{payload,_data,Message,imageMessage,contextInfo,externalAdReply}',
        wd.request_payload #> '{payload,_data,Message,videoMessage,contextInfo,externalAdReply}'
      ) as ad
    from public.webhook_deliveries wd
    where wd.created_at >= p_from
      and wd.created_at <  p_to
      -- 'message' is the inbound-only event. 'message.any' repeats it with the
      -- outbound echo and 'message.ack' is noise: filtering here cuts the scan
      -- ~3x and removes the double delivery before the distinct on.
      and wd.event_type = 'message'
      and coalesce(
        wd.request_payload #> '{payload,_data,Message,extendedTextMessage,contextInfo,externalAdReply}',
        wd.request_payload #> '{payload,_data,Message,imageMessage,contextInfo,externalAdReply}',
        wd.request_payload #> '{payload,_data,Message,videoMessage,contextInfo,externalAdReply}'
      ) is not null
    -- The webhook redelivers the same event ~1.8x: keep the earliest.
    order by wd.request_payload #>> '{payload,id}', wd.created_at
  )
  select m.id, m.conversation_id, h.occurred_at, h.ad - 'thumbnail'
    from hits h
    join public.messages m on m.provider_message_id = h.provider_message_id;
$$;

comment on function public.ad_backfill_delivery_window(timestamptz, timestamptz) is
  'PRD-217 Fase 2: backfill tooling. Reads one short window of webhook_deliveries and returns the ad referral node of each distinct inbound message that carried one, already joined to messages. Read-only, service_role only.';

revoke all on function public.ad_backfill_delivery_window(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ad_backfill_delivery_window(timestamptz, timestamptz)
  to service_role;

-- ── Backfill, approximate source ────────────────────────────────────────────
-- conversations.ad_referral only stores the LAST ad (the webhook
-- overwrites it), and the click's date is lost: we reconstruct one touch per
-- conversation, dated by the conversation's creation. Hence origin='backfill_conversation'
-- in the call, and the RN-06 warning on any time series.
--
-- "no touch at all" is the guard that keeps the most RECENT ad from being
-- dated with the OLDEST date in a conversation that already got a precise touch.
--
-- No limit on purpose: the set is bounded by the conversations that have
-- ad_referral (975 as of 2026-08-18) and shrinks with every run.
create or replace function public.ad_backfill_orphan_conversations()
returns table (
  conversation_id uuid,
  occurred_at     timestamptz,
  referral        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.created_at, c.ad_referral
    from public.conversations c
   where c.ad_referral is not null
     and not exists (
       select 1 from public.ad_touches t where t.conversation_id = c.id
     )
   order by c.created_at;
$$;

comment on function public.ad_backfill_orphan_conversations() is
  'PRD-217 Fase 2: backfill tooling. Conversations that carry an ad_referral but no ad_touch yet — the approximate source, dated by the conversation. Read-only, service_role only.';

revoke all on function public.ad_backfill_orphan_conversations()
  from public, anon, authenticated;
grant execute on function public.ad_backfill_orphan_conversations()
  to service_role;
