-- Parâmetros de leitura do NPS (ui_kits/nps — aba "Parâmetros").
--
-- A tela de Configurações → NPS decide QUANDO perguntar (gatilhos, delay,
-- cooldown, amostragem e as duas travas anti-disparo). Estas colunas decidem
-- COMO a resposta é lida: qual é a meta, como o score vira julgamento, quem
-- corre atrás de uma nota baixa e onde o número pode aparecer.
--
-- A separação é deliberada e vale mais que a economia de uma tabela: nenhum
-- campo abaixo é capaz de fazer uma mensagem sair. Errar aqui deixa o painel
-- julgando errado; errar lá dispara pesquisa para gente de verdade.
--
-- Tudo aditivo e com DEFAULT igual ao que o código já assumia como constante
-- (`NPS_TARGET = 60`, `npsFaixa` 75/50/0 em src/features/nps/engine). Uma linha
-- de nps_settings que já exista continua se comportando exatamente como antes
-- desta migration.

alter table public.nps_settings
  -- Meta interna: só desenha a linha tracejada da tendência e marca corte
  -- atingido. NÃO entra no cálculo do NPS.
  add column if not exists target_score integer not null default 60
    check (target_score between -100 and 100),

  -- Limite inferior de cada faixa nomeada. "Crítica" não tem coluna de
  -- propósito: é o que sobrar abaixo de band_improvement_min, de modo que
  -- nenhuma nota possa ficar sem classificação.
  add column if not exists band_excellence_min integer not null default 75
    check (band_excellence_min between -100 and 100),
  add column if not exists band_quality_min integer not null default 50
    check (band_quality_min between -100 and 100),
  add column if not exists band_improvement_min integer not null default 0
    check (band_improvement_min between -100 and 100),

  -- Tratativa da nota baixa.
  add column if not exists followup_max_score integer not null default 6
    check (followup_max_score in (6, 8)),
  add column if not exists followup_sla_hours integer not null default 24
    check (followup_sla_hours between 1 and 168),
  add column if not exists followup_owner text not null default 'attendant'
    check (followup_owner in ('attendant', 'manager', 'owner')),
  add column if not exists followup_escalation_enabled boolean not null default true,
  add column if not exists followup_escalation_hours integer not null default 48
    check (followup_escalation_hours between 1 and 336),

  -- Visibilidade: quais superfícies podem exibir o NPS.
  add column if not exists show_cockpit_card boolean not null default true,
  add column if not exists show_customer_badge boolean not null default true,
  add column if not exists show_seller_ranking boolean not null default true,
  add column if not exists anonymize_responses boolean not null default false;

-- As três faixas precisam ser estritamente decrescentes. Dois limites iguais
-- tornam uma faixa inalcançável e um par invertido faz o teste de cima vencer
-- para notas que pertencem à faixa de baixo — nos dois casos a régua deixa de
-- descrever a realidade. A UI recusa salvar, mas a checagem mora aqui porque a
-- UI não é a única porta: um UPDATE manual entraria igual.
alter table public.nps_settings
  drop constraint if exists nps_settings_bands_ordered;

alter table public.nps_settings
  add constraint nps_settings_bands_ordered
    check (band_excellence_min > band_quality_min and band_quality_min > band_improvement_min);

comment on column public.nps_settings.target_score is
  'Meta interna. Linha tracejada do gráfico de tendência e referência de "meta atingida". Não participa do cálculo do NPS.';
comment on column public.nps_settings.band_excellence_min is
  'Piso da faixa Excelência. Junto de band_quality_min e band_improvement_min, forma a régua nomeada; abaixo do menor deles a faixa é Crítica.';
comment on column public.nps_settings.followup_max_score is
  'Nota de corte da tratativa: 6 abre caso só para detratores, 8 inclui os neutros — fila muito maior, só faz sentido com gente para atender.';
comment on column public.nps_settings.followup_sla_hours is
  'Prazo do primeiro contato depois que a resposta chega. É o que separa uma tratativa de um arquivo de reclamações.';
comment on column public.nps_settings.followup_owner is
  'Quem faz o primeiro contato: attendant = quem atendeu a conversa, manager = gestor da loja, owner = dono da carteira do cliente.';
comment on column public.nps_settings.anonymize_responses is
  'Oculta a identidade do respondente nas listas de leitura. A tratativa continua enxergando o contato — sem isso não haveria a quem retornar.';
comment on column public.nps_settings.show_seller_ranking is
  'Tabela de NPS por atendente no painel. Existe para ser desligável: o PRD-051 proíbe compare-and-shame, e a tabela foi reintroduzida pelo ui_kit como diagnóstico.';
