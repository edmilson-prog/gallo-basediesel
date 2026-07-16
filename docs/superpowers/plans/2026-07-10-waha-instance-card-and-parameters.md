# WAHA — Card de instância rico + Parâmetros de sessão — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o card de sessão WAHA num card rico (acesso, status/saúde, cor, métricas, ações) espelhado no card Meta/Evolution, e expor os parâmetros úteis da sessão WAHA (filtros de chat, debug, proxy, dispositivo read-only) num wizard "Avançado" + diálogo editável.

**Architecture:** Sessões WAHA já são linhas `whatsapp_accounts` (`provider='waha'`). O card reaproveita `useWhatsAppAccountsProvider` (`get`/`getMetrics`/`getAccessRules`/`update` não filtram por provider) via novo método aditivo `listWaha`, sem tocar no `list()` genérico. Ciclo de vida + gravação de config via Edge `waha-connect`. Config nova em `provider_config.waha` (jsonb, sem migration). Engine `waha/*` runtime-agnostic espelhado em `_shared/`.

**Tech Stack:** React 19, TanStack Query/Router, shadcn/ui, Tailwind v4 (tokens semânticos), Vitest, Deno Edge Functions.

**Spec:** `docs/superpowers/specs/2026-07-10-waha-instance-card-and-parameters-design.md`

## Global Constraints

- **Tokens semânticos apenas** — `bg-card`/`text-foreground`/`border-border`/`text-primary`/`text-severity-{success|warning|critical}`. Nunca hex nem `--gallo-*`. Corrigir `bg-emerald-500/10`/`text-emerald-600` crus.
- **pt-BR com acentuação** em UI; código/comentários em inglês.
- **Motion** `motion-safe:`/`motion-reduce:transition-none`; decorativos `aria-hidden`; controles `aria-label` pt-BR.
- **Não tocar** `whatsappAccounts.list()` (o `neq("provider","waha")` é load-bearing) nem cache/realtime do Atendimento. Nenhuma migration.
- **Engine `src/providers/whatsapp/waha/**`** só Web APIs + imports relativos. Após mudar: `bun run scripts/sync-whatsapp-shared.ts` + redeploy `waha-connect` (Owner-gated).
- **`waha-connect` isolado** — não importa o pipeline compartilhado Meta/Evolution.
- **Não portar** failover, templates HSM, chips de capacidade.
- **Gate de CI:** `bun run build` + `bun run test` verdes. `bunx tsc --noEmit` avaliado por delta (baseline pré-existente).
- **Mapeamento WAHA config (confirmado na doc oficial):** `config.ignore.{status,groups,channels,broadcast}` (booleano = **ignorar**; 1:1 sempre passa) · `config.debug` (bool) · `config.proxy.{server,username?,password?}` · `config.client.{deviceName,browserName}` (no-op em GOWS) · `PUT /api/sessions/{session}` atualiza e, se não `STOPPED`, para+inicia sozinho (pareamento preservado; exige config completa).

---

## File Structure

- `src/shared/types/conversation.ts` — novo `IWahaSessionConfig`; `IWhatsAppProviderConfig` ganha `sessionName?`/`waha?`; `IWhatsAppAccount` ganha `wahaServerId?`.
- `src/providers/data/contracts/whatsappAccounts.ts` — interface ganha `listWaha`.
- `src/providers/data/impl/supabase/whatsappAccounts.ts` — `waha_server_id` em COLUMNS/row/mapper; `listWaha`.
- `src/providers/data/impl/mock/whatsappAccounts.ts` — `listWaha`.
- `src/providers/whatsapp/waha/client.ts` — `"PUT"` no union de método.
- `src/providers/whatsapp/waha/session.ts` — `IWahaSessionSettings`, `buildWahaConfig`, `createWahaSession(settings)`, `updateWahaSessionConfig`.
- `src/providers/whatsapp/waha/session.test.ts` — testes novos.
- `supabase/functions/_shared/whatsapp/waha/*` — espelho (via sync).
- `supabase/functions/waha-connect/index.ts` — `create` com config, `state` com `rawState`, ação `updateConfig`.
- `src/features/admin-settings/components/WahaSection.tsx` — card rico + banner + seção "Avançado" no wizard + `WahaParamsDialog`.
- `docs/dev/waha-integration.md` — doc das ações/config novas.

