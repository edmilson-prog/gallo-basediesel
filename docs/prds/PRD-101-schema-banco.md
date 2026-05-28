# PRD-101: Schema do Banco (Migrations + Seeds)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                        |
| **Repositório**       | _Repositório vivo da Fase 1, diretório `supabase/migrations/`_                                                                                                                                                                                                                                                                                  |
| **Objetivo**          | Materializar em PostgreSQL todo o modelo conceitual da Fase 1 (PRD-002) + extensões Fase 2 (§6 do briefing v1.3), distribuído nos schemas `crm` e `storefront`, com migrations versionadas, snapshots imutáveis em JSONB, índices estratégicos, triggers de `updated_at`, seeds de produção (não-demo) e geração automática de tipos TypeScript |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                                         |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                                                                            |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                                                                               |
| **Prioridade**        | P0 — bloqueante para PRD-103 (RLS) e PRD-104 (Providers Reais)                                                                                                                                                                                                                                                                                  |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                                                  |
| **PRDs Relacionados** | PRD-100 (Setup — pré-requisito direto); PRD-002 Fase 1 (modelo conceitual fonte); DELTAS v1.1 (extensões cruzadas Fase 1); PRD-103 (RLS — consome as tabelas); PRD-104 (Providers Substituem Mocks); PRD-108 (Performance — índices avançados); PRD-198 Onda 13 (Feature Flags — usa schema deste PRD)                                          |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                              |
| **Padrão de código**  | snake_case SQL; migrations com timestamp; arquivo de tipos gerado em `src/types/supabase.generated.ts` (commited)                                                                                                                                                                                                                               |

### Critérios de Complexidade

> **Justificativa de Alta:** mapeamento de ~50 agregados TypeScript da Fase 1 (PRD-002) + ~15 novos agregados Fase 2 (§6.1 do briefing v1.3) para tabelas PostgreSQL — cada qual com campos, FKs, índices, constraints. Distribuição entre 2 schemas exige decisão consciente por entidade. Snapshots imutáveis em JSONB precisam de constraints de schema. Tabelas de suporte cross-cutting (`processed_events`, `integration_logs`, `audit_logs`) introduzem padrões reaproveitados por toda a Fase 2. Geração de tipos TS em CI precisa pipeline novo. Volume de SQL > 1500 linhas distribuído em ~10 migrations atomicas.

---

## Contexto do Problema

A Fase 1 entregou ~50 interfaces TypeScript no PRD-002 — `IStore`, `ISeller`, `ICustomer`, `IVehicle`, `ILead`, `IPart`, `IQuote`, `IOrder`, `ICommission` etc. — e o Provider Pattern do PRD-005 abstrai consumidores via interface estável (`MockDataProvider` vs `SupabaseDataProvider`). Hoje, `SupabaseDataProvider` é apenas stub: lança `NotImplementedError` em todo método.

Para o switch `VITE_DATA_SOURCE=supabase` virar realidade, as tabelas têm que existir. **Este PRD entrega o schema completo**: cada interface TypeScript da Fase 1 vira tabela SQL, respeitando os deltas v1.1 (extensões cruzadas como `ICommission.calculatedFromRuleSnapshot`, `ICustomer.segmentationTags` etc.) e os novos agregados da Fase 2 (`IPaymentAttempt`, `INotificationDispatch`, `ILLMProvider` etc.).

A complexidade não é o SQL em si — é **acertar 5 decisões transversais que vão se propagar em todos os PRDs subsequentes**: distribuição por schema, naming, snapshots, índices, FKs com cascade.

---

## Conceito da Solução

### Distribuição em Schemas (vide §6.3 do briefing v1.3)

| Schema            | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Acessadores                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **`crm`**         | sellers, customers, vehicles, leads, conversations, messages, whatsapp_accounts, quotes, quote_items, orders, order_items, commissions, goals, gamification_badges, positivations, abc_classifications, recommendations, audit_logs, customer_notes, customer_segments, portal_settings, platform_settings, teams, vehicle_service_entries, stores, carteira_transfers, parts (verdade técnica), applications, supplier (PRD-201/Onda 14), processed_events, integration_logs, app_versions, feature_flags, llm_providers, llm_overrides, llm_usage_metrics + futuras tabelas Fase 2 não-storefront | `/app`, `/pwa`, `/portal` (autenticados) |
| **`storefront`**  | products (view curada de `crm.parts`), categories, featured, content_pages, cart_sessions, customer_accounts (B2C self-service), product_reviews, addresses (B2C)                                                                                                                                                                                                                                                                                                                                                                                                                                   | `/loja` (anônimo + B2C)                  |
| **`public`**      | apenas extensões PostgreSQL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                        |
| `auth`, `storage` | nativos Supabase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | gerenciados                              |

### Convenções de Mapeamento TS → SQL

| TypeScript                        | PostgreSQL                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `id: string`                      | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`                                                                |
| `createdAt: ISO8601`              | `created_at timestamptz NOT NULL DEFAULT now()`                                                                |
| `updatedAt: ISO8601`              | `updated_at timestamptz NOT NULL DEFAULT now()` (+ trigger)                                                    |
| `storeId: string`                 | `store_id uuid NOT NULL REFERENCES crm.stores(id)`                                                             |
| `enum X = 'a' \| 'b'`             | `column_name text NOT NULL CHECK (column_name IN ('a','b'))` (preferido sobre native enum para evolução fácil) |
| `someObject: SomeType` (snapshot) | `some_object jsonb NOT NULL` + constraint de validação                                                         |
| `tags: string[]`                  | `tags text[] NOT NULL DEFAULT '{}'`                                                                            |
| `optional?: T`                    | `column_name <type>` (nullable)                                                                                |
| `Decimal(2 casas)`                | `numeric(12, 2)`                                                                                               |
| `Decimal(4 casas)`                | `numeric(12, 4)`                                                                                               |

### Snapshots Imutáveis (princípio §4.2 do briefing)

Itens de quotes, orders, e commissions carregam snapshot do preço/regra no momento da criação. Esses snapshots viram colunas JSONB com constraint:

```sql
ALTER TABLE crm.quote_items
  ADD CONSTRAINT chk_price_snapshot_schema
  CHECK (
    price_snapshot ? 'unitPrice'
    AND price_snapshot ? 'discount'
    AND price_snapshot ? 'capturedAt'
  );
