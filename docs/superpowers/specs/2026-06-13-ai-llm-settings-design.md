# Design — Área de Inteligência Artificial (Provedores LLM, Roteamento & Consumo)

- **Data:** 2026-06-13
- **Status:** Aprovado para planejamento (brainstorming concluído)
- **Feature alvo:** `src/features/ai-settings/`
- **Origem:** brainstorming com o dono do produto (inspirado em dois painéis de referência: gestão de provedores LLM + dashboard de assistente IA), redesenhado para o GALLO.

---

## 1. Contexto e objetivo

Hoje o GALLO **não tem** nenhuma tela para configurar LLMs. O "cérebro" de IA da plataforma (copiloto de conversa, copiloto analítico, SDR, identificação de peça, insights) roda em **lógica de regras/heurística local** — não há integração real com nenhum provedor de LLM, e a própria tela de Copiloto analítico declara que "NLU por IA real (LLM) disponível na Fase 2".

**Objetivo:** entregar uma área Owner-only em `Configurações → Inteligência artificial` para:
1. Gerenciar **provedores LLM** (chave de API, modelo padrão, parâmetros, testar conexão).
2. **Rotear o modelo por funcionalidade** (cada cérebro de IA aponta para um provedor/modelo específico) com **fallback**.
3. Visualizar **consumo e budget** (KPIs/métricas avançadas).

Tudo seguindo o padrão **mock-first** do GALLO (Provider Pattern), de modo que o cutover para Supabase e a integração real de LLM sejam uma fase posterior, sem retrabalho de UI.

## 2. Decisões do brainstorming

| Tema | Decisão |
|------|---------|
| Escopo | Painel + fundação (mock-first). **Não** inclui chamada real de LLM nesta rodada. |
| Estrutura de navegação | **Hub com abas internas** (opção B): um item na sidebar abre uma página com abas. |
| Acesso (RBAC) | **Owner-only** (rota + sidebar). |
| Multi-loja | **Global** da plataforma (sem `storeId` na config nem no usage, no MVP). |
| Provedores | **Anthropic, OpenAI, OpenRouter, Google**. |
| Recurso central | **Roteamento de modelo por funcionalidade** + cadeia de **fallback**. |
| Arquitetura de dados | **Provider novo `ai` + chaves no Vault + engine puro testável** (opção C). |
| Prompts de sistema | **Embutidos na aba Funcionalidades** (cada funcionalidade expande e edita seu prompt), sem aba própria. |

## 3. Arquitetura e estrutura de pastas

Segue o padrão feature-driven + Provider Pattern do projeto.

```
src/features/ai-settings/
├── pages/
│   ├── AiSettingsPage.tsx          # hub: header + master switch + abas (lê ?aba=)
│   ├── AiOverviewTab.tsx           # aba Visão geral (KPIs + charts)
│   ├── AiProvidersTab.tsx          # aba Provedores & chaves
│   ├── AiFeaturesTab.tsx           # aba Funcionalidades (roteamento + prompt)
│   └── AiPlaygroundTab.tsx         # aba Playground
├── components/
│   ├── AiMasterSwitch.tsx
│   ├── KpiCard.tsx                 # card de métrica (label + valor + delta)
│   ├── ConsumptionAreaChart.tsx    # recharts
│   ├── ProviderShareDonut.tsx      # recharts
│   ├── CostByFeatureBars.tsx       # recharts
│   ├── ProviderCard.tsx            # provedor + chave (Vault) + modelo + testar conexão
│   ├── FeatureRoutingRow.tsx       # funcionalidade: provider/model/fallback/params/prompt
│   └── BudgetAlert.tsx
├── hooks/
│   ├── useAiSettings.ts            # carrega IAiSettings via provider
│   └── useAiUsage.ts               # carrega IAiUsageSummary (período)
├── engine/                         # PURO, testado com Vitest
│   ├── aiPricing.ts (+ .test.ts)
│   ├── aiUsage.ts   (+ .test.ts)
│   ├── aiBudget.ts  (+ .test.ts)
│   └── aiRouting.ts (+ .test.ts)
├── i18n/pt-BR.ts
└── index.ts                        # barrel

src/providers/data/
├── contracts/ai.ts                 # IAiProvider
├── impl/mock/ai.ts                 # MockAiProvider (determinístico)
├── impl/supabase/ai.ts             # stub (cutover posterior)
└── (factory.ts, context.tsx, hooks/useAiProvider.ts) → registra o 37º provider

src/shared/types/ai.ts              # tipos de domínio (+ barrel em index.ts)
src/routes/app.configuracoes.ia.tsx # rota Owner-only, abas por ?aba=
```

