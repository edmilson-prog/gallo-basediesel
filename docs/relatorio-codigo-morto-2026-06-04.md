# Relatório de Código Morto — GALLO BASE DIESEL

> **Data:** 2026-06-04
> **Versão analisada:** v0.65.0 (`Fitment`), branch `main`
> **Escopo:** `src/` (1.631 arquivos `.ts`/`.tsx`)
> **Método:** análise de grafo de imports (knip 6.15.0) + verificação adversarial multi-agente (12 agentes) + verificação cruzada programática de imports reais.

---

## Resumo executivo

A base está **notavelmente limpa** para o tamanho. Não há features inteiras abandonadas nem grandes blocos de lógica morta. O que existe é pontual: **4 arquivos** e **27 símbolos** genuinamente mortos (sobras de redesigns/substituições já concluídos), além de um padrão de **superfície de barrels não consumida** (consequência da convenção de _deep-imports_ do projeto).

| Categoria | Qtd | Ação |
|-----------|----:|------|
| 🗑️ **Arquivos inteiros mortos** | **4** | Remover (alta confiança) |
| 🗑️ **Símbolos/lógica morta** | **27** | Remover (verificado 2×) |
| 🗑️ **Dependências acopladas a UI órfã** | **8** | Remover só com o componente |
| 🌱 Features dormentes (trabalho adiantado de PRD) | 23 | **Manter** e sinalizar |
| 📚 Componentes shadcn/ui reservados | 14 (+`use-mobile`) | **Manter** (design system) |
| 🔌 API intencional de barrels/contratos | 145 | **Manter** |
| ✅ Falsos positivos do knip | 83 | **Não mexer** |
| ✷ Exports duplicados (aliases PRD-055) | 2 | **Manter** (intencional) |

**Impacto da limpeza segura:** ~31 itens (4 arquivos + 27 símbolos) + 8 deps acopladas. Nenhum afeta funcionalidade viva.

---

## Metodologia e confiabilidade

1. **knip 6.15.0** (`bunx`, sem alterar `package.json`) com config calibrada para o file-based routing do TanStack Router (`routeTree.gen.ts` tratado como conector de grafo).
2. **Verificação adversarial**: 12 agentes em paralelo (1,05M tokens, 555 buscas) reverificaram cada achado por grep independente e o classificaram com o contexto de **Fase 1 / PRDs** — distinguindo morto real de feature dormente, biblioteca reservada e falso positivo.
3. **Verificação cruzada programática**: para cada achado `DEAD_REMOVABLE`, um resolvedor de imports confirmou que **nenhum módulo importa o símbolo do seu arquivo de definição** (eliminando homônimos — cada feature tem seu próprio `pick`/`formatPercent`/`countActiveFilters`).

> **Resultado da dupla verificação:** os 31 achados marcados para remoção foram **100% confirmados mortos** — zero falsos "morto". Durante a análise foram corrigidos **2 falsos positivos sistêmicos** do parsing inicial e desambiguados ~14 homônimos.

---

## 1. Código morto confirmado — seguro remover

### 1.1 Arquivos inteiros (4) · confiança **alta**

| Arquivo | Por quê está morto |
|---------|--------------------|
| `src/features/catalog/components/detail/CommercialSection.tsx` | Substituído no redesign do detalhe de produto por `PartPricingTable` + cards + `PartPriceHistory`. O próprio checkpoint `2026-06-01-1357` e o spec do redesign o listam como órfão a remover. |
| `src/features/catalog/components/detail/StockSection.tsx` | Idem — órfão após o redesign; nenhum dos layouts ativos (`PartLayoutCounter/Panel/Sheet`) o referencia. |
| `src/features/customers/components/list/bulk-actions/TransferSellerModal.tsx` | Versão antiga do modal de transferência em lote. O slot `transferOpen` da `CustomersListPage` hoje é preenchido por `NewPermanentBatchTransferModal` (carteira). |
| `src/features/manager-dashboard/hooks/useActiveAlerts.ts` | Mecanismo de alertas do PRD-014 superado pelo reconciliador do PRD-008 + centro de notificações; a lógica migrou para `providers/notifications/conditions/derivedConditions.ts`. |

> Ao remover os dois de `catalog/detail`, conferir também strings i18n órfãs (`CATALOG_STRINGS.detail.commercial.*` / `sections.commercial`).

### 1.2 Símbolos / lógica morta (27) · verificados 2×

Exports/tipos exportados que **nenhum módulo importa** (e que não são usados internamente):

