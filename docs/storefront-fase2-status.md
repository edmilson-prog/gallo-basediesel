# Loja B2C (Storefront) — Status Fase 2 (Mock → Supabase)

> **Referência durável.** A loja foi **despriorizada** nesta fase (foco no `/app`). Este documento registra **tudo que já foi feito** e **tudo que falta** para a loja rodar de verdade no Supabase, para retomar sem perder contexto. Branch `feat/fase2-supabase-cutover` (PR #39, draft). Atualizado em 2026-06-09.

---

## Resumo executivo

| Capacidade da loja | Estado no Supabase |
|---|---|
| **Navegar** (home, busca, categoria, ficha, equivalências, relacionados, carrinho) | ✅ **PRONTO** como `anon` (sem login) — esta sessão. |
| **Finalizar compra** (checkout) | ⛔ **PENDENTE** — escreve `orders`/`customers`/`conversations` como anon (proibido). Decisão: **handoff** (WhatsApp/orçamento) no cutover. |
| **Conta do cliente B2C** (`/loja/conta/*`: pedidos, orçamentos, perfil, endereços, veículos) | ⛔ **PENDENTE** — auth de cliente é **mock**; precisa Supabase Auth de cliente + RLS por cliente. |
| **Admin da vitrine** (owner edita config em `/app/configuracoes/storefront`) | ✅ caminho de **staff** (write policy de `stores` já existe) — não-anon, valida no smoke do `/app`. |
| **Mídia/imagens** | ⚠️ **simulada** — loja usa `parts.imageUrl` (URL externa de texto), não o Supabase Storage; sistema de mídia é metadata-only. |

**Em uma frase:** a loja **vitrine** (browse) está pronta no Supabase; o **funil transacional** (comprar + conta logada) é uma frente própria, acoplada à **auth de cliente B2C** + um **backend de escrita anon-safe** (Edge Function), e foi conscientemente adiada.

---

## 1. O que existe (feature Fase 1, em mock)

A loja está implementada como feature navegável (PRDs 060–067), em `src/features/`:

| Feature | Papel |
|---|---|
| `storefront/` | Home (hero, marcas, categorias, destaques, "por que comprar", sobre, footer, SEO) |
| `storefront-search/` | `/loja/busca` (PRD-061) |
| `storefront-category/` | `/loja/categoria/:slug` (PRD-062) |
| `storefront-product/` | `/loja/produto/:slug` (PRD-063) |
| `storefront-cart/` | Carrinho + checkout + confirmação (PRD-064) |
| `storefront-account/` | `/loja/conta/*` — área do cliente logado (PRD-065) |
| `storefront-admin/` | Config da vitrine editada pelo owner no `/app` (PRD-067) |

Rotas em `src/routes/loja.*` (~25 arquivos). Layout em `src/features/shell/layouts/LojaLayout.tsx`. Loja é **single-store** no MVP (STORE_ID fixo `00000000-0000-0000-0000-000000000001`).

---

## 2. O que FOI FEITO para o Supabase (Fase 2 — esta sessão)

**Frente "storefront anon wiring" — FECHADA (commit `4c69771`).**

### Banco (migrations via MCP)
- `storefront_anon_read` (sessão anterior) — grant por **coluna** em `parts` para `anon` (esconde custo/margem/fornecedor/fiscal/sefaz/localização) + policy `parts_select_anon` (`active = true`) + RPC `storefront_config(store)` `SECURITY DEFINER` (devolve só `settings->'storefront'`).
- `storefront_anon_read_stock` — **correção**: re-concede `stock_available`/`stock_minimum` ao `anon` (a loja usa estoque no núcleo: badge fora-de-estoque, "pronta entrega", "só em estoque", cap de quantidade, validação de carrinho).
- `storefront_top_selling_rpc` — RPC `SECURITY DEFINER` que ranqueia `part_id` por unidades vendidas (90d, status pago/parcial) lendo `orders`/`order_items` como owner; devolve **só IDs** (não vaza pedido).

### Camada de dados
- **`IStorefrontProvider`** dedicado (`providers/data/contracts/storefront.ts`): `listCatalog`, `getPart`, `listEquivalents`, `getConfig`, `listTopSellingIds`.
  - `impl/mock/storefront.ts` — delega aos providers mock → comportamento **idêntico** em modo mock.
  - `impl/supabase/storefront.ts` — `PUBLIC_COLUMNS` (subconjunto do grant anon) + `rowToPublicPart` (defaulta `unitCost:0`/`marginPercent:0`/`supplier:""`); config via RPC `storefront_config`; ranking via RPC `storefront_top_selling`.
  - Registrado em `factory.ts`, `contracts/index.ts`, `hooks/useStorefrontProvider.ts`, barrel.

### Consumidores migrados (11) — de `usePartsProvider`/`useSettingsProvider`/`useOrdersProvider` → `useStorefrontProvider`
1. `storefront/hooks/useStorefrontSettings.ts` → `getConfig`
2. `storefront/hooks/useFeaturedProducts.ts` → `listCatalog` + `listTopSellingIds`
3. `storefront/components/StorefrontCategories.tsx` → `listCatalog`
4. `storefront-category/hooks/useCategoryResults.ts` → `listCatalog` + `listTopSellingIds`
5. `storefront-search/hooks/useSearchResults.ts` → `listCatalog` + `listTopSellingIds`
6. `storefront-search/pages/SearchResultsPage.tsx` → `listCatalog`
7. `storefront-product/pages/ProductDetailPage.tsx` → `getPart`
8. `storefront-product/hooks/useRelatedProducts.ts` → `listCatalog`
9. `storefront-product/components/EquivalentsTab.tsx` → `listEquivalents`
10. `storefront-cart/hooks/useCartValidation.ts` → `listCatalog`
11. `storefront-cart/components/CartItemRow.tsx` → `getPart`

### Validação
Build ✅ · 244 testes ✅ · `tsc` delta limpo ✅ · impersonação `anon`: projeção pública (32 colunas) lê OK, `unit_cost` → `42501`, RPCs respondem (186 IDs ranqueados, 344 peças ativas visíveis). App interno (`/app`) **intocado** — providers `parts`/`settings`/`orders` seguem com projeção completa para staff.

Detalhe técnico de RLS: `docs/db/rls-policies-fase2-mvp.md` (seções "Storefront anônimo" + "Wiring da loja").

---

## 3. O que FALTA (com arquivos, tamanho e bloqueio)

### 3.1 Checkout-backend (funil de compra) — **G**
**Bloqueio:** escreve como anon (proibido).
- `storefront-cart/pages/CheckoutPage.tsx` → `createOrderFromCart` + `triggerEcommerceOrder`.
- `orders/api/createOrderFromCart.ts` (203 linhas): cria customer guest (INSERT), gera nº de pedido (READ orders), cria pedido (INSERT), round-robin de vendedor (READ sellers), auditoria.
- `ecommerce-integration/api/triggerEcommerceOrder.ts` (~230 linhas, PRD-067): reatribui vendedor (UPDATE orders), abre conversa vinculada (INSERT+UPDATE conversations), notifica vendedor (store client-side), lê `settings.ecommerceIntegration`.
- `storefront-cart/hooks/useCartShipping.ts` → lê `settings.shipping` (campo **fora** da fatia `storefront` — RPC `storefront_config` não expõe).
- `storefront-cart/pages/OrderConfirmedPage.tsx` → `orders.get(orderId)` (anon não lê orders).

**Caminhos:** (A) **Edge Function transacional** `storefront-checkout` (service_role) — porta a orquestração para o servidor, **recalcula preço/estoque** do catálogo (não confia no input anon), devolve o pedido; confirmação via RPC tokenizada. Notificação do vendedor vira realtime/refresh. **Recomendado.** (B) Login B2C obrigatório + write policies por cliente (mata guest checkout; maior). **Decisão tomada p/ cutover:** handoff (ver 3.3) — o checkout-backend completo fica para quando a loja for prioridade.

### 3.2 Conta do cliente B2C (`/loja/conta/*`) — **G**
**Bloqueio:** auth de cliente é **mock**; reads/writes por cliente sem RLS.
- `storefront-account/hooks/useCustomerAuth.ts` — auth **mock** (Zustand `customerAuthStore`; `login` busca cliente por email e aceita qualquer senha; `register`/`updateProfile` escrevem em `customers`). Comentário no código: "designed for drop-in replacement by Supabase Auth on Fase 2".
- `storefront-account/hooks/useCustomerOrders.ts`, `pages/AccountOrderDetailPage.tsx`, `pages/AccountQuoteDetailPage.tsx` → leem `orders`/quotes direto (precisariam de leitura **escopada por cliente**).

**Precisa:** (1) **Supabase Auth de cliente B2C** (um papel `customer` ou auth dedicada — não existe; o Custom Access Token Hook hoje cobre staff/sellers); (2) **RLS por cliente** (cliente vê só os próprios pedidos/orçamentos/perfil/endereços/veículos); (3) os writes (`register`/`updateProfile`/checkout logado) via policies por cliente OU Edge Function. **Desbloqueia tanto a conta quanto o checkout logado.**

### 3.3 Handoff "Finalizar compra" (UX pré-cutover) — **P/M**
Redesenhar o CTA de finalização para **encaminhar a um vendedor** em vez do checkout demo: deep-link de WhatsApp (zero write) ou criar lead/orçamento (Edge Function pequena). Evita que a loja em modo `supabase` caia num fluxo que falha. **Não bloqueia o `/app`.**

### 3.4 Imagens de produto — **decisão**
A loja exibe `parts.imageUrl` (URL **externa** de texto) com fallback de ícone por categoria. **Não usa Supabase Storage.** Se as imagens reais de catálogo precisarem ser hospedadas, é uma decisão de catálogo (URLs externas vs Storage) — hoje funciona com a URL que estiver no campo.

### 3.5 Slug humano do produto — **P**
`/loja/produto/:slug` hoje carrega o **id** da peça no param `slug` (não há slug legível). Overlay de slug + SSR/edge é follow-up (anotado em `ProductDetailPage.tsx`).

### 3.6 Multi-loja da vitrine — **M**
Loja é single-store (STORE_ID fixo). Vitrine por domínio/loja é Fase 2+.

### 3.7 Mídia/Storage — **deferida** (ver roadmap)
Não é blocker da loja (vitrine usa `parts.imageUrl`). Storage real está acoplado à fonte de bytes (WhatsApp/upload-UI). Ver `ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md`.

---

## 4. Decisões tomadas (2026-06-09)

- **Wiring por provider dedicado** (não estreitar `parts`/`settings`) — protege o catálogo interno de regressão.
- **Estoque é público** na loja (e-commerce padrão) — `stock_available`/`stock_minimum` concedidos ao anon; custo/margem **não**.
- **Mais vendidos via RPC** server-side — sem vazar `orders`.
- **Checkout = handoff** no cutover; checkout-backend self-service fora da Fase 2.
- **Conta B2C** (auth real + RLS por cliente) fica como frente própria, acoplada ao checkout logado.

---

## 5. Ordem sugerida quando a loja voltar a ser prioridade

1. **Auth de cliente B2C** (Supabase Auth + papel/claim de cliente) — fundação que destrava conta logada **e** checkout autenticado.
2. **RLS por cliente** (orders/quotes/customers/addresses/vehicles escopados ao cliente logado).
3. **Conta `/loja/conta/*`** — trocar `useCustomerAuth` mock por Supabase Auth; migrar os reads para escopo de cliente.
4. **Checkout** — Edge Function transacional `storefront-checkout` (guest + logado), recalculando server-side; ou manter handoff.
5. **Handoff** (se não fizer checkout completo) — redesenhar "Finalizar" para WhatsApp/orçamento.
6. **Polimento** — slug humano, imagens, multi-loja.

---

## 6. Referências
- `docs/db/rls-policies-fase2-mvp.md` — RLS/migrations (seções Storefront anônimo + Wiring).
- `docs/db/cutover-smoke-checklist.md` — como ligar o Supabase local + smoke (inclui a seção anon da loja).
- `docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md` — roadmap geral de backend Fase 2.
- Commits desta frente: `4c69771` (wiring), `c8d987b`/`64c890a` (roadmap), `590d506` (cutover doc).
