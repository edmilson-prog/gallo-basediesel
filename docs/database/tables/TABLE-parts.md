---
objeto: parts
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: catalog
rls_enabled: true
colunas: 43
edge_functions: []
prds_relacionados: [PRD-030, PRD-021, PRD-060, PRD-061, PRD-062, PRD-063, PRD-101, PRD-103]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `parts`

> Peça do catálogo comercial da GALLO BASE DIESEL. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** catalog · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: src/shared/types/catalog.ts → IPart, migrations, CLAUDE.md, PRD-030, PRD-060–063, PRD-103)`

Unidade comercial vendida pela GALLO BASE DIESEL — filtros, correias, kits e demais peças para
veículos pesados (Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco). É o **catálogo master**:
alimenta orçamentos, pedidos, kits de composição, indicadores de produtos e a vitrine B2C pública.

Pontos-chave de domínio:

- **Vitrine pública (anon):** a tabela tem duplo perfil de leitura — staff autenticado vê tudo
  (inclusive custo/margem/estoque), enquanto o cliente anônimo da vitrine B2C só enxerga colunas
  não-comerciais de peças `active = true` (policy `parts_select_anon` + `GRANT SELECT (…)` restrito
  por coluna). `🔍 (fonte: supabase/migrations/20260609024532_storefront_anon_read.sql)`
- **OEM codes e busca:** `oem_codes` (array) armazena os códigos do fabricante do veículo (ex.:
  "21707792" Volvo); o campo derivado `oem_codes_text` (coluna texto gerada por trigger) viabiliza
  buscas por substring via `ILIKE`, complementando o GIN que faz exact-array matches. `🔍 (migration
  20260608150303 + provider supabase/parts.ts)`
- **Estruturas jsonb aninhadas:** `applications`, `cross_references`, `price_tables`, `fiscal` e
  `suppliers` vivem em jsonb — os objetos são mapeados para tipos TypeScript (`IApplication`,
  `IPartCrossReference`, `IPriceTable`, `IPartFiscal`, `IPartSupplier`). `🔍 (catalog.ts + parts.ts)`
- **Identificação de peça (PRD-021):** `category` segue a taxonomia `PartCategory` de PRD-021
  (ex.: `filtro`, `correia`). `🔍 (catalog.ts linha 98–99)`
- **NCM e NF-e:** o campo `fiscal.ncm` (dentro do jsonb `fiscal`) armazena o código Mercosul, mas a
  **emissão de NF-e própria está deferida** (segue no DINTEC); sem NCM real no catálogo até o gate
  do dono. `🔍 (CLAUDE.md — PRDs 127–129 deferidos; catalog.ts → IPartFiscal)`
- **Multi-loja:** `store_id` isola o catálogo por loja. Pode ser nulo em peças de catálogo global
  importadas antes da migração. `🔍 (migration + catalog.ts → storeId opcional)`
- **`division`:** sempre `'parts'` no MVP; `'service'` e `'industrial'` modelados e dormentes.
  `🔍 (catalog.ts linha 145–146 + CLAUDE.md)`
- **In-degree:** 4 tabelas referenciam `parts.id` — `media_assets`, `model_kit_items`,
  `order_items` e `quote_items`. `🔍 (introspecção mecânica)`

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `sku` | text | não | — | — |
| 3 | `name` | text | não | — | — |
| 4 | `description` | text | sim | — | — |
| 5 | `oem_codes` | text[] | não | `'{}'::text[]` | — |
| 6 | `equivalent_part_ids` | text[] | não | `'{}'::text[]` | — |
| 7 | `cross_references` | jsonb | sim | — | — |
| 8 | `segment` | text | sim | — | — |
| 9 | `application_notes` | text | sim | — | — |
| 10 | `applications` | jsonb | não | `'[]'::jsonb` | — |
| 11 | `brand` | text | não | — | — |
| 12 | `supplier` | text | não | — | — |
| 13 | `category` | text | sim | — | — |
| 14 | `subcategory` | text | sim | — | — |
| 15 | `is_original` | boolean | sim | — | — |
| 16 | `image_url` | text | sim | — | — |
| 17 | `unit_cost` | numeric | não | `0` | — |
| 18 | `unit_price` | numeric | não | `0` | — |
| 19 | `margin_percent` | numeric | não | `0` | — |
| 20 | `gtin` | text | sim | — | — |
| 21 | `sefaz_status` | text | sim | — | — |
| 22 | `sefaz_checked_at` | timestamptz | sim | — | — |
| 23 | `supplier_code` | text | sim | — | — |
| 24 | `reference` | text | sim | — | — |
| 25 | `group_label` | text | sim | — | — |
| 26 | `part_type` | text | sim | — | — |
| 27 | `price_tables` | jsonb | sim | — | — |
| 28 | `fiscal` | jsonb | sim | — | — |
| 29 | `weight_kg` | numeric | sim | — | — |
| 30 | `storage_location` | text | sim | — | — |
| 31 | `box_quantity` | integer | sim | — | — |
| 32 | `fractionable` | boolean | sim | — | — |
| 33 | `unit_of_measure` | text | sim | — | — |
| 34 | `suppliers` | jsonb | sim | — | — |
| 35 | `average_cost` | numeric | sim | — | — |
| 36 | `stock_available` | integer | não | `0` | — |
| 37 | `stock_minimum` | integer | não | `0` | — |
| 38 | `division` | text | não | `'parts'::text` | — |
| 39 | `active` | boolean | não | `true` | — |
| 40 | `store_id` | uuid | sim | — | FK → `stores.id` |
| 41 | `created_at` | timestamptz | não | `now()` | — |
| 42 | `updated_at` | timestamptz | não | `now()` | — |
| 43 | `oem_codes_text` | text | sim | — | — |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/catalog.ts → IPart, IApplication, IPriceTable, IPartFiscal, IPartSupplier, IPartCrossReference + migration 20260608150303 + PRD-021 + PRD-030)`