---

## Task 1: Tipos + provider `listWaha` + `wahaServerId`

**Files:**
- Modify: `src/shared/types/conversation.ts` (`IWhatsAppProviderConfig` ~286-299; `IWhatsAppAccount` — mesma pasta, achar por `goServerId`)
- Modify: `src/providers/data/contracts/whatsappAccounts.ts:61-85`
- Modify: `src/providers/data/impl/supabase/whatsappAccounts.ts` (COLUMNS:48-51, row:26-45, mapper:53-74, +método)
- Modify: `src/providers/data/impl/mock/whatsappAccounts.ts:23-45`

**Interfaces:**
- Produces: `IWahaSessionConfig`; `IWhatsAppAccount.wahaServerId?`; `IWhatsAppAccountsProvider.listWaha({storeId}): Promise<IWhatsAppAccount[]>`.

- [ ] **Step 1: Tipos em `conversation.ts`.** Antes de `export interface IWhatsAppProviderConfig` adicione:

```ts
/**
 * WAHA per-session settings surfaced in the UI (wizard "Avançado" + params
 * dialog). `chatFilters` are "process this type" booleans — the engine inverts
 * them into WAHA's `config.ignore`. `device` is shown read-only (no-op on GOWS).
 */
export interface IWahaSessionConfig {
  chatFilters: { groups: boolean; status: boolean; channels: boolean; broadcast: boolean };
  debug: boolean;
  proxy?: { server: string; username?: string; password?: string };
  device?: { name?: string; browser?: string };
}
```

Dentro de `IWhatsAppProviderConfig`, após `accentColor?`, adicione:

```ts
  /** WAHA — the created session name (provider='waha' rows). */
  sessionName?: string;
  /** WAHA — per-session settings (chat filters, debug, proxy). */
  waha?: IWahaSessionConfig;
```

Ache `export interface IWhatsAppAccount` (mesmo arquivo; tem `goServerId?`) e, ao lado de `goServerId?`, adicione:

```ts
  /** WAHA — id do servidor WAHA (waha_servers) que hospeda a sessão. */
  wahaServerId?: ID;
```

- [ ] **Step 2: Contrato.** Em `whatsappAccounts.ts`, dentro de `interface IWhatsAppAccountsProvider`, após `list(...)` (linha 62) adicione:

```ts
  /**
   * WAHA-scoped list (provider='waha'), fora do `list()` genérico que exclui
   * WAHA de propósito. Retorna `IWhatsAppAccount[]` para o card rico da aba WAHA.
   */
  listWaha(params: { storeId: ID }): Promise<IWhatsAppAccount[]>;
```

- [ ] **Step 3: Supabase impl.** Em `impl/supabase/whatsappAccounts.ts`:
  - `COLUMNS` (linha 48-51): acrescente `", waha_server_id"` ao final da string.
  - `WhatsAppAccountRow` (interface): adicione `waha_server_id: string | null;`.
  - `rowToWhatsAppAccount`: adicione `wahaServerId: row.waha_server_id ?? undefined,`.
  - Adicione o método (após `list`):

```ts
  async listWaha(params: { storeId: ID }): Promise<IWhatsAppAccount[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("provider", "waha")
      .eq("store_id", params.storeId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] whatsappAccounts.listWaha failed: ${error.message}`);
    return (data as unknown as WhatsAppAccountRow[]).map(rowToWhatsAppAccount);
  },
```

- [ ] **Step 4: Mock impl.** Em `impl/mock/whatsappAccounts.ts`, dentro do objeto provider adicione:

```ts
  listWaha: (params) =>
    whatsappAccountsApi.list(params).then((list) => list.filter((a) => a.provider === "waha")),
