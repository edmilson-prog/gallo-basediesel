# Spec — Integração LLM real (Sub-projeto 1: Fundação + Edge proxy)

- **Data:** 2026-06-17
- **Status:** Design aprovado (verbal) — aguardando revisão da spec escrita
- **Épico:** Integração real de LLM da área *Configurações → Inteligência artificial* (hoje mock-first, gated p/ Demonstração — v0.100.0 `Synapse`).
- **Sub-projeto:** 1 de N. Entrega a **fundação** que faz a área funcionar em **produção** (Supabase). Os **consumidores** (copiloto de conversa, copiloto analítico, SDR, identificação de peça, insights) ficam **deferidos** para sub-projetos seguintes, um a um.
- **Predecessores:** `docs/superpowers/specs/2026-06-13-ai-llm-settings-*` (a fundação mock-first já entregue).

---

## 1. Contexto e objetivo

A área de IA foi entregue mock-first e **gated para o modo Demonstração**: o `supabaseAiProvider` é 100% stub (`NotImplementedError` em 10 métodos), então em produção a rota redireciona e o item some da sidebar. Este sub-projeto remove esse gate **com segurança**, implementando a infraestrutura mínima para a área operar de verdade:

1. Persistência real das configurações de IA e do histórico de uso (2 tabelas Supabase + RLS).
2. Um **Edge proxy** (`ai-generate`) que faz a chamada real ao LLM com a chave do Vault, mede tokens/custo/latência, aplica o teto de orçamento e grava o evento de uso.
3. O **`supabaseAiProvider`** real (substitui o stub) — CRUD de settings via cliente direto (RLS) + Playground/testar-conexão via Edge.
4. O **Playground** e o **testar conexão** passam a chamar o LLM de verdade.
5. **Remoção do gate demo** — a área aparece para o Owner em produção.

**Resultado:** a área de IA funciona 100% em produção. O Owner configura chaves, testa conexão, usa o Playground com Claude/OpenRouter reais e vê consumo/custo medidos e protegidos por teto. Nenhum consumidor (copiloto/SDR/etc.) é religado neste sub-projeto.

### Não-objetivos (deferidos)
- Religar os consumidores reais ao LLM (cada um vira um sub-projeto).
- PII scrub / redaction server-side antes do envio ao LLM.
- Teto de orçamento atômico (advisory lock / contador) — só necessário quando consumidores automáticos dispararem sem humano no loop.
- Streaming de resposta.
- Adaptadores OpenAI e Google (ficam visíveis como "adaptador em breve").

---

## 2. Decisões (já tomadas)

| # | Decisão | Valor |
|---|---------|-------|
| D1 | Cobertura de provedores no v1 | **Anthropic + OpenRouter** (2 adaptadores). OpenAI/Google visíveis porém desabilitados ("adaptador em breve"). |
| D2 | Teto de orçamento | **Teto rígido global**, *best-effort* no v1 (checagem `SUM(cost_brl)` não-atômica + botão desabilitado em voo). Endurecer antes de plugar consumidores. |
| D3 | Escopo de `ai_settings` | **Singleton global** (1 linha; sentinela `id=1`). A IA é o "cérebro" da plataforma — orçamento, chaves (Vault, já globais) e roteamento são únicos, não por loja. |
| D4 | CRUD de settings | Cliente Supabase **direto** (RLS Owner), no padrão `stores.settings`/`sdr_sessions`. Só geração/teste/gravação-de-uso passam pelo Edge. |
| D5 | Catálogo de modelos/preços | Extraído de `mock/_aiSeed.ts` para `src/providers/data/engine/aiCatalog.ts` (módulo compartilhado, fora de `mock/`). Verdade de **preço em runtime = coluna persistida** `ai_settings.providers[].models`. |

---

## 3. Modelo de dados (2 tabelas novas)

Migrations versionadas em `supabase/migrations/` (formato `YYYYMMDDhhmmss_*.sql`), **aplicadas via MCP `apply_migration` e espelhadas no Git no mesmo PR** (regra do projeto). RLS owner-only no padrão canônico `(select public.current_app_role()) = 'owner'`.

### 3.1 `ai_settings` — singleton global