| coluna | significado |
|--------|-------------|
| `sku` | Identificador interno do catálogo GALLO. Distinto do código do fabricante (`oem_codes`) e do código do fornecedor (`supplier_code`). |
| `oem_codes` | Array de códigos OEM — números atribuídos pelo fabricante do veículo (ex.: "21707792" = Volvo). Uma peça pode ter múltiplos OEMs (versões/mercados). Buscado por exact-match GIN ou por substring via `oem_codes_text`. |
| `oem_codes_text` | Campo derivado: `array_to_string(oem_codes, ' ')`. **Mantido pelo trigger** `parts_oem_codes_text_biu` — nunca escrever diretamente. Viabiliza `ILIKE '%código%'` com o índice trigrama. |
| `equivalent_part_ids` | Array de `parts.id` de outras peças do catálogo GALLO consideradas funcionalmente equivalentes (venda alternativa). Distinto de `cross_references` (marcas concorrentes). |
| `cross_references` | jsonb → `IPartCrossReference[]`: referências aftermarket de marcas concorrentes (ex.: Mann, Fleetguard) com `brand` e `code`. |
| `segment` | Segmento de aplicação vindo da planilha do fornecedor: `Off Road`, `Linha Leve`, `Linha Pesada`. |
| `application_notes` | Texto livre de aplicação preservado do arquivo-fonte (fallback lossless do parser do PRD-021). |
| `applications` | jsonb → `IApplication[]`: aplicações tipadas — `vehicleBrand`, `vehicleModel`, `yearStart`, `yearEnd`, `engine?`. Range de ano inclusivo em ambas as pontas. |
| `is_original` | `true` quando a peça é OEM original (ex.: Volvo Genuine, Scania Original). `false` ou nulo = aftermarket/remanufaturada. |
| `unit_cost` | Custo unitário de aquisição (R$). **Não exposto ao anon** (vitrine B2C). |
| `unit_price` | Preço de venda base (R$). Exposto ao anon na vitrine. |
| `margin_percent` | Margem como decimal: `0.30` = 30%. Derivada do custo + preço base. **Não exposta ao anon.** |
| `gtin` | Global Trade Item Number (EAN-13 / código de barras). Distinto de `supplier_code` (código interno do ERP do fornecedor). |
| `sefaz_status` | Estado de validação do GTIN na SEFAZ: `validated` / `not_checked` / `invalid`. |
| `sefaz_checked_at` | Timestamp da última consulta de validação do GTIN. |
| `supplier_code` | Código interno do fornecedor no ERP — historicamente misusado como código de barras no DINTEC. |
| `reference` | Número de referência do fabricante da peça. |
| `group_label` | Grupo de produto do ERP (ex.: `"1-FILTRO"`). Mapeia para `IPart.group` no TypeScript. |
| `part_type` | Tipo livre de produto (texto livre do ERP). |
| `price_tables` | jsonb → `IPriceTable[]`: tabelas de preço nomeadas (Padrão, Ecommerce, Oficina, Varejo, Atacado), cada uma com `markupPercent` e `price` calculado sobre `unit_cost`. Espelha o "Cadastro de Valores do Produto" do DINTEC. **Não exposto ao anon.** |
| `fiscal` | jsonb → `IPartFiscal`: atributos fiscais — `ncm?` (código Mercosul, ex.: `"8421.23.00"`), `icmsPercent?`, `taxSubstitution?`, `origin?`. NCM real aguarda gate do dono (NF-e própria deferida). |
| `weight_kg` | Peso líquido em quilogramas (logística/frete). |
| `storage_location` | Localização física no armazém (ex.: `"A-12"`). **Não exposta ao anon.** |
| `box_quantity` | Unidades por caixa (embalagem mínima). |
| `fractionable` | Se a peça pode ser vendida fracionadamente (ex.: meio litro de óleo). |
| `unit_of_measure` | Unidade de medida: `UN`, `PC`, `L`, etc. |
| `suppliers` | jsonb → `IPartSupplier[]`: histórico de entradas de estoque do fornecedor — NF de entrada, custo, quantidade. **Não exposto ao anon.** |
| `average_cost` | Custo médio ponderado (C.M.) calculado a partir de `suppliers`. **Não exposto ao anon.** |
| `stock_available` | Quantidade em estoque disponível. **Não exposta ao anon** (para não revelar nível de inventário). |
| `stock_minimum` | Estoque mínimo de segurança (alerta de reposição). **Não exposto ao anon.** |
| `division` | Divisão da plataforma: `parts` (padrão/MVP) · `service` · `industrial` (dormentes). |
| `active` | `false` = peça descontinuada / inativa; oculta para anon pela policy `parts_select_anon`. |
| `store_id` | Loja proprietária do catálogo. Nullable em peças herdadas de importação pré-migração. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `media_assets.linked_part_id` → `parts.id`
- `model_kit_items.part_id` → `parts.id`
- `order_items.part_id` → `parts.id`
- `quote_items.part_id` → `parts.id`

