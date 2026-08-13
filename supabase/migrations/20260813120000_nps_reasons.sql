-- Motivos marcados na pesquisa (ui_kits/nps — `PQ_MOT`).
--
-- A pesquisa do kit tem dois passos: a nota e, em seguida, os motivos por
-- chips — com a pergunta mudando conforme a categoria ("O que fez a
-- diferença?" / "O que faltou?" / "O que deu errado?"). O painel se apoia
-- nesses motivos para responder o que puxa a nota para cima e para baixo, que
-- é a pergunta que o comentário livre nunca responde de forma agregável.
--
-- Array de texto, não tabela de junção: os motivos são um vocabulário fechado e
-- pequeno, só leitura agregada, e nunca se relacionam a mais nada. Uma tabela
-- filha custaria um join em toda leitura para não guardar nada além do rótulo.

alter table public.nps_surveys
  add column if not exists reasons text[] not null default '{}';

comment on column public.nps_surveys.reasons is
  'Motivos marcados pelo cliente no 2º passo da pesquisa. Vocabulário fechado por categoria (ver PQ_MOT no ui_kit). Vazio quando o cliente pulou.';

-- Índice GIN: o painel filtra e agrega por motivo ("respostas que citaram
-- Prazo"), que é contenção de array, não igualdade.
create index if not exists nps_surveys_reasons_idx
  on public.nps_surveys using gin (reasons);
