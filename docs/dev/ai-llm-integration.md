# Integração LLM real — `ai-generate` (Sub-projeto 1)

> **Versão:** v0.102.0 `Cortex` · 2026-06-17
> **Spec de referência:** `docs/superpowers/specs/2026-06-17-ai-llm-real-integration-design.md`
> **Predecessores:** v0.100.0 `Synapse` (área de IA mock-first).

---

## Visão geral

A área *Configurações → Inteligência artificial* foi entregue no v0.100.0 com dados mock e **gated para o modo Demonstração** — o `supabaseAiProvider` era 100% stub (`NotImplementedError` em todos os métodos) e a rota redirecionava em produção.

O Sub-projeto 1 remove esse gate com segurança, entregando a **fundação mínima para a área operar em produção**:

1. **Persistência real**: 2 tabelas Supabase com RLS (`ai_settings` + `ai_usage_events`).
2. **Edge proxy** `ai-generate` (a 11ª Edge Function): faz a chamada real ao LLM com a chave do Vault, mede tokens/custo/latência, aplica o teto de orçamento best-effort e grava o evento de uso.
3. **`supabaseAiProvider` real**: substitui o stub, implementa os 10 métodos de `IAiProvider`.
4. **Playground e teste de conexão reais**: passam a chamar Anthropic, OpenAI ou OpenRouter de verdade.
5. **Gate demo removido**: a área aparece para o Owner em produção.

**O que NÃO entra neste sub-projeto (deferido):**
- Consumidores reais (copiloto de conversa, copiloto analítico, SDR, identificação de peça, insights) — cada um será um sub-projeto próprio.
- Teto de orçamento atômico (advisory lock) — necessário apenas quando consumidores automáticos dispararem sem humano no loop.
- Streaming de resposta.
- Adaptador Google (visível na UI como "adaptador em breve"). *(OpenAI passou a ser suportada num incremento posterior — ver "Como adicionar um novo adaptador".)*
- PII scrub server-side.

---

## Tabelas

### `ai_settings` — configuração global (singleton)

```sql
create table if not exists public.ai_settings (
  id                  smallint primary key default 1 check (id = 1),
  master_enabled      boolean not null default false,
  default_provider_id text    not null default 'anthropic',
  budget              jsonb   not null,  -- { monthlyCapBRL, alertThresholdPct, usdToBrl }
  providers           jsonb   not null,  -- IAiProviderConfig[] (inclui models[] + preços + credentialsRef + status)
  routing             jsonb   not null,  -- IAiFeatureRouting[]
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);
```

O singleton é **garantido pelo schema** — `id smallint primary key default 1 check (id = 1)`. O semeio usa `insert ... on conflict (id) do nothing` (sem corrida de 2 linhas). O `master_enabled` começa em `false` — a área não auto-liga gasto em produção.

**RLS (Owner-only):**
```sql
alter table public.ai_settings enable row level security;

create policy "ai_settings_owner_read" on public.ai_settings
  for select to authenticated
  using ((select public.current_app_role()) = 'owner');

create policy "ai_settings_owner_write" on public.ai_settings
  for all to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');
```

As chaves de API **não vivem nesta tabela** — ficam no Supabase Vault, referenciadas por `credentialsRef` dentro do jsonb `providers`.

### `ai_usage_events` — histórico de uso (append-only)

```sql
create table if not exists public.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  source        text not null check (source in ('playground','routed')),
  feature       text,          -- AiFeatureKey quando source='routed'; null no playground
  provider_id   text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_brl      numeric(12,4) not null default 0,
  latency_ms    integer not null default 0,
  status        text not null check (status in ('ok','error','fallback')),
  caller_id     uuid references auth.users(id),
  store_id      uuid references public.stores(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_ai_usage_events_ts      on public.ai_usage_events (ts desc);
create index if not exists idx_ai_usage_events_feature on public.ai_usage_events (feature)
  where feature is not null;
```

**RLS:**
```sql
alter table public.ai_usage_events enable row level security;

-- Owner lê tudo. Sem policy de INSERT para 'authenticated' —
-- escrita exclusiva pelo service_role (Edge ai-generate), espelhando integration_logs.
create policy "ai_usage_events_owner_read" on public.ai_usage_events
  for select to authenticated
  using ((select public.current_app_role()) = 'owner');
```

O `idx_ts` serve a soma mensal do teto; o `idx_feature` parcial serve o agrupamento por funcionalidade no painel de uso.

---

## Edge Function `ai-generate`

**Arquivo:** `supabase/functions/ai-generate/index.ts`
**Deploy:** `npx supabase functions deploy ai-generate --project-ref njizaasajkdqptlxddqn`

