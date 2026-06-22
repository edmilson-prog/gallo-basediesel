# Copiloto analítico com LLM — Guia de desenvolvimento

> **Versão:** v0.109.0 Lexicon · 2026-06-19
> **Spec de referência:** `docs/superpowers/specs/2026-06-19-analytics-copilot-llm-design.md`
> **Feature:** `src/features/analytics-copilot/`
> **Rota:** `/app/gestao/copiloto`

---

## 1. Visão geral

O Copiloto analítico aceita perguntas em linguagem natural ("qual minha receita este mês?",
"compara peças Volvo com Scania") e responde com cards de métricas calculados sobre os dados
reais. Antes do v0.109.0, a interpretação da pergunta era 100% baseada em regras
(`resolveQuery` + `metricCatalog`). Com o Lexicon, essa interpretação passou a ser feita por
um LLM quando a funcionalidade está ativa em produção, mantendo o cálculo do número
**determinístico** e **isolado da IA**.

---

## 2. Arquitetura — resolver pluggable

A separação central é: **quem escolhe a métrica** vs. **quem calcula o número**.

```
useCopilotChat.ask(question)
   │
   ├─ useAnalyticsResolver()     ← decide qual resolver usar
   │     ├─ mock / LLM off       → rulesResolver (regras, comportamento Pré-Lexicon)
   │     └─ supabase + LLM ativo → llmResolver (Edge analytics-resolve)
   │                                    │ erro / vazio
   │                                    └──► fallback: rulesResolver
   │
   ├─ runCopilotQuery(question, ctx, { dataAccess, catalog, resolver })
   │     resolver(question, ctx, catalog) → IResolvedIntent
   │     para cada IMetricQuery:
   │       scopeClamp  (RBAC, papel do atendente)
   │       executeQuery(dataAccess)   ← NÚMERO REAL, sem LLM
   │     → IAnalyticsAnswer[]        (1 card por métrica resolvida)
   │
   └─ 1 mensagem assistente por answer → N cards em paralelo
```

### Contrato do resolver

```ts
interface IResolvedIntent {
  queries: IMetricQuery[];      // 0+ métricas; period vem do ctx
  ambiguous?: boolean;          // somente no resolvedor de regras
  candidates?: string[];        // metric ids para chips de desambiguação
}

type IQueryResolver = (
  question: string,
  ctx: { period: IGoalPeriod },
  catalog: IMetricDefinition[],
) => Promise<IResolvedIntent>;
```

- **`rulesResolver`** — adapta o `resolveQuery` atual; comportamento idêntico ao pré-Lexicon.
- **`llmResolver`** — chama `aiProvider.resolveAnalyticsQueries` → valida → `{ queries }`.
  Qualquer erro (rede, timeout, JSON inválido, lista vazia) → cai no `rulesResolver` sem
  lançar exceção. O copiloto **nunca para**.

O `runCopilotQuery` aceita `deps.resolver` (opcional; default = `rulesResolver`) e passou a
retornar `IAnalyticsAnswer[]` em vez de um único answer.

---

## 3. Edge `analytics-resolve` (13ª função)

**Arquivo:** `supabase/functions/analytics-resolve/index.ts`
**JWT:** `verify_jwt = true`
**Auth:** `requireAnyCaller` — qualquer atendente autenticado.

### Fluxo interno

1. Verifica `ai_feature_enabled('analytics_copilot')` (master ativo + routing configurado +
   provider disponível). Se falso → `409` (o front cai nas regras).
2. Recebe `{ question, digest }` — ver §4 Privacidade.
3. Resolve provider/model/systemPrompt do routing `analytics_copilot` via `ai_settings`.
4. Chama o adaptador LLM com instrução de resposta em **JSON estrito**; `max_tokens` ~500.
5. **Validação server-side** (defesa em profundidade):
   - `metricId` ∈ catálogo;
   - chaves de `filters` ⊆ `supportedFilters` da métrica **e** ∈ `{marca, categoria}`;
   - `marca` ∈ digest.brands; `categoria` ∈ digest.categories;
   - `comparison` ∈ `{previous_period, previous_year}`;
   - deduplicação por (metricId + filters + comparison); cap de N (padrão: 4).
   - Itens inválidos são descartados silenciosamente; se sobrar lista vazia → `{ queries: [] }`.