```

### Audit Log Imutável (§4.4 do briefing)

Tabela `crm.audit_logs` única, com `payload jsonb` flexível. Imutabilidade garantida por policies RLS (PRD-103) — não exige schema separado. Índices em `actor_id`, `entity_type`, `entity_id`, `created_at DESC`.

### Alternativas Consideradas

| Alternativa                                                    | Por que descartada                                                                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native PostgreSQL enums (`CREATE TYPE`)                        | Evolução de enum (adicionar valor) exige `ALTER TYPE`, que é mais doloroso do que adicionar valor a um CHECK. `CHECK (col IN (...))` é mais simples |
| Tabelas separadas para snapshots (`quote_item_snapshots`)      | Adicional join sem ganho: snapshot é por definição congelado e pertence ao item. JSONB inline resolve com lookup zero                               |
| Soft delete (`deleted_at`) em todas as tabelas                 | Complexidade alta sem ganho operacional. Apenas onde LGPD exige (`customers`, `customer_notes`, `messages`) terão soft delete; resto, delete físico |
| Schema separado `audit`                                        | Briefing v1.3 §4.3 já registrou que policies `FOR DELETE/UPDATE USING (false)` resolvem imutabilidade. Schema extra é overhead sem ganho            |
| Triggers de auditoria automática (capturar todo INSERT/UPDATE) | Performance ruim em transações de alta frequência (messages, inventory). Audit log é deliberado pela Edge Function (PRD-102), não automático        |
| ORM em vez de SQL puro                                         | Migration via Supabase CLI puro mantém transparência. Provider Pattern (PRD-005) já é a camada de abstração no front                                |

---

## Escopo

### Incluído

- ✅ Migration `00000000000001_init_schemas.sql` (criação dos 2 schemas — herdada do PRD-100, **não duplica**; este PRD assume schemas existentes)
- ✅ Migration `00000000000002_helper_functions.sql` (function `set_updated_at()` + função `current_seller_id()` que extrai seller_id do JWT)
- ✅ Migration `00000000000010_crm_core_tables.sql` (stores, sellers, customers, vehicles, parts, applications, brands, categories)
- ✅ Migration `00000000000011_crm_relational_tables.sql` (leads, conversations, messages, whatsapp_accounts, customer_notes, customer_segments, vehicle_service_entries)
- ✅ Migration `00000000000012_crm_commercial_tables.sql` (quotes, quote_items, orders, order_items, carteira_transfers)
- ✅ Migration `00000000000013_crm_gestao_tables.sql` (goals, gamification_badges, positivations, abc_classifications, commissions, recommendations)
- ✅ Migration `00000000000014_crm_config_tables.sql` (teams [dormente], portal_settings, platform_settings, app_versions, feature_flags)
- ✅ Migration `00000000000015_crm_audit_table.sql` (audit_logs + índices + constraint de imutabilidade pendente — policies vêm no PRD-103)
- ✅ Migration `00000000000016_crm_integration_tables.sql` (processed_events, integration_logs, llm_providers, llm_overrides, llm_usage_metrics)
- ✅ Migration `00000000000020_storefront_tables.sql` (categories, featured, content_pages, cart_sessions, customer_accounts, product_reviews, addresses)
- ✅ Migration `00000000000021_storefront_products_view.sql` (view materializada `storefront.products` derivada de `crm.parts` com filtros B2C)
- ✅ Migration `00000000000030_triggers_updated_at.sql` (aplicação do trigger em todas as tabelas com coluna `updated_at`)
- ✅ Migration `00000000000040_indexes_performance.sql` (índices estratégicos — chaves estrangeiras, `created_at DESC`, índices compostos básicos)
- ✅ Migration `00000000000050_seeds_production.sql` (seeds não-demo: 1 store matriz, estágios de pipeline default, motivos de perda default, badges base, platform_settings default, divisões PARTS/SERVICE/INDUSTRIAL)
- ✅ Habilitação `ENABLE ROW LEVEL SECURITY` em todas as tabelas (policies vêm no PRD-103; este PRD só liga o flag — tabelas sem policy ficam inacessíveis, propósito)
- ✅ Constraints `CHECK` para enums e snapshots
- ✅ Validação `tsc` no front continua passando com tipos gerados (`supabase gen types typescript --linked > src/types/supabase.generated.ts`)
- ✅ Workflow CI gera tipos e abre PR automatizado se houver diff (ou bloqueia merge se tipos não baterem)
- ✅ `.github/workflows/gen-types.yml` adicionado
- ✅ Husky pre-commit hook validando tipos atualizados (opcional, recomendado)
- ✅ Documentação `docs/db/schema-overview.md` com diagrama ERD (alto nível) e link para Supabase Dashboard
- ✅ Validação end-to-end: `supabase db reset` aplica todas as migrations em ordem sem erro; smoke test do PRD-100 segue passando

### Excluído

- ❌ Policies RLS detalhadas — vão no PRD-103 (este PRD só **habilita** RLS, não escreve policies)
- ❌ Substituição do `MockDataProvider` por `SupabaseDataProvider` no front — vai no PRD-104
- ❌ Tabelas específicas de Ondas posteriores (WhatsApp tokens, payment_attempts, dintec_export_files etc.) — cada onda traz suas próprias migrations
- ❌ Índices avançados (parcial, expression, BRIN) — vão no PRD-108 com profiling real
- ❌ Particionamento de tabelas grandes (`audit_logs`, `messages`) — Fase 3+ quando volume justificar
- ❌ Views materializadas para BI (cockpit, vendas, comissões) — usar views regulares + Supabase cache; PRD-108 reavalia
- ❌ Seeds de demonstração (clientes, produtos fictícios) — mocks ficam em `src/mocks/`, não no banco
- ❌ Auth schema (gerenciado pelo Supabase Auth, customização vai no PRD-107)
- ❌ Storage buckets (vão no PRD-106)

---

## Requisitos Funcionais

### Estrutura Geral de Migrations

- **RF-001:** Migrations devem ser arquivos `.sql` em `supabase/migrations/`, nomeados como `YYYYMMDDHHMMSS_<descricao_snake_case>.sql`. Para a sequência inicial deste PRD, usar timestamps sintéticos zerados (`00000000000001` a `00000000000050`) para ordenação determinística.
- **RF-002:** Cada migration deve ser **idempotente sempre que possível**: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS`. Migrations que adicionam coluna em tabela existente usam `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **RF-003:** Cada migration deve ser **transacional**: BEGIN/COMMIT implícito do Supabase CLI; em caso de erro, rollback total. Não pode haver migration que aplique parcialmente.
- **RF-004:** Comentários SQL devem documentar decisões não-óbvias (especialmente CHECKs, índices compostos, snapshots) em português ou inglês — manter consistência por arquivo.

### Tabelas do Schema `crm` — Core

- **RF-010:** Tabela `crm.stores` (filiais): `id uuid PK`, `name text NOT NULL`, `code text UNIQUE`, `cnpj text UNIQUE`, `address jsonb`, `phone text`, `email text`, `is_active boolean NOT NULL DEFAULT true`, `created_at`, `updated_at`. Seed: 1 store matriz GALLO.
- **RF-011:** Tabela `crm.sellers` (vendedores): `id uuid PK`, `store_id uuid REFERENCES crm.stores(id) ON DELETE RESTRICT`, `auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL`, `name text NOT NULL`, `email text UNIQUE NOT NULL`, `role text NOT NULL CHECK (role IN ('owner','manager','seller_internal','seller_external'))`, `is_active boolean NOT NULL DEFAULT true`, `custom_claims jsonb NOT NULL DEFAULT '{}'`, `phone text`, `whatsapp text`, `created_at`, `updated_at`. **Extensão Fase 2:** `auth_user_id` e `custom_claims` (§6.2 briefing v1.3).
- **RF-012:** Tabela `crm.brands` (marcas de peças): `id uuid PK`, `name text NOT NULL UNIQUE`, `division text NOT NULL CHECK (division IN ('parts','service','industrial'))`, `logo_url text`, `created_at`, `updated_at`. Seed: marcas iniciais a confirmar com cliente GALLO (Mann, Wega, Mahle, Bosch, Tecfil).
- **RF-013:** Tabela `crm.categories` (categorias de peças): `id uuid PK`, `name text NOT NULL`, `parent_id uuid REFERENCES crm.categories(id) ON DELETE SET NULL` (hierarquia self-referencing), `slug text UNIQUE NOT NULL`, `is_stop_the_line boolean NOT NULL DEFAULT false` (extensão Fase 3 — PRD-201 referencia), `created_at`, `updated_at`. Seed: Filtros (stop_the_line=true), Óleos, Correias, Velas, etc.
- **RF-014:** Tabela `crm.parts` (peças — verdade técnica + custo + OEM): `id uuid PK`, `store_id uuid REFERENCES crm.stores(id)`, `sku text NOT NULL`, `name text NOT NULL`, `description text`, `brand_id uuid REFERENCES crm.brands(id)`, `category_id uuid REFERENCES crm.categories(id)`, `unit_price numeric(12,2) NOT NULL`, `unit_cost numeric(12,2)` (extensão DELTAS v1.1), `oem_codes text[] NOT NULL DEFAULT '{}'`, `alternative_codes text[] NOT NULL DEFAULT '{}'`, `weight_kg numeric(6,3)`, `dintec_id text`, `last_dintec_sync_at timestamptz`, `dintec_version_hash text`, `is_active boolean NOT NULL DEFAULT true`, `tags text[] NOT NULL DEFAULT '{}'`, `created_at`, `updated_at`. UNIQUE constraint em `(store_id, sku)`. **Extensões Fase 2:** `dintec_id`, `last_dintec_sync_at`, `dintec_version_hash`.
- **RF-015:** Tabela `crm.applications` (compatibilidade peça↔veículo): `id uuid PK`, `part_id uuid NOT NULL REFERENCES crm.parts(id) ON DELETE CASCADE`, `vehicle_brand text NOT NULL`, `vehicle_model text NOT NULL`, `year_start integer`, `year_end integer`, `engine text`, `notes text`. Índice composto em `(vehicle_brand, vehicle_model, year_start, year_end)` para busca por aplicação.
- **RF-016:** Tabela `crm.customers` (clientes): `id uuid PK`, `store_id uuid REFERENCES crm.stores(id)`, `seller_id uuid REFERENCES crm.sellers(id) ON DELETE SET NULL`, `name text NOT NULL`, `document text` (CPF/CNPJ), `document_type text CHECK (document_type IN ('cpf','cnpj') OR document_type IS NULL)`, `email text`, `phone text`, `whatsapp text`, `address jsonb`, `customer_type text NOT NULL CHECK (customer_type IN ('b2c','b2b'))`, `segmentation_tags text[] NOT NULL DEFAULT '{}'` (delta v1.1), `consent_records jsonb NOT NULL DEFAULT '[]'` (extensão Fase 2 LGPD), `lgpd_status text NOT NULL DEFAULT 'not_collected' CHECK (lgpd_status IN ('not_collected','consented','revoked'))`, `dintec_id text`, `last_dintec_sync_at timestamptz`, `is_active boolean NOT NULL DEFAULT true`, `created_at`, `updated_at`. **Extensões Fase 2:** `consent_records`, `lgpd_status`, `dintec_id`, `last_dintec_sync_at`.
- **RF-017:** Tabela `crm.vehicles`: `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id) ON DELETE CASCADE`, `brand text NOT NULL`, `model text NOT NULL`, `year integer`, `plate text`, `engine text`, `chassis text`, `notes text`, `created_at`, `updated_at`. Índice em `customer_id`.

### Tabelas do Schema `crm` — Relacionais

- **RF-020:** Tabela `crm.leads`: `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id)`, `store_id uuid REFERENCES crm.stores(id)`, `seller_id uuid REFERENCES crm.sellers(id)`, `source text NOT NULL CHECK (source IN ('whatsapp','phone','email','walk_in','referral','website','social','other'))`, `status text NOT NULL CHECK (status IN ('new','qualifying','quoting','negotiating','won','lost','dormant'))`, `temperature text CHECK (temperature IN ('cold','warm','hot') OR temperature IS NULL)`, `estimated_value numeric(12,2)`, `loss_reason text`, `next_action_at timestamptz`, `next_action_description text`, `assigned_at timestamptz NOT NULL DEFAULT now()`, `closed_at timestamptz`, `created_at`, `updated_at`. Índices: `(seller_id, status)`, `(status, temperature)`, `next_action_at` parcial WHERE status != closed.
- **RF-021:** Tabela `crm.whatsapp_accounts`: `id uuid PK`, `store_id uuid REFERENCES crm.stores(id)`, `phone_number text NOT NULL`, `display_name text NOT NULL`, `provider text NOT NULL CHECK (provider IN ('meta','evolution'))`, `provider_credentials jsonb` (referência a Vault entries, nunca credencial direta), `is_active boolean NOT NULL DEFAULT true`, `created_at`, `updated_at`. UNIQUE em `(store_id, phone_number)`.
- **RF-022:** Tabela `crm.conversations`: `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id)`, `whatsapp_account_id uuid REFERENCES crm.whatsapp_accounts(id)`, `seller_id uuid REFERENCES crm.sellers(id)`, `channel text NOT NULL CHECK (channel IN ('whatsapp','email','phone','in_person'))`, `status text NOT NULL CHECK (status IN ('open','waiting','closed','archived'))`, `last_message_at timestamptz`, `unread_count integer NOT NULL DEFAULT 0`, `tags text[] NOT NULL DEFAULT '{}'`, `created_at`, `updated_at`. Índices: `(seller_id, status)`, `last_message_at DESC`.
- **RF-023:** Tabela `crm.messages`: `id uuid PK`, `conversation_id uuid NOT NULL REFERENCES crm.conversations(id) ON DELETE CASCADE`, `direction text NOT NULL CHECK (direction IN ('inbound','outbound'))`, `content_type text NOT NULL CHECK (content_type IN ('text','image','audio','video','document','location','contact'))`, `content text` (texto ou caption), `media_url text` (referência a storage), `meta_message_id text` (id externo Meta), `dispatch_status text CHECK (dispatch_status IN ('queued','sent','delivered','read','failed') OR dispatch_status IS NULL)`, `webhook_event_ids text[] NOT NULL DEFAULT '{}'`, `sender_seller_id uuid REFERENCES crm.sellers(id)`, `is_internal_note boolean NOT NULL DEFAULT false`, `created_at`. **Sem `updated_at`** — mensagens são imutáveis. Índices: `(conversation_id, created_at DESC)`, `meta_message_id` UNIQUE WHERE meta_message_id IS NOT NULL.
- **RF-024:** Tabela `crm.customer_notes`: `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id) ON DELETE CASCADE`, `seller_id uuid REFERENCES crm.sellers(id)`, `note text NOT NULL`, `is_pinned boolean NOT NULL DEFAULT false`, `deleted_at timestamptz` (soft delete para LGPD), `created_at`, `updated_at`.
- **RF-025:** Tabela `crm.customer_segments`: `id uuid PK`, `name text NOT NULL UNIQUE`, `description text`, `filter_criteria jsonb NOT NULL` (DSL de filtro), `is_dynamic boolean NOT NULL DEFAULT true`, `created_by uuid REFERENCES crm.sellers(id)`, `created_at`, `updated_at`.
- **RF-026:** Tabela `crm.vehicle_service_entries`: `id uuid PK`, `vehicle_id uuid NOT NULL REFERENCES crm.vehicles(id) ON DELETE CASCADE`, `service_type text NOT NULL`, `notes text`, `parts_used uuid[] NOT NULL DEFAULT '{}'` (referência a parts), `service_date date NOT NULL`, `mileage integer`, `created_at`.

### Tabelas do Schema `crm` — Comercial

- **RF-030:** Tabela `crm.carteira_transfers`: `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id)`, `from_seller_id uuid REFERENCES crm.sellers(id)`, `to_seller_id uuid REFERENCES crm.sellers(id)`, `transfer_type text NOT NULL CHECK (transfer_type IN ('temporary','permanent_single','permanent_batch'))`, `reason text NOT NULL`, `start_at timestamptz NOT NULL`, `end_at timestamptz`, `batch_id uuid` (agrupador opcional para transferências em lote), `created_by uuid REFERENCES crm.sellers(id)`, `created_at`. Sem `updated_at` — registro de evento, imutável.
- **RF-031:** Tabela `crm.quotes` (orçamentos): `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id)`, `seller_id uuid REFERENCES crm.sellers(id)`, `store_id uuid REFERENCES crm.stores(id)`, `lead_id uuid REFERENCES crm.leads(id)`, `quote_number text NOT NULL`, `status text NOT NULL CHECK (status IN ('draft','sent','negotiating','approved','rejected','expired','converted'))`, `total_value numeric(12,2) NOT NULL DEFAULT 0`, `discount_value numeric(12,2) NOT NULL DEFAULT 0`, `valid_until timestamptz`, `sent_at timestamptz`, `converted_order_id uuid`, `notes text`, `origin text CHECK (origin IN ('seller','sdr','ecommerce','external_seller') OR origin IS NULL)`, `created_at`, `updated_at`. UNIQUE em `(store_id, quote_number)`.
- **RF-032:** Tabela `crm.quote_items`: `id uuid PK`, `quote_id uuid NOT NULL REFERENCES crm.quotes(id) ON DELETE CASCADE`, `part_id uuid NOT NULL REFERENCES crm.parts(id)`, `quantity numeric(10,3) NOT NULL CHECK (quantity > 0)`, `unit_price numeric(12,2) NOT NULL`, `discount_pct numeric(5,2) NOT NULL DEFAULT 0`, `price_snapshot jsonb NOT NULL`, `notes text`, `created_at`. Constraint CHECK em `price_snapshot ? 'unitPrice' AND price_snapshot ? 'discount' AND price_snapshot ? 'capturedAt'`.
- **RF-033:** Tabela `crm.orders` (pedidos): `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id)`, `seller_id uuid REFERENCES crm.sellers(id)`, `store_id uuid REFERENCES crm.stores(id)`, `quote_id uuid REFERENCES crm.quotes(id)`, `order_number text NOT NULL`, `status text NOT NULL CHECK (status IN ('pending','confirmed','preparing','shipped','delivered','cancelled','returned'))`, `total_value numeric(12,2) NOT NULL`, `discount_value numeric(12,2) NOT NULL DEFAULT 0`, `freight_value numeric(12,2) NOT NULL DEFAULT 0`, `payment_method text`, `dintec_order_id text`, `nf_number text`, `nf_chave text`, `nf_issued_at timestamptz`, `payment_attempt_id uuid` (preenchido na Onda 7 quando pagamento existir), `origin text CHECK (origin IN ('seller','sdr','ecommerce','external_seller') OR origin IS NULL)`, `cancelled_at timestamptz`, `cancellation_reason text`, `created_at`, `updated_at`. UNIQUE em `(store_id, order_number)`. **Extensões Fase 2:** `dintec_order_id`, `nf_number`, `nf_chave`, `nf_issued_at`, `payment_attempt_id`.
- **RF-034:** Tabela `crm.order_items`: `id uuid PK`, `order_id uuid NOT NULL REFERENCES crm.orders(id) ON DELETE CASCADE`, `part_id uuid NOT NULL REFERENCES crm.parts(id)`, `quantity numeric(10,3) NOT NULL CHECK (quantity > 0)`, `unit_price numeric(12,2) NOT NULL`, `discount_pct numeric(5,2) NOT NULL DEFAULT 0`, `price_snapshot jsonb NOT NULL`, `cost_snapshot jsonb` (delta v1.1 — para PRD-049 Rentabilidade), `commission_preview jsonb` (delta v1.1 — substituído por `commissions` no PRD-047), `created_at`. CHECKs análogos ao `quote_items` para snapshots.

### Tabelas do Schema `crm` — Gestão e BI

- **RF-040:** Tabela `crm.goals`: `id uuid PK`, `scope text NOT NULL CHECK (scope IN ('store','team','seller'))`, `scope_ref_id uuid NOT NULL` (id do store/team/seller conforme scope), `period text NOT NULL CHECK (period IN ('weekly','monthly','quarterly','yearly'))`, `period_start date NOT NULL`, `period_end date NOT NULL`, `metric text NOT NULL CHECK (metric IN ('revenue','quantity','margin','positivation','active_customers'))`, `target_value numeric(15,2) NOT NULL`, `created_by uuid REFERENCES crm.sellers(id)`, `created_at`, `updated_at`.
- **RF-041:** Tabela `crm.gamification_badges`: `id uuid PK`, `seller_id uuid NOT NULL REFERENCES crm.sellers(id)`, `badge_code text NOT NULL`, `awarded_at timestamptz NOT NULL DEFAULT now()`, `context jsonb` (metadados do ganho). UNIQUE em `(seller_id, badge_code, awarded_at)`.
- **RF-042:** Tabela `crm.positivations`: `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id)`, `seller_id uuid REFERENCES crm.sellers(id)`, `period text NOT NULL` (formato `YYYY-MM`), `was_positivated boolean NOT NULL`, `first_order_at timestamptz`, `created_at`, `updated_at`. UNIQUE em `(customer_id, period)`.
- **RF-043:** Tabela `crm.abc_classifications`: `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id)`, `period text NOT NULL` (`YYYY-MM`), `classification text NOT NULL CHECK (classification IN ('A','B','C'))`, `total_revenue numeric(15,2) NOT NULL`, `revenue_percentile numeric(5,2) NOT NULL`, `computed_at timestamptz NOT NULL DEFAULT now()`. UNIQUE em `(customer_id, period)`.
- **RF-044:** Tabela `crm.commissions`: `id uuid PK`, `seller_id uuid NOT NULL REFERENCES crm.sellers(id)`, `order_id uuid NOT NULL REFERENCES crm.orders(id)`, `order_item_id uuid REFERENCES crm.order_items(id)` (NULL para commission no order todo; preenchido para split por item), `period text NOT NULL` (`YYYY-MM`), `gross_value numeric(12,2) NOT NULL`, `commission_pct numeric(5,2) NOT NULL`, `commission_value numeric(12,2) NOT NULL`, `rule_snapshot jsonb NOT NULL` (regra ativa no momento do cálculo — delta v1.1), `status text NOT NULL CHECK (status IN ('calculated','approved','paid','reversed','disputed'))`, `closed_at timestamptz`, `paid_at timestamptz`, `created_at`, `updated_at`. CHECK em `rule_snapshot ? 'ruleId' AND rule_snapshot ? 'ruleVersion'`.
- **RF-045:** Tabela `crm.recommendations`: `id uuid PK`, `customer_id uuid REFERENCES crm.customers(id)`, `seller_id uuid REFERENCES crm.sellers(id)`, `type text NOT NULL CHECK (type IN ('cross_sell','upsell','retention','predictable_maintenance','churn_prevention'))`, `title text NOT NULL`, `body text NOT NULL`, `suggested_parts uuid[] NOT NULL DEFAULT '{}'`, `priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high'))`, `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dismissed','actioned','expired'))`, `llm_model_used text`, `llm_cost_brl numeric(8,4)`, `evaluation_score numeric(3,2)`, `expires_at timestamptz`, `actioned_at timestamptz`, `dismissed_at timestamptz`, `created_at`, `updated_at`. **Extensões Fase 2:** `llm_model_used`, `llm_cost_brl`, `evaluation_score`.

### Tabelas do Schema `crm` — Config e Suporte

- **RF-050:** Tabela `crm.teams` (dormente no MVP): `id uuid PK`, `store_id uuid REFERENCES crm.stores(id)`, `name text NOT NULL`, `manager_seller_id uuid REFERENCES crm.sellers(id)`, `is_active boolean NOT NULL DEFAULT false`, `created_at`, `updated_at`. Tabela de junção `crm.team_members(team_id, seller_id, joined_at)`.
- **RF-051:** Tabela `crm.portal_settings` (configurações de B2B portal por cliente): `id uuid PK`, `customer_id uuid UNIQUE NOT NULL REFERENCES crm.customers(id)`, `has_b2b_portal boolean NOT NULL DEFAULT false` (delta v1.1), `approval_workflow jsonb`, `pricing_rule_id uuid`, `created_at`, `updated_at`.
- **RF-052:** Tabela `crm.platform_settings`: chave-valor — `id uuid PK`, `key text NOT NULL UNIQUE`, `value jsonb NOT NULL`, `description text`, `updated_by uuid REFERENCES crm.sellers(id)`, `created_at`, `updated_at`. Seeds: `default_lead_temperature_thresholds`, `default_abc_thresholds`, `default_positivation_period_days`, `commission_default_rule`, `loss_reasons` (array taxonomizado), etc.
- **RF-053:** Tabela `crm.app_versions`: `id uuid PK`, `version text NOT NULL UNIQUE`, `codename text`, `released_at timestamptz NOT NULL`, `changelog_md text NOT NULL`, `breaking_changes boolean NOT NULL DEFAULT false`. Seed: v1.0.0 Heavy (Fase 1 MVP), v2.0.0-rc.1 Engine (após este PRD).
- **RF-054:** Tabela `crm.feature_flags` (consumida em runtime por toda Fase 2): `id uuid PK`, `key text NOT NULL UNIQUE`, `description text NOT NULL`, `is_enabled boolean NOT NULL DEFAULT false`, `enabled_for_stores uuid[] NOT NULL DEFAULT '{}'` (override por loja), `enabled_for_sellers uuid[] NOT NULL DEFAULT '{}'`, `rollout_pct integer NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100)`, `created_at`, `updated_at`. Antecipa PRD-198 mas com schema enxuto suficiente para uso imediato.

### Tabelas do Schema `crm` — Audit Log

- **RF-060:** Tabela `crm.audit_logs`: `id uuid PK DEFAULT gen_random_uuid()`, `actor_id uuid REFERENCES crm.sellers(id)`, `actor_type text NOT NULL DEFAULT 'seller' CHECK (actor_type IN ('seller','customer','system','llm','integration'))`, `entity_type text NOT NULL`, `entity_id uuid`, `action text NOT NULL CHECK (action IN ('create','read','update','delete','approve','reject','login','logout','export','config_change','price_change','rule_change','sync','webhook_received','dispatch'))`, `payload jsonb NOT NULL DEFAULT '{}'`, `trace_id text`, `integration_context jsonb` (delta Fase 2), `payload_hash text`, `created_at timestamptz NOT NULL DEFAULT now()`. **Sem `updated_at`, sem `deleted_at`**. Imutabilidade enforced via policies RLS (PRD-103) — `FOR UPDATE USING (false)` e `FOR DELETE USING (false)`.
- **RF-061:** Índices em `crm.audit_logs`: `(actor_id, created_at DESC)`, `(entity_type, entity_id, created_at DESC)`, `(action, created_at DESC)`, `trace_id` (BTREE para joins entre logs), `created_at DESC` (paginação).

### Tabelas do Schema `crm` — Integrações Cross-Cutting

- **RF-070:** Tabela `crm.processed_events` (idempotência §4.7): `event_key text PRIMARY KEY`, `processed_at timestamptz NOT NULL DEFAULT now()`, `result_summary jsonb`. Garante que o mesmo evento externo nunca seja processado 2×. Usada por webhooks (Onda 5+), syncs (Onda 6), pagamentos (Onda 7), notificações (Onda 8).
- **RF-071:** Tabela `crm.integration_logs`: `id uuid PK`, `integration_name text NOT NULL CHECK (integration_name IN ('whatsapp_meta','whatsapp_evolution','dintec_csv','asaas','mercado_pago','resend','openai','anthropic','openrouter','nfe_io','enotas','plugnotas','custom'))`, `direction text NOT NULL CHECK (direction IN ('outbound','inbound'))`, `endpoint text`, `http_status integer`, `request_payload jsonb`, `response_payload jsonb`, `latency_ms integer`, `error_message text`, `trace_id text`, `created_at timestamptz NOT NULL DEFAULT now()`. Índices: `(integration_name, created_at DESC)`, `trace_id`, `http_status` parcial WHERE `http_status >= 400`.
- **RF-072:** Tabela `crm.llm_providers`: `id uuid PK`, `provider_name text NOT NULL UNIQUE CHECK (provider_name IN ('openai','anthropic','openrouter'))`, `api_key_vault_ref text NOT NULL` (referência à entrada no Vault — nunca a chave em si), `default_model text NOT NULL`, `available_models text[] NOT NULL DEFAULT '{}'`, `usd_to_brl_rate numeric(6,4) NOT NULL DEFAULT 5.0`, `is_active boolean NOT NULL DEFAULT false`, `last_health_check_at timestamptz`, `kill_switch boolean NOT NULL DEFAULT false`, `parameters jsonb NOT NULL DEFAULT '{}'` (temperature, max_tokens etc.), `created_at`, `updated_at`.
- **RF-073:** Tabela `crm.llm_overrides`: `id uuid PK`, `feature_key text NOT NULL UNIQUE` (ex: 'chatbot', 'insights', 'sdr', 'ocr'), `provider_id uuid NOT NULL REFERENCES crm.llm_providers(id)`, `model text NOT NULL`, `parameters_override jsonb`, `created_at`, `updated_at`.
- **RF-074:** Tabela `crm.llm_usage_metrics`: `id uuid PK`, `feature_key text NOT NULL`, `provider_id uuid REFERENCES crm.llm_providers(id)`, `model text`, `input_tokens integer NOT NULL`, `output_tokens integer NOT NULL`, `latency_ms integer NOT NULL`, `cost_usd numeric(10,6) NOT NULL`, `cost_brl numeric(10,4) NOT NULL`, `success boolean NOT NULL`, `error_message text`, `trace_id text`, `created_at timestamptz NOT NULL DEFAULT now()`. Índices: `(feature_key, created_at DESC)`, `(provider_id, created_at DESC)`. Tabela alimenta o dashboard do PRD-151D.

### Tabelas do Schema `storefront`

- **RF-080:** Tabela `storefront.categories`: `id uuid PK`, `name text NOT NULL`, `slug text UNIQUE NOT NULL`, `parent_id uuid REFERENCES storefront.categories(id)`, `display_order integer NOT NULL DEFAULT 0`, `is_featured boolean NOT NULL DEFAULT false`, `seo_title text`, `seo_description text`, `hero_image_url text`, `created_at`, `updated_at`. Distinta de `crm.categories` propositalmente — categorias do e-commerce podem ter curadoria diferente.
- **RF-081:** View `storefront.products` (NOT materialized inicialmente, materialize em PRD-108 se profiling indicar): SELECT de `crm.parts` com filtro `is_active = true AND store_id = <matriz>`, projetando apenas campos B2C (`id`, `name`, `description`, `unit_price as price`, `brand_id`, `category_id`, `oem_codes`, `slug`, `featured_image_url`, `gallery_urls jsonb`). **Custo, OEM completo e dintec_id NÃO são expostos**. Refresh manual via Edge Function quando catálogo muda; refresh schedule via `pg_cron` opcional.
- **RF-082:** Tabela `storefront.featured` (vitrines): `id uuid PK`, `position text NOT NULL CHECK (position IN ('hero','featured','best_sellers','new_arrivals','promotion'))`, `part_id uuid REFERENCES crm.parts(id)` (cross-schema FK permitida e desejada), `display_order integer NOT NULL DEFAULT 0`, `valid_from timestamptz`, `valid_until timestamptz`, `is_active boolean NOT NULL DEFAULT true`, `created_at`, `updated_at`.
- **RF-083:** Tabela `storefront.content_pages` (CMS leve para SEO/marketing): `id uuid PK`, `slug text UNIQUE NOT NULL`, `title text NOT NULL`, `body_md text NOT NULL`, `seo_title text`, `seo_description text`, `is_published boolean NOT NULL DEFAULT false`, `published_at timestamptz`, `created_at`, `updated_at`.
- **RF-084:** Tabela `storefront.cart_sessions`: `id uuid PK`, `customer_account_id uuid REFERENCES storefront.customer_accounts(id)`, `anonymous_token text` (cookie para anônimo), `items jsonb NOT NULL DEFAULT '[]'`, `total_value numeric(12,2) NOT NULL DEFAULT 0`, `expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')`, `created_at`, `updated_at`. CHECK exigindo `customer_account_id IS NOT NULL OR anonymous_token IS NOT NULL`.
- **RF-085:** Tabela `storefront.customer_accounts` (contas B2C self-service do e-commerce; distintas de `crm.customers` que é cadastro comercial): `id uuid PK`, `auth_user_id uuid UNIQUE REFERENCES auth.users(id)`, `linked_crm_customer_id uuid REFERENCES crm.customers(id)` (link opcional quando reconhecemos o cliente), `email text UNIQUE NOT NULL`, `name text NOT NULL`, `phone text`, `email_verified boolean NOT NULL DEFAULT false`, `lgpd_consent_at timestamptz`, `marketing_opt_in boolean NOT NULL DEFAULT false`, `created_at`, `updated_at`.
- **RF-086:** Tabela `storefront.addresses`: `id uuid PK`, `customer_account_id uuid NOT NULL REFERENCES storefront.customer_accounts(id) ON DELETE CASCADE`, `label text NOT NULL`, `recipient_name text NOT NULL`, `zip_code text NOT NULL`, `street text NOT NULL`, `number text NOT NULL`, `complement text`, `neighborhood text NOT NULL`, `city text NOT NULL`, `state text NOT NULL`, `is_default boolean NOT NULL DEFAULT false`, `created_at`, `updated_at`. Constraint: apenas um endereço com `is_default=true` por conta (índice parcial UNIQUE).
- **RF-087:** Tabela `storefront.product_reviews`: `id uuid PK`, `part_id uuid NOT NULL REFERENCES crm.parts(id)`, `customer_account_id uuid REFERENCES storefront.customer_accounts(id)`, `rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5)`, `title text`, `body text`, `is_approved boolean NOT NULL DEFAULT false`, `approved_by uuid REFERENCES crm.sellers(id)`, `created_at`, `updated_at`.