```

- [ ] **Step 5: Type-check + build.** Run: `bunx tsc --noEmit` — confirme **zero erros novos** nos 4 arquivos tocados (baseline pré-existente ignorado). Run: `bun run build` — deve passar.

- [ ] **Step 6: Commit.**

```bash
git add src/shared/types/conversation.ts src/providers/data/contracts/whatsappAccounts.ts src/providers/data/impl/supabase/whatsappAccounts.ts src/providers/data/impl/mock/whatsappAccounts.ts
git commit -m "feat(waha): add IWahaSessionConfig types + listWaha provider method"
```

---

## Task 2: Engine — `buildWahaConfig`, `createWahaSession(settings)`, `updateWahaSessionConfig`

**Files:**
- Modify: `src/providers/whatsapp/waha/client.ts:15`
- Modify: `src/providers/whatsapp/waha/session.ts` (`createWahaSession` 27-49; +novos)
- Modify: `src/providers/whatsapp/waha/session.test.ts`
- Run: `bun run scripts/sync-whatsapp-shared.ts` (espelho `_shared/`)

**Interfaces:**
- Consumes: `WAHA_DEFAULT_EVENTS` (`./constants`), `wahaRequest` (`./client`).
- Produces: `IWahaSessionSettings`; `buildWahaConfig(webhookUrl, hmacKey, settings?)`; `createWahaSession(apiKey, fetchFn, { baseUrl, sessionName, webhookUrl, hmacKey, settings? })`; `updateWahaSessionConfig(apiKey, fetchFn, { baseUrl, sessionName, webhookUrl, hmacKey, settings? })`.

- [ ] **Step 1: PUT no client.** Em `client.ts:15` troque a linha do union por:

```ts
  method?: "GET" | "POST" | "PUT" | "DELETE";
```

- [ ] **Step 2: Testes falhando (TDD).** Em `session.test.ts`, adicione ao topo o import de `buildWahaConfig`, `updateWahaSessionConfig` (junto dos já importados) e um novo bloco:

```ts
describe("WAHA session config", () => {
  it("buildWahaConfig ignores all non-1:1 chat types by default and keeps webhooks", () => {
    const config = buildWahaConfig("https://edge/waha-webhook", "secret");
    expect(config.ignore).toEqual({ status: true, groups: true, channels: true, broadcast: true });
    expect(config.debug).toBeUndefined();
    expect((config.webhooks as Array<{ url: string }>)[0].url).toBe("https://edge/waha-webhook");
  });

  it("buildWahaConfig inverts chatFilters (process=true → ignore=false) and sets debug/proxy", () => {
    const config = buildWahaConfig("https://edge/waha-webhook", "secret", {
      chatFilters: { groups: true, status: false, channels: false, broadcast: false },
      debug: true,
      proxy: { server: "http://proxy:8080" },
    });
    expect(config.ignore).toEqual({ status: true, groups: false, channels: true, broadcast: true });
    expect(config.debug).toBe(true);
    expect(config.proxy).toEqual({ server: "http://proxy:8080" });
  });

  it("createWahaSession sends the built config with settings", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, { name: "s", status: "STARTING" }));
    await createWahaSession("key", fetchFn, {
      baseUrl: "https://waha.example.com",
      sessionName: "loja-abc123",
      webhookUrl: "https://edge/waha-webhook",
      hmacKey: "secret",
      settings: { chatFilters: { groups: true, status: true, channels: false, broadcast: false }, debug: false },
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.config.ignore).toEqual({ status: false, groups: false, channels: true, broadcast: true });
  });

  it("updateWahaSessionConfig PUTs the full config to /api/sessions/{name}", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await updateWahaSessionConfig("key", fetchFn, {
      baseUrl: "https://waha.example.com",
      sessionName: "loja-abc123",
      webhookUrl: "https://edge/waha-webhook",
      hmacKey: "secret",
      settings: { chatFilters: { groups: false, status: false, channels: false, broadcast: false }, debug: true },
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sessions/loja-abc123");
    expect(fetchFn.mock.calls[0][1].method).toBe("PUT");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.config.webhooks[0].hmac.key).toBe("secret");
    expect(body.config.debug).toBe(true);
  });
});
```

- [ ] **Step 3: Rode e confirme a falha.** Run: `bun run test src/providers/whatsapp/waha/session.test.ts` — Expected: FAIL (símbolos não existem).

- [ ] **Step 4: Implementar em `session.ts`.** Substitua `createWahaSession` (27-49) e adicione os novos símbolos:

```ts
/** UI-facing per-session knobs (structurally compatible with IWahaSessionConfig). */
export interface IWahaSessionSettings {
  chatFilters?: { groups?: boolean; status?: boolean; channels?: boolean; broadcast?: boolean };
  debug?: boolean;
  proxy?: { server: string; username?: string; password?: string };
}