6. Grava `ai_usage_events` (`source='routed'`, `feature='analytics_copilot'`; `status='error'`
   quando a chamada ao LLM falha).

Reutiliza `_shared/{serve,http,secrets,auth,ai/adapters}` — não toca `ai-generate` nem
`copilot-generate`.

---

## 4. RNF-001 — números sempre determinísticos

> **"The number always comes from dataAccess; the resolver never produces a number."**

A LLM recebe apenas `{ question, digest }`. O digest contém:
- catálogo de métricas: `{ id, label, description, supportedFilters }[]`
- vocabulário público de marcas (`brands: string[]`) e categorias (`categories: string[]`)

**Nunca são enviados ao provedor:** valores numéricos, receita, nomes de clientes, nomes de
vendedores, dados de pedidos, informações financeiras ou qualquer PII. O `scopeClamp` (RBAC
por papel do atendente) é aplicado **após** o resolve, exatamente como nas regras.

---

## 5. Gating — dois níveis

| Nível | Controle | Efeito se desligado |
|---|---|---|
| Feature existe | `analyticsCopilotEnabled` (platform setting, Owner) | Tela e copiloto inteiros desaparecem |
| LLM ativa | `ai_feature_enabled('analytics_copilot')` | Cai no motor de regras; copiloto segue funcionando |

A LLM só é invocada quando `VITE_DATA_SOURCE=supabase` **e**
`ai_feature_enabled('analytics_copilot')` retorna `true`. No modo mock (Demonstração) o
`aiProvider.resolveAnalyticsQueries` retorna `null` imediatamente → regras.

---

## 6. Multi-card

Uma única pergunta pode resultar em **2+ cards** (ex.: "compara Volvo e Scania" → dois cards,
um por marca). O `llmResolver` retorna `queries` com N itens; o `runCopilotQuery` executa cada
um independentemente e o `useCopilotChat.ask` anexa uma mensagem assistente por answer. O
limite de 4 queries por pergunta é aplicado na validação da Edge.

O resolvedor de regras continua retornando no máximo 1 query (limite do motor de keywords).

---

## 7. Badge de fonte na UI

O `CopilotHeader` exibe:
- `IA` — quando o LLM resolver está ativo (supabase + `ai_feature_enabled` true)
- `BASEADO EM REGRAS` — caso contrário (mock, LLM off, fallback por erro)

A tela de configuração (`/app/configuracoes/copiloto-analitico`, Owner-only) removeu o aviso
"Fase 2 — disponível em breve" após a entrega do Lexicon.

---

## 8. Itens deferidos

| Item | Motivo do diferimento |
|---|---|
| **Narração em prosa** sobre o número | Decisão de NLU-only no v1; LLM só escolhe métrica |
| **Parsing de período livre** ("últimos 3 meses") | Complexidade de ambiguidade; período fixo (mês atual + comparação) por ora |
| **Tool-calling / agente multi-passo** | Aguarda maturidade da camada de agentes |
| **Filtro por vendedor via LLM** | Dado não-público (lista de vendedores); governado pelo `scopeClamp` |
| **Deploy em produção** | Requer autorização expressa do dono (`npx supabase functions deploy analytics-resolve`) |

---

## 9. Rollout

Não há migration nova. A RPC `ai_feature_enabled` e o routing `analytics_copilot` já existem
em produção desde o v0.108.0 Quill. O único passo de produção é:

```bash
npx supabase functions deploy analytics-resolve \
  --project-ref njizaasajkdqptlxddqn
```

Após o deploy, `ai_feature_enabled('analytics_copilot')` já retorna `true` (routing
configurado pelo Owner). Nenhuma chave nova; o provedor é resolvido via `ai_settings` existente.

---

## 10. Testes

Os testes unitários (Vitest) cobrem:
- validador/normalizador da saída JSON da LLM → `IResolvedQuery[]` contra o catálogo;
- builder do `digest` a partir do `metricCatalog` + marcas/categorias;
- `rulesResolver` (envelope de `resolveQuery` → `IResolvedIntent`, incluindo caso ambíguo);
- fallback do `llmResolver` (stub que lança/retorna vazio → regras);
- `runCopilotQuery` multi-answer (2 queries → 2 answers; refused → `refusalAnswer`).

Gate de CI: `bun run build` + `bun run test` verdes.

A Edge `analytics-resolve` é verificada por deploy + e2e (sem unit Deno isolado).
