-- PRD-217 (Provenance) Fase 1 — ad origin history.
--
-- The webhook overwrites conversations.ad_referral on every new ad entry, so a
-- customer returning through a different campaign erases the previous one for
-- good. These two tables keep every touch instead. conversations.ad_referral is
-- deliberately UNCHANGED: it stays the "latest ad" shortcut the thread card reads.

-- ── Catalog of ad creatives ────────────────────────────────────────────────
-- No store_id on purpose: an ad is not a commercial entity of the store, it is
-- an external Meta reference, and the same creative can bring people to several
-- stores. The touch carries the store.
create table if not exists public.ads (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null unique,
  source_type   text,
  headline      text,
  body          text,
  source_url    text,
  media_url     text,
  media_type    text check (media_type in ('image','video')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.ads is
  'Ad creatives that brought conversations in (Click-to-WhatsApp). Keyed by the Meta sourceID. Holds the LATEST creative seen: the advertiser can edit the copy without changing the id, and versioning creatives is out of scope (PRD-217 RN-02).';

-- ── Touch log ──────────────────────────────────────────────────────────────
create table if not exists public.ad_touches (
  id              uuid primary key default gen_random_uuid(),
  ad_id           uuid not null references public.ads(id) on delete cascade,
  store_id        uuid not null references public.stores(id),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id      uuid references public.messages(id) on delete set null,
  contact_id      uuid references public.contacts(id) on delete set null,
  lead_id         uuid references public.leads(id) on delete set null,
  customer_id     uuid references public.customers(id) on delete set null,
  occurred_at     timestamptz not null,
  origin          text not null check (origin in ('webhook','backfill_delivery','backfill_conversation')),
  created_at      timestamptz not null default now()
);

comment on table public.ad_touches is
  'One row per ad click that turned into a message. Immutable. origin distinguishes live capture from reconstruction: backfill_conversation rows carry an APPROXIMATE occurred_at (the conversation date), so any time series must say so (PRD-217 RN-06).';

-- Dedup (RN-01): the webhook redelivers the same event ~5x. message_id covers
-- live capture; the triple covers the backfill, which cannot always match a
-- message.
create unique index if not exists ad_touches_message_id_key
  on public.ad_touches (message_id) where message_id is not null;
create unique index if not exists ad_touches_dedupe_key
  on public.ad_touches (conversation_id, ad_id, occurred_at);

create index if not exists ad_touches_ad_occurred_idx on public.ad_touches (ad_id, occurred_at desc);
create index if not exists ad_touches_store_idx        on public.ad_touches (store_id);
create index if not exists ad_touches_conversation_idx on public.ad_touches (conversation_id);
create index if not exists ad_touches_lead_idx         on public.ad_touches (lead_id) where lead_id is not null;
create index if not exists ad_touches_customer_idx     on public.ad_touches (customer_id) where customer_id is not null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.ads enable row level security;

-- The catalog carries no PII — headline, copy and public permalinks of an ad
-- the company itself paid for.
create policy "ads_select"
  on public.ads for select to authenticated
  using (true);

alter table public.ad_touches enable row level security;

-- Staff (Owner/Gestor) sees the whole store: this is what the management screen
-- aggregates over.
create policy "ad_touches_select_staff"
  on public.ad_touches for select to authenticated
  using (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  );

-- Everyone else only sees the touch of a conversation they could already open —
-- the same two gates (instance + portfolio) that govern the conversation itself.
create policy "ad_touches_select_own_conversation"
  on public.ad_touches for select to authenticated
  using (public.can_access_conversation(conversation_id));

-- No INSERT/UPDATE/DELETE policy anywhere: writing is service_role only (which
-- bypasses RLS) plus the SECURITY DEFINER function below.

-- ── record_ad_touch ────────────────────────────────────────────────────────
-- Upserts the creative and appends the touch, resolving store/contact/lead/
-- customer from the conversation itself — the webhook does not carry them.
create or replace function public.record_ad_touch(
  p_conversation_id uuid,
  p_message_id      uuid,
  p_occurred_at     timestamptz,
  p_referral        jsonb,
  p_origin          text default 'webhook'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id text := nullif(trim(p_referral->>'sourceId'), '');
  v_ad_id     uuid;
  v_touch_id  uuid;
  v_conv      record;
begin
  -- No sourceID means no natural key: the creative cannot be catalogued and the
  -- touch would be unattributable. Silently skip.
  if v_source_id is null then
    return null;
  end if;

  select store_id, contact_id, lead_id, customer_id
    into v_conv
    from public.conversations
   where id = p_conversation_id;

  if not found then
    return null;
  end if;

  insert into public.ads as a (
    source_id, source_type, headline, body, source_url, media_url, media_type
  )
  values (
    v_source_id,
    nullif(trim(p_referral->>'sourceType'), ''),
    nullif(trim(p_referral->>'headline'), ''),
    nullif(trim(p_referral->>'body'), ''),
    nullif(trim(p_referral->>'sourceUrl'), ''),
    nullif(trim(p_referral->>'mediaUrl'), ''),
    case when p_referral->>'mediaType' in ('image','video') then p_referral->>'mediaType' end
  )
  on conflict (source_id) do update
    set source_type  = coalesce(excluded.source_type, a.source_type),
        headline     = coalesce(excluded.headline,    a.headline),
        body         = coalesce(excluded.body,        a.body),
        source_url   = coalesce(excluded.source_url,  a.source_url),
        media_url    = coalesce(excluded.media_url,   a.media_url),
        media_type   = coalesce(excluded.media_type,  a.media_type),
        last_seen_at = now(),
        updated_at   = now()
  returning a.id into v_ad_id;

  insert into public.ad_touches (
    ad_id, store_id, conversation_id, message_id,
    contact_id, lead_id, customer_id, occurred_at, origin
  )
  values (
    v_ad_id, v_conv.store_id, p_conversation_id, p_message_id,
    v_conv.contact_id, v_conv.lead_id, v_conv.customer_id, p_occurred_at, p_origin
  )
  on conflict do nothing
  returning id into v_touch_id;

  -- null when the touch already existed (redelivery) — the caller treats that
  -- as success, not as an error.
  return v_touch_id;
end;
$$;

comment on function public.record_ad_touch(uuid, uuid, timestamptz, jsonb, text) is
  'PRD-217: upserts the ad creative and appends one touch, resolving the conversation links server-side. Idempotent via the unique indexes. service_role only.';

revoke all on function public.record_ad_touch(uuid, uuid, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_ad_touch(uuid, uuid, timestamptz, jsonb, text)
  to service_role;