| Símbolo | Arquivo |
|---------|---------|
| `DEFAULT_SEED` | `src/mocks/hooks/useResetMocks.ts` |
| `_internals` | `src/features/part-identification/engine/search.ts` |
| `AttributeConfidence` (re-export redundante) | `src/features/part-identification/engine/search.ts` |
| `SdrTransitionTo` | `src/features/sdr/engine/respond.ts` |
| `GamificationStrings` | `src/features/gamification/i18n/pt-BR.ts` |
| `QUOTE_DENSITY_OPTIONS` | `src/features/quotes/types/editor.ts` |
| `SwapTargetId` | `src/features/quotes/components/new/items/EquivalentsPanel.tsx` |
| `periodStartIso` | `src/features/commissions/utils/periods.ts` |
| `orderStatusLabel` | `src/features/orders/utils/orderStatus.ts` |
| `countActiveFilters` | `src/features/customers/utils/listFilters.ts` |
| `getFicheButtonLabel` | `src/features/customers/hooks/useFicheLayout.ts` |
| `PlaceholderPage` + `IPlaceholderPageProps` | `src/features/shell/components/EmptyState.tsx` |
| `RouteKey` | `src/features/shell/config/routes.ts` |
| `sumOrdersTotal` | `src/features/insights/engine/utils.ts` ⚠️ |
| `revenueByPart` | `src/features/insights/engine/utils.ts` |
| `formatPercent` | `src/features/insights/engine/utils.ts` |
| `formatBRLCompact` | `src/features/insights/engine/utils.ts` |
| `pick` | `src/features/sales-analytics/utils/aggregations.ts` |
| `StorefrontAccountStrings` | `src/features/storefront-account/i18n/pt-BR.ts` |
| `periodLabel` | `src/features/expenses/utils/period.ts` |
| `totalDaysInWindow` | `src/features/abc-curve/hooks/useABCFilters.ts` |
| `ICarteiraTransfer` | `src/features/carteira/hooks/useTransfersList.ts` |
| `SellerCustomers` | `src/features/carteira/hooks/useStoreCustomers.ts` |
| `isClosedLead` | `src/features/leads/utils/leadDisplay.ts` |
| `MODES` | `src/config/themes.ts` |
| `EMPTY_NOTIFICATION_FILTERS` | `src/features/notifications/components/NotificationFilters.tsx` |

> ⚠️ `sumOrdersTotal` é importado por `insights/engine/detectInsights.ts` **apenas para re-exportar** (linha 795) — esse re-export não é consumido. Ao remover a função, remover também o import (linha 21) e o re-export (linha 795) em `detectInsights.ts`.

### 1.3 Dependências acopladas a UI órfã (8) · confiança **média**

Estes pacotes só são usados por componentes shadcn/ui **órfãos** (ver §2.2). Remover **somente em conjunto** com o componente correspondente:

| Dependência | Componente que a usa |
|-------------|----------------------|
| `@radix-ui/react-aspect-ratio` | `ui/aspect-ratio.tsx` |
| `@radix-ui/react-menubar` | `ui/menubar.tsx` |
| `@radix-ui/react-navigation-menu` | `ui/navigation-menu.tsx` |
| `embla-carousel-react` | `ui/carousel.tsx` |
| `input-otp` | `ui/input-otp.tsx` (provável uso futuro em OTP/auth) |
| `react-day-picker` | `ui/calendar.tsx` (provável uso por features de data) |
| `react-resizable-panels` | `ui/resizable.tsx` |
| `vaul` | `ui/drawer.tsx` |

---

## 2. Manter, mas com conhecimento

### 2.1 Features dormentes — trabalho adiantado de PRD (23) · **NÃO remover**

Código completo e funcional, ainda **não conectado a uma rota/UI** porque o PRD que o integra não foi executado. Remover destruiria trabalho legítimo. Destaques:

- **SDR (PRD-022/023/024):** `useSdrResponder`, `useSdrPauseOnHumanIntervention`/`useSdrReactivate` ("pausa sagrada"), `useSdrMetrics` — glue React→engine pronto para ligar ao Inbox.
- **Escalonamento (PRD-014/024):** `useSdrEscalation`, `EscalationMetricsCard`.
- **Quotes (PRD-031/012):** `CustomerQuotesList.tsx` — drop-in para a aba "Orçamentos" da ficha do cliente; `QuotesTab.tsx` deveria delegar a ele.
- **Notificações (PRD-008):** `DERIVED_EVENTS` (catálogo de eventos do reconciliador).
- **Mocks adiantados:** `rankingsApi`, `positivationsApi`, `abcsApi`, `rolesApi` — camadas mock prontas à frente dos providers/rotas.
- **Orders:** `markOrderOverdue`, `updateOrderDeliveryAddress` — transições completas aguardando UI.
- **Shell:** `DetailLayout` (layout lista+detalhe reservado), `RouteSkeleton` (fallback de Suspense do PRD-003).
- **B2B Portal (PRD-071):** `selectDefaultPortalCompanyId`, `PORTAL_ENABLED_B2B_COUNT`.
- **Gamificação (PRD-042/043):** `GamificationPlaceholderPage`.
- **Carteira:** `useExpireTransfer` (expiração de transferência).