/**
 * Builds the WAHA session `config`. `chatFilters` are "process this type";
 * WAHA's `config.ignore` is "ignore this type" → inverted. With no settings,
 * every non-1:1 type is ignored (commercial-inbox default). `debug`/`proxy`
 * are only set when meaningful.
 */
export function buildWahaConfig(
  webhookUrl: string,
  hmacKey: string,
  settings?: IWahaSessionSettings,
): Record<string, unknown> {
  const cf = settings?.chatFilters;
  const config: Record<string, unknown> = {
    ignore: {
      status: !cf?.status,
      groups: !cf?.groups,
      channels: !cf?.channels,
      broadcast: !cf?.broadcast,
    },
    webhooks: [{ url: webhookUrl, events: [...WAHA_DEFAULT_EVENTS], hmac: { key: hmacKey } }],
  };
  if (settings?.debug) config.debug = true;
  if (settings?.proxy?.server) config.proxy = settings.proxy;
  return config;
}

export async function createWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  input: {
    baseUrl: string;
    sessionName: string;
    webhookUrl: string;
    hmacKey: string;
    settings?: IWahaSessionSettings;
  },
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: input.baseUrl,
    path: "/api/sessions",
    json: {
      name: input.sessionName,
      start: true,
      config: buildWahaConfig(input.webhookUrl, input.hmacKey, input.settings),
    },
  });
}

/**
 * Updates an existing session's config. WAHA `PUT /api/sessions/{name}` requires
 * the COMPLETE config and, when the session isn't STOPPED, stops+starts it with
 * the new config (auth/pairing preserved — no QR re-scan). Rebuilds the same
 * webhook block create used.
 */
