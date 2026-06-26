---
objeto: ai_usage_events
tipo: tabela
schema: public
status: existente
tier: estrutural
dominio: ai
rls_enabled: true
colunas: 14
edge_functions: []
prds_relacionados: [ai]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `ai_usage_events`

> Log append-only de cada chamada real ao LLM. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** estrutural · **Domínio:** ai · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON ai_usage_events, no próprio banco)`

> Append-only. Uma linha por chamada real ao LLM. INSERT só pelo service_role (Edge ai-generate).

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `ts` | timestamptz | não | `now()` | — |
| 3 | `source` | text | não | — | — |
| 4 | `feature` | text | sim | — | — |
| 5 | `provider_id` | text | não | — | — |
| 6 | `model` | text | não | — | — |
| 7 | `input_tokens` | integer | não | `0` | — |
| 8 | `output_tokens` | integer | não | `0` | — |
| 9 | `cost_brl` | numeric | não | `0` | — |
| 10 | `latency_ms` | integer | não | `0` | — |
| 11 | `status` | text | não | — | — |
| 12 | `caller_id` | uuid | sim | — | — |
| 13 | `store_id` | uuid | sim | — | FK → `stores.id` |
| 14 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `ai_usage_events_owner_read` — SELECT · roles: `{authenticated}`
- **USING:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `ai_usage_events_pkey` — `CREATE UNIQUE INDEX ai_usage_events_pkey ON public.ai_usage_events USING btree (id)`
- `idx_ai_usage_events_feature` — `CREATE INDEX idx_ai_usage_events_feature ON public.ai_usage_events USING btree (feature) WHERE (feature IS NOT NULL)`
- `idx_ai_usage_events_ts` — `CREATE INDEX idx_ai_usage_events_ts ON public.ai_usage_events USING btree (ts DESC)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `ai_usage_events_source_check`: `(source = ANY (ARRAY['playground'::text, 'routed'::text]))`
- `ai_usage_events_status_check`: `(status = ANY (ARRAY['ok'::text, 'error'::text, 'fallback'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
