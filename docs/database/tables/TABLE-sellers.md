---
objeto: sellers
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: access
rls_enabled: true
colunas: 25
edge_functions: [invite-seller, invite-seller-email, set-seller-role, set-seller-access, reset-seller-password, delete-seller]
prds_relacionados: [PRD-101, PRD-211, PRD-212, PRD-213]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `sellers`

> Membro da equipe (staff/externo/representante) — núcleo gravitacional. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** access · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON sellers, no próprio banco)`

> Sales team (staff/external/representative). Maps to ISeller (people.ts). PRD-101.

Equipe da plataforma — vendedor interno, externo ou representante. É um dos dois eixos do escopo
multi-loja (junto com `stores`): **a tabela mais referenciada do banco** (35 FKs entrando), pois
quase toda entidade comercial registra "qual vendedor". `🔍 inferido (in-degree de FKs)`

Pontos-chave de domínio: `🔍 inferido (fonte: src/shared/types/people.ts → ISeller)`
- **Identidade de login:** `auth_user_id` liga a linha ao usuário do Supabase Auth (`auth.users`).
  Um seller pode existir **sem** login (`auth_user_id` nulo) — ex.: o seller do dono descolado do
  admin AILA. `🔍 (memória do projeto: identidade admin vs dono)`
- **RBAC:** o papel **não** vive aqui — vive em `profiles` e nos claims do JWT (`custom_access_token_hook`).
  Esta tabela é o "quem", não o "pode o quê". `🔍 (CLAUDE.md — enforcement via base_role)`
- **Pessoas & Acesso (cadeia 211→212→213):** `department_id` (PRD-211), `work_schedule`/
  `schedule_overrides`/`access_grant` (PRD-212, gate de horário) e `rotation` (PRD-213, participação
  na fila) foram acrescentados a esta tabela. `🔍 (PRDs 211–213 / people.ts)`

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` ‹on delete restrict› |
| 3 | `auth_user_id` | uuid | sim | — | — |
| 4 | `full_name` | text | não | — | — |
| 5 | `email` | text | não | — | — |
| 6 | `phone` | text | sim | — | — |
| 7 | `type` | text | não | — | — |
| 8 | `availability` | text | não | `'offline'::text` | — |
| 9 | `divisions` | text[] | não | `'{parts}'::text[]` | — |
| 10 | `theme_preference` | jsonb | sim | — | — |
| 11 | `region` | text | sim | — | — |
| 12 | `commission_tier` | text | sim | — | — |
| 13 | `parent_seller_id` | uuid | sim | — | FK → `sellers.id` ‹on delete set null› |
| 14 | `commission_rule` | jsonb | sim | — | — |
| 15 | `vehicle_cadastro_mode` | text | sim | — | — |
| 16 | `active` | boolean | não | `true` | — |
| 17 | `created_at` | timestamptz | não | `now()` | — |
| 18 | `updated_at` | timestamptz | não | `now()` | — |
| 19 | `deleted_at` | timestamptz | sim | — | — |
| 20 | `attendant_name` | text | sim | — | — |
| 21 | `department_id` | text | sim | — | FK → `departments.id` |
| 22 | `rotation` | jsonb | não | `'{"enabled": true}'::jsonb` | — |
| 23 | `work_schedule` | jsonb | sim | — | — |
| 24 | `schedule_overrides` | jsonb | sim | — | — |
| 25 | `access_grant` | jsonb | sim | — | — |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/people.ts → ISeller)`

| coluna | significado |
|--------|-------------|
| `attendant_name` | Nome curto de exibição ao cliente no WhatsApp; quando preenchido vira assinatura em negrito (`*Nome:* …`). Vazio = mensagens sem assinatura. |
| `type` | `internal` (staff), `external` (vendedor externo) ou `representative` (representante). |
| `availability` | Disponibilidade em tempo real p/ distribuição: `online`/`ausente`/`ocupado`/`offline`. |
| `divisions` | Divisões que o seller opera; no MVP sempre `{parts}` (SERVICE/INDUSTRIAL dormentes). |
| `region` / `commission_tier` / `commission_rule` | Reservados a externo/representante (região, faixa e regra de comissão). |
| `parent_seller_id` | Representante que reporta a outro seller (hierarquia). |
| `vehicle_cadastro_mode` | Override por seller do modo de cadastro de veículo da loja (PRD-016). |
| `department_id` | Departamento (PRD-211; no MVP no máximo um). **Tipo `text`** (não uuid). |
| `rotation` | Participação na fila de rodízio: `{enabled}` (PRD-213). |
| `work_schedule` / `schedule_overrides` | Horário semanal de atendimento + exceções pontuais (PRD-212, gate de acesso). |
| `access_grant` | Liberação temporária de emergência; `null`/ausente = nenhuma (PRD-212). |
| `deleted_at` | Soft delete: preenchido ⇒ oculto das listas e login revogado. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `department_id` → `departments.id`
- `parent_seller_id` → `sellers.id` — on delete `SET NULL`
- `store_id` → `stores.id` — on delete `RESTRICT`

**Entrando (referenciam esta tabela):**

- `asset_combos.owner_id` → `sellers.id`
- `asset_favorites.seller_id` → `sellers.id`
- `asset_send_log.seller_id` → `sellers.id`
- `audit_logs.actor_id` → `sellers.id`
- `carteira_transfers.created_by` → `sellers.id`
- `carteira_transfers.from_seller_id` → `sellers.id`
- `carteira_transfers.to_seller_id` → `sellers.id`
- `cash_flow_entries.created_by` → `sellers.id`
- `commissions.seller_id` → `sellers.id`
- `conversation_notes.author_id` → `sellers.id`
- `conversation_participants.added_by` → `sellers.id`
- `conversation_participants.seller_id` → `sellers.id`
- `conversations.assigned_seller_id` → `sellers.id`
- `customer_notes.author_id` → `sellers.id`
- `customer_segments.owner_id` → `sellers.id`
- `customers.converted_by_seller_id` → `sellers.id`
- `customers.seller_id` → `sellers.id`
- `departments.manager_id` → `sellers.id`
- `distribution_traces.selected_seller_id` → `sellers.id`
- `goals.created_by` → `sellers.id`
- `goals.seller_id` → `sellers.id`
- `leads.seller_id` → `sellers.id`
- `message_templates.created_by` → `sellers.id`
- `orders.canceled_by` → `sellers.id`
- `orders.seller_id` → `sellers.id`
- `product_indicators.seller_id` → `sellers.id`
- `profiles.seller_id` → `sellers.id`
- `quick_replies.owner_id` → `sellers.id`
- `quotes.approved_by` → `sellers.id`
- `quotes.seller_id` → `sellers.id`
- `recommendations.seller_id` → `sellers.id`
- `sdr_escalations.assigned_seller_id` → `sellers.id`
- `sdr_escalations.urgent_broadcast_claimed_by_seller_id` → `sellers.id`
- `sellers.parent_seller_id` → `sellers.id`
- `stores.manager_id` → `sellers.id`

## RLS — Row Level Security `[regra: mecânico]`

### `sellers_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `sellers_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `sellers_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `sellers_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (auth_user_id = ( SELECT auth.uid() AS uid))))`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