```sql
create table if not exists public.ai_settings (
  id                  smallint primary key default 1 check (id = 1), -- singleton sentinel
  master_enabled      boolean not null default false,
  default_provider_id text    not null default 'anthropic',
  budget              jsonb   not null,  -- { monthlyCapBRL, alertThresholdPct, usdToBrl }
  providers           jsonb   not null,  -- IAiProviderConfig[] (inclui models[] + preços + credentialsRef + status)
  routing             jsonb   not null,  -- IAiFeatureRouting[]
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);

alter table public.ai_settings enable row level security;

-- Owner lê e escreve a única linha.
create policy "ai_settings_owner_read" on public.ai_settings
  for select to authenticated
  using ((select public.current_app_role()) = 'owner');
create policy "ai_settings_owner_write" on public.ai_settings
  for all to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');

comment on table public.ai_settings is
  'Configuração global de IA (singleton id=1). Owner-only. Chaves de API NÃO vivem aqui — ficam no Vault.';
```

- **Singleton garantido por schema** (`id=1` + `check`), não por convenção. O semeio usa `insert ... on conflict (id) do nothing` (sem corrida de 2 linhas).
- `master_enabled` **default `false`** em produção (não auto-liga gasto).

### 3.2 `ai_usage_events` — histórico de uso (append-only)

```sql
create table if not exists public.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  source        text not null check (source in ('playground','routed')),
  feature       text,                       -- AiFeatureKey quando source='routed'; null no playground
  provider_id   text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_brl      numeric(12,4) not null default 0,
  latency_ms    integer not null default 0,
  status        text not null check (status in ('ok','error','fallback')),
  caller_id     uuid references auth.users(id),
  store_id      uuid references public.stores(id),  -- atribuição futura; null permitido
  created_at    timestamptz not null default now()
);

alter table public.ai_usage_events enable row level security;

-- Owner lê tudo. INSERT só pelo service_role (Edge) — sem policy de escrita p/ authenticated.
create policy "ai_usage_events_owner_read" on public.ai_usage_events
  for select to authenticated
  using ((select public.current_app_role()) = 'owner');

create index if not exists idx_ai_usage_events_ts on public.ai_usage_events (ts desc);
create index if not exists idx_ai_usage_events_feature on public.ai_usage_events (feature) where feature is not null;

comment on table public.ai_usage_events is
  'Append-only. Uma linha por chamada real ao LLM. INSERT exclusivamente pelo service_role (Edge ai-generate).';
```

- **Sem policy de INSERT/UPDATE/DELETE** para `authenticated` → escrita só pelo service_role (Edge), espelhando `integration_logs`.
- `idx_ts` serve a soma mensal do teto. `idx_feature` parcial serve o agrupamento por funcionalidade.

---

## 4. Catálogo compartilhado e mudanças de tipo

### 4.1 Extração do catálogo
Mover `MODELS`, `CREDENTIALS_REF`, `FEATURES`, `modelsFor()`, `buildDefaultAiSettings()` de `src/providers/data/impl/mock/_aiSeed.ts` para **`src/providers/data/engine/aiCatalog.ts`** (novo, fora de `mock/`). `_aiSeed.ts` passa a re-exportar/usar o módulo engine (mantém `seedUsageEvents` no mock, que é dado fictício). O `supabaseAiProvider` importa o catálogo do engine para semear o default — sem violar PRD-005 (o mock continua privado).

- **`buildDefaultAiSettings(env: "mock" | "supabase")`**: em `mock` mantém o comportamento atual (`masterEnabled: true`, provedores `configured`); em `supabase` retorna `masterEnabled: false`, **todos os provedores `not_configured`**. Unidade de preço (`inputPricePer1kUsd`) **inalterada** — fonte única de número.
- Teste de sanidade: toda chave de `AiFeatureKey` está em `FEATURES`; faixas de preço plausíveis (guarda contra erro de 1000× ao confundir /1k com /MTok).

### 4.2 `IAiUsageEvent` ganha `source` e `feature` opcional
```ts
export interface IAiUsageEvent {
  id: ID;
  ts: ISO8601;
  source: "playground" | "routed"; // NOVO
  feature?: AiFeatureKey;           // agora OPCIONAL (playground não tem feature)
  providerId: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costBRL: number;
  latencyMs: number;
  status: AiUsageStatus;
}
```
- `seedUsageEvents` (mock) passa a setar `source: "routed"` em todos os eventos semeados (mantém `byFeature` populado na demo).
- **`engine/aiUsage.ts` (summarizeUsage)**: filtrar `if (!e.feature) continue;` nos loops de `byFeature` e `prevCostByFeature` (eventos `source='playground'` entram nos totais/custo/teto, mas **não** poluem o "Custo por funcionalidade"). Adicionar teste com eventos sem feature.