## RLS — Row Level Security `[regra: mecânico]`

### `parts_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `parts_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `parts_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `parts_select_anon` — SELECT · roles: `{anon}`
- **USING:** `(active = true)`

### `parts_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

**Justificativa do desenho:** `🔍 inferido (fonte: expressões das policies + migration 20260609024532_storefront_anon_read.sql + RLS-PANORAMA.md)`

- **Isolamento por loja (authenticated):** todo acesso de staff exige `store_id = current_store_id()` —
  catálogos de lojas distintas são mutuamente opacos.
- **Vitrine pública (anon) — `parts_select_anon`:** a policy libera leitura anônima apenas para
  peças `active = true`. É o vetor de acesso da vitrine B2C (`loja.*` routes), sem autenticação.
- **Coluna-scope para anon:** além da policy de linha, a migration `20260609024532` faz
  `REVOKE ALL ON parts FROM anon` e depois `GRANT SELECT (…)` apenas nas colunas não-comerciais —
  `unit_cost`, `margin_percent`, `supplier`, `suppliers`, `average_cost`, `storage_location`,
  `stock_available`, `stock_minimum` e `price_tables` **nunca chegam ao anon**, mesmo que a policy
  de linha as permitisse. Dupla camada de defesa (policy + column grant).
- **Escrita exclusivamente autenticada:** `INSERT/UPDATE/DELETE` não têm policy para `anon` — a
  vitrine é read-only. No MVP o checkout faz handoff por WhatsApp (write-free).
- ❓ Confirmar se `store_id` nulo em peças de catálogo global bloqueia `INSERT` para staff (o
  `WITH CHECK` exige `store_id = current_store_id()` — nulo nunca iguala).

## Índices `[mecânico]`

- `parts_active_idx` — `CREATE INDEX parts_active_idx ON public.parts USING btree (active)`
- `parts_brand_idx` — `CREATE INDEX parts_brand_idx ON public.parts USING btree (brand)`
- `parts_category_idx` — `CREATE INDEX parts_category_idx ON public.parts USING btree (category)`
- `parts_name_trgm_idx` — `CREATE INDEX parts_name_trgm_idx ON public.parts USING gin (name gin_trgm_ops)`
- `parts_oem_codes_gin_idx` — `CREATE INDEX parts_oem_codes_gin_idx ON public.parts USING gin (oem_codes)`
- `parts_oem_codes_text_trgm_idx` — `CREATE INDEX parts_oem_codes_text_trgm_idx ON public.parts USING gin (oem_codes_text gin_trgm_ops)`
- `parts_pkey` — `CREATE UNIQUE INDEX parts_pkey ON public.parts USING btree (id)`
- `parts_stock_available_idx` — `CREATE INDEX parts_stock_available_idx ON public.parts USING btree (stock_available)`
- `parts_store_id_idx` — `CREATE INDEX parts_store_id_idx ON public.parts USING btree (store_id)`

