-- NPS — fila de recuperação de detratores e parâmetros de leitura.
--
-- Fonte: ui_kit `ui_kits/nps` (abas Recuperação e Parâmetros). O PRD-148B não
-- previa nenhuma das duas; o dono escolheu a versão do kit em 2026-08-13.
--
-- Duas partes independentes:
--   1. estado da tratativa em nps_surveys — o quadro de 3 colunas do kit;
--   2. parâmetros de leitura em nps_settings — meta, faixas, SLA e visibilidade.
--
-- ATENÇÃO: aplicar em produção é manual e exige OK do dono. Mergear o PR não
-- aplica nada. Enquanto não for aplicada, a aba Recuperação mostra o aviso de
-- "recurso pendente de migration" em vez de quebrar.

-- ---------------------------------------------------------------------------
-- 1. Tratativa de detratores
-- ---------------------------------------------------------------------------

-- Deliberadamente sem default: NULL significa "nunca tocado". Uma nota 0–6 com
-- recovery_status NULL é o card da coluna "Novo" — assim a fila já nasce cheia
-- com o histórico, sem precisar de backfill, e um dia de indisponibilidade do
-- app não deixa detrator invisível.
alter table public.nps_surveys
  add column if not exists recovery_status text
    check (recovery_status in ('em_contato', 'resolvido')),
  add column if not exists recovery_owner_id uuid references public.sellers (id) on delete set null,
  add column if not exists recovery_note text,
  add column if not exists recovery_contacted_at timestamptz,
  add column if not exists recovery_resolved_at timestamptz;

comment on column public.nps_surveys.recovery_status is
  'Tratativa do detrator. NULL = ainda na coluna "Novo" (inclui todo o histórico anterior à migration).';
comment on column public.nps_surveys.recovery_note is
  'Desfecho escrito pelo atendente ao encerrar. Fica na ficha do cliente, não na resposta do cliente.';

-- Índice parcial: o quadro só pergunta por detratores respondidos. Restringir o
-- índice a eles mantém a fila barata mesmo quando a tabela crescer com anos de
-- promotores, que nunca aparecem nessa consulta.
create index if not exists nps_surveys_recovery_idx
  on public.nps_surveys (store_id, responded_at desc)
  where status = 'responded' and score <= 6;

-- ---------------------------------------------------------------------------
-- 2. Escrita da tratativa — RPC, não policy
-- ---------------------------------------------------------------------------
--
-- nps_surveys não tem policy de UPDATE para authenticated, e abrir uma seria
-- conceder a edição da própria resposta do cliente: nota e comentário são o
-- registro do que ele disse e não podem ser reescritos por quem foi avaliado.
-- A RPC é o recorte: escreve as cinco colunas de tratativa e nenhuma outra.
create or replace function public.nps_set_recovery(
  p_survey_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
begin
  if p_status is not null and p_status not in ('em_contato', 'resolvido') then
    raise exception 'status de tratativa inválido: %', p_status
      using errcode = '22023';
  end if;

  -- SECURITY DEFINER ignora RLS, então o escopo é verificado aqui: só staff da
  -- própria loja mexe na fila. Sem esta linha a função seria uma porta aberta
  -- para editar tratativa de qualquer loja.
  if not public.is_staff() then
    raise exception 'sem permissão para tratar detratores'
      using errcode = '42501';
  end if;

  update public.nps_surveys
     set recovery_status = p_status,
         recovery_note = coalesce(p_note, recovery_note),
         recovery_owner_id = coalesce(recovery_owner_id, v_seller),
         recovery_contacted_at = case
           when p_status = 'em_contato' and recovery_contacted_at is null then now()
           else recovery_contacted_at
         end,
         recovery_resolved_at = case
           when p_status = 'resolvido' then now()
           else null
         end
   where id = p_survey_id
     and store_id = v_store
     and status = 'responded'
     and score <= 6;

  if not found then
    raise exception 'pesquisa não encontrada nesta loja, ou não é um detrator respondido'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.nps_set_recovery(uuid, text, text) from public;
grant execute on function public.nps_set_recovery(uuid, text, text) to authenticated;

comment on function public.nps_set_recovery(uuid, text, text) is
  'Move um detrator entre Novo / Em contato / Resolvido. Único caminho de escrita do app em nps_surveys; nota e comentário permanecem inalteráveis.';

-- ---------------------------------------------------------------------------
-- 3. Parâmetros de leitura
-- ---------------------------------------------------------------------------
--
-- Os defaults reproduzem o kit, que por sua vez reproduz o padrão de mercado do
-- NPS. Ficam no DDL e não no código do front: uma loja sem linha em nps_settings
-- tem que ler igual a uma loja configurada, senão o painel muda de significado
-- conforme quem abre.
alter table public.nps_settings
  add column if not exists target_score smallint not null default 60,
  add column if not exists band_excellence smallint not null default 75,
  add column if not exists band_quality smallint not null default 50,
  add column if not exists band_improvement smallint not null default 0,
  add column if not exists recovery_threshold smallint not null default 6,
  add column if not exists recovery_sla_hours smallint not null default 24,
  add column if not exists recovery_owner text not null default 'attendant',
  add column if not exists recovery_escalate boolean not null default true,
  add column if not exists show_widget boolean not null default true,
  add column if not exists show_on_fiche boolean not null default true,
  add column if not exists include_in_ranking boolean not null default false,
  add column if not exists anonymous_for_team boolean not null default false;

-- Faixas fora de ordem tornam uma delas inalcançável e fazem o teste de cima
-- vencer para notas que pertencem à de baixo — a régua deixaria de descrever a
-- realidade. O banco recusa o conjunto em vez de guardá-lo e deixar cada leitor
-- discordar do outro.
alter table public.nps_settings
  drop constraint if exists nps_settings_bands_ordered;
alter table public.nps_settings
  add constraint nps_settings_bands_ordered
  check (band_excellence > band_quality and band_quality > band_improvement);

alter table public.nps_settings
  drop constraint if exists nps_settings_recovery_owner_valid;
alter table public.nps_settings
  add constraint nps_settings_recovery_owner_valid
  check (recovery_owner in ('attendant', 'manager'));

alter table public.nps_settings
  drop constraint if exists nps_settings_recovery_threshold_valid;
alter table public.nps_settings
  add constraint nps_settings_recovery_threshold_valid
  check (recovery_threshold in (6, 8));

comment on column public.nps_settings.target_score is
  'Meta interna. Linha tracejada da tendência e corte do verde no painel.';
comment on column public.nps_settings.recovery_threshold is
  '6 = só detratores abrem tratativa (padrão do NPS); 8 = neutros também.';
comment on column public.nps_settings.include_in_ranking is
  'Default false: o PRD-148B recusava expor NPS por atendente, e ligar isso muda o incentivo do time.';