---

## 5. Edge Function `ai-generate` (a 11ª)

`supabase/functions/ai-generate/index.ts`, no esqueleto padrão: `servePost` + `requireCaller(req, ["owner"])` + `createSecretResolver(admin)`. Deploy por CLI (`supabase functions deploy ai-generate --project-ref njizaasajkdqptlxddqn`).

### 5.1 Contrato
```
POST /functions/v1/ai-generate
Authorization: Bearer <jwt do Owner>
Body: { mode: "generate" | "test", providerId, model, params?, prompt?, systemPrompt? }
```

**`mode: "generate"`** → `{ text, inputTokens, outputTokens, costBRL, latencyMs }`
**`mode: "test"`** → `{ ok, latencyMs, message }`

### 5.2 Fluxo `generate`
1. `requireCaller(req, ["owner"])` (defesa em profundidade sobre o `verify_jwt`).
2. **Validação/limites**: `prompt.length <= MAX_PROMPT_LENGTH` (≈ 50.000 chars), `params.maxTokens` capado server-side (ex. ≤ 4096), `temperature ∈ [0,2]`. Fora → `400`.
3. Carrega `ai_settings` (linha única) via `admin`.
4. **Adaptador habilitado?** Só `anthropic`/`openrouter` no v1; outro → `400 PROVIDER_UNSUPPORTED` ("adaptador em breve").
5. **Teto rígido (best-effort)**: `SUM(cost_brl)` do mês corrente (UTC) em `ai_usage_events`; `>= budget.monthlyCapBRL` → `402 BUDGET_EXCEEDED`. *(Race conhecida — ver §9.)*
6. **Chave** via `createSecretResolver` (`ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`). Ausente → `400 KEY_MISSING` (nunca chamar o provedor sem auth).
7. **Chamada ao adaptador** com `AbortSignal.timeout(LLM_TIMEOUT_MS ≈ 60s)`:
   - **Anthropic**: `POST https://api.anthropic.com/v1/messages` (header `anthropic-version` pinada), `system`+`messages`, `max_tokens`, `temperature`. Custo = `usage.input_tokens/output_tokens` × **preço da linha persistida** × `usdToBrl`.
   - **OpenRouter**: `POST https://openrouter.ai/api/v1/chat/completions` com **usage accounting habilitado**; custo = **`usage.cost` real (USD)** × `usdToBrl`. Fallback (se `cost` ausente): tokens × preço da linha + flag de imprecisão no log. **`model='auto'` não é oferecido no Playground no v1** (preço indeterminado).
   - **Model fora do catálogo**: **nunca** cair em `list[0]`. Usar o custo real do provedor (OpenRouter) ou registrar com custo conservador + log; nunca `cost_brl = 0` silencioso.
   - **Timeout/erro de rede** (`AbortError`): grava `ai_usage_events` `status='error'` com `latency_ms` medido e retorna `504 LLM_TIMEOUT`.
8. **Grava `ai_usage_events`** (`source='playground'`, `feature=null`, `caller_id`, `store_id` do profile, custo/tokens/latência/status) via `admin`.
9. Retorna `{ text, inputTokens, outputTokens, costBRL, latencyMs }`.

### 5.3 Fluxo `test`
- Ping mínimo (1 token / `max_tokens: 1`) ao `defaultModel` do provedor.
- **Bloqueado se o teto já estourou** (`402`), para o teste não furar o orçamento.
- **Não grava** `ai_usage_events` (custo desprezível; evita poluir métricas), mas respeita o limite de tamanho e a resolução de chave.
- Retorna `{ ok, latencyMs, message }` (mensagem amigável de sucesso/erro de credencial).

### 5.4 Adaptadores
Submódulo `supabase/functions/_shared/ai/` (ou `ai-generate/adapters.ts`) com uma interface fina `LlmAdapter` e 2 implementações (Anthropic, OpenRouter). Runtime Deno, só Web APIs. O Edge **não** tem tabela de preço própria — preço vem da linha persistida (sem drift, sem script de sync).

