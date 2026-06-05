# PRD-057 Analytics Copilot — Surface Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the analytics copilot (PRD-057) a working surface: a chat panel (Sheet) opened from a TopBar button (Ctrl+K), answering natural-language questions over the BI data with citation + drill-down, plus an Owner config toggle — built on the already-merged pure core (`metricCatalog`, `resolveQuery`, `scopeClamp`, `executeQuery`, `IAnalyticsDataAccess`).

**Architecture (decided):** Orchestration lives in the **feature**, not the data layer (avoids a providers→features dependency inversion):
- `useAnalyticsDataAccess()` — a hook that captures the existing data providers and returns a concrete `IAnalyticsDataAccess` whose async methods call `provider.list(...)` + the existing **pure** compute functions. No hooks inside the methods.
- `useAnalyticsCopilot()` — holds in-memory session state and exposes `ask(question)` = `resolveQuery` → `scopeClamp` → `executeQuery(def, query, dataAccess)`, appending user/assistant messages.
- The **Fase 2 swap seam** is the resolver (keyword → LLM) and the adapter (mock data → real/RAG) — documented, not implemented. The `IAnalyticsCopilotProvider` type (foundation) remains the documented contract; `useAnalyticsCopilot.ask` matches its `(question, context) → Promise<IAnalyticsAnswer>` signature. (No data-layer provider is registered.)

**Verification policy:** Same as Plan A — `bun run build` must stay green (real gate), touched files contribute zero new `tsc` errors, `bunx eslint <touched>` clean. **No jsdom/RTL; no browser** (user tests UI manually). RNF-001 must hold: the number comes only from the port/pure-functions, never from the resolver.

