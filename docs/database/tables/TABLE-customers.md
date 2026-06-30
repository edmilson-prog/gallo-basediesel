---
objeto: customers
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: crm
rls_enabled: true
colunas: 33
edge_functions: [whatsapp-webhook, whatsapp-avatar-sync, whatsapp-contacts-name-backfill, whatsapp-check-number]
prds_relacionados: [PRD-008, PRD-012, PRD-019, PRD-067, PRD-071, PRD-114, PRD-118, PRD-120, PRD-121]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `customers`

> Cliente B2B/B2C — núcleo do CRM. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** crm · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: src/shared/types/customer.ts → ICustomer; supabase/functions/_shared/whatsapp/webhook/core.ts; CLAUDE.md; memória do projeto)`

> Registro de cliente — pessoa física (B2C, CPF) ou jurídica (B2B, CNPJ) — dentro do CRM da plataforma.

Entidade de identidade central do domínio comercial. É a segunda tabela mais referenciada do banco:
**in-degree de 10 FKs** (`conversations`, `customer_notes`, `distribution_traces`, `leads`,
`media_assets`, `orders`, `quotes`, `recommendations`, `sdr_escalations`, `vehicles`). Toda
transação comercial (orçamento, pedido, conversa) converge aqui.

Pontos-chave de domínio:
- **União discriminada B2B / B2C:** o campo `type` (`'B2B'` ou `'B2C'`, MAIÚSCULO — check constraint)
  determina qual conjunto de colunas de identidade é válido. B2B usa `cnpj`/`razao_social`/
  `nome_fantasia`/`contact_name`; B2C usa `cpf`/`full_name`. As colunas do outro ramo ficam `NULL`.
  `🔍 inferido (fonte: customer.ts → ICustomerB2B / ICustomerB2C; CLOUD.md memória)`
- **Carteira 1:1:** `seller_id` é `NOT NULL` — todo cliente tem exatamente um vendedor responsável
  (dono da carteira). Transferência de carteira não desfaz visibilidade de conversas em andamento.
  `🔍 inferido (fonte: customer.ts → ICustomerBase.sellerId; migration 20260614183000)`
- **WhatsApp integrado:** `whatsapp_name`, `whatsapp_status` e `avatar_url`/`avatar_synced_at`
  são escritos exclusivamente por Edge Functions — a UI as trata como somente-leitura.
  `🔍 inferido (fonte: COMMENTs no banco; supabase/functions/_shared/whatsapp/webhook/core.ts)`
- **Ciclo de vida:** `status` (`ativo`, `dormente`, `recuperação`, `perdido`) governa o funil
  pós-conversão; `abc_class`/`abc_share` e `purchase_stats` são snapshots de BI computados.
  `🔍 inferido (fonte: customer.ts → CustomerStatus; ICustomerPurchaseStats)`
- **Origem multi-canal:** um cliente pode nascer de lead convertido (trail via
  `converted_from_lead_id`/`converted_from_lead_at`/`converted_by_seller_id`), de checkout B2C
  como hóspede (`is_guest_checkout`) ou de conversa WhatsApp com número inédito (auto-criado pelo
  webhook com `B2C` mínimo).
  `🔍 inferido (fonte: customer.ts comentários; supabase/functions/_shared/whatsapp/webhook/core.ts l.465)`

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `type` | text | não | — | — |
| 4 | `email` | text | sim | — | — |
| 5 | `phone` | text | não | — | — |
| 6 | `address` | jsonb | sim | — | — |
| 7 | `seller_id` | uuid | não | — | FK → `sellers.id` |
| 8 | `status` | text | não | — | — |
| 9 | `tags` | text[] | não | `'{}'::text[]` | — |
| 10 | `first_purchase_at` | timestamptz | sim | — | — |
| 11 | `last_purchase_at` | timestamptz | sim | — | — |
| 12 | `converted_from_lead_id` | text | sim | — | — |
| 13 | `converted_from_lead_at` | timestamptz | sim | — | — |
| 14 | `converted_by_seller_id` | uuid | sim | — | FK → `sellers.id` |
| 15 | `purchase_stats` | jsonb | sim | — | — |
| 16 | `abc_class` | text | sim | — | — |
| 17 | `abc_share` | numeric | sim | — | — |
| 18 | `overdue_titles_count` | integer | sim | — | — |
| 19 | `portal` | jsonb | sim | — | — |
| 20 | `is_guest_checkout` | boolean | sim | — | — |
| 21 | `has_b2b_portal` | boolean | sim | — | — |
| 22 | `portal_contract` | jsonb | sim | — | — |
| 23 | `cnpj` | text | sim | — | — |
| 24 | `razao_social` | text | sim | — | — |
| 25 | `nome_fantasia` | text | sim | — | — |
| 26 | `contact_name` | text | sim | — | — |
| 27 | `cpf` | text | sim | — | — |
| 28 | `full_name` | text | sim | — | — |
| 29 | `created_at` | timestamptz | não | `now()` | — |
| 30 | `whatsapp_status` | text | não | `'unknown'::text` | PRD-118: WhatsApp number validity. invalid = Meta 131026 seen; manual revalidation only. |
| 31 | `avatar_url` | text | sim | — | Public URL of the contact's WhatsApp profile photo (avatars bucket); NULL = none/private. |
| 32 | `avatar_synced_at` | timestamptz | sim | — | Last whatsapp-avatar-sync attempt for this contact; NULL = never attempted (idempotency). |
| 33 | `whatsapp_name` | text | sim | — | Contact's most recent WhatsApp profile name (pushName), persisted by the webhook on every inbound message — independent of the editable display name (full_name / nome_fantasia). Lets the platform show and restore the WhatsApp name after a manual rename. |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/customer.ts → ICustomer; COMMENTs de banco nas cols. 30–33; src/providers/data/impl/supabase/customers.ts → CustomerRow)`