### Triggers, Funções e Constraints

- **RF-100:** Função `set_updated_at()` em `crm` schema: trigger BEFORE UPDATE que atualiza `updated_at = now()` automaticamente. Aplicada em **toda tabela que tem coluna `updated_at`**.
- **RF-101:** Função `current_seller_id()` em `crm` schema: extrai `seller_id` do JWT custom claims (`auth.jwt() -> 'custom_claims' ->> 'seller_id'`). Usada por policies RLS no PRD-103.
- **RF-102:** Constraint global: toda coluna `created_at` é `timestamptz NOT NULL DEFAULT now()`. Toda `updated_at` igual. Toda `id` é `uuid PRIMARY KEY DEFAULT gen_random_uuid()` salvo casos onde naturalmente é text (`processed_events.event_key`).

### RLS Habilitada (policies vêm no PRD-103)

- **RF-110:** Para cada tabela criada por este PRD, executar `ALTER TABLE <schema>.<tabela> ENABLE ROW LEVEL SECURITY` e `ALTER TABLE <schema>.<tabela> FORCE ROW LEVEL SECURITY`. Garante que sem policy explícita (PRD-103), ninguém acessa. Funciona como "fail closed" — defense-in-depth.
- **RF-111:** Para `crm.audit_logs` especificamente, criar policy `CREATE POLICY "no_update" ON crm.audit_logs FOR UPDATE USING (false)` e `CREATE POLICY "no_delete" ON crm.audit_logs FOR DELETE USING (false)`. Imutabilidade enforced em nível de banco (PRD-103 complementa com policies de leitura).