**Source design:** spec §8 (Feature B). **Branch:** `feat/prd-056-057-foundation` (continue; PR #35).

---

## Conventions
- `@/` imports; barrels for `@/providers/data` and `@/mocks`. pt-BR user strings.
- Reuse: `Sheet`, `ScrollArea`, `Card`, `Icon`, `Skeleton`, `TypingIndicator`, `Button`, `Input`/`Textarea`, `formatBRL`/`formatGoalValue`, the `TrendBadge`-style delta pattern.
- Per task: implement → `bun run build` green + tsc-delta empty + eslint clean → commit.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/shared/types/platform.ts` (modify) | add `analyticsCopilotEnabled?: boolean` |
| `src/features/analytics-copilot/adapters/useAnalyticsDataAccess.ts` (create) | concrete `IAnalyticsDataAccess` from providers + pure fns |
| `src/features/analytics-copilot/hooks/useAnalyticsCopilot.ts` (create) | session state + `ask()` orchestration |
| `src/features/analytics-copilot/i18n/suggestions.ts` (create) | suggested questions per role |
| `src/features/analytics-copilot/components/AnalyticsAnswerCard.tsx` (create) | renders an answer (value, comparison, citation, states) |
| `src/features/analytics-copilot/components/AnalyticsCopilotPanel.tsx` (create) | Sheet: header + history + composer + chips |
| `src/features/analytics-copilot/index.ts` (modify) | export panel/hooks/types |
| `src/features/shell/components/TopBar.tsx` (modify) | copilot button + Ctrl+K + mount panel (gated by setting) |
| `src/features/analytics-copilot/pages/AnalyticsCopilotConfigPage.tsx` (create) | Owner toggle config |
| `src/routes/app.configuracoes.copiloto-analitico.tsx` (create) | config route |

---

## Task 1: Add `analyticsCopilotEnabled` to platform settings

**File:** Modify `src/shared/types/platform.ts`.

- [ ] **Step 1:** Add to `IPlatformSettings` (near `insightsEnabled`):
```ts
  /** Toggles the analytics copilot panel (PRD-057). Undefined → enabled. */
  analyticsCopilotEnabled?: boolean;
```
- [ ] **Step 2:** Verify `bun run build` green; `bunx tsc --noEmit 2>&1 | grep platform.ts` empty.
- [ ] **Step 3:** Commit:
```bash
git add src/shared/types/platform.ts
git commit -m "feat(analytics-copilot): add analyticsCopilotEnabled platform setting (PRD-057)"
```

---

## Task 2: `useAnalyticsDataAccess` adapter hook

**File:** Create `src/features/analytics-copilot/adapters/useAnalyticsDataAccess.ts`.

**Context (exact APIs — verify exact field names while implementing):**
- Providers from `@/providers/data`: `useOrdersProvider`, `useLeadsProvider`, `useCustomersProvider`, `useSellersProvider`, `useSettingsProvider` (confirm each is exported; if not, import the hook file directly).
- `ordersProvider.list({ storeId, sellerId, paymentStatus: "pago", since, until, pageSize: 3000 })` → `.data: IOrder[]`. Fields: `total`, `sellerId`, `items` (`IOrderItem.marginValue`, `.total`).
- `customersProvider.list({ storeId, sellerIds?, pageSize: 3000 })`, `sellersProvider.list({ storeId, active: true })`, `settingsProvider.get(storeId)` → `IPlatformSettings` (read `lifecycleThresholds.dormantDays` / `lifecycleThresholds.lostDays` — **verify exact names** in `src/shared/types/platform.ts`; and `abcCurveSettings`).
- Pure functions (import from each feature; verify exact context field names by reading the engine file):
  - `sumBy` — `@/features/sales-analytics/utils/aggregations`.
  - `calculatePositivation(startIso, endIso, ctx)` — `@/features/positivation/engine/calculatePositivation` (ctx: `{ customers, ordersInPeriod, sellers, dormantDays, atRiskWindowDays?, now? }`) → use `.positivationRate` (0..1).
  - `classifyABC(startIso, endIso, ctx)` — `@/features/abc-curve/engine/classifyABC` (ctx: `{ customers, ordersInPeriod, settings }` where `settings = IABCCurveSettings`) → use `.totalRevenue`.
  - `calculatePortfolioMetrics(startIso, endIso, ctx)` — `@/features/portfolio-analytics/engine/calculatePortfolioMetrics` (ctx: `{ customers, ordersInPeriod, sellers, dormantDays, lostDays, atRiskWindowDays?, now? }`) → use `.atRisk.activeAtRisk.length` (clients at risk).
  - `buildForecastInput` + `computeForecast` + `DEFAULT_FORECAST_CONFIG` — `@/features/sales-forecast`.
- Period helper: `monthBounds(query.period)` is already given by `query.period.start/end`. For previous period, compute the prior month from the current `query.period.start`.
- Types: `IAnalyticsDataAccess`, `IMetricQuery` from `@/shared/types/analytics-copilot`; `IOrder` from `@/shared/types`.

- [ ] **Step 1:** Implement `useAnalyticsDataAccess(): IAnalyticsDataAccess`. Capture the providers at the top (stable refs). Return an object with the 6 async methods. Helper inside: `loadOrders(scope, period, sellerId?)` → `(await ordersProvider.list({ storeId: scope?.storeId, sellerId: sellerId ?? scope?.sellerId, paymentStatus: "pago", since: period.start, until: period.end, pageSize: 3000 })).data ?? []`. And `prevPeriod(period)` → previous calendar month ISO bounds.

  - **getSalesMetric(query):** orders = loadOrders(query.scope, query.period). `metricId` semantics: if the metric is `pedidos` → `value = orders.length`; `ticket_medio` → `value = orders.length ? sumBy(orders,o=>o.total)/orders.length : 0`; else (`faturamento`) → `value = sumBy(orders, o=>o.total)`. If `query.comparison`, load previous-period orders and compute `previousValue` the same way. (You can read `query.metricId` to pick the variant; `faturamento`/`pedidos`/`ticket_medio` all route here.) Return `{ value, previousValue }`.
  - **getMargin(query):** orders = loadOrders(...). `value = sumBy(orders.flatMap(o => o.items ?? []), (it) => it.marginValue ?? 0)`. comparison via previous period. Return `{ value, previousValue }`. (Avoids needing parts maps.)
  - **getPositivation(query):** load customers (storeId, sellerIds from scope), orders (period), sellers, settings → `calculatePositivation(period.start, period.end, { customers, ordersInPeriod: orders, sellers, dormantDays: settings.lifecycleThresholds.dormantDays })`. Return `{ value: metrics.positivationRate }` (and previousValue if comparison).
  - **getABCClass(query):** load customers, orders, settings → `classifyABC(period.start, period.end, { customers, ordersInPeriod: orders, settings: settings.abcCurveSettings })`. Return `{ value: metrics.totalRevenue }`.
  - **getPortfolioStatus(query):** load customers, orders, sellers, settings → `calculatePortfolioMetrics(period.start, period.end, { customers, ordersInPeriod: orders, sellers, dormantDays: settings.lifecycleThresholds.dormantDays, lostDays: settings.lifecycleThresholds.lostDays })`. Return `{ value: metrics.atRisk.activeAtRisk.length }`.
  - **getForecast(query):** orders = loadOrders(...); leads = `(await leadsProvider.list({ storeId: query.scope?.storeId, sellerId: query.scope?.sellerId, pageSize: 2000 })).data ?? []`; `realizedValue = sumBy(orders,o=>o.total)`; `avgTicket = orders.length ? realizedValue/orders.length : undefined`. `input = buildForecastInput({ scope: { level: query.scope?.sellerId ? "individual" : "store", targetId: query.scope?.sellerId ?? query.scope?.storeId ?? "store-matriz", storeId: query.scope?.storeId ?? "store-matriz", sellerId: query.scope?.sellerId }, metric: "revenue", period: query.period, realizedValue, avgTicket, leads, now: new Date() })`. `const f = computeForecast(input, DEFAULT_FORECAST_CONFIG)`. Return `{ value: f.scenarios.find(s=>s.type==="provavel")!.projectedValue }`.

- [ ] **Step 2:** Verify build green + tsc-delta empty + eslint clean. **Verify RNF-001:** the value in every method comes from data/pure-fns, never invented.
- [ ] **Step 3:** Commit:
```bash
git add src/features/analytics-copilot/adapters/useAnalyticsDataAccess.ts
git commit -m "feat(analytics-copilot): add useAnalyticsDataAccess adapter (providers + pure fns)"
```

---

## Task 3: `useAnalyticsCopilot` orchestration hook

**File:** Create `src/features/analytics-copilot/hooks/useAnalyticsCopilot.ts`.

**Context:** Uses `useAnalyticsDataAccess()`, `useCurrentRole()` (`@/features/rbac`), `useCurrentStore()` (`@/features/multistore`), `useAuth()` (for sellerId — `currentUser.id` when role is Vendedor), and the pure core from `@/features/analytics-copilot` (`metricCatalog`, `findMetricById`, `resolveQuery`, `scopeClamp`, `executeQuery`, `unresolvedAnswer`, `refusalAnswer`). Audit via `auditLog` from `@/features/rbac` on each resolved query (`action: "analytics_copilot_query"`, resource `"insight"`, resourceId = metricId).

- [ ] **Step 1:** Implement:
```ts
export interface IUseAnalyticsCopilotResult {
  messages: IAnalyticsMessage[];
  isThinking: boolean;
  ask: (question: string) => Promise<void>;
  reset: () => void;
}
```
The `ask(question)` flow:
1. push a `user` message (`{ id, role: "user", text: question, timestamp }` — generate id via `crypto.randomUUID()` and timestamp via `new Date().toISOString()`).
2. set `isThinking = true`.
3. `period` = current month bounds (replicate `monthBounds(new Date())` → `IGoalPeriod`).
4. `const r = resolveQuery(question, { period }, metricCatalog)`.
5. if `r.query === null`: answer = `r.ambiguous ? { resolved:false, ambiguous:true, suggestions: r.candidates.map(id => findMetricById(id)?.label ?? id) } : unresolvedAnswer(<role suggestions>)`.
6. else: `role = useCurrentRole() ?? "Vendedor"`; `sellerId = role === "Vendedor" ? currentUser?.id : undefined`; `const clamp = scopeClamp(r.query, { role, storeId, sellerId })`; if `clamp.refusedByScope` → answer = `refusalAnswer(clamp.query)`; else `const def = findMetricById(clamp.query.metricId)!; answer = await executeQuery(def, clamp.query, dataAccess)`; then `auditLog({ action:"analytics_copilot_query", resource:"insight", resourceId: def.id, storeId })`.
7. push an `assistant` message `{ id, role:"assistant", answer, timestamp }`. set `isThinking=false`.
8. wrap execute in try/catch → on error push an assistant message with an error answer (`{ resolved:false, suggestions:[] }` + a flag/text) so the panel can show a friendly retry; never throw out of `ask`.
- `reset()` clears messages.

- [ ] **Step 2:** Verify build green + tsc-delta + eslint.
- [ ] **Step 3:** Commit:
```bash
git add src/features/analytics-copilot/hooks/useAnalyticsCopilot.ts
git commit -m "feat(analytics-copilot): add useAnalyticsCopilot orchestration hook (resolve→clamp→execute)"
```

---

## Task 4: Suggestions + `AnalyticsAnswerCard`

**Files:** Create `src/features/analytics-copilot/i18n/suggestions.ts` and `src/features/analytics-copilot/components/AnalyticsAnswerCard.tsx`.

- [ ] **Step 1:** `suggestions.ts` — export `suggestionsForRole(role: RoleName | null): string[]`. Gestor/Owner: `["Quanto faturei esse mês?", "Faturamento de filtro Volvo esse mês", "Qual a margem esse mês?", "Quantos clientes em risco?"]`. Vendedor: own-scope phrasings (`["Quanto faturei esse mês?", "Meu ticket médio", "Minha positivação"]`). Default = Gestor list.

- [ ] **Step 2:** `AnalyticsAnswerCard.tsx` — props `{ answer: IAnalyticsAnswer; onSuggestion?: (q: string) => void }`. Render inside a sober `div` (no heavy shadow; it sits in a chat bubble):
  - **Resolved with value:** `formattedValue` in `text-2xl font-semibold tracking-tight text-foreground`. If `comparison`, a delta pill (reuse the cockpit `TrendBadge` pattern: arrow `mdi:arrow-top-right`/`mdi:arrow-bottom-right`/`mdi:minus` + `text-emerald-600 dark:text-emerald-400` up / `text-red-...` down / `text-muted-foreground` flat, `rounded-full px-2 py-0.5 text-xs`, with `role="status"` + `aria-label`) plus textual `"vs. {formatted previous} no período anterior"` and the percent — **never color-only**. **Citation** footer: `border-t border-border/60 pt-2 mt-2`, `<Icon icon="mdi:check-decagram-outline" />` + a `Link to={answer.citation.drillDownUrl}` "Fonte: {answer.citation.source.label}" in `text-xs text-primary hover:underline`. (Drill-down URL may contain query params — use `Link` with `to`/`search` appropriately, or an `<a href>` if simpler; verify TanStack `Link` accepts a full path+query string, else split.)
  - **Not resolved (`resolved:false`, not refused):** `mdi:help-circle-outline` muted + "Ainda não sei responder isso." + render `answer.suggestions` as clickable chips (`rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted`, as `<button>` calling `onSuggestion`). For ambiguity, prefix "Você quer:" with the candidate labels as chips. **Never render a number when `resolved:false`.**
  - **Refused (`refusedByScope`):** `mdi:shield-lock-outline` + "Você não tem acesso a esse dado." (no number).

- [ ] **Step 3:** Verify build green + tsc-delta + eslint.
- [ ] **Step 4:** Commit:
```bash
git add src/features/analytics-copilot/i18n/suggestions.ts src/features/analytics-copilot/components/AnalyticsAnswerCard.tsx
git commit -m "feat(analytics-copilot): add AnalyticsAnswerCard + role suggestions (PRD-057)"
```

---

## Task 5: `AnalyticsCopilotPanel` (Sheet)

**File:** Create `src/features/analytics-copilot/components/AnalyticsCopilotPanel.tsx`.

**Context:** `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle` from `@/components/ui/sheet`; `ScrollArea` from `@/components/ui/scroll-area`; `TypingIndicator` from `@/features/conversations/components/TypingIndicator`; `Input`/`Button` from `@/components/ui`. Uses `useAnalyticsCopilot()` + `useCurrentRole()` + `suggestionsForRole`.

- [ ] **Step 1:** Props `{ open: boolean; onOpenChange: (open: boolean) => void }`. Render `<Sheet open onOpenChange>` → `<SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md lg:max-w-lg">` (full-screen on mobile via `w-full`, wider on desktop):
  - **Header** (`SheetHeader` padded): `SheetTitle` "Copiloto analítico" + subtitle "Pergunte sobre seus dados" + a discreet "Beta · baseado em regras" badge.
  - **History** (`ScrollArea className="flex-1"` with `role="log" aria-live="polite"`): map `messages` to bubbles — user right-aligned (`bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2`), assistant left with `<AnalyticsAnswerCard answer onSuggestion={(q)=>ask(q)} />`. When `isThinking`, render `<TypingIndicator />` as the last assistant bubble. Auto-scroll to bottom on new messages (`useEffect` + ref). Each message in a semantic `<li>` identifying author for SR.
  - **Empty state** (no messages): a friendly intro + the `suggestionsForRole(role)` as large clickable chips (calls `ask`).
  - **Composer** (footer, `sticky bottom-0`): an `Input` (or `Textarea`) `aria-label="Pergunte ao copiloto"` + send `Button` `aria-label="Enviar pergunta"` (disabled when empty or `isThinking`). `Enter` submits. On submit call `ask(text)` and clear. Above the composer, show 2-3 suggestion chips when there is history too. `pb-[env(safe-area-inset-bottom)]`.
  - On open, focus the input (Radix focus-trap handles the rest; `Escape` closes via Sheet).

- [ ] **Step 2:** Verify build green + tsc-delta + eslint.
- [ ] **Step 3:** Commit:
```bash
git add src/features/analytics-copilot/components/AnalyticsCopilotPanel.tsx
git commit -m "feat(analytics-copilot): add AnalyticsCopilotPanel chat surface (PRD-057)"
```

---

## Task 6: TopBar button + Ctrl+K + barrel

**Files:** Modify `src/features/shell/components/TopBar.tsx`; modify `src/features/analytics-copilot/index.ts`.

- [ ] **Step 1:** Export from `src/features/analytics-copilot/index.ts`: `AnalyticsCopilotPanel`, `useAnalyticsCopilot`. (Keep existing exports.)

- [ ] **Step 2:** In `TopBar.tsx`:
  - Add `const [copilotOpen, setCopilotOpen] = useState(false)`.
  - Gate visibility on the setting: read `usePlatformSettings(storeId)` (storeId from `useCurrentStore`) and treat `settings?.analyticsCopilotEnabled !== false` as enabled (default on). (If reading settings in TopBar is undesirable per existing patterns, default to always-on and leave a TODO — but prefer gating.)
  - In the `ml-auto` cluster, **before** `<NotificationDropdown />`, add (only when enabled):
    ```tsx
    <Button variant="ghost" size="icon" onClick={() => setCopilotOpen(true)} aria-label="Copiloto analítico" title="Copiloto (Ctrl+K)">
      <Icon icon="mdi:robot-happy-outline" size={20} />
    </Button>
    ```
  - Register a `Ctrl+K`/`Cmd+K` global shortcut (mirror `GlobalSearch`'s `useEffect` keydown pattern, but `(e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k"` → `e.preventDefault(); setCopilotOpen(true)`). Do NOT use `/` (collides with GlobalSearch).
  - Render `<AnalyticsCopilotPanel open={copilotOpen} onOpenChange={setCopilotOpen} />` near the end of the TopBar JSX (only when enabled).

- [ ] **Step 3:** Verify build green + `bunx tsc --noEmit 2>&1 | grep TopBar` no new errors + eslint clean.
- [ ] **Step 4:** Commit:
```bash
git add src/features/shell/components/TopBar.tsx src/features/analytics-copilot/index.ts
git commit -m "feat(analytics-copilot): add TopBar entry point + Ctrl+K for the copilot panel (PRD-057)"
```

---

## Task 7: `AnalyticsCopilotConfigPage` (Owner) + route

**Files:** Create `src/features/analytics-copilot/pages/AnalyticsCopilotConfigPage.tsx`; create `src/routes/app.configuracoes.copiloto-analitico.tsx`; export the page from the feature barrel.

- [ ] **Step 1:** Page (follow the `ShippingConfigPage`/`ForecastConfigPage` molde): `useCurrentStore`, `useAuth`, `useCurrentRole`, `hasPermission`, `Forbidden`, `SectionHeader`, `usePlatformSettings`. A single toggle (`Switch` from `@/components/ui/switch` if present, else a checkbox) bound to `settings.analyticsCopilotEnabled` (default true when undefined). Save via `update({ analyticsCopilotEnabled: draft }, "settings.analytics_copilot.update")`. Info banner: "NLU por IA real (LLM) disponível na Fase 2 — atualmente baseado em interpretação por regras sobre o catálogo de métricas." Sticky save/discard footer + `UnsavedChangesDialog`. Owner-only edit (`canEdit = role === "Owner"`).

- [ ] **Step 2:** Route `src/routes/app.configuracoes.copiloto-analitico.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { AnalyticsCopilotConfigPage } from "@/features/analytics-copilot/pages/AnalyticsCopilotConfigPage";

export const Route = createFileRoute("/app/configuracoes/copiloto-analitico")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <AnalyticsCopilotConfigPage />
    </SettingsLayout>
  ),
});
```
- [ ] **Step 3:** Export `AnalyticsCopilotConfigPage` from `src/features/analytics-copilot/index.ts`.
- [ ] **Step 4:** Verify build green (regenerates route tree) + tsc-delta + eslint.
- [ ] **Step 5:** Commit:
```bash
git add src/features/analytics-copilot/pages/AnalyticsCopilotConfigPage.tsx src/routes/app.configuracoes.copiloto-analitico.tsx src/features/analytics-copilot/index.ts src/routeTree.gen.ts
git commit -m "feat(analytics-copilot): add Owner config page + route (PRD-057)"
```

---

## Task 8: Final verification

- [ ] **Step 1:** `bun run build` → green.
- [ ] **Step 2:** `bunx eslint src/features/analytics-copilot src/features/shell/components/TopBar.tsx` → clean.
- [ ] **Step 3:** `bunx tsc --noEmit 2>&1 | grep -E "analytics-copilot|copiloto-analitico|TopBar"` → empty.
- [ ] **Step 4:** `bunx vitest run src/features/analytics-copilot` → core tests still green.
- [ ] **Step 5:** Confirm route tree includes `/app/configuracoes/copiloto-analitico`. Commit any leftover `routeTree.gen.ts`.

## Self-Review (controller)
- TopBar shows the copilot button (when enabled); Ctrl+K opens the Sheet; asking a known question returns value + citation; unknown → honest + suggestions; Vendedor cross-seller → refusal. RNF-001 holds (number from adapter/pure-fns).
- `bun run build` green; eslint clean; zero new tsc errors. Manual UI verification by the user.

## Out of scope
- Cockpit CTA card (TopBar entry suffices for MVP); sparkline mini-visual; persisted sessions; LLM/RAG (Fase 2).
