---
objeto: processed_events
tipo: tabela
schema: public
status: existente
tier: estrutural
dominio: integrations
rls_enabled: true
colunas: 3
edge_functions: []
prds_relacionados: [PRD-114]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `processed_events`

> Ledger de idempotência de webhook. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** estrutural · **Domínio:** integrations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON processed_events, no próprio banco)`

> Webhook idempotency ledger (PRD-114). event_key = whatsapp:<provider>:<providerMessageId>. service_role only.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `event_key` | text | não | — | **PK** |
| 2 | `trace_id` | text | sim | — | — |
| 3 | `processed_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- _nenhuma_

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

- **Sem policies.** `❓ pendente` — RLS habilitada mas sem policy ⇒ nega tudo a não-service_role. Confirmar se é intencional (acesso só por service_role).

## Índices `[mecânico]`

- `processed_events_pkey` — `CREATE UNIQUE INDEX processed_events_pkey ON public.processed_events USING btree (event_key)`
- `processed_events_processed_at_idx` — `CREATE INDEX processed_events_processed_at_idx ON public.processed_events USING btree (processed_at)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- ❓ `processed_events` tem RLS habilitada e nenhuma policy — acesso é exclusivamente via `service_role`/RPC? Confirmar.

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
