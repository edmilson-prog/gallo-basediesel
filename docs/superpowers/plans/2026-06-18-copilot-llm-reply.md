# Copiloto — Gerar resposta com IA (Sub-projeto 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ativar o botão "Gerar resposta" do copiloto: sob demanda, a LLM lê o contexto da conversa e devolve um rascunho que o atendente insere no composer.

**Architecture:** Nova Edge `copilot-generate` (gated, consumível por qualquer atendente autenticado) resolve provider/model/prompt do routing server-side, valida acesso à conversa por RLS, chama o LLM (reusa `_shared/ai/adapters.ts`) e grava `ai_usage_events`. O front aciona via `ICopilotProvider.generateReply`; o botão é gateado por uma RPC `ai_feature_enabled`.

**Tech Stack:** Supabase Edge Functions (Deno), Postgres (RPC SECURITY DEFINER), React 19 + TanStack, Vitest, provider pattern (mock + supabase).

**Spec:** `docs/superpowers/specs/2026-06-18-copilot-llm-reply-design.md`

## Global Constraints

- **UI/conteúdo em português do Brasil com acentos corretos** (UTF-8). Código/comentários em inglês.
- **Commits Conventional Commits** em inglês, atômicos. Terminar mensagens com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Provider boundary (PRD-005):** features acessam dados só via `@/providers/data`. Nada importa `@/mocks` nem `impl/*` fora da camada.
- **Migration mirror:** todo `apply_migration` deve ser exportado para `supabase/migrations/` no mesmo PR.
- **Gate de CI:** `bun run build` + `bun run test` verdes. `tsc` tem baseline pré-existente — avaliar só o delta.
- **Segurança:** o atendente envia **só `conversationId`**; provider/model/params/systemPrompt vêm do routing (nunca do body). Vendedor não lê `ai_settings`/chaves.
- **Budget:** teto mensal aplicado server-side, best-effort (não-atômico, TOCTOU conhecida — igual `ai-generate`).
- **PII:** conteúdo das mensagens + nome do cliente vão ao provedor (inerente; mascaramento é endurecimento futuro, fora do v1).
- **Base:** worktree `feat+copilot-ai-reply`, branch `worktree-feat+copilot-ai-reply`, base `origin/main` `ce288d2` (v0.107.1). Bump alvo **v0.108.0**.
- **Projeto Supabase ref:** `njizaasajkdqptlxddqn`. Chaves OpenAI e OpenRouter já no Vault; routing `conversation_copilot` já habilitado (openai/gpt-5.2).

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/copilot-generate/prompt.ts` (criar) | Função pura `buildReplyPrompt` — monta o user prompt (transcript + instrução). Sem imports Deno. |
| `supabase/functions/copilot-generate/prompt.test.ts` (criar) | Testes Vitest da função pura. |
| `supabase/functions/copilot-generate/index.ts` (criar) | Edge proxy gated: auth, acesso, routing, budget, LLM, usage. |
| `supabase/functions/_shared/auth.ts` (modificar) | Adicionar `requireAnyCaller` (sem checar papel; devolve `callerClient`). |
| `supabase/migrations/20260618120000_ai_feature_enabled_rpc.sql` (criar) | RPC `ai_feature_enabled(feature)` → booleano, grant authenticated. |
| `vitest.config.ts` (modificar) | Incluir `supabase/functions/**/*.{test,spec}.ts` no glob de testes. |
| `src/providers/data/contracts/copilot.ts` (modificar) | Adicionar `generateReply` + `isReplyGenerationEnabled`. |
| `src/providers/data/impl/mock/copilot.ts` (modificar) | Impl mock (rascunho determinístico; enabled=true). |
| `src/providers/data/impl/mock/copilot.test.ts` (criar) | Testes do mock. |
| `src/providers/data/impl/supabase/_functionError.ts` (criar) | Helper compartilhado `extractFunctionError`. |
| `src/providers/data/impl/supabase/ai.ts` (modificar) | Passar a importar `extractFunctionError` do helper. |
| `src/providers/data/impl/supabase/copilot.ts` (modificar) | Impl supabase (invoke edge; rpc). |
| `src/features/copilot/hooks/useCopilotReply.ts` (criar) | Hook de estado da geração. |
| `src/features/copilot/components/CopilotReply.tsx` (modificar) | UI do gerador (botão, loading, resultado, inserir, erro). |
| `src/features/copilot/components/CopilotStrip.tsx` (modificar) | Trocar prop `reply` por `conversationId`. |
| `src/features/copilot/components/CopilotCard.tsx` (modificar) | Receber `conversationId` + `onInsertReply`; render do gerador. |
| `src/features/copilot/components/CopilotFicheTab.tsx` (modificar) | Idem card. |
| `src/features/copilot/i18n/pt-BR.ts` (modificar) | Strings (remover "soon", adicionar loading/regerar). |
| `src/features/copilot/index.ts` (modificar) | Exportar `useCopilotReply`. |
| `src/features/conversations/pages/ConversationPage.tsx` (modificar) | Remover `stripReply`; passar `conversationId`+`onInsertReply` aos 3 placements. |
| `CHANGELOG.md`, `package.json` (modificar) | Bump v0.108.0. |
| `docs/dev/copilot-ai-reply.md` (criar) | Doc de dev. |

---

### Task 1: `requireAnyCaller` no `_shared/auth.ts`

Permite que qualquer atendente autenticado (não só owner) chame a edge, e expõe o `callerClient` para validar acesso por RLS. Para evitar duplicação, extrai um helper interno `resolveCaller` que **`requireCaller` passa a reusar preservando exatamente o comportamento atual** (mesmos checks, mesmas mensagens de erro) — zero regressão nas 6 funções existentes.

**Files:**
- Modify: `supabase/functions/_shared/auth.ts`

**Interfaces:**
- Produces: `requireAnyCaller(req: Request): Promise<{ callerId: string; admin: SupabaseClient; callerClient: SupabaseClient; profile: CallerProfile }>`
- Preserves: `requireCaller(req, allowedRoles)` com a MESMA assinatura, retorno e mensagens (401 "missing authorization" / "invalid session"; 403 "forbidden: requires …").

- [ ] **Step 1: Extrair `resolveCaller` e adicionar `requireAnyCaller`; refatorar `requireCaller` para delegar**

Substituir a função `requireCaller` existente por este bloco (helper interno + as duas funções públicas):
```ts
export interface AnyCallerContext {
  /** The authenticated auth.users id of the caller. */
  callerId: string;
  /** service_role client — bypasses RLS; never expose its key to the browser. */
  admin: SupabaseClient;
  /** Caller-scoped client (anon + caller JWT): reads obey the caller's RLS. */
  callerClient: SupabaseClient;
  /** The caller's profiles row (role + store). */
  profile: CallerProfile;
}

