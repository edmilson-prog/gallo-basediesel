-- Candidatos a pesquisa de NPS: todo o filtro relacional em um round-trip,
-- no mesmo padrão de sdr_backstop_candidates. A decisão em si (delay,
-- cooldown, amostragem, teto diário, janela de envio) é do motor puro em
-- supabase/functions/nps-scheduler/eligibility.ts — esta função só reúne os
-- fatos.
--
-- `l.id = c.lead_id::uuid` casta o PARÂMETRO, não a coluna indexada: castar
-- `l.id::text` inutilizaria leads_pkey e pagaria varredura sequencial de leads
-- a cada chamada (migration 20260811190000). O cast é seguro por causa da
-- CHECK conversations_lead_id_is_uuid (validada) — sem ela, um lead_id
-- malformado deixaria de retornar zero linhas e passaria a levantar 22P02.
--
-- Mensagem humana: direction = 'out' e author_type <> 'sdr'. Uma conversa que
-- só teve automação não mede satisfação com atendimento nenhum.
--
-- A janela retroativa (p_backfill_days) é o backstop que impede que ligar o
-- master switch varra o backlog histórico inteiro.

create or replace function public.nps_survey_candidates(
  p_store_id uuid,
  p_backfill_days integer
)
returns table (
  conversation_id uuid,
  store_id uuid,
  customer_id uuid,
  lead_id text,
  phone_digits text,
  recipient_name text,
  closed_at timestamptz,
  last_survey_at timestamptz,
  has_active_survey boolean,
  opt_out boolean,
  has_human_message boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.store_id,
    c.customer_id,
    c.lead_id,
    coalesce(cu.phone_digits, l.phone_digits),
    coalesce(nullif(btrim(cu.contact_name), ''), nullif(btrim(cu.full_name), ''),
             nullif(btrim(cu.whatsapp_name), ''), nullif(btrim(l.name), '')),
    c.closed_at,
    (select max(s.created_at)
       from public.nps_surveys s
      where s.phone_digits = coalesce(cu.phone_digits, l.phone_digits)),
    exists (select 1
              from public.nps_surveys s
             where s.phone_digits = coalesce(cu.phone_digits, l.phone_digits)
               and s.status in ('pending', 'sent')),
    exists (select 1
              from public.contacts ct
             where ct.phone_digits = coalesce(cu.phone_digits, l.phone_digits)
               and ct.opt_out),
    exists (select 1
              from public.messages m
             where m.conversation_id = c.id
               and m.direction = 'out'
               and m.author_type <> 'sdr')
  from public.conversations c
  left join public.customers cu on cu.id = c.customer_id
  left join public.leads l on l.id = c.lead_id::uuid
  where c.store_id = p_store_id
    and c.status = 'resolvida'
    and c.closed_at is not null
    and c.closed_at >= now() - make_interval(days => p_backfill_days)
    and coalesce(cu.phone_digits, l.phone_digits) is not null
    and not exists (select 1
                      from public.nps_surveys s2
                     where s2.conversation_id = c.id)
  order by c.closed_at asc
$$;

comment on function public.nps_survey_candidates(uuid, integer) is
  'PRD-148B: reúne os fatos de elegibilidade de NPS de uma loja. Roda apenas pelo nps-scheduler (service_role) — execute revogado de authenticated/anon.';

revoke execute on function public.nps_survey_candidates(uuid, integer) from public;
revoke execute on function public.nps_survey_candidates(uuid, integer) from anon;
revoke execute on function public.nps_survey_candidates(uuid, integer) from authenticated;