- **Rota:** `app.configuracoes.ia.tsx` com `beforeLoad: requireAuth(location.pathname, ["Owner"])`. As abas são controladas por **query param** `?aba=visao-geral|provedores|funcionalidades|playground` (deep-link sem inflar `routeTree.gen.ts`).
- **Sidebar:** novo item em `SETTINGS_GROUPS` (grupo *Integrações*) no [SettingsLayout.tsx](src/features/shell/layouts/SettingsLayout.tsx): `{ label: "Inteligência artificial", icon: "mdi:robot-happy-outline", to: "/app/configuracoes/ia", roles: ["Owner"] }`.
- **Fronteiras ESLint:** features acessam só via `@/providers/data`; tipos via `@/shared/types`. Sem import de `@/mocks`.

## 4. Modelo de dados (`src/shared/types/ai.ts`)

```ts
export type AiProviderId = "anthropic" | "openai" | "openrouter" | "google";

export type AiFeatureKey =
  | "conversation_copilot"
  | "analytics_copilot"
  | "sdr"
  | "part_identification"
  | "insights";

export interface IAiModelOption {
  id: string;            // ex.: "claude-opus-4-8"
  label: string;         // ex.: "Claude Opus 4.8"
  inputPricePer1kUsd: number;    // preço de entrada por 1k tokens, em USD
  outputPricePer1kUsd: number;   // preço de saída por 1k tokens, em USD
}

export interface IAiProviderConfig {
  provider: AiProviderId;
  enabled: boolean;
  defaultModel: string;             // id de IAiModelOption
  models: IAiModelOption[];
  credentialsRef: string;           // nome do secret no Vault (ex.: "ANTHROPIC_API_KEY")
  status: "configured" | "not_configured" | "error";
  lastTestedAt?: ISO8601;
  lastTestResult?: "ok" | "error";
}

export interface IAiGenerationParams {
  temperature: number;   // 0..2
  maxTokens: number;
  topP?: number;
}

export interface IAiFeatureRouting {
  feature: AiFeatureKey;
  enabled: boolean;
  providerId: AiProviderId;
  model: string;
  fallbackProviderId?: AiProviderId;
  fallbackModel?: string;
  params: IAiGenerationParams;
  systemPrompt: string;
  monthlyBudgetCapBRL?: number;     // teto opcional por funcionalidade
}

export interface IAiBudget {
  monthlyCapBRL: number;
  alertThresholdPct: number;        // ex.: 80 → alerta aos 80%
  usdToBrl: number;                 // câmbio configurável p/ converter preços USD → BRL
}

export interface IAiSettings {
  masterEnabled: boolean;
  defaultProviderId: AiProviderId;
  budget: IAiBudget;
  providers: IAiProviderConfig[];
  routing: IAiFeatureRouting[];
}

export type AiUsageStatus = "ok" | "error" | "fallback";

export interface IAiUsageEvent {
  id: ID;
  ts: ISO8601;
  feature: AiFeatureKey;
  providerId: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costBRL: number;
  latencyMs: number;
  status: AiUsageStatus;
}

// Derivado pelo engine (não persistido)
export interface IAiUsageSummary {
  period: "current_month" | "last_7d" | "last_30d";
  calls: number;
  tokens: number;
  costBRL: number;
  budgetPct: number;
  projectionBRL: number;            // run-rate até o fim do mês
  avgTokensPerCall: number;
  avgLatencyMs: number;
  errorRate: number;                // 0..1
  fallbackRate: number;             // 0..1
  byProvider: Array<{ providerId: AiProviderId; calls: number; tokens: number; costBRL: number }>;
  byFeature: Array<{ feature: AiFeatureKey; calls: number; costBRL: number; growthPct: number }>;
  series: Array<{ date: ISO8601; calls: number; tokens: number; costBRL: number }>;
}
```

## 5. Contrato do provider (`IAiProvider`)

```ts
export interface IAiProvider {
  getSettings(): Promise<IAiSettings>;
  setMasterEnabled(enabled: boolean): Promise<void>;
  setDefaultProvider(providerId: AiProviderId): Promise<void>;
  updateBudget(patch: Partial<IAiBudget>): Promise<IAiBudget>;
  updateProviderConfig(providerId: AiProviderId, patch: Partial<IAiProviderConfig>): Promise<IAiProviderConfig>;
  testConnection(providerId: AiProviderId): Promise<{ ok: boolean; latencyMs: number; message: string }>;
  updateFeatureRouting(feature: AiFeatureKey, patch: Partial<IAiFeatureRouting>): Promise<IAiFeatureRouting>;
  getUsageSummary(period: IAiUsageSummary["period"]): Promise<IAiUsageSummary>;
  listUsageEvents?(filter?: { feature?: AiFeatureKey; providerId?: AiProviderId }): Promise<IAiUsageEvent[]>;
  runPlayground(input: {
    providerId: AiProviderId; model: string; params: IAiGenerationParams; prompt: string;
  }): Promise<{ text: string; inputTokens: number; outputTokens: number; costBRL: number; latencyMs: number }>;
}
```