### Contrato

```
POST /functions/v1/ai-generate
Authorization: Bearer <jwt do Owner>
Content-Type: application/json

{
  "mode": "generate" | "test",
  "providerId": "anthropic" | "openrouter",
  "model": "<model-id>",
  "params"?: { "maxTokens"?: number, "temperature"?: number },
  "prompt"?: string,
  "systemPrompt"?: string
}
```

**Resposta `generate`:** `{ text, inputTokens, outputTokens, costBRL, latencyMs }`
**Resposta `test`:** `{ ok, latencyMs, message }`

### Fluxo `generate`

1. `requireCaller(req, ["owner"])` — defesa em profundidade sobre `verify_jwt`.
2. **Validação de limites**: `prompt.length <= MAX_PROMPT_LENGTH` (≈ 50.000 chars), `params.maxTokens` ≤ 4096 (capado server-side), `temperature ∈ [0, 2]`. Fora → `400` com `{ error: "prompt ou parâmetros inválidos" }`.
3. Carrega `ai_settings` (linha singleton `id=1`) via cliente `admin`.
4. **Adaptador habilitado?** `anthropic`, `openai` e `openrouter`; outro (ex.: `google`) → `400` com `{ error: "provedor não suportado" }`.
5. **Teto best-effort**: `SUM(cost_brl)` do mês corrente (UTC) em `ai_usage_events` — se ≥ `budget.monthlyCapBRL` → `402` com `{ error: "orçamento mensal esgotado" }`. *(Ver §Riscos aceitos — TOCTOU conhecida.)*
6. **Chave do Vault** via `createSecretResolver` — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` ou `OPENROUTER_API_KEY`. Ausente → `400` com `{ error: "chave de API não configurada" }` (nunca chamar o provedor sem autenticação).
7. **Chamada ao adaptador** com `AbortSignal.timeout(LLM_TIMEOUT_MS ≈ 60 s)`:
   - **Anthropic** (`POST https://api.anthropic.com/v1/messages`, `anthropic-version` pinada): custo = `usage.input_tokens/output_tokens` × preço da linha persistida em `providers[].models[].inputPricePer1kUsd` × `budget.usdToBrl`.
   - **OpenAI** (`POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer`): a OpenAI **não** reporta custo monetário (só tokens) → custo = `usage.prompt_tokens/completion_tokens` × preço da linha persistida × `budget.usdToBrl` (mesmo caminho do Anthropic). Como o catálogo usa modelos da família GPT-5 (e a o-series se comporta igual), o corpo envia **`max_completion_tokens`** (não `max_tokens`, que esses modelos rejeitam) e **omite `temperature`/`top_p`** (esses modelos só aceitam a temperatura padrão) — compatibilidade ampla acima de tuning por chamada no v1.
   - **OpenRouter** (`POST https://openrouter.ai/api/v1/chat/completions`, usage accounting habilitado): custo = `usage.cost` (USD real) × `budget.usdToBrl`; fallback se `cost` ausente: tokens × preço da linha + flag de imprecisão no log.
   - **Timeout** (`AbortError` cujo `name === "TimeoutError"`): grava `ai_usage_events` com `status='error'`, `latency_ms` medido, retorna `504` com `{ error: "tempo limite da chamada ao LLM excedido" }`.
   - **Qualquer outro erro de chamada** (falha de rede, HTTP 4xx/5xx do provedor, etc.): grava `ai_usage_events` com `status='error'`, retorna `502` com `{ error: "falha na chamada ao provedor LLM" }`.
8. **Grava `ai_usage_events`** via `admin` — `source='playground'`, `feature=null`, `caller_id`, custo/tokens/latência/status.
9. Retorna `{ text, inputTokens, outputTokens, costBRL, latencyMs }`.

> **Importante:** o campo `model` da linha persistida é a fonte de preço — sem tabela própria no Edge, sem drift, sem script de sincronização. O Edge nunca usa `cost_brl = 0` silencioso para modelos fora do catálogo: usa o custo real do provedor (OpenRouter) ou registra com custo conservador + log.

> **`source` fixo no v1:** o Edge sempre grava `source='playground'` (e `feature=null`) em `ai_usage_events`. Quando consumidores automáticos forem adicionados, passarão `source='routed'` + o `feature` correspondente (`AiFeatureKey`) — a coluna e o check constraint já estão preparados.