export async function updateWahaSessionConfig(
  apiKey: string,
  fetchFn: typeof fetch,
  input: {
    baseUrl: string;
    sessionName: string;
    webhookUrl: string;
    hmacKey: string;
    settings?: IWahaSessionSettings;
  },
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: input.baseUrl,
    path: `/api/sessions/${input.sessionName}`,
    method: "PUT",
    json: {
      name: input.sessionName,
      config: buildWahaConfig(input.webhookUrl, input.hmacKey, input.settings),
    },
  });
}
```

- [ ] **Step 5: Verde.** Run: `bun run test src/providers/whatsapp/waha/session.test.ts` — Expected: PASS (todos, incl. os antigos).

- [ ] **Step 6: Espelhar.** Run: `bun run scripts/sync-whatsapp-shared.ts`. Confirme que `supabase/functions/_shared/whatsapp/waha/session.ts` e `client.ts` refletem as mudanças (cabeçalho "AUTO-GENERATED MIRROR").

- [ ] **Step 7: Commit.**

```bash
git add src/providers/whatsapp/waha/ supabase/functions/_shared/whatsapp/waha/
git commit -m "feat(waha): build session config (ignore/debug/proxy) + PUT update engine"
```

---

## Task 3: Edge `waha-connect` — create com config, `state.rawState`, ação `updateConfig`

**Files:**
- Modify: `supabase/functions/waha-connect/index.ts`

**Interfaces:**
- Consumes: `createWahaSession`/`updateWahaSessionConfig`/`getWahaSessionStatus` (`_shared/.../session.ts`), `wahaStateToAccountStatus` (`_shared/.../constants.ts`), `resolveWahaServer` (`./wahaServer.ts`).
- Produces: body `{ ..., sessionConfig? }` no `create`; `state` retorna `rawState`; ação `updateConfig`.

> ⚠️ Sem harness local de teste (Deno). Gate = revisão + `bun run build` (frontend) verde + smoke no deploy Owner-gated. NÃO deployar sem OK do dono.

- [ ] **Step 1: Imports.** Adicione a `import { ... } from "../_shared/whatsapp/waha/session.ts"`: `getWahaSessionStatus`, `updateWahaSessionConfig`, e o `type IWahaSessionSettings`. Adicione `import { wahaStateToAccountStatus } from "../_shared/whatsapp/waha/constants.ts";`.

- [ ] **Step 2: ACTIONS + tipo do body.** Em `ACTIONS` (linha 39) inclua `"updateConfig"`. Amplie o tipo do `body` (linha 76-83) com `sessionConfig?: IWahaSessionSettings;`.

- [ ] **Step 3: `create` passa config + persiste.** No bloco `create`, na chamada `createWahaSession(...)` adicione `settings: body.sessionConfig` ao objeto de input. No `insert`, troque `provider_config: { sessionName }` por:

```ts
        provider_config: body.sessionConfig
          ? { sessionName, waha: body.sessionConfig }
          : { sessionName },
```

- [ ] **Step 4: `state` retorna `rawState`.** Substitua o corpo do `case "state"` para ler o estado bruto e mapear:

```ts
      case "state": {
        const { state: rawState, phoneNumber } = await getWahaSessionStatus(apiKey, fetchFn, target);
        const accountStatus = wahaStateToAccountStatus(rawState);
        const patch: Record<string, unknown> = { status: accountStatus };
        if (phoneNumber && !account.phone_number) patch.phone_number = phoneNumber;
        const wasConnected = account.status === "connected";
        await admin.from("whatsapp_accounts").update(patch).eq("id", account.id);
        if (accountStatus === "connected" && !wasConnected && actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_connected",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { provider: "waha" },
          });
        }
        return json({ state: accountStatus, rawState, phoneNumber, traceId: ctx.traceId }, 200);
      }
