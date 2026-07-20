-- Funnel Frente 3: ownerless leads + inbox avatar for lead-anchored conversations.
--
-- Why (a) seller_id drop not null: the approved Funnel Frente 3 design creates
-- leads without an owner in several paths — echo-created leads (WAHA sends
-- from an unknown number that the account itself originated), the archive
-- migration (historical conversations backfilled as leads), and future
-- imports. `leads.seller_id` is currently `text not null references
-- public.sellers (id)` (see 20260608151323_create_leads_table.sql), which
-- makes those paths impossible: an echo-created lead insert would violate the
-- NOT NULL constraint and the WAHA webhook would retry the same delivery
-- forever. Live inbound conversations are unaffected — they still always
-- assign an owner via the rotation queue (assign_next_from_rotation), so this
-- migration only widens what is representable, it does not change any
-- existing assignment behavior. Task 2 review flagged this as the critical
-- rollout gate: this migration MUST be applied BEFORE deploying the updated
-- waha-webhook Edge Function that creates ownerless leads.
--
-- Why (b) avatar_url: as leads become first-class conversation anchors at
-- scale (echo, archive, imports), the Inbox needs to render an avatar for
-- them the same way it does for customers. The inbox avatar is resolved by
-- the conversation_contacts RPC, which today only reads customers.avatar_url
-- — leads have no avatar column, so lead-anchored conversations always
-- rendered without one. Adding leads.avatar_url lets the WAHA layer (or a
-- future import) populate it, with customers.avatar_url still taking
-- precedence when both exist.
--
-- Why (c) the RPC change: conversation_contacts is reproduced verbatim from
-- the live definition in 20260717190620_conversation_contacts_b2b_name_fallback.sql
-- (itself already a verbatim-except-one-expression transcription of the prior
-- live definition), changing ONLY the avatar expression from
-- `cu.avatar_url as avatar_url` to `coalesce(cu.avatar_url, l.avatar_url) as
-- avatar_url`. Everything else — the SECURITY DEFINER header, search_path,
-- the B2B display-name fallback, the can_access_conversation gate, every
-- other column — is untouched. This is a pure presentation change; it does
-- NOT touch the conversation access model. search_conversations is
-- deliberately NOT modified here: its RETURNS TABLE does not expose an
-- avatar column at all (id, store_id, customer_id, lead_id,
-- assigned_seller_id, channel, whatsapp_account_id, status, is_sdr_active,
-- tags, linked_order_id, last_message_at, unread_count, created_at,
-- queued_at, ad_referral, is_collaborator, is_accessible, contact_name,
-- contact_phone, total_count), so there is nothing to coalesce there.

alter table public.leads alter column seller_id drop not null;

alter table public.leads add column if not exists avatar_url text;

CREATE OR REPLACE FUNCTION public.conversation_contacts(p_ids uuid[])
 RETURNS TABLE(conversation_id uuid, ref_id text, is_lead boolean, name text, phone text, avatar_url text, temperature text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    coalesce(cu.phone, l.phone) as phone,
    coalesce(cu.avatar_url, l.avatar_url) as avatar_url,
    l.temperature::text as temperature
  from public.conversations c
  left join public.customers cu on cu.id = c.customer_id
  left join public.leads l on l.id::text = c.lead_id
  where c.id = any (p_ids)
    and public.can_access_conversation(c.id);
$function$;