### Seeds de Produção

- **RF-120:** Migration de seed `00000000000050_seeds_production.sql` deve inserir, em ambos os ambientes (staging e prod):
  - 1 store matriz GALLO BASE DIESEL (CNPJ a confirmar)
  - 3 divisões: PARTS (#337648 verde), SERVICE (#C4151C vermelho), INDUSTRIAL (#C79C2C amarelo)
  - Estágios padrão de pipeline (taxonomia em `platform_settings.value`): new, qualifying, quoting, negotiating, won, lost
  - Motivos de perda padrão (em `platform_settings`): preço, prazo, qualidade, concorrência, não-resposta, outros
  - Badges base de gamificação (em `platform_settings.value`): primeira-venda, top-10-mes, positivacao-100pct, etc.
  - Configurações default: limites ABC, limites de positivação, thresholds de lead temperature
  - Categoria "Filtros" com `is_stop_the_line=true` (futura conexão com PRD-201 Onda 14)
  - Versão `v1.0.0` (codinome Heavy) em `app_versions` documentando estado pós-Fase 1
- **RF-121:** Seeds devem usar `INSERT ... ON CONFLICT DO NOTHING` para serem idempotentes (reapplicáveis sem erro).

### Geração de Tipos TypeScript

- **RF-130:** Script `npm run gen:supabase-types` (definido em `package.json`) executa `supabase gen types typescript --linked > src/types/supabase.generated.ts`.
- **RF-131:** Cabeçalho do arquivo gerado: `// AUTO-GENERATED — DO NOT EDIT MANUALLY\n// Run 'npm run gen:supabase-types' to regenerate\n`. Verificação no pre-commit hook (Husky).
- **RF-132:** Workflow CI `.github/workflows/gen-types.yml` executa em PRs que mexem em `supabase/migrations/`: regenera os tipos e compara com o commit; se houver diff, abre comentário no PR sinalizando "Tipos desatualizados — rodar `npm run gen:supabase-types` e commitar".
- **RF-133:** Arquivo `src/types/supabase.generated.ts` é **commited** no Git (não gitignored) — facilita revisão de PR e build CI determinístico.

### Documentação

- **RF-140:** `docs/db/schema-overview.md` deve conter:
  - Diagrama ERD de alto nível (texto/mermaid) por schema
  - Tabela de mapeamento entidade Fase 1 → tabela SQL → schema
  - Notas sobre extensões Fase 2 introduzidas
  - Link para Supabase Dashboard de cada projeto (staging + prod)
  - Convenções de naming + exemplos
  - Lista de seeds aplicados

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance — migration time):** Toda a sequência completa de migrations deve aplicar em ambiente vazio em < 60 segundos (`supabase db reset`). Atual estimativa: ~15s para schemas vazios + ~30s com seeds.
- **RNF-002 (Reprodutibilidade):** `supabase db reset` em ambiente staging deve gerar schema 100% idêntico a `supabase db reset` em ambiente local — sem dependência de ordem temporal manual.
- **RNF-003 (Migration safety):** Toda migration roda em uma transação. Se qualquer comando falha, rollback total. Sem migrations "half-applied".
- **RNF-004 (Type safety):** `tsc` no frontend deve compilar sem erros com `supabase.generated.ts` atual. Todo provider Supabase do PRD-104 tem que casar com os tipos gerados.
- **RNF-005 (Documentação versionada):** Cada migration tem comentário no topo explicando "o que" e "por quê". `git blame` numa coluna deve levar à decisão original.
- **RNF-006 (Storage efficiency):** JSONB de snapshots não deve duplicar dados desnecessariamente — capturar apenas o mínimo (`unitPrice`, `discount`, `capturedAt`, `ruleId`). Snapshot não é cópia completa da entidade.
- **RNF-007 (Migration reversibility):** Cada migration de schema deve ter migration de rollback documentada em comentário (para casos extremos). Não automatizamos rollback, mas pensamos no caminho de volta.
- **RNF-008 (LGPD compliance — desde já):** Tabelas com PII (`customers`, `customer_accounts`, `customer_notes`, `messages`) têm coluna `deleted_at` para soft delete; campos sensíveis (CPF, CNPJ) marcados em documentação para fins de "right to be forgotten" (PRD-191).

