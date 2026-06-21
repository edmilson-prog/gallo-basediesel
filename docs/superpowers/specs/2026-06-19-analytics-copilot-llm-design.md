# Design — Copiloto analítico com LLM (NLU real)

> **Data:** 2026-06-19
> **Feature key de IA:** `analytics_copilot`
> **Consumidor real de LLM #2** (o #1 foi o copiloto de conversa, v0.108.0 `Quill`)
> **Status:** aprovado (brainstorming) — aguardando revisão da spec

## 1. Contexto

O **Copiloto analítico** (PRD-057, `src/features/analytics-copilot/`, rota `/app/gestao/copiloto`)
é hoje **100% baseado em regras**: o engine puro `resolveQuery` casa *keywords* do
`metricCatalog` para mapear a pergunta em uma `IMetricQuery` (métrica + filtros + comparação),
e o `executeQuery` calcula o **número real** via `IAnalyticsDataAccess` (RNF-001:
*"the number always comes from dataAccess; the resolver never produces a number"*). O
`scopeClamp` aplica o RBAC por papel (Vendedor→próprio, Gestor→loja, Owner→cross-store).
Já há sessões/histórico (`useCopilotSessions`/`sessionStore`).

Limites do resolvedor por regras: só resolve se a pergunta contém uma *keyword* do catálogo;
>1 *keyword* → ambíguo (pede desambiguação); paráfrase/erro de digitação → "não consegui
responder". A própria tela de config (`/app/configuracoes/copiloto-analitico`, Owner-only,
toggle `analyticsCopilotEnabled`) **antecipa** este trabalho com o texto: *"NLU por IA real
(LLM) disponível na Fase 2 — atualmente baseado em interpretação por regras"*.

A camada de IA já está de pé (entregas `Cortex`→`Quill`): Edge `ai-generate`, RPC
`ai_feature_enabled`, `requireAnyCaller`, adapters `_shared/ai/adapters.ts`. Em produção o
routing `analytics_copilot` **já existe e está habilitado** (openai/gpt-5.2) e
`ai_feature_enabled('analytics_copilot')` retorna `true`.

## 2. Escopo

### Entra
- Substituir o resolvedor de intenção por um **resolvedor LLM**: a LLM recebe a pergunta + o
  catálogo de métricas e devolve **uma ou mais** intenções (`metricId` + `filters` +
  `comparison`). Os números continuam vindo do `executeQuery`/`dataAccess`.
- **Multi-métrica:** uma pergunta pode resolver em 2+ métricas → vários cards.
- **Fallback para as regras:** LLM off/erro/teto/JSON inválido → usa `resolveQuery`.
- Nova Edge `analytics-resolve` (13ª), gated, consumível por qualquer atendente.
- Badge `BASEADO EM REGRAS` → `IA` quando a LLM está ativa; atualizar o aviso da tela de config.

### Não entra (deferido)
- Narração/prosa sobre o número (decisão: **NLU-only**).
- Tool-calling/agente multi-passo.
- Parsing de período livre ("últimos 3 meses") — mantém-se **mês atual + comparação**.
- Filtros que exigem dado/PII: **vendedor** continua governado pelo `scopeClamp` (a LLM não
  recebe lista de vendedores). Filtros da LLM no v1 = **marca**, **categoria**, **comparison**
  (vocabulário público, espelha a capacidade atual das regras).
- Resumo/insights automáticos; mudanças no `executeQuery`/`dataAccess`/`scopeClamp`.
- Tocar `copilot-generate`/`ai-generate` (ficam intactos).

## 3. Arquitetura & fluxo de dados

```
useCopilotChat.ask(question)
   │
   ├─ resolver = useAnalyticsResolver()          ← NOVO (decide LLM vs regras + fallback)
   │     ├─ data source mock      → resolver de REGRAS (demo, sem LLM)
   │     └─ data source supabase  → aiProvider.isAiFeatureEnabled('analytics_copilot')?
   │            true  → LLM (Edge analytics-resolve)  ──┐ erro/vazio
   │            false → REGRAS                          └──► fallback: REGRAS
   │
   ├─ runCopilotQuery(question, ctx, { dataAccess, catalog, resolver })
   │     resolver(question, ctx, catalog) → { queries: IMetricQuery[], ambiguous?, candidates? }
   │     para cada query: scopeClamp → executeQuery(dataAccess)   ← número REAL, determinístico
   │     → IAnalyticsAnswer[]            (1 por métrica; ou 1 unresolved/ambiguous)
   │
   └─ append 1 mensagem assistente por answer  → N cards
```