/**
 * Shared caller resolution (no authorization): caller-scoped client + getUser +
 * service_role client + profile lookup. `profile` is null when the authenticated
 * user has no profiles row. Used by both requireCaller (role-gated) and
 * requireAnyCaller (any authenticated caller).
 */
async function resolveCaller(req: Request): Promise<{
  callerId: string;
  admin: SupabaseClient;
  callerClient: SupabaseClient;
  profile: CallerProfile | null;
}> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "missing authorization");

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) throw new HttpError(401, "invalid session");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: profile } = await admin
    .from("profiles")
    .select("role, store_id")
    .eq("auth_user_id", callerData.user.id)
    .maybeSingle();

  return { callerId: callerData.user.id, admin, callerClient, profile: profile ?? null };
}

/**
 * Resolves the caller and their profile, enforcing `allowedRoles`.
 * Throws HttpError(401/403) with the exact messages the clients already handle.
 */
export async function requireCaller(
  req: Request,
  allowedRoles: readonly string[],
): Promise<CallerContext> {
  const { callerId, admin, profile } = await resolveCaller(req);
  if (!profile || !allowedRoles.includes(profile.role)) {
    const label = allowedRoles.length === 1 ? allowedRoles[0] : "owner or manager";
    throw new HttpError(403, `forbidden: requires ${label}`);
  }
  return { callerId, admin, profile };
}

/**
 * Resolves the caller WITHOUT enforcing any role — for production proxies
 * consumed by attendants (e.g. the conversation copilot). Authorization is
 * delegated downstream to RLS (the caller can only act on conversations their
 * policies let them read). Returns the caller-scoped client so the handler can
 * validate access via RLS instead of replicating it.
 */
export async function requireAnyCaller(req: Request): Promise<AnyCallerContext> {
  const { callerId, admin, callerClient, profile } = await resolveCaller(req);
  if (!profile) throw new HttpError(403, "forbidden: no profile");
  return { callerId, admin, callerClient, profile };
}
```

- [ ] **Step 2: Verificar que o comportamento de `requireCaller` foi preservado**

Run: `git diff supabase/functions/_shared/auth.ts`
Expected: `requireCaller` agora delega a `resolveCaller`, mas mantém assinatura, retorno e as mensagens 401/403 idênticas; `resolveCaller` (privado) e `requireAnyCaller` (público) adicionados.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/auth.ts
git commit -m "feat(edge): add requireAnyCaller for attendant-facing proxies

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migration — RPC `ai_feature_enabled`

Booleano legível por `authenticated` para o gating do botão, sem vazar chaves/budget.

**Files:**
- Create: `supabase/migrations/20260618120000_ai_feature_enabled_rpc.sql`

**Interfaces:**
- Produces: `public.ai_feature_enabled(p_feature text) returns boolean` (executável por `authenticated`).

- [ ] **Step 1: Escrever a migration**

```sql
-- ai_feature_enabled(feature): gating boolean for the front (attendants cannot
-- read ai_settings — it is owner-only RLS). SECURITY DEFINER reads the singleton
-- and returns ONLY master AND routing[feature].enabled AND (∃ provider configurado),
-- never keys/budget/models. Mirrors the SUPPORTED set semantics of ai-generate.
create or replace function public.ai_feature_enabled(p_feature text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.master_enabled
       and coalesce((
         select (r->>'enabled')::boolean
         from jsonb_array_elements(s.routing) r
         where r->>'feature' = p_feature
         limit 1
       ), false)
       and exists (
         select 1 from jsonb_array_elements(s.providers) p
         where p->>'status' = 'configured' and (p->>'enabled')::boolean = true
       )
    from public.ai_settings s
    where s.id = 1
  ), false);
$$;

revoke execute on function public.ai_feature_enabled(text) from public, anon;
grant execute on function public.ai_feature_enabled(text) to authenticated;
```

- [ ] **Step 2: Aplicar via MCP** (apply_migration, name `ai_feature_enabled_rpc`, mesmo SQL)

- [ ] **Step 3: Verificar em SQL** (execute_sql)

```sql
select public.ai_feature_enabled('conversation_copilot') as enabled,
       public.ai_feature_enabled('inexistente') as unknown_feature;
```
Expected: `enabled = true` (master on, routing on, openai/openrouter configurados), `unknown_feature = false`.

- [ ] **Step 4: Commit** (arquivo espelhado no Git)

```bash
git add supabase/migrations/20260618120000_ai_feature_enabled_rpc.sql
git commit -m "feat(db): ai_feature_enabled RPC for copilot gating

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Engine puro `buildReplyPrompt` + teste (TDD)

A montagem do prompt é server-side e pura. Vive na pasta da edge; testada pelo Vitest (após estender o glob).

