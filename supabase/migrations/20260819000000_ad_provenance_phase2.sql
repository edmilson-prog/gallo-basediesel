-- PRD-217 (Provenance) Fase 2 — propagação do customer_id e leitura do backfill.
--
-- Três objetos:
--   1. convert_lead_mark recriada com a RN-05 (carimba customer_id nos toques);
--   2. ad_backfill_delivery_window — fonte PRECISA do backfill;
--   3. ad_backfill_orphan_conversations — fonte APROXIMADA do backfill.
--
-- As duas últimas só LEEM. A escrita continua sendo exclusividade de
-- record_ad_touch (Fase 1), que é idempotente pelos índices únicos.

-- ── RN-05: propagação na conversão ─────────────────────────────────────────
-- Corpo idêntico ao que roda em produção (pg_get_functiondef, 2026-08-18) mais
-- o update final. As guardas de loja e autorização são o controle de acesso da
-- conversão: não alterar.
--
-- O update passa por cima da RLS de ad_touches de propósito e por construção:
-- a tabela não tem `force row level security` e pertence a postgres, e esta
-- função é SECURITY DEFINER do mesmo dono. Verificado no catálogo.
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

-- ── Backfill, fonte precisa ────────────────────────────────────────────────
-- webhook_deliveries guarda o payload cru do WAHA desde 19/07/2026. Cada nó
-- externalAdReply carrega uma thumbnail base64 (~2,8 KB) que ninguém lê: a
-- função a descarta antes de devolver.
--
-- Por que existe em vez de a query viver no script: PostgREST não expressa
-- coalesce de caminho jsonb, e trazer 127 mil payloads crus para o cliente é
-- inviável. Por que é por janela: varrer a tabela inteira de uma vez estoura o
-- statement_timeout (medido — 1 dia custa ~1,5 s; o script janela por dia).
--
-- Os três caminhos NÃO são hipotéticos: extendedTextMessage (277) e
-- imageMessage (2) foram ambos observados em produção numa amostra de 8 dias.
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

-- ── Backfill, fonte aproximada ─────────────────────────────────────────────
-- conversations.ad_referral guarda apenas o ÚLTIMO anúncio (o webhook
-- sobrescreve), e a data do clique se perdeu: reconstruímos um toque por
-- conversa datado pela criação da conversa. Daí origin='backfill_conversation'
-- na chamada e o aviso da RN-06 em qualquer série temporal.
--
-- "sem nenhum toque" é a guarda que impede datar o anúncio mais RECENTE com a
-- data mais ANTIGA numa conversa que já recebeu um toque preciso.
--
-- Sem limite de propósito: o conjunto é limitado pelas conversas com
-- ad_referral (975 em 2026-08-18) e encolhe a cada execução.
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