- **Chaves NÃO passam pelo provider.** O segredo é gravado via a Edge `integration-secrets` existente (write-only, Vault). O provider só conhece `credentialsRef` e `status`.
- **Mock (`MockAiProvider`):** config inicial determinística (3 provedores configurados, Google não-configurado); `getUsageSummary`/`listUsageEvents` derivam de eventos gerados por seed (`seedrandom`) processados pelo **engine** (mesma lógica que o Supabase usará); `testConnection`/`runPlayground` simulam latência e resposta canned. Mutações persistem no `mockStore` (Zustand) na sessão.
- **Supabase (stub):** lança `NotImplementedError` até a fase de cutover; documentado.

## 6. Telas (hub com abas)

Página `AiSettingsPage`: header com título + subtítulo + **master switch global** (`masterEnabled`) à direita; barra de abas; conteúdo da aba ativa (lê/escreve `?aba=`). Mockup navegável de referência: `ia-area-hub-v1.html` (estrutura B aprovada).

### 6.1 Visão geral (`AiOverviewTab`)
- **KPI cards:** Chamadas · Tokens · Custo est. (R$) · Budget mensal (% + barra), com delta vs. período anterior.
- **Métricas avançadas:** projeção de gasto (run-rate), alerta de budget, tokens médios/chamada, taxa de erro, taxa de fallback, latência média.
- **Charts (recharts):** série 30d alternável (chamadas/tokens/custo) · donut por provedor · barras de custo por funcionalidade · top funcionalidade por crescimento.
- **Filtro de período** (mês atual / 7d / 30d) e **tabela alternativa** aos gráficos (acessibilidade).

### 6.2 Provedores & chaves (`AiProvidersTab`)
- Seletor de **provedor padrão** global + botão Salvar.
- 4 `ProviderCard` (Anthropic, OpenAI, OpenRouter, Google): badge de status, **chave de API write-only via Vault** (reusa o fluxo de `KeyRow`/`integration-secrets`), modelo padrão, preço por 1k, botão **Testar conexão** + "último teste".

### 6.3 Funcionalidades (`AiFeaturesTab`)
- Nota explicando o roteamento + fallback.
- Uma `FeatureRoutingRow` por funcionalidade (Copiloto de conversa, Copiloto analítico, SDR, Identificação de peça, Insights): toggle on/off · select de provider · select de model · **fallback** (provider+model) · custo do mês · expandir → **parâmetros** (temperatura, maxTokens) e **prompt de sistema** editável.

### 6.4 Playground (`AiPlaygroundTab`)
- Seletor provider/model + temperatura · textarea de prompt · botão Executar · área de resposta + métricas (tokens in/out, custo, latência). No MVP, resposta/métricas simuladas (mock).

## 7. Roteamento + fallback (`engine/aiRouting.ts`)

- `resolveEffectiveModel(settings, feature)` → `{ providerId, model, params, systemPrompt } | null`. Retorna `null` (IA desligada → comportamento por regras atual) quando `!settings.masterEnabled` ou a funcionalidade está `enabled: false`.
- **Fallback:** se o provedor primário está indisponível (`status !== "configured"` ou erro ou budget estourado), resolve para `fallbackProviderId`/`fallbackModel`. Espelha o conceito de failover já usado em `supabase/functions/_shared/whatsapp/failover.ts`.
- **Budget gate:** se o teto da funcionalidade (`monthlyBudgetCapBRL`) ou o global (`budget.monthlyCapBRL`) foi atingido → sinaliza alerta e usa fallback. Função pura, testada.

## 8. KPIs & métricas (`engine/aiUsage.ts`, `engine/aiBudget.ts`)

- `summarizeUsage(events, period, settings)` → `IAiUsageSummary` (calls, tokens, cost, byProvider, byFeature com growthPct, series, avgTokensPerCall, avgLatencyMs, errorRate, fallbackRate).
- `projectMonthlySpend(events, now)` → run-rate de gasto até o fim do mês.
- `budgetStatus(summary, budget)` → `{ pct, projectionPct, level: "ok" | "warning" | "critical" }`.
- `costOf(tokens, modelPricing, usdToBrl)` em `engine/aiPricing.ts` — calcula em USD e converte para BRL pelo câmbio de `IAiBudget.usdToBrl`.

## 9. Chaves no Vault

Estende o catálogo em [integrationKeys.ts](src/features/admin-settings/engine/integrationKeys.ts) com um grupo **"Provedores LLM"**:

| Secret name | Provedor |
|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENAI_API_KEY` | OpenAI |
| `OPENROUTER_API_KEY` | OpenRouter |
| `GOOGLE_AI_API_KEY` | Google |

- Write-only, mascarada, "configurada em <data>", via Edge `integration-secrets` (já existente). Status "Configurado" deriva da presença do secret (no modo `supabase`); no modo mock, do flag do `MockAiProvider`.
- Os nomes seguem `SECRET_NAME_PATTERN` (`/^[A-Z][A-Z0-9_]{2,64}$/`).

## 10. Engine puro + testes (TDD com Vitest)

Todos os arquivos de `engine/` são puros (sem I/O) e acompanham `*.test.ts`. O mock gera eventos determinísticos (`seedrandom`) e os processa pelo **mesmo** engine que o Supabase usará — garantindo paridade mock↔real.

## 11. RBAC, multistore, estados, acessibilidade

- **RBAC:** Owner-only na rota (`requireAuth(..., ["Owner"])`) e no item da sidebar (`roles: ["Owner"]`). Demais papéis nem veem o item.
- **Modo demonstração:** banner igual ao de `IntegrationKeysPage` quando `getActiveDataSource() !== "supabase"`; edição de chaves só em `supabase`.
- **Multistore:** global (sem `storeId`).
- **Estados:** skeleton no load · empty state com ação ("nenhum consumo ainda — configure um provedor") · erro com retry · botões async com `disabled`+spinner.
- **UX/a11y:** segue `docs/dev/ux-guidelines.md` (header glass, tokens semânticos); `aria-label` em botões de ícone; contraste 4.5:1; cor nunca é único indicador (badge = ícone+texto); tabela alternativa aos charts; `prefers-reduced-motion`.

## 12. Escopo MVP × deferido

**Entra agora (MVP):**
- As 4 abas 100% funcionais sobre o `MockAiProvider`.
- Config persistida via provider (mock = Zustand na sessão).
- **Chaves reais no Vault** (fluxo já real via `integration-secrets`).
- `engine/` puro + testes.
- "Testar conexão" e Playground **simulados** (mock).

**Deferido (fase seguinte, gated por decisão):**
- Edge Function proxy `ai-generate` (lê chave do Vault → chama o LLM real → grava `IAiUsageEvent`).
- Tabelas Supabase reais (`ai_provider_config`, `ai_feature_routing`, `ai_usage_events`) + RPCs agregadas (scoped) + RLS; espelhadas em `supabase/migrations/`.
- Plugar os consumidores reais (copiloto de conversa/analítico, SDR, identificação de peça, insights) ao `resolveEffectiveModel`.
- "Testar conexão"/Playground reais (dependem da Edge proxy).

## 13. Riscos e considerações em aberto

- **Câmbio USD→BRL:** preços de modelo são guardados em **USD por 1k tokens** (`IAiModelOption`) e convertidos para **R$** via `IAiBudget.usdToBrl` no `engine/aiPricing.ts`. A taxa é editável; no MVP vem com um default razoável no mock. (Decisão já refletida nos tipos.)
- **Catálogo de modelos:** no MVP, lista curada estática por provedor (mock). OpenRouter expõe centenas de modelos — no MVP, um subconjunto curado; busca dinâmica fica para a fase real.
- **`testConnection` no modo supabase (pré-Edge proxy):** retorna stub "indisponível em demonstração/aguardando integração" até a Edge existir — não quebra a UI.
- **Versionamento:** feature nova → bump MINOR com codinome (seguir CHANGELOG/`versionamento`), ao concluir.
- **Provider count:** passa de 36 → **37 providers**; atualizar referências em CLAUDE.md ao final.

## 14. Referências (arquivos do projeto)

- Sidebar de Configurações: `src/features/shell/layouts/SettingsLayout.tsx`
- Padrão de chave write-only/Vault: `src/features/admin-settings/pages/IntegrationKeysPage.tsx`, `src/features/admin-settings/engine/integrationKeys.ts`, `src/features/admin-settings/api/integrationSecrets.ts`
- Padrão de tela de config (settings + unsaved + permissões): `src/features/analytics-copilot/pages/AnalyticsCopilotConfigPage.tsx`, `src/features/admin-settings/hooks/usePlatformSettings.ts`
- Conceito de failover: `supabase/functions/_shared/whatsapp/failover.ts`
- Provider Pattern: `src/providers/data/factory.ts`, `src/providers/data/contracts/`
- Mockup navegável de referência (estrutura B aprovada): `.superpowers/brainstorm/` (sessão de brainstorming, gitignored) → `content/ia-area-hub-v1.html`
