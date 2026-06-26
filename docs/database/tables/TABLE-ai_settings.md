---
objeto: ai_settings
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: ai
rls_enabled: true
colunas: 8
edge_functions: []
prds_relacionados: [ai]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `ai_settings`

> Configuração global de IA (singleton). Owner-only; chaves no Vault. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** ai · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON ai_settings, no próprio banco)`

> Configuração global de IA (singleton id=1). Owner-only. Chaves de API NÃO vivem aqui (Vault).

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | smallint | não | `1` | **PK** |
| 2 | `master_enabled` | boolean | não | `false` | — |
| 3 | `default_provider_id` | text | não | `'anthropic'::text` | — |
| 4 | `budget` | jsonb | não | — | — |
| 5 | `providers` | jsonb | não | — | — |
| 6 | `routing` | jsonb | não | — | — |
| 7 | `updated_at` | timestamptz | não | `now()` | — |
| 8 | `updated_by` | uuid | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- _nenhuma_

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `ai_settings_owner_write` — ALL · roles: `{authenticated}`
- **USING:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`
- **WITH CHECK:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`

### `ai_settings_owner_read` — SELECT · roles: `{authenticated}`
- **USING:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `ai_settings_pkey` — `CREATE UNIQUE INDEX ai_settings_pkey ON public.ai_settings USING btree (id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `ai_settings_id_check`: `(id = 1)`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