**Files:**
- Modify: `vitest.config.ts`
- Create: `supabase/functions/copilot-generate/prompt.ts`
- Test: `supabase/functions/copilot-generate/prompt.test.ts`

**Interfaces:**
- Produces: `buildReplyPrompt(opts: { messages: PromptMessage[]; customer?: PromptCustomer; maxMessages?: number; maxChars?: number }): string`
  - `PromptMessage = { direction: "in" | "out"; authorType: string; text: string; sentAt: string }`
  - `PromptCustomer = { name?: string; type?: string; status?: string }`
  - Retorna `""` quando não há conteúdo útil do cliente (a edge responde 422).

- [ ] **Step 1: Estender o glob do Vitest**

Em `vitest.config.ts`, trocar a linha `include`:
```ts
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/**/*.{test,spec}.ts"],
```
(Testes em `supabase/functions/**` DEVEM ser puros — sem imports Deno/`jsr:`/`https://`.)

- [ ] **Step 2: Escrever o teste (falhando)**

Criar `supabase/functions/copilot-generate/prompt.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildReplyPrompt, type PromptMessage } from "./prompt";

const msg = (over: Partial<PromptMessage> = {}): PromptMessage => ({
  direction: "in",
  authorType: "customer",
  text: "oi",
  sentAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("buildReplyPrompt", () => {
  it("retorna '' sem mensagens com texto", () => {
    expect(buildReplyPrompt({ messages: [] })).toBe("");
    expect(buildReplyPrompt({ messages: [msg({ text: "   " })] })).toBe("");
  });

  it("retorna '' quando não há mensagem do cliente", () => {
    expect(
      buildReplyPrompt({ messages: [msg({ direction: "out", authorType: "seller", text: "olá" })] }),
    ).toBe("");
  });

  it("rotula Cliente/Vendedor e inclui a instrução final", () => {
    const out = buildReplyPrompt({
      messages: [
        msg({ text: "qual o prazo de entrega?" }),
        msg({ direction: "out", authorType: "seller", text: "vou verificar" }),
      ],
    });
    expect(out).toContain("Cliente: qual o prazo de entrega?");
    expect(out).toContain("Vendedor: vou verificar");
    expect(out).toContain("português do Brasil");
  });

  it("limita às últimas N mensagens", () => {
    const messages = Array.from({ length: 40 }, (_, i) => msg({ text: `linha${i}` }));
    const out = buildReplyPrompt({ messages, maxMessages: 5 });
    expect(out).toContain("linha39");
    expect(out).not.toContain("linha34");
  });

  it("inclui o nome do cliente quando fornecido", () => {
    const out = buildReplyPrompt({ messages: [msg({ text: "oi" })], customer: { name: "João", type: "B2C" } });
    expect(out).toContain("Cliente: João");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun run test -- prompt`
Expected: FAIL — `Cannot find module './prompt'`.

- [ ] **Step 4: Implementar `prompt.ts`**

```ts
/**
 * Pure prompt builder for the conversation copilot reply (Sub-projeto 1).
 * Runtime-agnostic: NO Deno imports — unit-testable under Vitest (node).
 * The system prompt is supplied separately by the routing config; this builds
 * the USER prompt (recent transcript + a final formatting instruction).
 */

export interface PromptMessage {
  direction: "in" | "out";
  authorType: string; // "customer" | "seller" | "sdr" | "system"
  text: string;
  sentAt: string;
}

export interface PromptCustomer {
  name?: string;
  type?: string; // "B2B" | "B2C"
  status?: string;
}

const DEFAULT_MAX_MESSAGES = 30;
const DEFAULT_MAX_CHARS = 8000;

const INSTRUCTION =
  "Escreva UMA resposta curta e objetiva, em português do Brasil, no tom de um " +
  "vendedor cordial da GALLO, pronta para enviar ao cliente pelo WhatsApp. " +
  "Responda apenas com o texto da mensagem — sem saudações genéricas repetidas, " +
  "sem assinatura e sem aspas.";

function speaker(m: PromptMessage): string {
  if (m.authorType === "customer" || m.direction === "in") return "Cliente";
  if (m.authorType === "sdr") return "SDR";
  return "Vendedor";
}

export function buildReplyPrompt(opts: {
  messages: PromptMessage[];
  customer?: PromptCustomer;
  maxMessages?: number;
  maxChars?: number;
}): string {
  const maxMessages = opts.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;

  const usable = opts.messages.filter((m) => m.text && m.text.trim().length > 0);
  if (usable.length === 0) return "";
  const hasCustomer = usable.some((m) => m.authorType === "customer" || m.direction === "in");
  if (!hasCustomer) return "";

  const recent = usable.slice(-maxMessages);
  let transcript = recent.map((m) => `${speaker(m)}: ${m.text.trim()}`).join("\n");
  if (transcript.length > maxChars) transcript = transcript.slice(transcript.length - maxChars);

  const header: string[] = [];
  if (opts.customer?.name) {
    const tipo = opts.customer.type === "B2B" ? " (empresa)" : "";
    header.push(`Cliente: ${opts.customer.name}${tipo}.`);
  }

  return [
    header.join(" "),
    "Conversa recente (mais antiga no topo):",
    transcript,
    "",
    INSTRUCTION,
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun run test -- prompt`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts supabase/functions/copilot-generate/prompt.ts supabase/functions/copilot-generate/prompt.test.ts
git commit -m "feat(copilot): pure reply-prompt builder + vitest coverage of edge functions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Edge `copilot-generate/index.ts`

Proxy gated. Reusa `_shared`. Helpers (`monthSpendBRL`, `pricingFor`, `dispatch`) inline — **não toca `ai-generate`**.

**Files:**
- Create: `supabase/functions/copilot-generate/index.ts`