> **`master_enabled` não é verificado pelo Edge:** o Playground contorna intencionalmente esse flag — a guarda é feita client-side pelo provider antes de habilitar o Playground. Consumidores automáticos também devem fazer a guarda client-side via `resolveEffectiveModel`. A única proteção de gasto server-side garantida pelo Edge é o teto mensal de orçamento (`budget.monthlyCapBRL`).

### Fluxo `test`

- Ping mínimo (`max_tokens: 1`) ao `defaultModel` do provedor.
- **Bloqueado se o teto já estourou** (`402`) — o teste não fura o orçamento.
- **Não grava** `ai_usage_events` (custo desprezível; evita poluir métricas).
- Retorna `{ ok, latencyMs, message }` com mensagem amigável de sucesso/erro de credencial.

### Adaptadores

Submódulo `supabase/functions/_shared/ai/adapters.ts` com interface fina:

```ts
interface LlmAdapter {
  call(input: AdapterInput, signal: AbortSignal): Promise<AdapterOutput>;
}

interface AdapterInput {
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  priceRow: { inputPricePer1kUsd: number; outputPricePer1kUsd: number };
  usdToBrl: number;
}

interface AdapterOutput {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costBRL: number;
  latencyMs: number;
}
```

Runtime Deno — somente Web APIs, zero dependências externas. O Edge importa os adaptadores por nome de provedor.

---

## Como adicionar um novo adaptador (resta: Google)

> **OpenAI já foi adicionada** seguindo exatamente este roteiro — use-a como referência. O `callOpenAI` em `adapters.ts` é o padrão para um provedor sem custo reportado (cai no preço por token do catálogo); o `callOpenRouter` é o padrão para um provedor que reporta `usage.cost`.

1. **Criar a função** `call<Provider>(apiKey, req, signal): Promise<LlmResult>` em `supabase/functions/_shared/ai/adapters.ts` (espelhar `callOpenAI`/`callOpenRouter`). Web APIs apenas — runtime Deno.
2. **Registrar** em `supabase/functions/ai-generate/index.ts`: adicionar o id ao `SUPPORTED`, o nome da chave ao `KEY_BY_PROVIDER` e o caso no `dispatch()`.
3. **Catálogo** — adicionar o provedor e seus modelos em `src/providers/data/engine/aiCatalog.ts` (nome, `inputPricePer1kUsd`, `outputPricePer1kUsd`, `defaultModel`, `credentialsRef`). Esse arquivo é a única fonte de verdade de preço em tempo de execução.
4. **Habilitar na UI** — adicionar o id a `AI_SUPPORTED_PROVIDERS` em `src/shared/types/ai.ts` (espelho do `SUPPORTED` do Edge). O `ProviderCard` destrava chave+teste e o Playground passa a listar o provedor automaticamente.
5. **Segredo no Vault** — documentar o nome da variável de ambiente (`GOOGLE_AI_API_KEY`) e orientar o Owner a cadastrá-la em *Configurações → Inteligência artificial → Provedores & chaves*.
6. **Redeploy do Edge** — `npx supabase functions deploy ai-generate --project-ref njizaasajkdqptlxddqn`.
7. **Testes**: sem teste Vitest na camada de adaptadores (Deno, fora do Vitest) — validar por smoke manual via `testConnection` + uma geração no Playground.

> Nenhuma migration nova é necessária — `ai_settings.providers` é jsonb e aceita o novo item sem alteração de schema.

### Lista de modelos dinâmica (v0.104.0 `Manifest`)

A partir do v0.104.0, a lista de modelos de cada provedor é **dinâmica** — não mais fixada no catálogo estático. O fluxo completo:

1. O `ProviderCard` dispara **"Atualizar modelos"** (botão explícito ou auto-busca única no primeiro acesso com chave configurada), chamando `listProviderModels(providerId)` do `IAiProvider`.
2. O `supabaseAiProvider` invoca a **ação `list-models`** no Edge `ai-generate` (`_shared/ai/modelList.ts`): o Edge chama a API do provedor com a chave do Vault e retorna a lista bruta de modelos.
3. O front executa `normalizeProviderModels(provider, raw)` (em `aiCatalog.ts`): mescla preço do mapa `priceForModel` (Anthropic/OpenAI) ou da própria API (OpenRouter, que retorna `pricing` por modelo); modelos sem preço no mapa ficam com `inputPricePer1kUsd: 0` e são exibidos com o badge **"preço a definir"** na UI.
4. A lista normalizada é **persistida em `ai_settings.providers[].models`** (jsonb, sem migration) com `modelsRefreshedAt` atualizando o timestamp da última busca.
5. O seletor de modelo usa um `<select>` nativo para listas ≤ 20 modelos e um **combobox com busca** para listas maiores (tipicamente OpenRouter, que lista centenas de modelos). O mock segue retornando o catálogo estático para modo Demonstração.