---

## 6. `supabaseAiProvider` (substitui o stub)

`src/providers/data/impl/supabase/ai.ts` — implementa os 10 métodos de `IAiProvider`.

- **`getSettings()`**: lê a linha `id=1`. Se não existir → `insert ... on conflict (id) do nothing` com `buildDefaultAiSettings("supabase")`, relê e retorna. **Defensivo**: nunca estoura por linha ausente (semeia). Mapper `rowToSettings`/`settingsPatchToRow` (snake_case↔`I*`, jsonb direto).
- **`setMasterEnabled` / `setDefaultProvider` / `updateBudget` / `updateProviderConfig` / `updateFeatureRouting`**: read-merge-in-app-write (padrão `settings.update`), `update ... where id=1`. `updateProviderConfig`/`updateFeatureRouting` fazem merge no item do array jsonb. Auditoria fire-and-forget (`recordAuditLog`).
- **`testConnection(providerId)`**: `functions.invoke('ai-generate', { body: { mode: 'test', providerId, model: defaultModel } })`; `extractFunctionError` no erro.
- **`getUsageSummary(period)` / `listUsageEvents()`**: `select` em `ai_usage_events` (RLS Owner) ordenado por `ts`; agrega **client-side reusando `summarizeUsage`** (sem RPC nova — volume baixo no v1).
- **`runPlayground(input)`**: `functions.invoke('ai-generate', { body: { mode: 'generate', ...input } })`.

> `updateProviderConfig` ao salvar `status`/`lastTestResult` é o ponto onde "salvar chave + testar conexão OK" reflete `configured`.

---

## 7. Frontend

- **Playground real**: `useAiSettings`/`runPlayground` já existem; só passam a bater no Edge. Endurecer o estado-zero (§8): desabilitar "Executar" quando o provedor selecionado não está `configured`; inicializar o `select` no **primeiro provedor configurado** (não no `claude-opus-4-8` hardcoded); empty-state "Configure uma chave em *Provedores & chaves*". OpenRouter `auto` fora da lista no v1.
- **Banner LGPD** (Playground + topo da área): aviso curto de que o conteúdo enviado vai para o provedor externo selecionado; recomendação de **não** usar OpenRouter para dado sensível de cliente (sub-processadores opacos). Prompt default do Playground neutro (sem sugerir colar conversa real de cliente).
- **Remoção do gate** (em sincronia, §8):
  - `SettingsLayout.tsx:180` — remover `demoOnly: true` do item "Inteligência artificial".
  - `app.configuracoes.ia.tsx:24-31` — remover o `if (getActiveDataSource() !== 'mock') throw redirect(...)`. Mantém o `requireAuth(location.pathname, ['Owner'])`.
- Em modo **mock** a área segue 100% no provider mock (inalterada). Em **supabase**, usa o provider real + Edge.

---

## 8. Rollout / ordem de deploy (crítico)

A remoção do gate **só pode mergear depois** que o backend está em produção, senão a área quebra (relation/Edge inexistente). O override de ambiente em runtime (`gallo-data-source-override`) agrava — qualquer Owner que flipou o browser para supabase veria a área quebrada.

**Sequência obrigatória:**
1. Migration aplicada em prod (MCP `apply_migration`) **+ espelhada** em `supabase/migrations/` no PR.
2. Chaves `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` no Vault (o Owner grava em *Chaves & API* — caminho já existe).
3. Deploy do Edge `ai-generate` por CLI.
4. **Só então** mergear o front (provider real + remoção do gate + Playground real).
5. `getSettings` defensivo (semeia default) cobre o intervalo entre (1) e (4).

---

## 9. Riscos aceitos no v1 (com mitigação documentada)