**Interfaces:**
- Consumes: `requireAnyCaller` (Task 1), `buildReplyPrompt` (Task 3), `callAnthropic/callOpenAI/callOpenRouter/computeCostBRL` (`_shared/ai/adapters.ts`), `createSecretResolver` (`_shared/secrets.ts`), `servePost/json/parseJsonBody/HttpError` (`_shared`).
- Produces: `POST { conversationId: string } → 200 { text: string }`.

- [ ] **Step 1: Escrever a edge**

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * copilot-generate — 12ª Edge Function. Proxy do Copiloto de Vendas (PRD-025).
 *
 * Gated, consumível por QUALQUER atendente autenticado (não Owner-only). O caller
 * envia apenas { conversationId }; provider/model/params/systemPrompt vêm do
 * routing (ai_settings) — nunca do body. Valida acesso à conversa por RLS,
 * aplica teto de orçamento best-effort, chama o LLM com a chave do Vault e grava
 * ai_usage_events (source='routed', feature='conversation_copilot').
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requireAnyCaller } from "../_shared/auth.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import {
  callAnthropic,
  callOpenAI,
  callOpenRouter,
  computeCostBRL,
  type LlmRequest,
  type LlmResult,
  type ModelPricing,
} from "../_shared/ai/adapters.ts";
import { buildReplyPrompt, type PromptMessage } from "./prompt.ts";

const FEATURE = "conversation_copilot";
const LLM_TIMEOUT_MS = 60_000;
const MAX_REPLY_TOKENS = 600; // copilot reply is short
const MESSAGES_LIMIT = 200;
const SUPPORTED = new Set(["anthropic", "openai", "openrouter"]);
const KEY_BY_PROVIDER: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

interface RoutingEntry {
  feature: string;
  enabled: boolean;
  providerId: string;
  model: string;
  params?: { temperature?: number; maxTokens?: number; topP?: number };
  systemPrompt?: string;
}
interface SettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; alertThresholdPct: number; usdToBrl: number };
  providers: Array<{
    provider: string;
    models: Array<{ id: string; inputPricePer1kUsd: number; outputPricePer1kUsd: number }>;
  }>;
  routing: RoutingEntry[];
}

function pricingFor(settings: SettingsRow, providerId: string, model: string): ModelPricing | null {
  const p = settings.providers.find((x) => x.provider === providerId);
  const m = p?.models.find((x) => x.id === model);
  if (!m) return null;
  return { inputPricePer1kUsd: m.inputPricePer1kUsd, outputPricePer1kUsd: m.outputPricePer1kUsd };
}

async function monthSpendBRL(admin: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("ai_usage_events")
    .select("cost_brl")
    .gte("ts", start.toISOString());
  if (error) throw new HttpError(500, `budget read failed: ${error.message}`);
  return (data ?? []).reduce((a: number, r: { cost_brl: number | string }) => a + Number(r.cost_brl), 0);
}

function dispatch(
  providerId: string,
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  if (providerId === "anthropic") return callAnthropic(apiKey, req, signal);
  if (providerId === "openai") return callOpenAI(apiKey, req, signal);
  return callOpenRouter(apiKey, req, signal);
}

