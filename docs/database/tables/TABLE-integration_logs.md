---
objeto: integration_logs
tipo: tabela
schema: public
status: existente
tier: estrutural
dominio: integrations
rls_enabled: true
colunas: 11
edge_functions: []
prds_relacionados: [PRD-112]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `integration_logs`

> Auditoria de chamadas a provedores externos (WhatsApp/Vault). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** estrutural · **Domínio:** integrations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON integration_logs, no próprio banco)`

> Outbound WhatsApp provider call audit (PRD-112 RF-120). Written by Edge Functions (service_role) only; owner-only read.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `integration_name` | text | não | — | — |
| 3 | `direction` | text | não | `'outbound'::text` | — |
| 4 | `endpoint` | text | não | — | — |
| 5 | `http_status` | integer | sim | — | — |
| 6 | `latency_ms` | integer | sim | — | — |
| 7 | `trace_id` | text | sim | — | — |
| 8 | `request_payload` | jsonb | sim | — | — |
| 9 | `response_payload` | jsonb | sim | — | — |
| 10 | `error_message` | text | sim | — | — |
| 11 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- _nenhuma_

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `integration_logs_owner_read` — SELECT · roles: `{authenticated}`
- **USING:** `(current_app_role() = 'owner'::text)`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `integration_logs_created_at_idx` — `CREATE INDEX integration_logs_created_at_idx ON public.integration_logs USING btree (created_at DESC)`
- `integration_logs_integration_name_idx` — `CREATE INDEX integration_logs_integration_name_idx ON public.integration_logs USING btree (integration_name, created_at DESC)`
- `integration_logs_pkey` — `CREATE UNIQUE INDEX integration_logs_pkey ON public.integration_logs USING btree (id)`
- `integration_logs_trace_id_idx` — `CREATE INDEX integration_logs_trace_id_idx ON public.integration_logs USING btree (trace_id) WHERE (trace_id IS NOT NULL)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `integration_logs_direction_check`: `(direction = ANY (ARRAY['outbound'::text, 'inbound'::text]))`
- `integration_logs_integration_name_check`: `(integration_name = ANY (ARRAY['whatsapp_meta'::text, 'whatsapp_evolution'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