---

## Critérios de Aceitação

### RF-001 + RF-002 + RNF-002: Migrations Aplicam Sem Erro

```gherkin
DADO um ambiente Supabase staging recém-provisionado (estado = só schemas crm e storefront)
QUANDO o desenvolvedor executa supabase db push
ENTÃO todas as migrations 00000000000001 a 00000000000050 aplicam em sequência
  E o tempo total é menor que 60 segundos
  E não há erros SQL
  E supabase db diff retorna vazio (sem mudanças pendentes)
```

### RF-010 a RF-074: Todas as Tabelas Criadas

```gherkin
DADO que as migrations foram aplicadas em staging
QUANDO o Arquiteto executa via MCP: Supabase:list_tables com schemas=['crm','storefront']
ENTÃO encontra todas as tabelas listadas nos RFs 010–087
  E cada uma tem as colunas obrigatórias (created_at, updated_at quando aplicável)
  E todas têm RLS habilitada (FORCE ROW LEVEL SECURITY)
```

### RF-014 + RF-016: Extensões Fase 2 Presentes

```gherkin
DADO a tabela crm.parts criada
QUANDO inspeciona as colunas
ENTÃO existe a coluna unit_cost (numeric 12,2 — delta v1.1 PRD-049)
  E existe a coluna dintec_id (text — Fase 2 §6.2)
  E existe a coluna last_dintec_sync_at (timestamptz — Fase 2)
  E existe a coluna dintec_version_hash (text — Fase 2)

DADO a tabela crm.customers criada
QUANDO inspeciona as colunas
ENTÃO existe a coluna consent_records (jsonb — LGPD §4.9)
  E existe a coluna lgpd_status (text com CHECK — LGPD)
  E existe a coluna segmentation_tags (text[] — delta v1.1)
```