servePost(async (req, { log }) => {
  const { callerId, admin, callerClient, profile } = await requireAnyCaller(req);
  const body = await parseJsonBody(req);
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) throw new HttpError(400, "conversationId é obrigatório");

  // 1. Access check + load conversation (RLS via caller — can_access_conversation).
  const { data: conv, error: convErr } = await callerClient
    .from("conversations")
    .select("id, customer_id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; customer_id: string | null }>();
  if (convErr) throw new HttpError(500, `conversation read failed: ${convErr.message}`);
  if (!conv) throw new HttpError(403, "sem acesso a esta conversa");

  // 2. Settings + routing (admin; ai_settings is owner-only RLS).
  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, providers, routing")
    .eq("id", 1)
    .maybeSingle<SettingsRow>();
  if (sErr) throw new HttpError(500, `settings read failed: ${sErr.message}`);
  if (!settings) throw new HttpError(409, "configuração de IA ainda não inicializada");
  if (!settings.master_enabled) throw new HttpError(409, "IA desligada");
  const route = settings.routing.find((r) => r.feature === FEATURE);
  if (!route || !route.enabled) throw new HttpError(409, "copiloto de IA desligado");
  const providerId = route.providerId;
  if (!SUPPORTED.has(providerId)) {
    throw new HttpError(400, "provedor não suportado neste momento (adaptador em breve)");
  }
  const model = route.model;
  if (!model) throw new HttpError(400, "nenhum modelo configurado para o copiloto");

  // 3. Messages (RLS via caller), ascending by sentAt.
  const { data: msgs, error: mErr } = await callerClient
    .from("messages")
    .select("direction, author_type, text, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .limit(MESSAGES_LIMIT);
  if (mErr) throw new HttpError(500, `messages read failed: ${mErr.message}`);

  // 4. Customer (optional; RLS via caller).
  let customer: { name?: string; type?: string; status?: string } | undefined;
  if (conv.customer_id) {
    const { data: c } = await callerClient
      .from("customers")
      .select("type, status, full_name, razao_social, nome_fantasia, contact_name")
      .eq("id", conv.customer_id)
      .maybeSingle<{
        type: string;
        status: string;
        full_name: string | null;
        razao_social: string | null;
        nome_fantasia: string | null;
        contact_name: string | null;
      }>();
    if (c) {
      const name =
        c.type === "B2B"
          ? c.nome_fantasia || c.razao_social || c.contact_name || undefined
          : c.full_name || undefined;
      customer = { name: name ?? undefined, type: c.type, status: c.status };
    }
  }

  // 5. Build the user prompt.
  const promptMessages: PromptMessage[] = (msgs ?? []).map((m: {
    direction: string;
    author_type: string;
    text: string | null;
    sent_at: string;
  }) => ({
    direction: m.direction === "out" ? "out" : "in",
    authorType: m.author_type,
    text: m.text ?? "",
    sentAt: m.sent_at,
  }));
  const userPrompt = buildReplyPrompt({ messages: promptMessages, customer });
  if (!userPrompt) throw new HttpError(422, "conversa sem conteúdo do cliente para gerar resposta");

  // 6. Budget hard cap (best-effort).
  const spent = await monthSpendBRL(admin);
  if (settings.budget.monthlyCapBRL > 0 && spent >= settings.budget.monthlyCapBRL) {
    throw new HttpError(402, "orçamento de IA do mês esgotado");
  }

  // 7. Resolve key (Vault-first).
  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret(KEY_BY_PROVIDER[providerId]!);
  if (!apiKey) throw new HttpError(400, "chave de API do provedor não configurada");

  // 8. Call the LLM.
  const params = route.params ?? {};
  let temperature = Math.min(2, Math.max(0, Number(params.temperature ?? 0.4)));
  if (!Number.isFinite(temperature)) temperature = 0.4;
  let maxTokens = Math.min(MAX_REPLY_TOKENS, Math.max(1, Number(params.maxTokens ?? MAX_REPLY_TOKENS)));
  if (!Number.isFinite(maxTokens)) maxTokens = MAX_REPLY_TOKENS;
  const llmReq: LlmRequest = {
    model,
    prompt: userPrompt,
    systemPrompt: typeof route.systemPrompt === "string" ? route.systemPrompt : undefined,
    maxTokens,
    temperature,
  };
  const controller = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const started = Date.now();

  let result: LlmResult;
  try {
    result = await dispatch(providerId, apiKey, llmReq, controller);
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof DOMException && err.name === "TimeoutError";
    const { error: insErr } = await admin.from("ai_usage_events").insert({
      source: "routed",
      feature: FEATURE,
      provider_id: providerId,
      model,
      input_tokens: 0,
      output_tokens: 0,
      cost_brl: 0,
      latency_ms: latencyMs,
      status: "error",
      caller_id: callerId,
      store_id: profile.store_id,
    });
    if (insErr) log.error("copilot-generate error-usage insert failed", { error: insErr.message });
    log.error("copilot-generate llm call failed", { providerId, model, aborted });
    throw new HttpError(
      aborted ? 504 : 502,
      aborted ? "tempo de resposta do LLM esgotado" : "falha na chamada ao LLM",
    );
  }

  const latencyMs = Date.now() - started;
  const pricing = pricingFor(settings, providerId, model);
  const costBRL = computeCostBRL(
    result.inputTokens,
    result.outputTokens,
    pricing ?? { inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
    settings.budget.usdToBrl,
    result.usdCost,
  );
  if (!pricing && result.usdCost === undefined) {
    log.error("copilot-generate unknown model pricing", { providerId, model });
  }

  const { error: insErr } = await admin.from("ai_usage_events").insert({
    source: "routed",
    feature: FEATURE,
    provider_id: providerId,
    model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_brl: costBRL,
    latency_ms: latencyMs,
    status: "ok",
    caller_id: callerId,
    store_id: profile.store_id,
  });
  if (insErr) log.error("copilot-generate usage insert failed", { error: insErr.message, costBRL });

  return json({ text: result.text });
});
```

- [ ] **Step 2: Sanidade local** (a edge usa APIs Deno — não roda no Vitest; o type-check real é no deploy, Task 9)

Run: `bun run build`
Expected: PASS (Vite ignora `supabase/functions`). Sem novos erros no front.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/copilot-generate/index.ts
git commit -m "feat(edge): copilot-generate proxy (gated, routing-driven, budgeted)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Contrato + mock provider (TDD)

**Files:**
- Modify: `src/providers/data/contracts/copilot.ts`
- Modify: `src/providers/data/impl/mock/copilot.ts`
- Test: `src/providers/data/impl/mock/copilot.test.ts`

**Interfaces:**
- Produces (contrato): `generateReply(conversationId: ID): Promise<string>` e `isReplyGenerationEnabled(): Promise<boolean>`.

- [ ] **Step 1: Atualizar o contrato**

Em `src/providers/data/contracts/copilot.ts`, dentro de `ICopilotProvider`, trocar a linha comentada `// Fase 2: generateReply...` por:
```ts
  /**
   * Gera um rascunho de resposta com IA a partir do contexto da conversa
   * (sob demanda). Lança em erro de geração — o consumidor degrada na UI.
   */
  generateReply(conversationId: ID): Promise<string>;
  /** Se a geração de resposta com IA está habilitada (gating do botão). */
  isReplyGenerationEnabled(): Promise<boolean>;
```

- [ ] **Step 2: Escrever o teste (falhando)**

Criar `src/providers/data/impl/mock/copilot.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mockCopilotProvider } from "./copilot";
import { mockConversationsProvider } from "./conversations";

describe("mockCopilotProvider — geração de resposta", () => {
  it("isReplyGenerationEnabled é true no mock", async () => {
    expect(await mockCopilotProvider.isReplyGenerationEnabled()).toBe(true);
  });

  it("gera um rascunho não-vazio e determinístico", async () => {
    const conv = (await mockConversationsProvider.list({ pageSize: 100 })).data.find(
      (c) => c.customerId,
    );
    expect(conv).toBeTruthy();
    const a = await mockCopilotProvider.generateReply(conv!.id);
    const b = await mockCopilotProvider.generateReply(conv!.id);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun run test -- mock/copilot`
Expected: FAIL — `generateReply is not a function` (ou type error de propriedade ausente).

- [ ] **Step 4: Implementar no mock**

Em `src/providers/data/impl/mock/copilot.ts`, adicionar dentro de `mockCopilotProvider` (após `dismissSuggestion`):
```ts
  async generateReply(conversationId: ID): Promise<string> {
    // Mock has no LLM: fabricate a deterministic draft from the last customer line.
    const messages = (
      await mockMessagesProvider.list({ conversationId, pageSize: 500, orderDir: "asc" })
    ).data;
    const lastInbound = [...messages]
      .reverse()
      .find((m) => m.direction === "in" && m.authorType === "customer" && m.text.trim());
    if (!lastInbound) return "Olá! Como posso ajudar você hoje?";
    const topic = lastInbound.text.trim().slice(0, 60);
    return `Claro! Sobre "${topic}", já verifico aqui e retorno com a melhor condição. 👍`;
  },

  async isReplyGenerationEnabled(): Promise<boolean> {
    // Demo sempre disponível (sem custo): o mock não chama LLM.
    return true;
  },
```
(`mockMessagesProvider` já está importado no topo do arquivo.)

- [ ] **Step 5: Rodar e ver passar**

Run: `bun run test -- mock/copilot`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/contracts/copilot.ts src/providers/data/impl/mock/copilot.ts src/providers/data/impl/mock/copilot.test.ts
git commit -m "feat(copilot): generateReply + isReplyGenerationEnabled (contract + mock)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Supabase provider impl + helper de erro compartilhado

**Files:**
- Create: `src/providers/data/impl/supabase/_functionError.ts`
- Modify: `src/providers/data/impl/supabase/ai.ts`
- Modify: `src/providers/data/impl/supabase/copilot.ts`

**Interfaces:**
- Produces: `extractFunctionError(error: unknown): Promise<string>` (helper); `supabaseCopilotProvider.generateReply/isReplyGenerationEnabled`.

- [ ] **Step 1: Extrair o helper**

Criar `src/providers/data/impl/supabase/_functionError.ts`:
```ts
/** Extracts the pt-BR `{ error }` message from a failed Edge Function invoke. */
export async function extractFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* fall through */
    }
  }
  return error instanceof Error ? error.message : "[supabase] operation failed";
}
```

- [ ] **Step 2: Apontar `ai.ts` para o helper**

Em `src/providers/data/impl/supabase/ai.ts`: remover a função local `extractFunctionError` (linhas ~139-150) e adicionar o import no topo:
```ts
import { extractFunctionError } from "./_functionError";
```

- [ ] **Step 3: Implementar no `copilot.ts`**

Em `src/providers/data/impl/supabase/copilot.ts`, adicionar imports no topo:
```ts
import { getSupabaseClient } from "@/shared/lib/supabase";
import { extractFunctionError } from "./_functionError";
```
E adicionar dentro de `supabaseCopilotProvider` (após `dismissSuggestion`):
```ts
  async generateReply(conversationId: ID): Promise<string> {
    const { data, error } = await getSupabaseClient().functions.invoke("copilot-generate", {
      body: { conversationId },
    });
    if (error) throw new Error(await extractFunctionError(error));
    return (data as { text: string }).text;
  },

  async isReplyGenerationEnabled(): Promise<boolean> {
    // Attendants cannot read ai_settings (owner-only RLS) → ask the SECURITY
    // DEFINER RPC. Fail-closed: any error hides the button.
    const { data, error } = await getSupabaseClient().rpc("ai_feature_enabled", {
      p_feature: "conversation_copilot",
    });
    if (error) return false;
    return data === true;
  },
```

- [ ] **Step 4: Verificar build + testes**

Run: `bun run build && bun run test -- supabase/ai`
Expected: build PASS; testes dos mappers de `ai` seguem verdes (o helper extraído não muda o comportamento).

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/_functionError.ts src/providers/data/impl/supabase/ai.ts src/providers/data/impl/supabase/copilot.ts
git commit -m "feat(copilot): supabase provider — generateReply via edge, gating via RPC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Hook `useCopilotReply`

**Files:**
- Create: `src/features/copilot/hooks/useCopilotReply.ts`
- Modify: `src/features/copilot/index.ts`

**Interfaces:**
- Produces: `useCopilotReply(conversationId: ID | null): ICopilotReplyState` onde
  `ICopilotReplyState = { enabled: boolean; generating: boolean; reply: string | null; error: string | null; generate: () => void; clear: () => void }`.

- [ ] **Step 1: Criar o hook**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { ID } from "@/shared/types";
import { useCopilotProvider } from "@/providers/data";

export interface ICopilotReplyState {
  enabled: boolean;
  generating: boolean;
  reply: string | null;
  error: string | null;
  generate: () => void;
  clear: () => void;
}

export function useCopilotReply(conversationId: ID | null): ICopilotReplyState {
  const provider = useCopilotProvider();
  const [enabled, setEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against a late response landing on a different conversation.
  const reqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    provider
      .isReplyGenerationEnabled()
      .then((v) => {
        if (!cancelled) setEnabled(v);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  // Reset transient state when switching conversations.
  useEffect(() => {
    reqRef.current += 1;
    setReply(null);
    setError(null);
    setGenerating(false);
  }, [conversationId]);

  const generate = useCallback(() => {
    if (!conversationId) return;
    const reqId = (reqRef.current += 1);
    setGenerating(true);
    setError(null);
    provider
      .generateReply(conversationId)
      .then((text) => {
        if (reqRef.current === reqId) setReply(text);
      })
      .catch((e: unknown) => {
        if (reqRef.current === reqId) {
          setError(e instanceof Error ? e.message : "Falha ao gerar a resposta. Tente novamente.");
        }
      })
      .finally(() => {
        if (reqRef.current === reqId) setGenerating(false);
      });
  }, [provider, conversationId]);

  const clear = useCallback(() => {
    setReply(null);
    setError(null);
  }, []);

  return { enabled, generating, reply, error, generate, clear };
}
```

- [ ] **Step 2: Exportar no barrel**

Em `src/features/copilot/index.ts`, adicionar:
```ts
export { useCopilotReply } from "./hooks/useCopilotReply";
export type { ICopilotReplyState } from "./hooks/useCopilotReply";
```

- [ ] **Step 3: Verificar build**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/copilot/hooks/useCopilotReply.ts src/features/copilot/index.ts
git commit -m "feat(copilot): useCopilotReply hook (enabled gating + on-demand generate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: UI do gerador (`CopilotReply`) + i18n

**Files:**
- Modify: `src/features/copilot/i18n/pt-BR.ts`
- Modify: `src/features/copilot/components/CopilotReply.tsx`

**Interfaces:**
- Consumes: `useCopilotReply` (Task 7).
- Produces: `CopilotReply({ conversationId: ID; onInsert: (text: string) => void })`.

- [ ] **Step 1: Strings i18n**

Em `src/features/copilot/i18n/pt-BR.ts`: remover `generateReplySoon` e ajustar/adicionar:
```ts
  replyLabel: "Resposta sugerida",
  replyInsert: "Inserir",
  generateReply: "Gerar resposta com IA",
  regenerateReply: "Gerar outra",
  generatingReply: "Gerando resposta…",
```

- [ ] **Step 2: Reescrever `CopilotReply.tsx`**

```tsx
import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { useCopilotReply } from "../hooks/useCopilotReply";

export interface ICopilotReplyProps {
  conversationId: ID;
  onInsert: (text: string) => void;
}

export function CopilotReply({ conversationId, onInsert }: ICopilotReplyProps) {
  const { enabled, generating, reply, error, generate } = useCopilotReply(conversationId);
  if (!enabled) return null;

  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      {reply && (
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {COPILOT_STRINGS.replyLabel}
          </span>
          <span className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground">
            {reply}
          </span>
          <button
            type="button"
            onClick={() => onInsert(reply)}
            className="shrink-0 cursor-pointer rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            {COPILOT_STRINGS.replyInsert} ↑
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={generate}
        disabled={generating}
        className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon
          icon={generating ? "mdi:loading" : "mdi:auto-fix"}
          size={14}
          className={generating ? "animate-spin" : undefined}
        />
        {generating
          ? COPILOT_STRINGS.generatingReply
          : reply
            ? COPILOT_STRINGS.regenerateReply
            : COPILOT_STRINGS.generateReply}
      </button>
      {error && <p className="mt-1.5 text-[11px] text-severity-critical">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build**

Run: `bun run build`
Expected: PASS (CopilotStrip ainda passa `reply` → próxima task corrige; pode haver erro de tipo transitório — se o build acusar, seguir direto para a Task 9, que conserta os call-sites).

> Nota: Tasks 8 e 9 formam um par de compilação (a assinatura de `CopilotReply` muda e os call-sites são corrigidos na 9). Se preferir, faça o commit da 8 e 9 juntos após o build verde da 9.

- [ ] **Step 4: Commit**

```bash
git add src/features/copilot/i18n/pt-BR.ts src/features/copilot/components/CopilotReply.tsx
git commit -m "feat(copilot): reply generator UI (loading/result/insert/error)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Fiação nos 3 placements + ConversationPage

**Files:**
- Modify: `src/features/copilot/components/CopilotStrip.tsx`
- Modify: `src/features/copilot/components/CopilotCard.tsx`
- Modify: `src/features/copilot/components/CopilotFicheTab.tsx`
- Modify: `src/features/conversations/pages/ConversationPage.tsx`

**Interfaces:**
- Consumes: `CopilotReply` (Task 8).

- [ ] **Step 1: `CopilotStrip.tsx`** — trocar `reply` por `conversationId`

Props:
```tsx
export interface ICopilotStripProps {
  panel: ICopilotPanelState;
  conversationId: ID;
  onInsertReply: (text: string) => void;
}
```
Adicionar `import type { ID } from "@/shared/types";`. Trocar a assinatura `export function CopilotStrip({ panel, conversationId, onInsertReply }: ICopilotStripProps)`. No bloco expandido, substituir `{reply && <CopilotReply reply={reply} onInsert={onInsertReply} />}` por:
```tsx
          <CopilotReply conversationId={conversationId} onInsert={onInsertReply} />
```

- [ ] **Step 2: `CopilotCard.tsx`** — receber `conversationId` + `onInsertReply`

Trocar a assinatura para:
```tsx
import type { ID } from "@/shared/types";
import { CopilotReply } from "./CopilotReply";

export function CopilotCard({
  panel,
  conversationId,
  onInsertReply,
}: {
  panel: ICopilotPanelState;
  conversationId: ID;
  onInsertReply: (text: string) => void;
}) {
```
No bloco `{open && ( ... )}`, após a `<ul>` de sugestões, renderizar o gerador dentro de um wrapper com padding:
```tsx
      {open && (
        <div className="px-3.5 pb-3.5">
          {suggestions.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {suggestions.map((s) => (
                <CopilotSuggestionItem key={s.id} suggestion={s} onDismiss={dismiss} />
              ))}
            </ul>
          )}
          <CopilotReply conversationId={conversationId} onInsert={onInsertReply} />
        </div>
      )}
```
(Substitui o bloco `{open && suggestions.length > 0 && (<ul ...>)}` atual.)

- [ ] **Step 3: `CopilotFicheTab.tsx`** — receber `conversationId` + `onInsertReply`

Trocar a assinatura para:
```tsx
import type { ID } from "@/shared/types";
import { CopilotReply } from "./CopilotReply";

export function CopilotFicheTab({
  panel,
  conversationId,
  onInsertReply,
}: {
  panel: ICopilotPanelState;
  conversationId: ID;
  onInsertReply: (text: string) => void;
}) {
```
Antes do `</div>` final (depois do bloco de sugestões), adicionar:
```tsx
      <CopilotReply conversationId={conversationId} onInsert={onInsertReply} />
```

- [ ] **Step 4: `ConversationPage.tsx`** — remover `stripReply` e passar props

Remover as linhas 93-95 (o comentário + `const stripReply = ...`). Atualizar os 3 call-sites:
```tsx
              {copilot.placement === "card" && conversation.customerId && !copilot.error && (
                <CopilotCard
                  panel={copilot}
                  conversationId={conversation.id}
                  onInsertReply={setDraft}
                />
              )}
```
```tsx
              {copilot.placement === "strip" && conversation.customerId && !copilot.error && (
                <CopilotStrip
                  panel={copilot}
                  conversationId={conversation.id}
                  onInsertReply={setDraft}
                />
              )}
```
```tsx
                copilotTab={
                  copilot.placement === "tab" && !copilot.error ? (
                    <CopilotFicheTab
                      panel={copilot}
                      conversationId={conversation.id}
                      onInsertReply={setDraft}
                    />
                  ) : undefined
                }
```

- [ ] **Step 5: Verificar build + testes + tipos do delta**

Run: `bun run build && bun run test`
Expected: build PASS; 859 testes anteriores + os novos (prompt: 5; mock copilot: 2) verdes.

Run (delta de tipos): `bunx tsc --noEmit 2>&1 | grep -E "copilot|CopilotReply|useCopilotReply" || echo "sem erros novos nos arquivos do copiloto"`
Expected: `sem erros novos...`.

- [ ] **Step 6: Commit**

```bash
git add src/features/copilot/components/CopilotStrip.tsx src/features/copilot/components/CopilotCard.tsx src/features/copilot/components/CopilotFicheTab.tsx src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat(copilot): wire reply generator into strip, card and ficha tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Deploy + verificação e2e

**Files:** nenhum (operacional).

- [ ] **Step 1: Deploy da edge** (CLI Supabase autenticada — caminho preferido do projeto)

Run:
```bash
npx supabase functions deploy copilot-generate --project-ref njizaasajkdqptlxddqn
```
Expected: deploy OK; a função compila (type-check Deno do `index.ts` + `prompt.ts` + `_shared`).

- [ ] **Step 2: Confirmar ACTIVE**

Verificar via MCP `list_edge_functions` que `copilot-generate` aparece `status: ACTIVE`.

- [ ] **Step 3: Migration já aplicada** (Task 2) — reconfirmar no banco

Run (execute_sql): `select public.ai_feature_enabled('conversation_copilot');` → `true`.

- [ ] **Step 4: Smoke e2e (dono)** — registrar no checklist de verificação

O dono, logado como `seller_internal` em produção, abre uma conversa com mensagens do cliente, clica **"Gerar resposta com IA"**, confirma que um rascunho aparece e que "Inserir" o joga no composer. Em seguida, validar a telemetria:
```sql
select ts, feature, provider_id, model, input_tokens, output_tokens, cost_brl, status
from ai_usage_events
where source = 'routed' and feature = 'conversation_copilot'
order by ts desc limit 3;
```
Expected: ≥1 linha `status='ok'` recém-criada.

> A verificação completa por um vendedor real depende de sessão `seller_internal` (dono). Sem JWT de vendedor no ambiente do agente, a checagem aqui cobre deploy + RPC + (opcionalmente) uma chamada como owner.

---

### Task 11: Versionamento, CHANGELOG e doc de dev

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Create: `docs/dev/copilot-ai-reply.md`

- [ ] **Step 1: Doc de dev** — criar `docs/dev/copilot-ai-reply.md`

Conteúdo (resumo): arquitetura (front → `generateReply` → edge `copilot-generate`), gating via `ai_feature_enabled`, segurança (só `conversationId`; routing server-side), budget best-effort, PII (envia transcript ao provedor), e os pontos de extensão para os sub-projetos 2/3 (resumo/sugestões). Referenciar a spec.

- [ ] **Step 2: Bump de versão**

Em `package.json`: `"version": "0.108.0"`.

- [ ] **Step 3: CHANGELOG** — adicionar entrada (Keep a Changelog), codinome sugerido **`Quill`**:
```markdown
## [0.108.0] - 2026-06-18 - Quill

### Added
- Copiloto: botão "Gerar resposta com IA" (sob demanda) nos 3 posicionamentos
  (faixa, card, aba da ficha). Edge `copilot-generate` (12ª) resolve
  provider/modelo/prompt do routing administrado pelo Owner e grava o uso em
  `ai_usage_events`. Gating via RPC `ai_feature_enabled`.
```

- [ ] **Step 4: Verificar build (changelog copiado para public/)**

Run: `bun run build`
Expected: PASS; `node scripts/copy-changelog.mjs` roda no pre-build.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md docs/dev/copilot-ai-reply.md
git commit -m "chore(release): v0.108.0 Quill — copilot AI reply

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Tasks 1, 2, 4, 10** não têm teste unitário (auth de edge, RPC SQL, edge Deno, deploy). A verificação é: Task 2 via SQL; Task 4 via `bun run build` + deploy (Task 10); Task 1 via deploy bem-sucedido. TDD real está nas Tasks 3 e 5 (funções puras).
- **UI (Tasks 8/9):** sem testes de componente (o ambiente Vitest é `node`, sem jsdom; o projeto valida UI manualmente). Verificação por `bun run build` + smoke do dono.
- **Ordem recomendada:** 1→2→3→4 (backend completo) → 5→6→7→8→9 (front) → 10 (deploy/e2e) → 11 (release). As Tasks 8 e 9 compilam juntas.
- **Não tocar `ai-generate`** nem `requireCaller`.
- O PR final precisa do `routeTree.gen.ts` limpo antes do merge (regra do projeto: descartar o gerado se sujar o working tree).