> **Recomendação:** rastrear estes itens no respectivo PRD para que sejam plugados (ou removidos) quando o PRD for executado, evitando que virem código morto de verdade.

### 2.2 Componentes shadcn/ui reservados (14 + 1 hook) · **manter** (design system)

Componentes da biblioteca copiada (`new-york`) ainda não usados — fazem parte da reserva do design system, não são "lixo":

`aspect-ratio`, `breadcrumb`, `calendar`, `carousel`, `chart`, `drawer`, `form`, `input-otp`, `menubar`, `navigation-menu`, `pagination`, `resizable`, `sidebar`, `sonner`.

> O hook `src/hooks/use-mobile.tsx` é usado **apenas** por `ui/sidebar.tsx` (também órfão) → na prática é parte deste mesmo conjunto reservado. Se um dia o `sidebar` for removido, `use-mobile` sai junto.

### 2.3 API intencional de barrels e contratos (145) · **manter**

Símbolos definidos em arquivos vivos e expostos como **superfície pública** via `index.ts` ou `providers/.../contracts`, mantidos por design mesmo sem consumidor atual (ex.: helpers RBAC `getEffectivePermissions`/`getCurrentUserScope` mandados pelo PRD-006; contratos de provider). Convenção do projeto.

---

## 3. Falsos positivos do knip (83) · **não mexer**

O knip apontou, mas a verificação encontrou uso vivo. Principais classes:

- **Deps usadas via CSS:** `tailwindcss` e `tw-animate-css` (importados em `src/styles.css` via `@import` — o knip não rastreia CSS). **Remover qualquer um quebraria o build.**
- **Símbolos usados _in-file_:** dezenas de `export const DEFAULT_*_FILTERS`, `resolveWindow`, etc. — o símbolo roda no próprio arquivo; apenas a _keyword_ `export` é supérflua (over-export, não código morto).
- **Tipos usados via barrel/composição:** `RecencyBucket`, `INumericRange`, etc. consumidos via `@/providers/data`.

> Sub-oportunidade opcional e de baixo risco: remover a _keyword_ `export` dos símbolos que só são usados internamente reduz a superfície pública, mas **não** remove código.

---

## 4. Exports duplicados (2) · intencionais

`useCashFlowSummary` (`cashflow/hooks/useCashFlowData.ts`) e `projectCashFlow` (`cashflow/engine/buildCashFlow.ts`) são **aliases públicos deliberados** do contrato PRD-055/PRD-040 (Cockpit), expostos via dois barrels. Manter.

---

## 5. Observações estruturais e recomendações

1. **Rede de proteção desligada.** `tsconfig.json` tem `noUnusedLocals: false` e `noUnusedParameters: false`, e o ESLint tem `@typescript-eslint/no-unused-vars: "off"`. Por isso imports/variáveis locais mortos nunca foram capturados. **Recomendação:** ativar `noUnusedLocals`/`noUnusedParameters` (pega o caso intra-arquivo, que o knip não cobre).
2. **~689 re-exports de barril não consumidos** (278 exports + 411 tipos em `index.ts`). Não são lógica morta (os fontes estão vivos), mas refletem barrels que o projeto não consome porque adota _deep-imports_. Enxugá-los é opcional e de baixa prioridade. *(Esta categoria não foi verificada item a item — é tratada como agregado.)*
3. **Adicionado `knip.json`** na raiz, calibrado para o projeto. Permite reexecutar a auditoria com `bunx knip`. Pode ser mantido (recomendado) ou removido conforme preferência.

---

## Apêndice — como reproduzir

```bash
bunx knip                      # relatório completo no terminal
bunx knip --reporter json      # saída estruturada
bunx knip --trace-file <path>  # rastrear por que um símbolo é (não) usado
```

> Cobertura desta auditoria: arquivos órfãos (100%), exports/tipos em arquivos reais (100% verificados por agentes), dependências (100%), duplicados (100%). Não coberto item a item: re-exports de barrels (agregado, §5.2) e variáveis locais intra-arquivo (requer `noUnusedLocals`, §5.1).
