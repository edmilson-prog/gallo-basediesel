-- Item avulso (off-catalog) em orçamento e pedido — `part_id` passa a aceitar NULL.
--
-- O editor de orçamentos oferece "item avulso": uma linha digitada à mão, sem
-- peça no catálogo (mão de obra, frete de terceiro, peça de terceiro). O domínio
-- marca essa linha com o sentinela `partId = 'avulso'`, e a linha já carrega o
-- nome e o preço em snapshot próprio — a peça nunca é necessária para exibir ou
-- somar o orçamento.
--
-- Só que `quote_items.part_id` (e `order_items.part_id`) é `uuid not null` com FK
-- para `parts(id)`: gravar o sentinela quebra no cast antes mesmo da FK
-- (`invalid input syntax for type uuid: "avulso"`), e não existe peça sentinela
-- no catálogo para apontar. Resultado: o item avulso é impossível de salvar.
--
-- A ausência de peça é justamente o que a linha significa, então o lugar certo
-- de registrar isso é NULL. Os providers mapeiam `'avulso' <-> NULL` nos dois
-- sentidos (`quoteItemToRow`/`rowToQuoteItem`, `orderItemToRow`/`rowToOrderItem`).
--
-- A FK e o NOT NULL das demais colunas continuam de pé: uma linha de catálogo
-- segue obrigada a apontar para uma peça que existe.

alter table public.quote_items alter column part_id drop not null;
alter table public.order_items alter column part_id drop not null;

comment on column public.quote_items.part_id is
  'Peça do catálogo. NULL = item avulso (off-catalog): nome e preço vivem no snapshot da própria linha.';

comment on column public.order_items.part_id is
  'Peça do catálogo. NULL = item avulso (off-catalog): nome e preço vivem no snapshot da própria linha.';
