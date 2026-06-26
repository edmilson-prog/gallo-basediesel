# Evolution Go Engine — Fase 2 (Edge Functions: connect + webhook + send) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o engine `evolution-go` (entregue na Fase 0+1) às três Edge Functions de runtime — `whatsapp-connect` (pareamento QR + captura do token), `whatsapp-webhook` (recepção + auth por `instanceToken`) e `whatsapp-send` (envio) — para um fluxo ponta-a-ponta: criar/parear uma conta Go, enviar texto/mídia, receber inbound e status.

**Architecture:** As edges **ramificam por `provider`** (reuso máximo; v2/meta intactos). O `whatsapp-connect` ganha um ramo `evolution-go` que cria a instância no servidor Go com a **chave global** (`/instance/create`), captura o **token** retornado, grava-o no Vault (`integration_secret_set`) e conecta a instância (token) apontando o webhook para `/whatsapp-webhook/evolution-go`. O `whatsapp-webhook` ganha a rota `evolution-go`, resolve a conta por `provider_config.instanceId`, autentica comparando o `instanceToken` do payload com o token do Vault (constant-time, sem HMAC) e parseia com `parseEvolutionGoInbound`. O `whatsapp-send` já é agnóstico via `buildWhatsAppEngine` (Fase 1) — só precisa alargar uniões de tipo e a matriz de failover. Toda a camada pura vive em `supabase/functions/_shared/whatsapp/` (espelho de `src/providers/whatsapp/` via `scripts/sync-whatsapp-shared.ts`).

**Tech Stack:** TypeScript (Deno edge runtime), Vitest (cores puros co-localizados em `src/`), Supabase (RPC `integration_secret_set`/`integration_secret_get`, Vault), deploy das edges via Supabase MCP `deploy_edge_function` ou CLI.

## Global Constraints