### RF-032 + RF-034: Snapshots com Constraint

```gherkin
DADO uma quote criada e estamos inserindo um quote_item
QUANDO tentamos INSERT com price_snapshot = '{"foo": "bar"}'
ENTÃO o INSERT falha com constraint violation
  E a mensagem indica que price_snapshot deve conter 'unitPrice', 'discount', 'capturedAt'

QUANDO inserimos com price_snapshot = '{"unitPrice": 100.0, "discount": 0, "capturedAt": "2026-05-27T10:00:00Z"}'
ENTÃO o INSERT é aceito
```

### RF-060 + RF-111: Audit Log Imutável

```gherkin
DADO um audit log inserido em crm.audit_logs
QUANDO o role authenticated tenta UPDATE em qualquer coluna
ENTÃO recebe permission denied
QUANDO o role authenticated tenta DELETE
ENTÃO recebe permission denied
QUANDO o role authenticated tenta SELECT
ENTÃO recebe o registro (policies de SELECT vêm no PRD-103, mas insert e select básico já funcionam pós-PRD-103)
```

### RF-081: View storefront.products Não Vaza Dados Sensíveis

```gherkin
DADO uma part em crm.parts com unit_cost=50, oem_codes=['A','B','C'], dintec_id='X123'
QUANDO faço SELECT * FROM storefront.products WHERE id = <part_id>
ENTÃO recebo as colunas id, name, description, price, brand_id, category_id, oem_codes (mas filtrado se necessário), slug, featured_image_url, gallery_urls
  E NÃO recebo unit_cost
  E NÃO recebo dintec_id
  E NÃO recebo dintec_version_hash
```