### 3a. Resolver pluggable (núcleo)
Define-se um contrato de resolvedor que `runCopilotQuery` passa a injetar (default = regras),
e que retorna **lista** (multi-métrica) + preserva o caso ambíguo das regras:

```ts
interface IResolvedIntent {
  queries: IMetricQuery[];        // 0+; o resolvedor preenche period a partir de ctx.period
  ambiguous?: boolean;            // só o resolvedor de regras produz
  candidates?: string[];          // metric ids p/ chips de desambiguação
}
type IQueryResolver = (
  question: string,
  ctx: { period: IGoalPeriod },
  catalog: IMetricDefinition[],
) => Promise<IResolvedIntent>;
```

- **Resolvedor de regras** (`rulesResolver`): adapta o `resolveQuery` atual →
  `{ queries: query ? [query] : [], ambiguous, candidates }`. Comportamento idêntico ao de hoje.
- **Resolvedor LLM** (`llmResolver`): chama `aiProvider.resolveAnalyticsQueries` → valida →
  `{ queries }`. Em erro/vazio, **cai no `rulesResolver`** (wrapper em `useAnalyticsResolver`).

`runCopilotQuery` passa a **retornar `IAnalyticsAnswer[]`** (hoje retorna 1):
`queries.length === 0` → `[ambiguous?suggestions : unresolvedAnswer]`; senão, para cada query:
`scopeClamp` (refused → `refusalAnswer`) + `executeQuery`. Nunca lança.

### 3b. Edge `analytics-resolve` (13ª)
`supabase/functions/analytics-resolve/index.ts`, `verify_jwt=true`. Reusa
`_shared/{serve,http,secrets,auth(requireAnyCaller),ai/adapters}` (helpers de budget inline,
como na `copilot-generate`). **Não toca** as edges existentes.

- **Auth/gating:** `requireAnyCaller` (qualquer atendente) → exige `ai_feature_enabled('analytics_copilot')`
  via `ai_settings` (admin) (`master_enabled` + routing habilitado + provider configurado);
  senão `409` (front cai nas regras).
- **Entrada:** `{ question: string, digest: { catalog: Array<{id,label,description,supportedFilters}>, brands: string[], categories: string[] } }`. O digest é montado no front a partir do `metricCatalog` + vocabulário de marcas/categorias — **metadados públicos, sem números nem dados de cliente/vendedor.**
- **LLM:** resolve provider/model/systemPrompt do routing `analytics_copilot`; instrui resposta em **JSON estrito**; `max_tokens` curto (~500). Adapter reusado.
- **Saída:** `{ queries: Array<{ metricId, filters: { marca?, categoria? }, comparison? }> }`.
- **Validação server-side** (defesa em profundidade): `metricId` ∈ catálogo; chaves de `filters` ⊆ `supportedFilters` daquela métrica **e** ∈ {marca, categoria}; `marca` ∈ `brands`; `categoria` ∈ `categories`; `comparison` ∈ {previous_period, previous_year}; **dedupe** por (metricId+filters+comparison); **cap** de N (ex.: 4). Inválidos são descartados; se sobrar vazio → `{ queries: [] }`.
- **Uso:** grava `ai_usage_events` (`source='routed'`, `feature='analytics_copilot'`, tokens/custo/latência/status); `status='error'` quando a chamada ao LLM falha.

### 3c. Frontend
- **`ai` provider** ganha 2 métodos **genéricos** (reutilizáveis por futuros consumidores):
  - `isAiFeatureEnabled(feature: AiFeatureKey): Promise<boolean>` — mock: `false`; supabase: RPC `ai_feature_enabled`.
  - `resolveAnalyticsQueries(question, digest): Promise<IResolvedQuery[] | null>` — mock: `null` (→ regras); supabase: invoke da Edge (erro → lança; o wrapper trata).
  - `IResolvedQuery = { metricId: string; filters: Partial<Record<MetricDimension,string>>; comparison?: ComparisonMode }` (sem period; o chamador injeta).
