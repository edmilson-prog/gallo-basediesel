-- =============================================================================
-- Teto de p_limit nas RPCs de conversas
-- =============================================================================
--
-- POR QUÊ
-- As três RPCs abaixo terminavam com `limit greatest(p_limit, 1)`, ou seja: um
-- piso de 1 linha e NENHUM teto. Como elas são expostas pelo PostgREST, qualquer
-- chamador autenticado podia enviar `p_limit = 100000` e puxar cem mil linhas de
-- conversas num único request. O limite existente hoje é apenas do lado do
-- cliente (`Math.max(1, Math.min(1000, ...))` em
-- src/providers/data/impl/supabase/conversations.ts) — e limite de cliente não é
-- controle de segurança: basta chamar a RPC direto.
--
-- O QUE MUDA
-- A cláusula de limite passa a ser `least(greatest(coalesce(p_limit, <default>), 1), 200)`,
-- seguindo o padrão já usado em `storefront_top_selling`
-- (`limit greatest(1, least(coalesce(p_limit, 2000), 5000))`). O `coalesce`
-- também fecha o caso de `p_limit => null` explícito, que antes virava
-- `limit NULL` (sem limite algum).
--
-- Teto de 200 está folgado em relação ao uso real: o default de cada função é
-- 20/30 e o maior valor legítimo observado no frontend é 50. Nenhuma tela
-- existente é afetada.
--
-- ⚠️ ESCOPO — LEIA
-- Este teto NÃO fecha o vazamento de PII de `search_conversations`. Aquele
-- vazamento decorre do 6º ramo do predicado de acesso
-- (`c.assigned_seller_id is not null and exists (select 1 from acc)`), que
-- libera qualquer conversa atribuída para quem tenha ao menos uma instância
-- acessível. Esse ramo está PRESERVADO exatamente como está em produção — sua
-- remoção depende de decisão do dono e será tratada em PR separado. O que esta
-- migration faz é apenas limitar o VOLUME por requisição, reduzindo a
-- exfiltração em massa de uma tacada. Não confunda mitigação com correção.
--
-- Fora a cláusula `limit`, nada mais foi alterado: predicados de acesso,
-- filtros, CTEs materializadas, comentários de plano, `SECURITY DEFINER`,
-- `SET search_path TO ''` e `p_offset` seguem idênticos ao que está no banco.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_conversations(p_search text, p_store_id uuid DEFAULT NULL::uuid, p_status text[] DEFAULT NULL::text[], p_channel text DEFAULT NULL::text, p_whatsapp_account_id uuid DEFAULT NULL::uuid, p_assigned_seller_id uuid DEFAULT NULL::uuid, p_unassigned boolean DEFAULT false, p_is_sdr_active boolean DEFAULT NULL::boolean, p_tags text[] DEFAULT NULL::text[], p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_order_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_assigned_seller_ids uuid[] DEFAULT NULL::uuid[], p_include_queue boolean DEFAULT false, p_search_digit_variants text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid, channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean, tags text[], linked_order_id text, last_message_at timestamp with time zone, unread_count integer, created_at timestamp with time zone, queued_at timestamp with time zone, ad_referral jsonb, is_collaborator boolean, is_accessible boolean, contact_name text, contact_phone text, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  ),
  q as (select '%' || coalesce(trim(p_search), '') || '%' as term),
  -- MATERIALISED pre-filters: one scan of each table, not 3.6k. The empty-term
  -- guard is repeated here on purpose — it becomes a One-Time Filter on the CTE,
  -- so an empty term never scans these tables even if the planner reorders.
  mc as materialized (
    select cu.id
    from public.customers cu, q
    where length(trim(coalesce(p_search, ''))) > 0
      and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term
           or (p_search_digit_variants is not null and exists (
                 select 1 from unnest(p_search_digit_variants) as v(variant)
                 where cu.phone_digits like '%' || v.variant || '%')))
  ),
  -- `l.id`, never `l.id::text`: `ml` yields native uuid, so the comparison with
  -- `c.lead_id::uuid` is uuid vs uuid. The cast fix does NOT regress here.
  ml as materialized (
    select l.id
    from public.leads l, q
    where length(trim(coalesce(p_search, ''))) > 0
      and (l.name ilike q.term or l.phone ilike q.term
           or (p_search_digit_variants is not null and exists (
                 select 1 from unnest(p_search_digit_variants) as v(variant)
                 where l.phone_digits like '%' || v.variant || '%')))
  )
  select
    c.id, c.store_id, c.customer_id, c.lead_id, c.assigned_seller_id, c.channel,
    c.whatsapp_account_id, c.status, c.is_sdr_active, c.tags, c.linked_order_id,
    c.last_message_at, c.unread_count, c.created_at, c.queued_at, c.ad_referral,
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
    public.can_access_conversation(c.id) as is_accessible,
    coalesce(
      (select case when cu.type = 'B2B'
                then coalesce(nullif(cu.nome_fantasia, ''), nullif(cu.razao_social, ''), cu.full_name)
                else cu.full_name end
         from public.customers cu where cu.id = c.customer_id),
      (select l.name from public.leads l where l.id = c.lead_id::uuid)
    ) as contact_name,
    coalesce(
      (select cu.phone from public.customers cu where cu.id = c.customer_id),
      (select l.phone from public.leads l where l.id = c.lead_id::uuid)
    ) as contact_phone,
    count(*) over () as total_count
  from public.conversations c
  where
    c.store_id = public.current_store_id()
    and length(trim(coalesce(p_search, ''))) > 0
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
      or (
        c.assigned_seller_id is not null
        and exists (select 1 from acc)
      )
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
    and not (
      c.status = 'arquivada'
      and not exists (select 1 from public.messages m where m.conversation_id = c.id)
    )
    -- THE ONLY LOGIC CHANGE: this was an OR of two correlated EXISTS.
    and (
      c.customer_id in (select id from mc)
      or c.lead_id::uuid in (select id from ml)
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200)
  offset greatest(p_offset, 0);