- **Coexistência:** `meta` e `evolution` (v2) permanecem **inalterados**. Toda mudança é aditiva (`case "evolution-go"` ao lado dos existentes). Nenhum teste/comportamento v2/meta pode regredir.
- **Runtime-agnostic + mirror:** a lógica pura mora em `src/providers/whatsapp/**` (só Web APIs + imports relativos) e é espelhada em `supabase/functions/_shared/whatsapp/**` por `bun run scripts/sync-whatsapp-shared.ts`. **Nunca editar `_shared/` à mão.** Mudou a camada ⇒ rodar o sync **e** commitar os arquivos do mirror que tiverem mudança real (lição da Fase 1: `git add` precisa cobrir os arquivos-raiz do mirror, não só a subpasta).
- **Modelo de segredos (decisão do dono — Model A, "por conta", igual v2):** cada conta Go tem um `credentials_ref` único, em MAIÚSCULAS casando `^[A-Z][A-Z0-9_]{2,64}$`. A **chave global** do servidor evogo fica em `{credentials_ref}_API_KEY` (pré-provisionada via Chaves & API; mesmo valor pode repetir entre contas do mesmo servidor) e é usada **só** por `createGoInstance` (admin). O **token da instância** fica em `{credentials_ref}_INSTANCE_TOKEN`, **gravado pelo connect** após `create`, e é a credencial de TODAS as chamadas escopadas + a auth do webhook (smoke 2026-06-25).
- **Escrita no Vault:** via o RPC já existente `integration_secret_set(p_name text, p_value text, p_description text)` (SECURITY DEFINER, concedido ao `service_role`; upsert idempotente em `vault.secrets`). **Nenhuma migration nova é necessária.** O nome do segredo deve casar `^[A-Z][A-Z0-9_]{2,64}$`.
- **Auth do webhook Go:** sem HMAC — comparar o `instanceToken` do payload com o token do Vault via `EvolutionGoProvider.verifyWebhookSignature` (constant-time). **Fail-closed:** token ausente/divergente ⇒ rejeita.
- **Comentários em inglês**; strings ao usuário em **português do Brasil com acentos corretos**.
- **TypeScript strict**, sem `any` novo; interfaces de domínio com prefixo `I`. Conventional Commits em inglês, atômicos (um por tarefa).
- **Gate prático:** `bun run build` + `bun run test` verdes; `bunx tsc --noEmit` sem erros NOVOS nos arquivos tocados. As **edges (`index.ts`) são código de integração Deno** (não cobertas por Vitest) — seu gate é build + tsc + o **smoke e2e do dono**; a lógica testável por unidade vive nos cores (`webhook/core.ts`, `failover.ts`) e é coberta por TDD.
- **Dependência de fase:** este plano assume a Fase 0+1 presente (engine `evolution-go` + mirror). Em execução, a worktree deve partir do tip da branch da Fase 1 (PR #173) ou da `main` após o merge — ver Handoff.
- **Deploy e smoke são gated no dono:** aplicar deploy de edge em produção e rodar o e2e exigem "ok" explícito do dono (espelha a regra de migrations).

## File Structure

```
supabase/functions/
├── _shared/whatsapp/
│   ├── webhook/core.ts          # MODIFY (via src/): union provider + dispatch parser + Connection lifecycle p/ evolution-go
│   └── (mirror auto-gerado de src/providers/whatsapp/**)
├── whatsapp-webhook/index.ts    # MODIFY: rota evolution-go, findEvolutionGoAccount, evolutionGoGate, scheduleAvatarFetch gate
├── whatsapp-connect/index.ts    # MODIFY: ramo evolution-go (create→token→Vault→connect→QR; status/logout/restart/delete; test-message)
├── whatsapp-send/
│   ├── index.ts                 # (sem mudança — agnóstico via buildWhatsAppEngine)
│   └── whatsappSendAdapter.ts   # MODIFY: alargar casts de provider
└── _shared/secrets.ts           # (sem mudança — integration_secret_set já existe)

src/providers/whatsapp/          # FONTE da camada pura (editar AQUI; depois sync p/ _shared)
├── webhook/core.ts              # MODIFY: IAccountRecord.provider, insert*.provider, dispatch parser, Connection
├── webhook/core.test.ts         # MODIFY: testes do dispatch evolution-go + Connection
├── send/core.ts                 # MODIFY: ISendDb.insertQueuedMessage.provider union
├── failover.ts                  # MODIFY: matriz aceita evolution-go
└── failover.test.ts             # MODIFY: casos evolution-go
```

> ⚠️ `webhook/core.ts`, `send/core.ts`, `failover.ts` são **espelhados**: editar em `src/providers/whatsapp/`, **nunca** em `_shared/`. Já `whatsapp-webhook/index.ts`, `whatsapp-connect/index.ts`, `whatsappSendAdapter.ts` são código de edge real (editar direto em `supabase/functions/`).

---

### Task 1: Alargar as uniões de `provider` para `evolution-go`

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts` (`IAccountRecord.provider`; `IWebhookDb.insertInboundMessage`/`insertOutboundEchoMessage` `provider`)
- Modify: `src/providers/whatsapp/send/core.ts` (`ISendDb.insertQueuedMessage` `provider`)
- Modify: `supabase/functions/whatsapp-webhook/index.ts` (cast `row.provider as ...`)
- Modify: `supabase/functions/whatsapp-send/whatsappSendAdapter.ts` (casts `row.provider as ...`, 2 ocorrências)

**Interfaces:**
- Consumes: nada novo.
- Produces: o literal-union de `provider` em todos esses pontos passa de `"meta" | "evolution"` para `"meta" | "evolution" | "evolution-go"`. Desbloqueia todas as tarefas seguintes (sem isto, passar `provider: "evolution-go"` é erro de tipo).

- [ ] **Step 1: Localizar e trocar as uniões em `src/`**

Em `src/providers/whatsapp/webhook/core.ts`, trocar **todas** as ocorrências de:
```ts
provider: "meta" | "evolution";
```
por:
```ts
provider: "meta" | "evolution" | "evolution-go";
```
(São 3: `IAccountRecord.provider`, `IWebhookDb.insertInboundMessage(...).provider`, `IWebhookDb.insertOutboundEchoMessage(...).provider`. Use busca para confirmar que não sobrou nenhuma.)

Em `src/providers/whatsapp/send/core.ts`, na assinatura de `ISendDb.insertQueuedMessage`, trocar `provider: "meta" | "evolution";` por `provider: "meta" | "evolution" | "evolution-go";`.

- [ ] **Step 2: Trocar os casts nas edges**

Em `supabase/functions/whatsapp-webhook/index.ts`, trocar o cast `row.provider as "meta" | "evolution"` por `row.provider as "meta" | "evolution" | "evolution-go"`.

Em `supabase/functions/whatsapp-send/whatsappSendAdapter.ts`, trocar as **duas** ocorrências de `row.provider as "meta" | "evolution"` por `row.provider as "meta" | "evolution" | "evolution-go"`.

- [ ] **Step 3: Sync do mirror + checagem de tipos**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Run: `bunx tsc --noEmit 2>&1 | grep -iE "webhook/core|send/core|whatsapp-webhook|whatsappSendAdapter" || echo "no new type errors"`
Expected: `no new type errors` (baseline pré-existente ignorado).

- [ ] **Step 4: Commit**

```bash
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/send/core.ts \
  supabase/functions/whatsapp-webhook/index.ts supabase/functions/whatsapp-send/whatsappSendAdapter.ts \
  supabase/functions/_shared/whatsapp/webhook/core.ts supabase/functions/_shared/whatsapp/send/core.ts
git commit -m "feat(whatsapp): widen provider unions for evolution-go across edges"
```

---

### Task 2: Webhook core — dispatch do parser whatsmeow + lifecycle `Connection`

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts`
- Test: `src/providers/whatsapp/webhook/core.test.ts`

**Interfaces:**
- Consumes: `parseEvolutionGoInbound` de `../evolution-go/parser` (relativo: `./evolution-go/parser` a partir de `webhook/core.ts` é `../evolution-go/parser`); `IAccountRecord.provider` (Task 1).
- Produces: `processWebhookEvent` passa a aceitar `account.provider === "evolution-go"` — usa `parseEvolutionGoInbound` para mensagens e trata o evento `Connection` (PascalCase) no lifecycle. Mantém o comportamento de `meta`/`evolution` idêntico.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `src/providers/whatsapp/webhook/core.test.ts` (reusar os helpers/mocks `IWebhookDb` já existentes no arquivo; o teste a seguir assume o mesmo padrão de `makeDb()`/`processWebhookEvent` usado pelos casos `evolution`):

```ts
describe("processWebhookEvent — evolution-go", () => {
  it("normalizes a whatsmeow inbound text message via the go parser", async () => {
    const db = makeDb({
      account: { id: "acc-go-1", provider: "evolution-go", credentialsRef: "WA_GO_T", providerConfig: { baseUrl: "https://go.test", instanceId: "inst-9" } },
    });
    const payload = {
      event: "Message",
      instanceId: "inst-9",
      data: {
        Info: { Chat: "5555988887777@s.whatsapp.net", Sender: "5555988887777@s.whatsapp.net", IsFromMe: false, Type: "text", PushName: "Cliente", ID: "GOIN1", Timestamp: "2026-06-25T10:00:00Z" },
        Message: { conversation: "olá go" },
      },
    };
    await processWebhookEvent({ provider: "evolution-go", rawPayload: payload, account: db.account, db, log: noopLog });
    expect(db.insertedInbound).toMatchObject({ providerMessageId: "GOIN1", contentType: "text", text: "olá go", provider: "evolution-go" });
  });

  it("treats a whatsmeow Connection event as a lifecycle signal (no message insert)", async () => {
    const db = makeDb({ account: { id: "acc-go-1", provider: "evolution-go", credentialsRef: "WA_GO_T", providerConfig: { baseUrl: "https://go.test", instanceId: "inst-9" } } });
    await processWebhookEvent({ provider: "evolution-go", rawPayload: { event: "Connection", instanceId: "inst-9", data: { State: "open" } }, account: db.account, db, log: noopLog });
    expect(db.insertedInbound).toBeUndefined();
  });
});
```
> Ajuste os nomes dos helpers (`makeDb`, `noopLog`, `db.insertedInbound`, a forma de chamar `processWebhookEvent`) ao que o arquivo de teste já usa para os casos `evolution`/`meta`. NÃO invente helpers novos — espelhe os existentes.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/whatsapp/webhook/core.test.ts`
Expected: FAIL — `evolution-go` cai no parser errado / `Connection` não tratado.

- [ ] **Step 3: Implementar o dispatch no parser**

Em `src/providers/whatsapp/webhook/core.ts`, adicionar o import:
```ts
import { parseEvolutionGoInbound } from "./evolution-go/parser";
```
> Caminho relativo: `webhook/core.ts` está em `src/providers/whatsapp/webhook/`, e o parser em `src/providers/whatsapp/evolution-go/` ⇒ o import é `../evolution-go/parser`. Use `../evolution-go/parser`.

Localizar o ponto de dispatch do parser (hoje):
```ts
parsed =
  provider === "meta"
    ? parseMetaInbound(rawPayload, "")
    : parseEvolutionInbound(rawPayload, "");
```
e trocar por:
```ts
parsed =
  provider === "meta"
    ? parseMetaInbound(rawPayload, "")
    : provider === "evolution-go"
      ? parseEvolutionGoInbound(rawPayload, "")
      : parseEvolutionInbound(rawPayload, "");
```

- [ ] **Step 4: Tratar o lifecycle `Connection` do Go**

Localizar o bloco de lifecycle de conexão (hoje gated em `if (provider === "evolution") { const connection = extractEvolutionConnectionUpdate(rawPayload); ... }`). O evento de conexão da Go é `event === "Connection"` (PascalCase) com `data.State` (`"open"|"close"|"connecting"|"timeout"`), diferente do `connection.update` do v2. Adicionar, **antes** de tentar parsear como mensagem, um ramo que detecta o evento Connection da Go e o trata como sinal de lifecycle (sem inserir mensagem):

```ts
if (provider === "evolution-go") {
  const ev = rawPayload as { event?: string; data?: { State?: string } } | null;
  if (ev?.event === "Connection") {
    // Lifecycle only — não há mensagem para persistir. O parser lança em
    // eventos não-Message, então retornamos cedo aqui (espelha como o v2
    // trata connection.update). Atualização de status da conta (connected/
    // disconnected) fica a cargo do poll do whatsapp-connect na Fase 2.
    return;
  }
}
```
> Posicionar este guard de modo que rode para `evolution-go` **antes** da chamada a `parseEvolutionGoInbound` (que lançaria em `Connection`). Reusar o ponto onde o v2 já intercepta `connection.update` — adicionar o ramo Go ao lado, sem mexer no do v2.

- [ ] **Step 5: Rodar e ver passar**

Run: `bun run test src/providers/whatsapp/webhook/core.test.ts`
Expected: PASS — inbound text normalizado com `provider: "evolution-go"`; `Connection` não insere mensagem; casos `meta`/`evolution` seguem verdes.

- [ ] **Step 6: Sync + commit**

```bash
bun run scripts/sync-whatsapp-shared.ts
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts \
  supabase/functions/_shared/whatsapp/webhook/core.ts
git commit -m "feat(whatsapp): webhook core parses evolution-go (whatsmeow) + Connection lifecycle"
```

---

### Task 3: Webhook edge — rota, resolução de conta por `instanceId` e gate por `instanceToken`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`
- Modify (interface + db adapter): a interface `IWebhookDb` em `src/providers/whatsapp/webhook/core.ts` ganha `findEvolutionGoAccount`/`findEvolutionGoAccountAnyStatus`; a implementação concreta vive no `index.ts` da edge.

**Interfaces:**
- Consumes: `EvolutionGoProvider` de `../_shared/whatsapp/evolution-go/EvolutionGoProvider.ts` (para `verifyWebhookSignature`); `createSecretResolver` de `../_shared/secrets.ts`; o parser dispatch da Task 2.
- Produces: a URL `/functions/v1/whatsapp-webhook/evolution-go` é aceita; a conta é resolvida por `provider_config->>instanceId` (provider `evolution-go`); o payload é autenticado comparando seu `instanceToken` ao `{credentials_ref}_INSTANCE_TOKEN` do Vault (constant-time, fail-closed).

> **Gate desta task = build + `tsc` + smoke e2e** (código de edge Deno; não há Vitest para o `index.ts`). Não escrever teste Vitest do handler; validar no smoke.

- [ ] **Step 1: Aceitar a rota `evolution-go`**

Localizar (hoje):
```ts
if (provider !== "meta" && provider !== "evolution") {
  return respond(json({ error: "unknown provider" }, 400));
}
```
Trocar por:
```ts
if (provider !== "meta" && provider !== "evolution" && provider !== "evolution-go") {
  return respond(json({ error: "unknown provider" }, 400));
}
```

- [ ] **Step 2: Adicionar `findEvolutionGoAccount` à interface `IWebhookDb` (em `src/.../webhook/core.ts`)**

Junto das assinaturas `findEvolutionAccount`/`findEvolutionAccountAnyStatus`, adicionar:
```ts
  /** Resolve a conta evolution-go pelo instanceId do payload (provider_config.instanceId). */
  findEvolutionGoAccount(instanceId: string): Promise<IAccountRecord | null>;
  findEvolutionGoAccountAnyStatus(instanceId: string): Promise<IAccountRecord | null>;
```
Rodar `bun run scripts/sync-whatsapp-shared.ts` ao final desta task (a interface vive na camada espelhada).

- [ ] **Step 3: Implementar a resolução de conta no `index.ts` da edge**

No objeto que implementa `IWebhookDb` dentro de `whatsapp-webhook/index.ts`, espelhar a implementação de `findEvolutionAccount(AnyStatus)` trocando o filtro:
```ts
findEvolutionGoAccount: async (instanceId: string) => {
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("id, provider, credentials_ref, provider_config, status")
    .eq("provider", "evolution-go")
    .eq("provider_config->>instanceId", instanceId)
    .eq("status", "connected")
    .maybeSingle();
  return data ? toAccountRecord(data) : null;
},
findEvolutionGoAccountAnyStatus: async (instanceId: string) => {
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("id, provider, credentials_ref, provider_config, status")
    .eq("provider", "evolution-go")
    .eq("provider_config->>instanceId", instanceId)
    .maybeSingle();
  return data ? toAccountRecord(data) : null;
},
```
> Use exatamente o mesmo `select`, `toAccountRecord` e tratamento de `status` que o `findEvolutionAccount` v2 já usa neste arquivo — só troque `provider` para `evolution-go` e a chave `instanceName` → `instanceId`.

- [ ] **Step 4: Extrair `instanceId` do payload e rotear o gate**

Onde hoje o handler resolve a conta v2:
```ts
const instance = (payload as { instance?: string } | null)?.instance ?? "";
const account = await db.findEvolutionAccountAnyStatus(instance);
const rejection = await evolutionGate(req, rawBody, account, log, resolveSecret);
```
adicionar, **antes**, o ramo Go (o payload whatsmeow traz `instanceId` no topo):
```ts
if (provider === "evolution-go") {
  const instanceId = (payload as { instanceId?: string } | null)?.instanceId ?? "";
  const account = await db.findEvolutionGoAccountAnyStatus(instanceId);
  const rejection = await evolutionGoGate(rawBody, payload, account, log, resolveSecret);
  if (rejection) return respond(rejection);
  // segue para processWebhookEvent com `account` resolvido (mesmo caminho do v2)
}
```
> Estruture para reaproveitar o fluxo comum a jusante (`processWebhookEvent`) com o `account` resolvido — espelhe a forma como o ramo `evolution` encadeia gate → process. Evite duplicar o corpo do `process`.

- [ ] **Step 5: Implementar `evolutionGoGate` (auth por instanceToken, fail-closed)**

Adicionar a função (perto de `evolutionGate`):
```ts
import { EvolutionGoProvider } from "../_shared/whatsapp/evolution-go/EvolutionGoProvider.ts";

/**
 * Evolution Go has no HMAC: the webhook payload carries the per-instance
 * `instanceToken`. We authenticate by comparing it (constant-time) to the
 * Vault token via EvolutionGoProvider.verifyWebhookSignature. Fail-closed:
 * unknown account or missing/mismatched token → 401.
 */
async function evolutionGoGate(
  rawBody: string,
  payload: unknown,
  account: IAccountRecord | null,
  log: (msg: string) => void,
  resolveSecret: VaultSecretResolver,
): Promise<Response | null> {
  if (!account) {
    log("evolution-go webhook: conta não encontrada para o instanceId");
    return json({ error: "unknown instance" }, 401);
  }
  const token = (payload as { instanceToken?: string } | null)?.instanceToken ?? "";
  const provider = new EvolutionGoProvider(
    { accountId: account.id, baseUrl: String((account.providerConfig as { baseUrl?: string })?.baseUrl ?? ""), instanceId: String((account.providerConfig as { instanceId?: string })?.instanceId ?? ""), credentialsRef: account.credentialsRef ?? "" },
    { resolveSecret },
  );
  const ok = await provider.verifyWebhookSignature(rawBody, token);
  if (!ok) {
    log("evolution-go webhook: instanceToken inválido");
    return json({ error: "invalid token" }, 401);
  }
  return null;
}
```
> `verifyWebhookSignature(rawBody, signature)` compara `signature` (o `instanceToken` do payload) com `{credentialsRef}_INSTANCE_TOKEN` do Vault. Nunca lança (retorna `false`). `IAccountRecord` já expõe `credentialsRef`/`providerConfig` — confirme os nomes exatos no arquivo e ajuste.

- [ ] **Step 6: Liberar `scheduleAvatarFetch` para evolution-go (config por `instanceId`)**

Onde hoje há `if (account.provider !== "evolution") return;` em `scheduleAvatarFetch`, trocar por `if (account.provider !== "evolution" && account.provider !== "evolution-go") return;` e ler `instanceId` (não `instanceName`) do `provider_config` quando `provider === "evolution-go"`.
> Se o avatar-fetch da Go ainda não tiver função equivalente em `evolution-go/instance.ts`, manter **degradação honesta**: `if (account.provider === "evolution-go") return;` (não-suportado nesta fase; entra na Fase 3 de paridade). Escolher esta opção mais simples se a função de avatar não existir — e anotar como deferido.

- [ ] **Step 7: Build + commit**

Run: `bun run build` (deve concluir sem erro)
Run: `bunx tsc --noEmit 2>&1 | grep -iE "whatsapp-webhook" || echo "ok"`
```bash
git add supabase/functions/whatsapp-webhook/index.ts src/providers/whatsapp/webhook/core.ts \
  supabase/functions/_shared/whatsapp/webhook/core.ts
git commit -m "feat(whatsapp): whatsapp-webhook routes evolution-go (instanceId resolve + token gate)"
```

---

### Task 4: Connect edge — ramo `evolution-go` (create → token → Vault → connect → QR + lifecycle)

**Files:**
- Modify: `supabase/functions/whatsapp-connect/index.ts`

**Interfaces:**
- Consumes: `createGoInstance`, `connectGoInstance`, `getGoInstanceQr`, `getGoInstanceStatus`, `logoutGoInstance`, `deleteGoInstance`, `restartGoInstance` de `../_shared/whatsapp/evolution-go/instance.ts`; `EVOLUTION_GO_SECRET_SUFFIXES`, `EVOLUTION_GO_DEFAULT_SUBSCRIBE` de `../_shared/whatsapp/evolution-go/constants.ts`; `createSecretResolver` de `../_shared/secrets.ts`.
- Produces: para uma conta `provider="evolution-go"`, o connect cria a instância (chave global), grava o token no Vault, conecta (token) apontando o webhook para `/whatsapp-webhook/evolution-go`, e devolve o QR; cobre status/logout/restart/delete.

> **Gate = build + `tsc` + smoke e2e** (edge Deno). Sem Vitest do handler.

- [ ] **Step 1: Liberar o gate de provider**

Localizar:
```ts
if (account.provider !== "evolution") {
  throw new HttpError(422, "Conexão por QR é exclusiva de contas Evolution");
}
```
Trocar por:
```ts
if (account.provider !== "evolution" && account.provider !== "evolution-go") {
  throw new HttpError(422, "Conexão por QR é exclusiva de contas Evolution / Evolution Go");
}
```

- [ ] **Step 2: Importar a camada Go e ramificar a extração de config**

Adicionar os imports da `instance.ts`/`constants.ts` da Go (ver Interfaces). Onde a config v2 é montada (`{ baseUrl, instanceName }`), ramificar: para `evolution-go`, montar `{ baseUrl, instanceId }` lendo `provider_config.instanceId` (pode estar vazio antes do primeiro `create` — ver Step 3).

- [ ] **Step 3: Ramo de conexão Go (create → token → Vault → connect → QR)**

Para `account.provider === "evolution-go"`, no fluxo de "conectar/gerar QR":
```ts
const config = account.provider_config ?? {};
const baseUrl = String(config.baseUrl ?? "");
const credsRef = account.credentials_ref ?? "";
const globalKey = await deps.resolveSecret(`${credsRef}${EVOLUTION_GO_SECRET_SUFFIXES.apiKey}`); // _API_KEY
if (!globalKey) throw new HttpError(422, "Chave global da Evolution Go não configurada (credentials_ref + _API_KEY)");

// 1) Garantir a instância: se ainda não há instanceId no provider_config, cria.
let instanceId = String(config.instanceId ?? "");
let instanceToken = await deps.resolveSecret(`${credsRef}${EVOLUTION_GO_SECRET_SUFFIXES.instanceToken}`);
if (!instanceId) {
  const created = await createGoInstance(globalKey, deps, { baseUrl, name: account.id }); // name = id da conta (estável)
  instanceId = created.instanceId;
  instanceToken = created.token;
  // 2) Persistir instanceId no provider_config e o token no Vault.
  await admin.from("whatsapp_accounts")
    .update({ provider_config: { ...config, instanceId } })
    .eq("id", account.id);
  const { error: secErr } = await admin.rpc("integration_secret_set", {
    p_name: `${credsRef}${EVOLUTION_GO_SECRET_SUFFIXES.instanceToken}`,
    p_value: instanceToken,
    p_description: `Evolution Go instance token (conta ${account.id})`,
  });
  if (secErr) throw new HttpError(500, `Falha ao gravar o token da instância no Vault: ${secErr.message}`);
}
if (!instanceToken) throw new HttpError(500, "Token da instância Evolution Go ausente — refaça o pareamento");

// 3) Conectar (token da instância) apontando o webhook para a rota go + assinar eventos.
const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/whatsapp-webhook/evolution-go`;
await connectGoInstance(instanceToken, deps, { baseUrl, instanceId }, webhookUrl, EVOLUTION_GO_DEFAULT_SUBSCRIBE);

// 4) QR (token da instância).
const qr = await getGoInstanceQr(instanceToken, deps, { baseUrl, instanceId });
// devolver qr.qrBase64 / qr.pairingCode no mesmo formato de resposta do v2; se qr.state === "open", a sessão já está pareada.
```
> **Atenção (smoke):** `name: account.id` no `create` — confirmar se a Go aceita re-`create` com o mesmo name de forma idempotente (a `mapEvolutionGoError` já trata 403 "already in use" como `INTEGRATION_ERROR` preservando a mensagem). Se a Go recusar nomes repetidos, capturar o `instanceId` existente via `/instance/all` antes de criar. Decidir contra o servidor real.

- [ ] **Step 4: Status / logout / restart / delete para Go**

Nas ações correspondentes do handler, ramificar por `account.provider === "evolution-go"` usando as funções Go com o **token da instância** como `apiKey` (não a global), exceto onde a ação for puramente admin:
- **status:** `getGoInstanceStatus(instanceToken, deps, { baseUrl, instanceId })` → mapear `{connected, loggedIn}` para o `status` da conta (`connected`/`disconnected`) e persistir.
- **logout:** `logoutGoInstance(instanceToken, deps, { baseUrl, instanceId })`.
- **restart:** `restartGoInstance(instanceToken, deps, { baseUrl, instanceId })`.
- **delete (teardown):** no ramo de delete (que roda antes do gate), adicionar `if (account.provider === "evolution-go")` chamando `deleteGoInstance(instanceToken, deps, { baseUrl, instanceId })` (token da instância); seguir com o delete da linha como no v2.

- [ ] **Step 5: `test-message` usa `account.provider`**

Localizar no `test-message`:
```ts
const engine = buildWhatsAppEngine({ engine: "evolution", ... });
```
Trocar o literal por `engine: account.provider` (assim funciona para `evolution` e `evolution-go` sem novo ramo).

- [ ] **Step 6: Build + commit**

Run: `bun run build`
Run: `bunx tsc --noEmit 2>&1 | grep -iE "whatsapp-connect" || echo "ok"`
```bash
git add supabase/functions/whatsapp-connect/index.ts
git commit -m "feat(whatsapp): whatsapp-connect pairs evolution-go (create→vault token→connect→QR)"
```

---

### Task 5: Failover — incluir `evolution-go` na matriz

**Files:**
- Modify: `src/providers/whatsapp/failover.ts`
- Test: `src/providers/whatsapp/failover.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `resolveEffectiveAccount` aceita `evolution-go` como par válido na matriz meta ↔ evolution ↔ evolution-go; mantém `FAILOVER_INCOMPATIBLE` quando o destino de um `template` não é `meta` (Go não suporta templates, igual ao v2).

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `src/providers/whatsapp/failover.test.ts` (espelhar os helpers existentes):
```ts
it("permite failover meta → evolution-go para envios não-template", () => {
  const eff = resolveEffectiveAccount({
    primary: makeAccount({ provider: "meta", isFailoverActive: true, failoverAccountId: "go-1" }),
    failover: makeAccount({ id: "go-1", provider: "evolution-go" }),
    kind: "text",
  });
  expect(eff.provider).toBe("evolution-go");
});

it("rejeita failover de template para evolution-go (FAILOVER_INCOMPATIBLE)", () => {
  expect(() =>
    resolveEffectiveAccount({
      primary: makeAccount({ provider: "meta", isFailoverActive: true, failoverAccountId: "go-1" }),
      failover: makeAccount({ id: "go-1", provider: "evolution-go" }),
      kind: "template",
    }),
  ).toThrowError(/FAILOVER_INCOMPATIBLE|template/i);
});
```
> Ajuste `makeAccount`/o shape de input ao que o arquivo já usa.

- [ ] **Step 2: Rodar e ver (provável) passar-ou-falhar**

Run: `bun run test src/providers/whatsapp/failover.test.ts`
Expected: o caso de template já deve passar (a regra `failover.provider !== "meta"` é agnóstica). O caso "permite meta → evolution-go" falha se a matriz tiver um allowlist explícito de providers que não inclui `evolution-go`.

- [ ] **Step 3: Ajustar a matriz (só se o Step 2 mostrar allowlist)**

Se `failover.ts` tiver uma checagem explícita de providers permitidos (ex.: um `Set`/condição listando `"meta"`/`"evolution"`), adicionar `"evolution-go"`. Se a lógica já for agnóstica (só depende de `template → meta`), **nenhuma mudança de código é necessária** — os testes apenas documentam o comportamento (registrar isso no relatório).

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/providers/whatsapp/failover.test.ts`
Expected: PASS.

- [ ] **Step 5: Sync + commit**

```bash
bun run scripts/sync-whatsapp-shared.ts
git add src/providers/whatsapp/failover.ts src/providers/whatsapp/failover.test.ts \
  supabase/functions/_shared/whatsapp/failover.ts
git commit -m "test(whatsapp): cover evolution-go in failover matrix"
```

---

### Task 6: Gate verde, sync final e plano de deploy + smoke e2e (gated no dono)

**Files:**
- Verify: todo o conjunto.
- Create: `docs/dev/evolution-go-edges.md` (runbook curto de deploy + smoke).

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: suíte + build verdes; mirror sincronizado e commitado; runbook de deploy/smoke para o dono executar.

- [ ] **Step 1: Sync + gate completo**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Run: `bun run test` → Expected: todos os arquivos passam, sem regressão em meta/evolution.
Run: `bun run build` → Expected: conclui sem erro.
Run: `bunx tsc --noEmit 2>&1 | grep -iE "evolution-go|whatsapp-webhook|whatsapp-connect|webhook/core|send/core|failover" || echo "no new type errors"`

- [ ] **Step 2: Commitar quaisquer arquivos do mirror com mudança real**

Confirmar com `git status` (ignorando churn de CRLF — usar `git diff --ignore-cr-at-eol --stat`) que todos os arquivos `_shared/whatsapp/**` com **mudança de conteúdo** estão commitados; descartar o churn de CRLF (`git checkout -- .` nos não-relevantes).

- [ ] **Step 3: Escrever o runbook de deploy + smoke**

Criar `docs/dev/evolution-go-edges.md` com: (a) ordem de deploy das edges (`whatsapp-webhook`, `whatsapp-connect`, `whatsapp-send`) via Supabase MCP `deploy_edge_function` ou CLI `npx supabase functions deploy <fn> --project-ref njizaasajkdqptlxddqn` (webhook com `--no-verify-jwt`); (b) pré-requisitos do dono: gravar a **chave global** do servedor evogo em `{credentials_ref}_API_KEY` (Chaves & API) e ter uma linha `whatsapp_accounts` com `provider='evolution-go'`, `provider_config={baseUrl}`, `credentials_ref` (MAIÚSCULO); (c) o **roteiro de smoke e2e** validando os critérios de aceitação do spec §9 + resolvendo os 2 contratos ainda abertos (corpo do `/message/downloadimage` base64-vs-`[]int`; shape exato do webhook).

- [ ] **Step 4: Commit**

```bash
git add docs/dev/evolution-go-edges.md
git commit -m "docs(whatsapp): evolution-go edges deploy + e2e smoke runbook"
```

- [ ] **Step 5: GATE do dono — deploy + smoke**

> **NÃO fazer deploy em produção nem rodar o e2e sem o "ok" explícito do dono.** Entregar o runbook e aguardar. O smoke e2e é onde os 2 contratos não-verificados da Fase 1 (download de mídia; shape do webhook) são finalmente confirmados — qualquer ajuste vira um fix pontual (já isolado num ponto cada).

---

## Self-Review

- **Spec coverage (§4.3–4.6, §9):** §4.3 connect/webhook/send → Tasks 4/3/1+5; §4.4 (resolução por instanceId + auth por instanceToken) → Task 3; §4.5 failover → Task 5; §4.3 "build.ts/factory.ts" já feito na Fase 1 (Task 10 daquele plano) — confirmado, não repetido aqui. **Auxiliares de paridade (§4.3 último bullet) e UI (§4.6) ficam FORA desta fase** (Fase 3 e Fase 5) — declarado no header. §8 (riscos/contratos abertos) → Task 6 Step 5 (smoke).
- **Placeholder scan:** os "confirmar contra o servidor real" (idempotência do `create`, avatar não-suportado) são pontos de validação contra API de terceiro + degradação honesta declarada, não requisitos vagos — cada um traz a decisão concreta a tomar e o fallback. As edges `index.ts` não têm Vitest por serem Deno — declarado no Global Constraints + por-task; o gate delas é build+tsc+smoke (honesto, não placeholder).
- **Type consistency:** a união `"meta" | "evolution" | "evolution-go"` é introduzida na Task 1 e consumida em 2/3/5; `findEvolutionGoAccount(AnyStatus)` definido na Task 3 Step 2 e usado no Step 4; `EVOLUTION_GO_SECRET_SUFFIXES.{apiKey,instanceToken}` e `EVOLUTION_GO_DEFAULT_SUBSCRIBE` (Fase 1) consumidos nas Tasks 3/4; `createGoInstance`→`{instanceId,token}`, `getGoInstanceQr`→`{state,qrBase64?,pairingCode?}`, `getGoInstanceStatus`→`{connected,loggedIn}` (Fase 1) consumidos na Task 4; `verifyWebhookSignature(rawBody, signature)` (Fase 1) consumido na Task 3.
- **Decisões resolvidas nesta fase (visíveis para revisão):** Model A de segredos (dono confirmou); Vault-write via `integration_secret_set` (RPC existente, sem migration); create-on-connect com captura do token do retorno; resolução de conta por `instanceId`; e2e da Fase 2 validado com linha `whatsapp_accounts` semeada manualmente (o wizard é Fase 5).