> Ao adicionar o Google: além dos passos 1–7 acima, criar o adaptador de listagem `listGoogle` em `_shared/ai/modelList.ts` (seguir `listAnthropic`/`listOpenAI`/`listOpenRouter` como referência).

---

## Ordem de deploy (crítico)

A remoção do gate **só pode entrar em produção após o backend estar ativo**, caso contrário a área quebra (tabela/Edge inexistente). O override de ambiente em runtime (`gallo-data-source-override`) agrava — um Owner com o browser apontado para `supabase` veria a área quebrada imediatamente.

**Sequência obrigatória:**

1. **Migration aplicada** em produção (MCP `apply_migration`) **e espelhada** em `supabase/migrations/` no mesmo PR.
2. **Chaves no Vault** — Owner cadastra `ANTHROPIC_API_KEY` e/ou `OPENROUTER_API_KEY` em *Chaves & API*.
3. **Deploy do Edge** `ai-generate` por CLI: `npx supabase functions deploy ai-generate --project-ref njizaasajkdqptlxddqn`.
4. **Merge do front** — provider real + remoção do gate + Playground real.
5. O `getSettings()` defensivo (semeia o default na ausência da linha) cobre o intervalo entre (1) e (4).

---

## Riscos aceitos no v1

| Severidade | Risco | Postura no v1 |
|------------|-------|---------------|
| Alta | **Teto não-atômico (TOCTOU)** — dois Playgrounds em paralelo podem furar o orçamento pelo check-then-act não atômico. | Aceito *best-effort*: humano no loop + botão desabilitado durante a chamada em voo. **Endurecer (advisory lock por mês ou contador `UPDATE ... RETURNING`) é pré-requisito antes de religar consumidores automáticos.** |
| Alta | **LGPD** — o conteúdo enviado vai para o provedor externo selecionado (Anthropic, OpenAI ou OpenRouter). OpenRouter repassa para sub-processadores opacos. | Consumidores deferidos ⇒ exposição real adiada. v1: banner explícito no Playground + recomendação de não usar OpenRouter para dado sensível de cliente + prompt padrão neutro. PII scrub fica para o sub-projeto que religar o primeiro consumidor. |
| Média | **`testConnection` custa e não respeita teto.** | Ping de 1 token, **bloqueado quando o teto já estourou**. Rate-limit por chamador fica deferido (Owner-only já limita a superfície). |
| Média | **Sem rate-limit no `ai-generate`.** | Owner-only + `MAX_PROMPT_LENGTH` + cap de `maxTokens` server-side. Rate-limit por chamador fica para a fase de consumidores. |
| Baixa | **Divergência de casing do papel** — front usa `'Owner'` (PascalCase em `requireAuth`) × Edge usa `'owner'` (base_role). | Já existia em *Chaves & API*. Documentado: a área de IA exige o papel-base `owner` (papel "Dono"). Padronizar para `base_role` em todo o front fica deferido. |

---

## Catálogo compartilhado (`aiCatalog.ts`)

Os modelos, preços e funcionalidades saíram do seed mock e foram para o módulo engine compartilhado `src/providers/data/engine/aiCatalog.ts`. Esse módulo:

- Exporta `MODELS`, `CREDENTIALS_REF`, `FEATURES`, `modelsFor()` e `buildDefaultAiSettings(env)`.
- Em `env = "mock"`: `masterEnabled: true`, todos os provedores `configured` (comportamento Demonstração inalterado).
- Em `env = "supabase"`: `masterEnabled: false`, todos os provedores `not_configured` (não auto-liga gasto).
- É importado pelo `supabaseAiProvider` (para semear o default) sem violar PRD-005 — o mock continua privado.

O `_aiSeed.ts` do mock foi atualizado para re-exportar/usar o catálogo do engine e adicionar `source: "routed"` em todos os eventos semeados.

---

## `IAiUsageEvent` — campos novos

A interface ganhou dois campos para suportar a gravação real:

```ts
export interface IAiUsageEvent {
  id: ID;
  ts: ISO8601;
  source: "playground" | "routed"; // NOVO — obrigatório
  feature?: AiFeatureKey;           // agora OPCIONAL (playground não tem feature)
  // ...demais campos inalterados
}
```

O engine `aiUsage.summarizeUsage` filtra `if (!e.feature) continue` nos loops de `byFeature` — eventos do Playground entram nos totais/custo/teto, mas **não poluem** o painel "Custo por funcionalidade".