| coluna | significado |
|--------|-------------|
| `type` | `'B2B'` (pessoa jurídica / CNPJ) ou `'B2C'` (pessoa física / CPF) — **MAIÚSCULO** (check constraint). Discriminador da união: B2B usa `cnpj`/`razao_social`/`nome_fantasia`/`contact_name`; B2C usa `cpf`/`full_name`. |
| `seller_id` | Vendedor responsável pela carteira deste cliente (1:1, NOT NULL). Determina visibilidade via RLS; não transfere automaticamente ao reatribuir conversa. |
| `status` | Ciclo de vida pós-conversão: `ativo` · `dormente` · `recuperacao` · `perdido`. |
| `tags` | Array de rótulos livres (`text[]`, default `'{}'`). Usados em segmentação e busca. |
| `converted_from_lead_id` | UUID do lead de origem (armazenado como `text`). Preserva o histórico pré-conversão na ficha (PRD-012 "Histórico pré-conversão"). |
| `converted_by_seller_id` | Seller / SDR que executou a conversão — pode ser diferente do `seller_id` atual. |
| `purchase_stats` | Snapshot jsonb de BI: `ticketMedio`, `ltv`, `orderCount12m`. Gerado pelo mock (Fase 1) ou por view materializada (Fase 2). `🔍 inferido (customer.ts → ICustomerPurchaseStats)` |
| `abc_class` / `abc_share` | Cópia de conveniência da última classificação ABC (`A`/`B`/`C`; share 0..1). |
| `overdue_titles_count` | Contagem demo-only de títulos vencidos (sem módulo de cobrança real na Fase 2); exibida no editor de orçamento quando presente. |
| `portal` / `portal_contract` | Jsonb: permissões granulares do Portal do Cliente (PRD-071) e contrato comercial B2B negociado. |
| `is_guest_checkout` | `true` quando o registro foi criado por checkout B2C anônimo (PRD-067 RF-022); limpo na mesclagem com cadastro posterior (RF-023). |
| `has_b2b_portal` | Flag que indica se o portal corporativo avançado (PRD-071 RF-005) está provisionado — índice `btree` específico. |
| `whatsapp_status` | Validade do número no WhatsApp (PRD-118): `unknown` (default) · `valid` · `invalid` · `blocked`. `invalid` é setado pelo webhook ao receber erro Meta 131026; volta para `valid` apenas por ação manual da staff — **nunca automático**. _COMMENT no banco: "PRD-118: WhatsApp number validity. invalid = Meta 131026 seen; manual revalidation only."_ |
| `avatar_url` | URL pública da foto de perfil do contato no WhatsApp, espelhada no bucket `avatars` pelo job `whatsapp-avatar-sync`. `NULL` = sem foto ou foto privada. _COMMENT no banco: "Public URL of the contact's WhatsApp profile photo (avatars bucket); NULL = none/private."_ |
| `avatar_synced_at` | Timestamp da última tentativa de sincronização de avatar pelo `whatsapp-avatar-sync` (idempotência). `NULL` = nunca tentado. _COMMENT no banco: "Last whatsapp-avatar-sync attempt for this contact; NULL = never attempted (idempotency)."_ |
| `whatsapp_name` | Nome de perfil mais recente do contato no WhatsApp (`pushName`), gravado pelo webhook a cada mensagem recebida — independente do nome editável (`full_name`/`nome_fantasia`). Permite restaurar o nome WhatsApp após renomeação manual. _COMMENT no banco: "Contact's most recent WhatsApp profile name (pushName), persisted by the webhook on every inbound message…"_ |
| `address` | Jsonb: `{street, number, complement?, district, city, state, zipCode}` — mesmo esquema para B2B e B2C. `🔍 inferido (customer.ts → ICustomerAddress)` |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `converted_by_seller_id` → `sellers.id`
- `seller_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `conversations.customer_id` → `customers.id`
- `customer_notes.customer_id` → `customers.id`
- `distribution_traces.customer_id` → `customers.id`
- `leads.converted_to_customer_id` → `customers.id`
- `media_assets.customer_id` → `customers.id`
- `orders.customer_id` → `customers.id`
- `quotes.customer_id` → `customers.id`
- `recommendations.subject_id` → `customers.id`
- `sdr_escalations.customer_id` → `customers.id`
- `vehicles.customer_id` → `customers.id`

## RLS — Row Level Security `[regra: mecânico]`

### `customers_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `customers_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `customers_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id)) OR seller_handles_customer(id)))`

### `customers_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `🔍 inferido (fonte: expressões das policies; migration 20260614183000_rls_assigned_seller_reads_linked_customer.sql; CLAUDE.md)`