```

(Remova o import de `getWahaAccountStatus` se ficar sem uso; mantenha os demais.)

- [ ] **Step 5: ação `updateConfig`.** Adicione um `case "updateConfig"` no switch (o `target`/`baseUrl`/`apiKey` já resolvidos acima; precisamos também de `webhookUrl` e `hmacKey`). Como `resolveWahaServer` retorna `{ baseUrl, apiKey }`, resolva o HMAC do servidor do jeito que o `create` faz. Implemente:

```ts
      case "updateConfig": {
        const sessionConfig = body.sessionConfig;
        if (!sessionConfig) throw new HttpError(422, "sessionConfig é obrigatório");
        // Resolve o HMAC do servidor (o config completo precisa reconstruir o webhook).
        const { data: srv } = await admin
          .from("waha_servers")
          .select("webhook_hmac_ref")
          .eq("id", account.waha_server_id)
          .maybeSingle();
        const hmacKey = srv?.webhook_hmac_ref
          ? await resolveSecret(String(srv.webhook_hmac_ref))
          : "";
        if (!hmacKey) throw new HttpError(422, "Segredo HMAC do webhook WAHA não definido.");
        const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/waha-webhook`;
        await updateWahaSessionConfig(apiKey, fetchFn, {
          baseUrl,
          sessionName,
          webhookUrl,
          hmacKey,
          settings: sessionConfig,
        });
        const nextConfig = { ...(account.provider_config ?? {}), waha: sessionConfig };
        await admin
          .from("whatsapp_accounts")
          .update({ provider_config: nextConfig, status: "pending" })
          .eq("id", account.id);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_config_updated",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { waha: sessionConfig },
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
```

- [ ] **Step 6: JSDoc.** Atualize o comentário `Input (JSON body)` (linhas 11-14) para incluir `{ storeId, label, purpose?, wahaServerId?, sessionConfig?, action: 'create' }` e `{ accountId, action: 'updateConfig', sessionConfig }`.

- [ ] **Step 7: Build.** Run: `bun run build` — passa (o edge é Deno; a verificação real é revisão + smoke). Confirme via leitura que `ACTIONS`, imports e os dois novos blocos estão consistentes.

- [ ] **Step 8: Commit.**

```bash
git add supabase/functions/waha-connect/index.ts
git commit -m "feat(waha): edge create passes session config, state returns rawState, add updateConfig action"
```

---

## Task 4: Frontend — card rico (Opção 1) + banner de status

**Files:**
- Modify: `src/features/admin-settings/components/WahaSection.tsx`

**Interfaces:**
- Consumes: `useWhatsAppAccountsProvider` (`listWaha`/`getMetrics`/`getAccessRules`/`update`), `useWahaServersProvider`, `InstanceAccessSheet`, `INSTANCE_PALETTE` (`@/features/conversations/utils/instanceAccent`), `resolveAccessRecipients`, `useSellersProvider`, `invokeWaha`.

> Referência visual: o card de `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` (bloco `accounts.map` ~505-899). Copie a estrutura, **removendo** provider/health-badge de failover, chips de capacidade e todos os botões de failover/import/HSM. Componentes de acesso (`InstanceAccessSheet`), pill de acesso, color picker e grid de métricas são reaproveitados **como estão**.

- [ ] **Step 1: Trocar a fonte de dados.** `WahaSection` passa a usar `useWhatsAppAccountsProvider()`. Substitua o estado `accounts: IWahaAccountRow[]` e `fetchWahaAccounts` por `IWhatsAppAccount[]` via `provider.listWaha({ storeId })`. Carregue também, decorativamente (nunca bloqueando): `metrics: Record<string, IWhatsAppAccountMetrics>` (via `getMetrics`), `accessRules: Record<string, IWhatsAppAccountAccessRule[]>` (via `getAccessRules`), `sellers` (via `useSellersProvider().list({storeId, active:true})`) e `servers` (via `useWahaServersProvider().list()` para resolver o nome pelo `wahaServerId`). Espelhe os padrões `loadMetrics`/`loadAccessRules` do `WhatsAppAccountsPage`.

- [ ] **Step 2: Ações de ciclo de vida.** Mantenha `handleRestart`/`handleLogout`/`handleRepair`/`handleDelete` chamando `invokeWaha` (inalterados). Adicione `setAccentColor(account, hex|null)` que chama `provider.update(account.id, { providerConfig })` — cópia do `WhatsAppAccountsPage:379-389`. Adicione estado `accessAccount: IWhatsAppAccount | null` para o `InstanceAccessSheet`.

- [ ] **Step 3: Card rico (render).** Reescreva o `<li>` (hoje 228-293) para, na ordem: (a) header — avatar (`aria-hidden`), nome + pill de finalidade, subline `número · sessão mono`; cluster direito com badge `WAHA`, badge de status (`STATUS_VISUAL`), badge de saúde derivada e kebab (Silenciar/Excluir); (b) pill de acesso (`resolveAccessRecipients`; amber quando vazio → "Ninguém vê — configurar acesso", senão "N pessoas • configurar acesso") abrindo `setAccessAccount`; (c) color picker (`INSTANCE_PALETTE` + auto) via `setAccentColor`; (d) divisor + grid `<dl>` **Servidor WAHA** (nome resolvido de `servers` por `wahaServerId`, senão "—") / **Sessão** (`providerConfig.sessionName` mono) / **Número**; ações **Reiniciar**, **Parâmetros** (abre dialog — Task 5), **Editar** (renomear label via `provider.update`); (e) métricas 4-up (`metrics[id]`, colorização condicional). Use `p-5` e bandas `border-t border-border` entre seções. **Substitua** os tokens `bg-emerald-500/10`/`text-emerald-600` do avatar por `bg-severity-success/10`/`text-severity-success`.

Health badge derivada (WAHA não tem `currentState` significativo — derive de `status`):

```tsx
// connected → Saudável (success); pending → verde? não: neutro; disconnected → Indisponível (critical)
const HEALTH = row.status === "connected"
  ? { label: "Saudável", cls: "border-severity-success/40 bg-severity-success/10 text-severity-success", icon: "mdi:heart-pulse" }
  : row.status === "disconnected"
    ? { label: "Indisponível", cls: "border-severity-critical/40 bg-severity-critical/10 text-severity-critical", icon: "mdi:close-circle-outline" }
    : { label: "Conectando", cls: "border-border bg-muted text-muted-foreground", icon: "mdi:progress-clock" };
```

- [ ] **Step 4: Banner de status + `SCAN_QR_CODE` acionável.** O poll de `state` já roda no `WahaQrPairingPane`; para a lista, adicione um poll leve por card OU reutilize o `status` da linha + um `rawState` opcional. Implemente: quando `row.status === "disconnected"`, renderize banner `role="alert"` (montado 1×) `border-severity-critical/40 bg-severity-critical/10` com texto "Conexão perdida — mensagens não saem nem chegam." e botão herói **Reconectar** → `handleRepair(row)` (restart + abre `WahaPairingDialog`). Guarde por `!alertsMuted`. Para distinguir "Aguardando leitura do QR": no refresh da lista, chame `invokeWaha<{ state, rawState }>({ accountId, action: "state" })` e, quando `rawState === "SCAN_QR_CODE"`, mostre banner `severity-warning` "Aguardando leitura do QR" com botão **Parear** → `setPairingTarget(row)`. (Reuse `WahaPairingDialog`/`WahaQrPairingPane` existentes.)

- [ ] **Step 5: Empty state + HAS_LINKED_DATA inline.** No bloco vazio (hoje 218), adicione um botão primário "Nova sessão WAHA". No `handleDelete`, quando `code === "HAS_LINKED_DATA"`, além do toast, marque a linha para exibir uma nota inline `severity-warning` "Conversas vinculadas impedem a exclusão." (estado `linkedBlockedId`).

- [ ] **Step 6: a11y/motion.** Avatar/ícones decorativos `aria-hidden`; badge de status com `aria-label` pt-BR; swatches com `aria-label`/`aria-pressed` e `motion-safe:hover:scale-110 motion-reduce:transition-none` (cópia do `WhatsAppAccountsPage:647-677`).

- [ ] **Step 7: tsc + build.** Run: `bunx tsc --noEmit` (zero erros novos no arquivo) e `bun run build` (passa).

- [ ] **Step 8: Commit.**

```bash
git add src/features/admin-settings/components/WahaSection.tsx
git commit -m "feat(waha): rich instance card (access, color, metrics, status banner)"
```

---

## Task 5: Frontend — parâmetros (wizard "Avançado" + `WahaParamsDialog`)

**Files:**
- Modify: `src/features/admin-settings/components/WahaSection.tsx`

**Interfaces:**
- Consumes: `invokeWaha` (`create` com `sessionConfig`; `updateConfig`), `IWahaSessionConfig` (`@/shared/types`), shadcn `Switch`/`Collapsible` (ou `Accordion`).

- [ ] **Step 1: Defaults + form control compartilhado.** Defina `const DEFAULT_WAHA_CONFIG: IWahaSessionConfig = { chatFilters: { groups: false, status: false, channels: false, broadcast: false }, debug: false };` e um componente controlado `WahaParamsForm({ value, onChange, engineIsGows })` com: grupo **Tipos de conversa** (4 `Switch`: Grupos/Status/Canais/Broadcast, cada um → `chatFilters.*`); **Depuração** (`Switch` debug); **Proxy** (campos server/username/password, aninhados, opcionais); **Dispositivo** (inputs nome/navegador **disabled** + nota amber `severity-warning` "O engine GOWS aplica isto por variáveis de ambiente do servidor, não por sessão."); **Webhooks** read-only (URL greyed `…/functions/v1/waha-webhook` + "Gerenciado pela plataforma"). Copy em pt-BR.

- [ ] **Step 2: Wizard "Avançado".** No `WahaWizard`, abaixo dos 3 campos, adicione um `Collapsible` "Avançado" (fechado por default) contendo `<WahaParamsForm value={config} onChange={setConfig} />` com estado `config` inicial `DEFAULT_WAHA_CONFIG`. No `handleCreate`, passe `sessionConfig: config` ao `invokeWaha({ action: "create", ... })`.

- [ ] **Step 3: `WahaParamsDialog` (novo componente no mesmo arquivo).** Recebe `{ account, onClose, onSaved }`. Estado inicial = `account.providerConfig?.waha ?? DEFAULT_WAHA_CONFIG`. Renderiza `<WahaParamsForm/>`, uma nota persistente `severity-info` "Alterar parâmetros exige reiniciar a sessão — há uma breve desconexão, mas o pareamento é preservado (não será preciso ler o QR de novo)." e botão primário **"Salvar e reiniciar"**. Ao salvar:

```tsx
try {
  await invokeWaha({ accountId: account.id, action: "updateConfig", sessionConfig: config });
  toast.success("Parâmetros salvos — reiniciando a sessão…");
  onSaved(); // refresh + fecha; NÃO reabrir QR (o poll reconcilia; só SCAN_QR_CODE abre o pareamento)
} catch (err) {
  toast.error(err instanceof Error ? err.message : "Não foi possível salvar os parâmetros.");
}
```

- [ ] **Step 4: Botão no card.** O botão **Parâmetros** (Task 4, Step 3d) abre `setParamsTarget(row)`; renderize `{paramsTarget && <WahaParamsDialog account={paramsTarget} onClose={() => setParamsTarget(null)} onSaved={() => { setParamsTarget(null); void refresh(); }} />}`.

- [ ] **Step 5: tsc + build.** Run: `bunx tsc --noEmit` (zero erros novos) e `bun run build`.

- [ ] **Step 6: Commit.**

```bash
git add src/features/admin-settings/components/WahaSection.tsx
git commit -m "feat(waha): session parameters — wizard advanced section + params dialog"
```

---

## Task 6: Docs

**Files:**
- Modify: `docs/dev/waha-integration.md`

- [ ] **Step 1: Documentar.** Na descrição do `waha-connect` (seção 4): adicione a ação `updateConfig` (grava `provider_config.waha` + `PUT /api/sessions/{name}` com config completa, auto stop+start; audit `whatsapp_instance_config_updated`), o `sessionConfig` opcional no `create`, e o `rawState` no retorno do `state`. Documente o mapeamento `chatFilters` (processar) → `config.ignore` (ignorar, invertido; 1:1 sempre passa), `debug`, `proxy`, e que `device` é read-only/no-op em GOWS. Registre a regra: mexeu no engine ⇒ `sync-whatsapp-shared.ts` + redeploy.

- [ ] **Step 2: Commit.**

```bash
git add docs/dev/waha-integration.md
git commit -m "docs(waha): document updateConfig action + session config mapping"
```

---

## Rollout (pós-plano, fora das tasks)

- **Sem migration.** Deploy do `waha-connect` (novas ações) é **Owner-gated** — confirmar com o dono antes (`npx supabase functions deploy waha-connect --project-ref njizaasajkdqptlxddqn`).
- Frontend via **PR/push** (nunca merge direto).
- **Smoke manual** (dono): criar sessão com "Avançado" (ignorar grupos), parear, editar Parâmetros → "Salvar e reiniciar" (confirmar que não pede QR de novo), desconectar de propósito → banner-herói Reconectar, checar `integration_logs`/`audit_logs`.