- **`useAnalyticsResolver()`** (novo adapter na feature): devolve um `IQueryResolver` que decide LLM vs regras e faz o fallback; monta o `digest` a partir do `metricCatalog`/marcas/categorias; **revalida** as queries da LLM contra o `metricCatalog` real antes de montar `IMetricQuery` (período do contexto).
- **`runCopilotQuery`**: `deps.resolver?` (default `rulesResolver`); retorno `IAnalyticsAnswer[]`.
- **`useCopilotChat.ask`**: injeta o resolver; recebe `IAnalyticsAnswer[]`; **anexa 1 mensagem assistente por answer**; auditoria por métrica resolvida (como hoje).
- **UI:** `CopilotHeader` mostra `IA` quando a LLM está ativa (em vez de `BASEADO EM REGRAS`); a tela de config atualiza o aviso "Fase 2".

## 4. Pureza de números & privacidade
RNF-001 **preservado**: a LLM só escolhe métrica/filtros; o valor vem sempre do `dataAccess`.
A LLM recebe **apenas** a pergunta + o digest do catálogo (metadados públicos) — nunca números,
nem dados de cliente/vendedor. O `scopeClamp` (RBAC) roda **depois** do resolve, como hoje.

## 5. Gating (dois níveis, reconciliados)
- `analyticsCopilotEnabled` (platform setting, Owner) = a feature existe (inalterado).
- LLM ativa ⇔ data source `supabase` **e** `ai_feature_enabled('analytics_copilot')`. Caso
  contrário → **regras**. Erro/teto/JSON inválido → **regras**. O copiloto nunca para.

## 6. Erros & degradação
LLM off/erro/timeout/teto/JSON inválido/vazio → cai silenciosamente nas **regras** (sem erro
duro; só perde a "esperteza"). Pergunta fora do catálogo → "não sei" + sugestões (como hoje).
A Edge grava `status='error'` no uso quando a chamada ao LLM falha (telemetria honesta).

## 7. Testes
- **Puros (Vitest):**
  - validador/normalizador da saída JSON da LLM → `IResolvedQuery[]` válidas contra o catálogo
    (descarta metricId/filters/comparison inválidos, dedupe, cap N).
  - builder do `digest` a partir do `metricCatalog` + marcas/categorias.
  - `rulesResolver` (envelope do `resolveQuery` → `IResolvedIntent`, incl. ambíguo).
  - lógica de fallback (`llmResolver` com stub que lança/vazio → cai nas regras).
  - `runCopilotQuery` multi-answer (resolver injetado devolvendo 2 queries → 2 answers; refused → refusalAnswer).
- **Edge:** verificação por deploy + e2e (sem unit Deno).
- Localização do teste do parser/validador puro: mesma estratégia da `Quill` (função pura sem
  imports Deno; co-localizada na Edge com o glob do Vitest já estendido p/ `supabase/functions/**`).
- Gate de CI: `bun run build` + `bun run test` verdes.

## 8. Rollout & versionamento
- **Sem migration** (a RPC `ai_feature_enabled` já existe; o routing `analytics_copilot` já está
  configurado em prod).
- Deploy da Edge `analytics-resolve` (CLI Supabase) — passo de prod **sob autorização do dono**.
- Bump **v0.109.0** com codinome novo em inglês. CHANGELOG + doc de dev (`docs/dev/analytics-copilot-llm.md`).
- Branch/worktree: `worktree-feat+analytics-copilot-llm`, base `origin/main` `bf8845e` (v0.108.0).
- Integração só por **PR** (sem merge sem "ok").

## 9. Decisões resolvidas no brainstorming

| Decisão | Escolha |
|---|---|
| Papel da LLM | Só NLU (escolher métrica/filtros); números determinísticos |
| Multi-métrica | Permitido (vários cards) |
| Fallback | Cai no motor de regras quando LLM off/falha |
| Endpoint | Edge dedicada `analytics-resolve` (não generalizar a `copilot-generate`) |
| Gating | `ai_feature_enabled('analytics_copilot')` + `analyticsCopilotEnabled` |
| Filtros da LLM (v1) | marca, categoria, comparison (vocabulário público) |
| Período | Mês atual + comparação (sem parsing livre) |
| Migration | Nenhuma |
| Privacidade | Só pergunta + digest do catálogo vão ao provedor |