- **Isolamento por loja:** todo acesso exige `store_id = current_store_id()` — um usuário só
  enxerga clientes da própria loja ativa. Padrão idêntico ao de `sellers`.
- **Escrita: carteira + staff:** INSERT/UPDATE/DELETE exigem `is_staff() OR seller_id = current_seller_id()`.
  Apenas o dono da carteira (ou staff) pode criar, editar e excluir clientes — preserva a integridade
  da carteira comercial.
- **Leitura estendida (`seller_handles_customer`):** a policy `customers_select` acrescenta uma
  terceira condição (`seller_handles_customer(id)`): um seller que está atribuído a uma **conversa**
  daquele cliente também pode lê-lo, mesmo sem ser o dono da carteira. Implementado via função
  `SECURITY DEFINER` que faz `EXISTS` em `conversations` — necessário porque `conversations` tem
  própria RLS e não pode ser consultada diretamente dentro da policy sem escalar privilégios.
  Migration: `20260614183000`. `🔍 inferido (fonte: migration + comentário da própria migration)`
- **UPDATE não expande escrita:** o `USING` e o `WITH CHECK` do UPDATE são idênticos
  (`store_id + is_staff OR seller_id`) — sem a cláusula `seller_handles_customer`. Isso é
  intencional: visibilidade de leitura para atendente não implica direito de editar a carteira alheia.
  Transferência de carteira exige RPC SECURITY DEFINER (padrão handoff, memória do projeto).

## Índices `[mecânico]`