### RF-100: Trigger updated_at Funciona

```gherkin
DADO uma customer em crm.customers com updated_at = '2026-05-27 10:00:00'
QUANDO faço UPDATE customers SET name = 'New Name' WHERE id = <id>
ENTÃO o updated_at é automaticamente atualizado para now()
  E não foi necessário SET updated_at = now() no UPDATE
```

### RF-120: Seeds Aplicados Sem Duplicar

```gherkin
DADO o ambiente tem seeds aplicados (1 store matriz, divisões, badges, etc.)
QUANDO o desenvolvedor executa supabase db push novamente
ENTÃO a migration de seeds executa com ON CONFLICT DO NOTHING
  E nenhum duplicado é inserido
  E nenhum erro é lançado
```

### RF-130 + RF-132: Geração de Tipos em CI

```gherkin
DADO um PR que adiciona uma nova migration alterando crm.parts
QUANDO o workflow gen-types.yml é disparado
ENTÃO ele instala Supabase CLI, faz link com staging
  E roda supabase gen types typescript --linked
  E compara com src/types/supabase.generated.ts commitado
  E se houver diff: comenta no PR "Tipos desatualizados"
  E se não houver diff: aprova silenciosamente
```

---

## Fases de Implementação

### Fase 1 — Migrations core do CRM (2 dias)

- Migrations `00000000000001` a `00000000000016` (sem audit_logs ainda; sem RLS)
- Validar via MCP `Supabase:list_tables` que todas as tabelas existem em staging
- Confirmar constraints, FKs, índices básicos
- Aplicar em prod após validação

### Fase 2 — Migrations storefront + cross-schema (1 dia)

- Migrations `00000000000020` e `00000000000021`
- View `storefront.products` validada (não vaza dados sensíveis)
- FK cross-schema (`storefront.product_reviews.part_id → crm.parts.id`) testada

### Fase 3 — Triggers, índices, audit log (1 dia)

- Migration `00000000000030_triggers_updated_at.sql`
- Migration `00000000000040_indexes_performance.sql`
- Migration `00000000000015_crm_audit_table.sql` + policies de imutabilidade
- Habilitar RLS em todas as tabelas (`ENABLE` + `FORCE`)

### Fase 4 — Seeds + geração de tipos (1 dia)

- Migration `00000000000050_seeds_production.sql`
- Script `npm run gen:supabase-types` + `package.json`
- Workflow `.github/workflows/gen-types.yml`
- Husky pre-commit hook
- Commitar `src/types/supabase.generated.ts` inicial
- Validar `tsc` ainda passa no frontend (provider stub do PRD-005 deve compilar)

### Fase 5 — Validação E2E + documentação (1 dia)

- Smoke test: criar customer, vehicle, lead, quote, order via MCP `Supabase:execute_sql` (com role bypass RLS = service_role)
- Validar seeds aplicados
- Escrever `docs/db/schema-overview.md`
- Validar que `supabase db reset` recompõe tudo em < 60s
- Demo para Edmilson + Frederico
- Marcar PRD como `_DONE`

---

## Dependências

### PRDs

- **Bloqueia:** PRD-103 (RLS — precisa das tabelas existindo), PRD-104 (Providers Reais — precisa dos tipos gerados), PRD-105 (Realtime), PRD-106 (Storage), PRD-107 (Auth — usa `crm.sellers.auth_user_id`), PRD-108 (Performance), todas as Ondas 5+
- **Depende de:** **PRD-100 (Setup Supabase)** — sem os 2 projetos provisionados, nada roda

### Bibliotecas

- Supabase CLI ≥ 1.180.0
- MCP Supabase (operacional pelo Arquiteto e Desenvolvedor)
- Husky (pre-commit hook) — opcional mas recomendado

### Decisões Pendentes

- **CNPJ da matriz GALLO:** preencher no seed. Edmilson confirma antes da Fase 4.
- **Lista oficial de marcas no seed:** Mann, Wega, Mahle, Bosch, Tecfil — confirmar lista final + códigos (cliente GALLO).
- **Lista oficial de motivos de perda:** taxonomia inicial proposta no RF-120; cliente pode refinar.

---

## Cadeia de PRDs

```
   ┌────────────────────┐
   │ PRD-100 (Setup)    │ ← pré-requisito
   └─────────┬──────────┘
             │
             ▼
   ┌────────────────────┐
   │ PRD-101 (ESTE)     │
   │ Schema + Tipos     │
   └─────────┬──────────┘
             │
   ┌─────────┼─────────┬──────────┐
   ▼         ▼         ▼          ▼
 ┌──────┐ ┌──────┐ ┌──────┐  ┌──────┐
 │ 102  │ │ 103  │ │ 104  │  │ 107  │
 │ Edge │ │ RLS  │ │Prov. │  │ Auth │
 └──────┘ └──┬───┘ └──┬───┘  └──────┘
             │        │
             ▼        ▼
          ┌─────────────┐
          │ Onda 4 done │
          │ → v2.0.0    │
          │   Engine    │
          └─────────────┘
```

---

## Considerações de Segurança

- **RLS por default ("fail closed"):** `FORCE ROW LEVEL SECURITY` garante que sem policy, ninguém acessa. Mesmo se o Desenvolvedor esquecer de escrever policy no PRD-103, dados ficam inacessíveis ao role `anon`/`authenticated`. Apenas `service_role` (Edge Functions) bypassa.
- **Defense-in-depth (3 camadas):** (1) PostgREST expõe apenas `storefront` para anônimo; (2) RLS filtra linhas; (3) JWT custom claims (PRD-107) restringem operações.
- **Snapshots imutáveis:** colunas JSONB de snapshot têm CHECK constraint. Não é só convenção — é enforced pelo banco. Tentativa de inserir sem campos obrigatórios falha.
- **Audit log imutável:** policies `FOR UPDATE/DELETE USING (false)` (PRD-103) garantem que nem `authenticated` nem `anon` modificam logs. Apenas `service_role` pode (uso interno em raros casos).
- **LGPD desde dia 1:** colunas `consent_records`, `lgpd_status`, `deleted_at` (em tabelas com PII) já presentes. PRD-191 (Onda 13) completa o framework, mas a base está aqui.
- **Vault para credenciais:** colunas como `whatsapp_accounts.provider_credentials` e `llm_providers.api_key_vault_ref` armazenam **referências** ao Vault, nunca credenciais em texto plano. Acesso ao Vault apenas via `service_role`.
- **Privilégios mínimos no schema `public`:** RF-012 do PRD-100 já revogou privilégios em `public` para `anon`. Garante que extensões instaladas em `public` não vazem.
- **SQL injection mitigation:** todas as queries no front passam pelo Supabase client (parametrizadas) ou pelo PostgREST (parametrização nativa). Provider Pattern do PRD-005 abstrai construção de queries.

---

## Fluxos de Usuário (operação infra)

### Fluxo principal — Aplicação inicial