## Triggers `[mecânico]`

- `parts_oem_codes_text_biu` — BEFORE INSERT/UPDATE → `parts_set_oem_codes_text()`

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- _nenhuma_

**Narrativa** `🔍 inferido (catalog.ts + migration 20260608150303 + supabase/parts.ts + CLAUDE.md)`:

- **Trigger `parts_set_oem_codes_text` / função `public.parts_set_oem_codes_text()`:** dispara
  BEFORE INSERT OR UPDATE (por linha). Executa `new.oem_codes_text := array_to_string(new.oem_codes, ' ')`.
  Efeito: concatena todos os códigos OEM separados por espaço em uma coluna text plana. Isso
  permite que o provider Supabase faça `ILIKE '%21707792%'` sobre `oem_codes_text` com apoio do
  índice trigrama `parts_oem_codes_text_trgm_idx` — busca por substring em OEM, algo que um GIN
  de array (`parts_oem_codes_gin_idx`) faz apenas por exact-match. A coluna **não deve ser escrita
  diretamente**; é sempre derivada pelo trigger.
- **Estratégia dupla de busca por OEM:** `findByOem()` usa `.contains("oem_codes", [code])` (GIN
  de array, exact-match). O `list()` com `params.oem` usa `.ilike("oem_codes_text", …)` (trigrama,
  substring). `🔍 (supabase/parts.ts linhas 210, 243–248)`
- **`oem_codes_text` excluída do SELECT do provider:** a constante `COLUMNS` no provider
  não inclui `oem_codes_text` (campo interno de busca, não mapeado para `IPart`). A coluna é usada
  apenas como filtro — nunca retornada ao frontend. `🔍 (supabase/parts.ts linha 78)`
- **Preços derivados:** `margin_percent` é informado (não calculado no banco); `price_tables[*].price`
  é calculado no lado TypeScript como `unitCost * (1 + markupPercent)`. Não há check constraint
  de consistência entre `unit_cost`, `unit_price` e `margin_percent` no banco. `🔍 (catalog.ts → IPriceTable)`
- **Equivalências bidirecionais:** `equivalent_part_ids` é **unidirecional no banco** — se A aponta
  para B, B não aponta automaticamente para A. A UI consulta `listEquivalents()` que faz `.in("id", ids)`.
  `🔍 (supabase/parts.ts linhas 251–268)`
- **Vitrine B2C é read-only:** o checkout não escreve em `parts` (handoff por WhatsApp). As RPCs
  `storefront_config` e `storefront_top_selling` são as únicas consultas auxiliares públicas.
  `🔍 (CLAUDE.md — storefront write-free + migration 20260609024532)`
- **NCM real ausente no MVP:** `fiscal.ncm` existe no modelo mas não é populado com NCM correto —
  a NF-e própria está deferida; o catálogo aguarda o gate do dono (contratar provedor fiscal). `🔍 (CLAUDE.md)`

## Perguntas pendentes

- ❓ **NCM no catálogo:** quando a NF-e própria for implementada (PRDs 127–129 desbloqueados), o
  `fiscal.ncm` precisará ser populado para todas as ~N peças. Existe plano de backfill via DINTEC
  ou entrada manual? A coluna `fiscal` é jsonb — sem constraint de formato do NCM (ex.: `\d{4}\.\d{2}\.\d{2}`).
- ❓ **Normalização de `applications`:** as aplicações são jsonb livre — não há tabela `part_applications`
  normalizada. Isso impossibilita queries eficientes do tipo "quais peças servem ao Volvo FH 2020?"
  via SQL. É intencional para MVP ou haverá normalização (PRD-021 / PRD-034)?
- ❓ **`store_id` nulo em peças legadas:** peças de catálogo global importadas antes da migração
  podem ter `store_id IS NULL`. O `WITH CHECK` da policy `parts_insert` exige `store_id = current_store_id()`
  (nulo não iguala) — como essas peças são gerenciadas? São read-only de facto?
- ❓ **`equivalent_part_ids` como `text[]`:** o tipo é `text[]` (não `uuid[]`), alinhado com o
  `IPart.equivalentPartIds: ID[]` que aceita string. Confirmar se os valores são UUIDs válidos ou
  podem ser IDs legados em outro formato (ex.: `"part-XXXXX"` do mock).

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3). |