- `customers_created_at_idx` — `CREATE INDEX customers_created_at_idx ON public.customers USING btree (created_at)`
- `customers_full_name_trgm_idx` — `CREATE INDEX customers_full_name_trgm_idx ON public.customers USING gin (full_name gin_trgm_ops)`
- `customers_has_b2b_portal_idx` — `CREATE INDEX customers_has_b2b_portal_idx ON public.customers USING btree (has_b2b_portal)`
- `customers_nome_fantasia_trgm_idx` — `CREATE INDEX customers_nome_fantasia_trgm_idx ON public.customers USING gin (nome_fantasia gin_trgm_ops)`
- `customers_pkey` — `CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id)`
- `customers_razao_social_trgm_idx` — `CREATE INDEX customers_razao_social_trgm_idx ON public.customers USING gin (razao_social gin_trgm_ops)`
- `customers_seller_id_idx` — `CREATE INDEX customers_seller_id_idx ON public.customers USING btree (seller_id)`
- `customers_status_idx` — `CREATE INDEX customers_status_idx ON public.customers USING btree (status)`
- `customers_store_id_idx` — `CREATE INDEX customers_store_id_idx ON public.customers USING btree (store_id)`
- `customers_type_idx` — `CREATE INDEX customers_type_idx ON public.customers USING btree (type)`
- `idx_customers_converted_by_seller_id` — `CREATE INDEX idx_customers_converted_by_seller_id ON public.customers USING btree (converted_by_seller_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `customers_abc_class_check`: `(abc_class = ANY (ARRAY['A'::text, 'B'::text, 'C'::text]))`
- `customers_status_check`: `(status = ANY (ARRAY['ativo'::text, 'dormente'::text, 'recuperacao'::text, 'perdido'::text]))`
- `customers_type_check`: `(type = ANY (ARRAY['B2B'::text, 'B2C'::text]))`
- `customers_whatsapp_status_check`: `(whatsapp_status = ANY (ARRAY['unknown'::text, 'valid'::text, 'invalid'::text, 'blocked'::text]))`

**Narrativa** `🔍 inferido (fonte: customer.ts; customers.ts mapper; whatsapp/webhook/core.ts; CLAUDE.md; memória do projeto)`:
- `type` **MAIÚSCULO** (`'B2B'`/`'B2C'`) é check constraint do banco — inserções com caixa diferente
  geram erro 23514. O webhook que auto-cria clientes usa `'B2C'` explicitamente ao abrir conversa
  para número inédito. `🔍 (CLAUDE.md memória: customers.type & edge deploy)`
- `seller_id` é **NOT NULL** — um cliente sem carteirista é impossível no banco. O webhook utiliza
  o `seller_id` do store default (owner/manager fallback) quando nenhum atendente é determinado.
  `🔍 (webhook/core.ts l.59 comentário; migration CHECK implícito via NOT NULL)`
- **Notas** (`customer_notes`) **não** vivem em `customers` — estão em tabela própria para suportar
  múltiplos autores; o mapper as injeta em `notes: []` no `get()` mas omite no `list()` por custo
  de join. Não confundir com `conversation_notes` (notas internas de conversa, entidade separada).
  `🔍 (customers.ts → listNotes; memória do projeto: notas da conversa vs ficha)`
- **`whatsapp_name` vs `full_name`:** são independentes. O webhook sempre escreve `whatsapp_name`
  (`pushName`). O usuário edita `full_name` (B2C) / `nome_fantasia` (B2B). A UI oferece "usar nome
  WhatsApp" como ação de conveniência — não há mesclagem automática.
  `🔍 (webhook/core.ts l.66,71; memória: PRD-096 Alias)`
- **`avatar_url` e `avatar_synced_at`** são escritos apenas pelo job `whatsapp-avatar-sync`;
  `avatar_synced_at` garante idempotência (não re-sincroniza em janelas recentes). A coluna
  **não está** no `COLUMNS` select do provider Supabase nem no `CustomerRow` — o app lê o valor
  mas pelo canal correto (URL pública do bucket `avatars`, não da query). Ver divergência abaixo.
  `🔍 (supabase/functions/whatsapp-avatar-sync/index.ts; customers.ts COLUMNS string)`
- **`purchase_stats`**, **`abc_class`**, **`abc_share`**: snapshots de BI gravados pelo servidor
  (mock: generator; Fase 2: view materializada + RPC). A UI lê em modo read-only.
  `🔍 (customer.ts → ICustomerPurchaseStats JSDoc; CLAUDE.md BI MVs via RPCs scoped)`
- A **exclusão real** (`DELETE`) é permitida pela policy quando `is_staff OR seller_id = current`.
  Não há soft-delete em `customers` (ao contrário de `sellers`). Deleção em cascata: ver in-degree
  de FKs — `conversations`, `orders`, `quotes`, etc. usam `customer_id` sem `ON DELETE CASCADE`
  explícito (limitação: deleção direta pode falhar por FK). `❓ confirmar comportamento em prod`.

## Perguntas pendentes

- ❓ **Deleção em cascata:** as FKs entrantes (`conversations.customer_id`, `orders.customer_id`,
  `quotes.customer_id`, etc.) não declaram `ON DELETE CASCADE` nas migrations inspecionadas. O que
  acontece ao tentar deletar um cliente com conversas/pedidos existentes? Erro de FK ou exclusão
  orphaning permitida via `ON DELETE SET NULL`? Confirmar por migration ou teste em prod.
- ❓ **`avatar_url` / `avatar_synced_at` fora do mapper:** `CustomerRow` e `COLUMNS` em
  `src/providers/data/impl/supabase/customers.ts` **não incluem** `avatar_synced_at` e `avatar_url`
  não está mapeado para `avatarUrl` no `rowToCustomerBase`. O app exibe avatares via URL pública
  direta do bucket ou via outro mecanismo? Confirmar se o campo `avatarUrl` na interface `ICustomer`
  fica sempre `undefined` em prod (Fase 2 supabase) ou se há fetch separado.
- ❓ **Conversas sem `customer_id`:** memória do projeto menciona ~28 conversas sem `customer_id`
  vinculado (importadas via `whatsapp-import-history` ou recebidas antes do fix do webhook).
  O campo `conversations.customer_id` é `NOT NULL`? Confirmar constraint e estratégia de backfill.
- ❓ **`converted_from_lead_id` é `text` (não `uuid`):** coluna declarada como `text` na migration
  embora armazene UUIDs de leads. Intencional (espelhando `conversations.lead_id` que é `text`)?
  Confirmar se há validação de formato ou se o tipo fraco é debt técnico.

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3): Descrição da entidade, Dicionário de colunas-chave, Justificativa de RLS, Narrativa de regras de negócio, Perguntas pendentes. Fontes: `customer.ts`, `customers.ts` (mapper), `whatsapp/webhook/core.ts`, migration `20260614183000`, CLAUDE.md, memória do projeto. |