$function$;

CREATE OR REPLACE FUNCTION public.list_conversations(p_status text[] DEFAULT NULL::text[], p_channel text DEFAULT NULL::text, p_whatsapp_account_id uuid DEFAULT NULL::uuid, p_is_sdr_active boolean DEFAULT NULL::boolean, p_tags text[] DEFAULT NULL::text[], p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_assigned_seller_ids uuid[] DEFAULT NULL::uuid[], p_unassigned boolean DEFAULT false, p_include_queue boolean DEFAULT false, p_order_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid, channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean, tags text[], linked_order_id text, last_message_at timestamp with time zone, unread_count integer, created_at timestamp with time zone, queued_at timestamp with time zone, ad_referral jsonb, is_collaborator boolean, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  )
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
  from public.conversations c
  where c.store_id = public.current_store_id()
    and (p_status is null or c.status = any(p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    and (
      ((p_assigned_seller_ids is null or cardinality(p_assigned_seller_ids) = 0)
        and not p_unassigned and not p_include_queue)
      or (p_assigned_seller_ids is not null
          and c.assigned_seller_id = any(p_assigned_seller_ids))
      or (p_assigned_seller_ids is not null
          and exists (
            select 1 from public.conversation_participants p
            where p.conversation_id = c.id
              and p.seller_id = any(p_assigned_seller_ids)
          ))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue
          and c.assigned_seller_id is null
          and c.is_sdr_active = false
          and c.status = 'aguardando')
    )
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
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit least(greatest(coalesce(p_limit, 20), 1), 200)
  offset greatest(p_offset, 0);
$function$;

CREATE OR REPLACE FUNCTION public.search_conversation_messages(p_search text, p_store_id uuid DEFAULT NULL::uuid, p_status text[] DEFAULT NULL::text[], p_channel text DEFAULT NULL::text, p_whatsapp_account_id uuid DEFAULT NULL::uuid, p_assigned_seller_id uuid DEFAULT NULL::uuid, p_unassigned boolean DEFAULT false, p_assigned_seller_ids uuid[] DEFAULT NULL::uuid[], p_include_queue boolean DEFAULT false, p_is_sdr_active boolean DEFAULT NULL::boolean, p_tags text[] DEFAULT NULL::text[], p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_order_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid, channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean, tags text[], linked_order_id text, last_message_at timestamp with time zone, unread_count integer, created_at timestamp with time zone, queued_at timestamp with time zone, ad_referral jsonb, matched_message_text text, matched_message_sent_at timestamp with time zone, matched_message_direction text, matched_message_extra_count integer, is_collaborator boolean, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  ),
  esc as (
    select
      trim(coalesce(p_search, '')) as raw_term,
      replace(replace(replace(trim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_')
        as escaped_term
  ),
  candidate_conversations as (
    select c.*
    from public.conversations c
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
  ),
  -- Defect 1: without the join in here, the ilike stops being a per-conversation
  -- post-filter and the planner uses messages_text_trgm_idx ONCE.
  msg_hits as materialized (
    select m.conversation_id, m.text, m.sent_at, m.direction
    from public.messages m, esc
    where length(esc.raw_term) > 0
      and m.text ilike ('%' || esc.escaped_term || '%') escape '\'
  ),
  -- Defect 2: rn = 1 MUST stay in here. Back on the outer join's ON clause the
  -- node becomes a Nested Loop with a Join Filter (~6,6M comparisons).
  matched as materialized (
    select t.conversation_id, t.text, t.sent_at, t.direction, t.match_count
    from (
      select
        mh.conversation_id, mh.text, mh.sent_at, mh.direction,
        row_number() over (
          partition by mh.conversation_id order by mh.sent_at desc, mh.text desc
        ) as rn,
        count(*) over (partition by mh.conversation_id) as match_count
      from msg_hits mh
      join candidate_conversations cc on cc.id = mh.conversation_id
    ) t
    where t.rn = 1
  )
  select
    cc.id,
    cc.store_id,
    cc.customer_id,
    cc.lead_id,
    cc.assigned_seller_id,
    cc.channel,
    cc.whatsapp_account_id,
    cc.status,
    cc.is_sdr_active,
    cc.tags,
    cc.linked_order_id,
    cc.last_message_at,
    cc.unread_count,
    cc.created_at,
    cc.queued_at,
    cc.ad_referral,
    mm.text as matched_message_text,
    mm.sent_at as matched_message_sent_at,
    mm.direction as matched_message_direction,
    (mm.match_count - 1)::integer as matched_message_extra_count,
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = cc.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
    count(*) over () as total_count
  from candidate_conversations cc
  join matched mm on mm.conversation_id = cc.id
  order by
    case when p_order_dir = 'asc' then cc.last_message_at end asc,
    case when p_order_dir <> 'asc' then cc.last_message_at end desc
  limit least(greatest(coalesce(p_limit, 30), 1), 200)
  offset greatest(p_offset, 0);
$function$;