| Sev | Risco | Postura no v1 |
|-----|-------|---------------|
| Alta | **Teto não-atômico (TOCTOU)** — `SUM` read-then-write; 2 Playgrounds em paralelo furam o teto. | Aceito *best-effort*: humano no loop + botão desabilitado em voo. **Endurecer (advisory lock por (mês) ou contador `UPDATE ... RETURNING`) é pré-requisito antes de religar consumidores automáticos.** |
| Alta | **LGPD** — dado sai p/ LLM externo. | Consumidores deferidos ⇒ exposição real adiada. v1: banner explícito + recomendação anti-OpenRouter p/ dado de cliente + prompt default neutro. PII scrub fica p/ o sub-projeto que religa o 1º consumidor. |
| Média | **`testConnection` custa e não respeita teto.** | Ping de 1 token, **bloqueado quando o teto estourou**. Rate-limit fica deferido (Owner-only já limita). |
| Média | **Sem rate-limit no `ai-generate`.** | Owner-only + `MAX_PROMPT_LENGTH` + cap de `maxTokens`. Rate-limit por caller fica p/ a fase de consumidores. |
| Baixa | **Divergência de papel** front (`'Owner'` PascalCase em `requireAuth`) × Edge (`'owner'` base_role). | Já existe p/ *Chaves & API*. Documentar: AI/Chaves exigem o papel-base owner (papel "Dono"). Padronizar p/ base_role fica deferido. |

---

## 10. Testes
- **Engines puros** (Vitest): `summarizeUsage` com eventos sem `feature` (não poluir byFeature); sanidade do catálogo (toda `AiFeatureKey` em `FEATURES`; faixas de preço); `costOfTokens` (já existe).
- **Mappers** do `supabaseAiProvider` (`rowToSettings`/`settingsPatchToRow`) — puros, testáveis.
- **Predicado de teto** (`isOverBudget(spentBRL, capBRL)`) — puro.
- Adaptadores do Edge (HTTP) — cobertos por smoke manual + `testConnection` (I/O, não unitário).
- Gate prático: `bun run build` + `bun run test` verdes; código novo sem erro de tipo por delta.

---

## 11. Versionamento e docs
- Bump **MINOR** + **codinome novo** (a definir no fechamento) + entrada Keep a Changelog (`Added`: integração LLM real; `Changed`: área de IA sai do modo Demonstração) + tag `vX.Y.0`.
- Atualizar **CLAUDE.md** e **MEMORY** (`project_ai_llm_settings_planned`), que hoje dizem "integração real deferida" e "gated para Demonstração" — passam a "integração real (Sub-projeto 1) em produção; consumidores deferidos".
- Doc dev: `docs/dev/ai-llm-integration.md` (Edge, tabelas, ordem de deploy, como adicionar um adaptador).

---

## 12. Arquivos (criar/editar)

**Backend / dados**
- `supabase/migrations/<ts>_ai_settings_and_usage_events.sql` (novo)
- `supabase/functions/ai-generate/index.ts` (novo) + `supabase/functions/_shared/ai/` adaptadores (novo)

**Camada de dados**
- `src/providers/data/engine/aiCatalog.ts` (novo — catálogo extraído)
- `src/providers/data/impl/supabase/ai.ts` (reescrita do stub)
- `src/providers/data/impl/mock/_aiSeed.ts` (usa o engine; `source` nos eventos)
- `src/shared/types/ai.ts` (`IAiUsageEvent`: `source` + `feature?`)

**Engines / UI**
- `src/features/ai-settings/engine/aiUsage.ts` (filtra feature null) + teste
- `src/features/ai-settings/pages/AiPlaygroundTab.tsx` (estado-zero, default configurado, banner LGPD, sem `auto`)
- `src/features/ai-settings/pages/AiProvidersTab.tsx` (status pós-teste)
- `src/features/shell/layouts/SettingsLayout.tsx` (remove `demoOnly`)
- `src/routes/app.configuracoes.ia.tsx` (remove redirect)

**Release/docs**
- `CHANGELOG.md`, `package.json`, `CLAUDE.md`, `docs/dev/ai-llm-integration.md`, memória.

---

## 13. Critérios de aceite
1. Em produção (supabase), o Owner acessa *Configurações → Inteligência artificial* sem redirect; o item aparece na sidebar.
2. Salvar `ANTHROPIC_API_KEY` no Vault + "testar conexão" → `ok`; o provedor vira `configured`.
3. Playground com Claude real retorna texto + tokens + custo + latência; o evento aparece no histórico e nos KPIs.
4. Com `SUM(cost_brl)` do mês ≥ teto, o Playground recebe `402` e a UI mostra "orçamento esgotado".
5. Migration espelhada em `supabase/migrations/`; `bun run build` + `bun run test` verdes.
6. Em modo mock, a área permanece idêntica ao comportamento atual.