```
[Desenvolvedor CLI] ──▶ git pull
                    ──▶ supabase link --project-ref <staging>
                    ──▶ supabase db push
                    ──▶ CLI aplica migrations em ordem (00000001 → 00000050)
                    ──▶ npm run gen:supabase-types
                    ──▶ Commit src/types/supabase.generated.ts
                    ──▶ Validação via MCP list_tables
                    ──▶ tsc no frontend continua passando
```

### Fluxo de nova migration

```
[Desenvolvedor] ──▶ supabase migration new <descrição>
                ──▶ Edita o .sql gerado
                ──▶ supabase db push (aplica em staging)
                ──▶ Valida via MCP list_tables / execute_sql
                ──▶ npm run gen:supabase-types
                ──▶ Commit migration + tipos atualizados
                ──▶ PR
                ──▶ CI valida via gen-types.yml
                ──▶ Merge em staging branch
                ──▶ db-deploy.yml aplica em prod (após UAT 2 semanas)
```

### Fluxo de erro — Constraint violation

```
[App] ──▶ INSERT quote_item sem price_snapshot.unitPrice
       ──▶ PostgreSQL rejeita via CHECK constraint
       ──▶ Supabase client recebe 23514 (check_violation)
       ──▶ Provider Pattern (PRD-104) mapeia para AppError
       ──▶ Frontend exibe mensagem amigável
       ──▶ Audit log NÃO é registrado (Edge Function não foi chamada)
       ──▶ Bug é detectado em dev via testes E2E
```

---

## Convenções de Código (Referência Rápida)

| Elemento                 | Convenção                                                            | Exemplo                                |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------- |
| **Schemas**              | lowercase, sem prefixo                                               | `crm`, `storefront`                    |
| **Tabelas**              | snake_case, plural                                                   | `customer_notes`, `audit_logs`         |
| **Colunas**              | snake_case                                                           | `created_at`, `seller_id`, `is_active` |
| **PKs**                  | sempre `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` salvo exceção | —                                      |
| **FKs**                  | `<tabela_referenciada_singular>_id`                                  | `customer_id`, `seller_id`, `quote_id` |
| **Booleans**             | prefixo `is_` ou `has_`                                              | `is_active`, `has_b2b_portal`          |
| **Timestamps**           | `_at` suffix, sempre `timestamptz`                                   | `created_at`, `paid_at`, `expires_at`  |
| **Datas (sem hora)**     | `_date` suffix                                                       | `service_date`, `period_start`         |
| **Snapshots**            | suffix `_snapshot`                                                   | `price_snapshot`, `rule_snapshot`      |
| **Constraint enum-like** | `CHECK (col IN (...))`                                               | `CHECK (status IN ('open','closed'))`  |
| **Migration name**       | `YYYYMMDDHHMMSS_<descricao>.sql`                                     | `00000000000010_crm_core_tables.sql`   |
| **Comentário SQL**       | `-- comment` (linha) ou `/* block */`                                | obrigatório no topo da migration       |
| **Linhas longas**        | quebra após `,` em colunas                                           | melhor diff no Git                     |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.7 via Claude Code CLI. Este PRD foi escrito pelo Agente Arquiteto na plataforma web.

### Esclarecimento de Dúvidas

> 💬 Antes de implementar, faça perguntas sobre: CNPJ da matriz GALLO (necessário no seed), lista de marcas (Mann, Wega, etc. — confirmar com Edmilson), motivos de perda padrão (taxonomia proposta vs alinhada com cliente).

### Instruções Obrigatórias

> ⚠️ **1. ANTES DE IMPLEMENTAR:** Leia o PRD-002 Fase 1 completo (modelo conceitual fonte) e o DELTAS-PRDs-Gallo-Base-Diesel.md (extensões cruzadas). Toda divergência entre o que está aqui e o que está no PRD-002 deve ser sinalizada — ESTE PRD prevalece (incorpora deltas Fase 2), mas vale validar.

> ⚠️ **2. APÓS IMPLEMENTAR:**
>
> - Bump versão para `v2.0.0-rc.1` (release candidate da onda 4)
> - CHANGELOG.md detalhado: tabelas criadas, mudanças retroativas em `IPart`, `ICustomer`, etc.
> - Renomear para `PRD-101-schema-banco_DONE.md`
> - Atualizar Status de Implementação
> - Documentação `docs/db/schema-overview.md` completa antes do `_DONE`

### Princípios de Implementação

| Princípio                       | Descrição                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Schema-first**                | Cada coluna nova exige uma migration nova — nunca editar migrations já mergeadas em main          |
| **Idempotência**                | `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` — toda migration aplicável 2× sem erro                  |
| **Snapshot é mínimo**           | JSONB de snapshot guarda só o essencial; não cópia da entidade inteira                            |
| **Audit log é caro de inserir** | Não use trigger automático; deixe a Edge Function (PRD-102) decidir quando registrar              |
| **Cross-schema FK é OK**        | `storefront.product_reviews.part_id → crm.parts.id` funciona. Postgres não exige isolamento total |
| **Tipos commited**              | `supabase.generated.ts` no Git facilita PR review e build determinístico                          |
| **MCP como acelerador**         | `Supabase:apply_migration`, `list_tables`, `get_advisors` em vez de só CLI                        |

### Orientações Específicas

| Aspecto                           | Orientação                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Ordem de criação**              | Stores antes de Sellers antes de Customers antes de Orders. Respeitar FKs                                                    |
| **Constraints CHECK**             | Use string literals em CHECK de enum: `CHECK (col IN ('a','b','c'))`. Evite native PG enums                                  |
| **JSONB validation**              | `CHECK (col ? 'field')` valida presença de chave; combine com `jsonb_typeof()` se precisar validar tipo                      |
| **Índices estratégicos**          | FK + colunas usadas em WHERE/ORDER BY frequentes (especialmente `created_at DESC` para paginação)                            |
| **Migration de view**             | View pode ser RECREATE — use `CREATE OR REPLACE VIEW`                                                                        |
| **MCP get_advisors**              | Após aplicar todas as migrations, rodar `Supabase:get_advisors` — captura RLS faltando, índices faltando, performance issues |
| **Seed idempotente**              | `INSERT ... ON CONFLICT (key) DO NOTHING` ou `DO UPDATE SET ...` conforme caso                                               |
| **Soft delete só onde precisa**   | `deleted_at` em customers, customer_notes, messages. Resto, delete físico                                                    |
| **Constraints CHECK ON CONFLICT** | Cuidado: ON CONFLICT exige UNIQUE constraint. Para tabelas sem UNIQUE, usa subquery de existência                            |

### O que NÃO Fazer

| ❌ Evitar                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Editar migration já mergeada em main (sempre nova migration)                                                                                    |
| Native PG enums (`CREATE TYPE ... AS ENUM`) — usar CHECK                                                                                        |
| FK com `ON DELETE CASCADE` em direção a tabelas de Owner (ex: deletar `customer` cascateando `orders` é destrutivo demais; preferir `RESTRICT`) |
| `SELECT *` em views (especifique colunas — defense em profundidade contra leak)                                                                 |
| Index em coluna boolean isolada (baixa cardinalidade — composto OK)                                                                             |
| Triggers que executam lógica de negócio (apenas `set_updated_at`, `current_seller_id`; resto fica em Edge Function)                             |
| Esquecer de habilitar `FORCE ROW LEVEL SECURITY`                                                                                                |
| Misturar migrations de schema com seed na mesma migration (separar para clareza)                                                                |
| Snapshot duplicando dados desnecessariamente                                                                                                    |
| Tipos manuais em `src/types/` paralelos ao gerado (use o gerado; estenda com tipos derivados se necessário)                                     |

---

## Status de Implementação

| Campo                     | Valor       |
| ------------------------- | ----------- |
| **Status**                | ⏳ PENDENTE |
| **Data de Implementação** | -           |
| **Versão do App**         | -           |
| **Implementado por**      | -           |
| **Observações**           | -           |

---

## Histórico

| Data       | Versão | Alteração                                        |
| ---------- | ------ | ------------------------------------------------ |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1a do Lote 1 (Onda 4) |

---

**AILA - Sistemas Inteligentes**