**Justificativa do desenho:** `🔍 inferido (fonte: expressões das policies + CLAUDE.md)`
- **Isolamento por loja:** todo acesso exige `store_id = current_store_id()` — um seller só enxerga
  a equipe da própria loja.
- **Escrita restrita a staff** (`is_staff()`): criar/excluir e editar outros sellers é ato de gestão.
- **Auto-edição:** o UPDATE permite `auth_user_id = auth.uid()` além de staff — o próprio usuário
  edita seu registro (ex.: disponibilidade/preferências) sem precisar ser staff.
- ❓ Confirmar se o `WITH CHECK` do UPDATE (só `store_id`) é intencionalmente mais frouxo que o
  `USING` (não impede o auto-editor de alterar campos sensíveis além dos previstos pela UI).

## Índices `[mecânico]`

- `idx_sellers_active` — `CREATE INDEX idx_sellers_active ON public.sellers USING btree (active)`
- `idx_sellers_department` — `CREATE INDEX idx_sellers_department ON public.sellers USING btree (department_id)`
- `idx_sellers_parent_seller_id` — `CREATE INDEX idx_sellers_parent_seller_id ON public.sellers USING btree (parent_seller_id)`
- `idx_sellers_store_id` — `CREATE INDEX idx_sellers_store_id ON public.sellers USING btree (store_id)`
- `sellers_auth_user_id_key` — `CREATE UNIQUE INDEX sellers_auth_user_id_key ON public.sellers USING btree (auth_user_id)`
- `sellers_email_key` — `CREATE UNIQUE INDEX sellers_email_key ON public.sellers USING btree (email)`
- `sellers_pkey` — `CREATE UNIQUE INDEX sellers_pkey ON public.sellers USING btree (id)`

**Constraints UNIQUE:** `sellers_auth_user_id_key`, `sellers_email_key`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `sellers_availability_check`: `(availability = ANY (ARRAY['online'::text, 'ausente'::text, 'ocupado'::text, 'offline'::text]))`
- `sellers_commission_tier_check`: `((commission_tier IS NULL) OR (commission_tier = ANY (ARRAY['junior'::text, 'pleno'::text, 'senior'::text, 'master'::text])))`
- `sellers_type_check`: `(type = ANY (ARRAY['internal'::text, 'external'::text, 'representative'::text]))`

**Narrativa** `🔍 inferido (people.ts + CLAUDE.md + memória do projeto)`:
- `email` e `auth_user_id` são únicos (índices `*_key`) — um e-mail/login por seller.
- O perfil exibido nas telas vem de `full_name` do seller logado, resolvido por `auth_user_id`
  (não por e-mail). `🔍 (memória: dev aponta p/ prod & identidade admin)`
- `audit_logs.actor_id` → `sellers.id` é **NOT NULL**: toda ação auditada exige um seller válido
  (daí o espelho de sessão carregar `sellerId`). `🔍 (memória: PR #66)`
- Desligar um seller é **soft delete** (`deleted_at`), via Edge `delete-seller` — a linha não é
  removida (preserva FKs históricas).

## Perguntas pendentes

- ❓ Confirmar a folga do `WITH CHECK` no UPDATE de auto-edição (ver Justificativa de RLS acima).
- ❓ `accessible_store_ids` existe no tipo `ISeller` (multi-loja do StoreSwitcher) mas **não há
  coluna correspondente** em `sellers` — é derivado em runtime ou ainda não persistido? Confirmar.

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
