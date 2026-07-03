# WhatsApp Go — Ingestão do HistorySync (Etapa B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar os chunks de HistorySync já capturados (`integration_logs`) em customers/conversations/messages reais no Inbox, para uma conta Evolution Go — incluindo o resgate de `@lid` via `phoneNumberToLidMappings`.

**Architecture:** Núcleo puro de agregação (TS, TDD) destila os chunks → itens `{phone, name, messages[]}`; uma tabela de staging guarda o destilado (1 distilação, escala por lotes + serve de manifesto para o "desfazer"); um Edge Function Owner-only roda `prepare` (distila→staging) e `land` (cursored, reusa a persistência testada via `IImportDb`); o frontend espelha o fluxo de "Importar contatos" (botão Go-only + loop de progresso). Replay-friendly: desenvolve/testa sobre os chunks já gravados, sem re-parear.

**Tech Stack:** TS runtime-agnostic (`src/providers/whatsapp/**`, espelhado p/ `_shared/whatsapp/**`), Supabase Edge (Deno), Postgres/RLS, React 19 + TanStack Query, Vitest.

## Global Constraints

- **Provider Pattern:** features só acessam dados via `@/providers/data`; a tela de contas já é staff/owner-gated. Edge é a fronteira de escrita.
- **Runtime-agnostic:** `src/providers/whatsapp/**` usa só Web APIs + imports relativos. Após QUALQUER mudança lá: `bun run scripts/sync-whatsapp-shared.ts` (o script faz `rmSync` de `_shared/whatsapp/` e re-espelha — NUNCA editar `_shared/whatsapp/**` à mão; adapters com supabase-js vão em `_shared/*.ts`, fora da árvore espelhada).
- **Idempotência:** `messages.provider_message_id` é a chave de dedup (índice único + upsert `ignoreDuplicates`). Re-rodar nunca duplica.
- **Conversa importada cai no POOL, EM FILA** (`assigned_seller_id = null`, `status = 'aguardando'`) — nunca auto-atribui ao dono da carteira. ⚠️ **Decisão superada em 2026-07-02** pela spec de unificação `docs/superpowers/specs/2026-07-02-unify-queue-assignment-design.md`: este documento originalmente previa `status = 'em_andamento'`; conversas importadas agora nascem `'aguardando'` para aparecer no filtro "Em fila". Visibilidade vem do acesso por instância (modelo 2 portões). Não tocar em `customers.seller_id`.
- **customers.type = 'B2C'** (maiúsculo), `tags: ['pending_review']`, `full_name = phone` (idêntico ao import de contatos/histórico Evolution).
- **Owner-only** no edge (`requireCaller(req, ["owner"])`); `audit_logs.actor_id` resolvido de `profiles.seller_id` (FK p/ sellers).
- **Gate de CI:** `bun run build` + `bun run test` verdes. `bunx tsc --noEmit` tem baseline pré-existente — avaliar só o delta de arquivos novos.
- **Deploy/migration:** manuais via MCP/CLI, com OK do dono; migration espelhada em `supabase/migrations/`. Nunca mergear sem OK (push + PR).
- **NÃO tocar na camada de cache do atendimento** (signing em lote #137, realtime, query keys, RPC gated-once) — congelada. Esta feature não a toca.

---

## File Structure

**Criar:**
- `src/providers/whatsapp/import/history-core.ts` — agregador incremental puro (chunks → itens) + `normalizeWhatsmeowRecord`. Espelhado.
- `src/providers/whatsapp/import/history-core.test.ts` — Vitest (não espelhado).
- `supabase/functions/_shared/import-db.ts` — adapter `IImportDb` (supabase-js), levantado do edge Evolution e parametrizado por `provider`. **Fora** da árvore espelhada.
- `supabase/functions/whatsapp-import-history-go/index.ts` — edge Owner-only: ações `prepare` | `land` | `undo`.
- `supabase/migrations/2026XXXXXXXXXX_whatsapp_go_history_staging.sql` — tabela `whatsapp_go_history_items` + RLS.
- `src/features/admin-settings/api/whatsappImportHistory.ts` — chamada das 3 ações (espelha `whatsappImportContacts.ts`).
- `src/features/admin-settings/components/ImportHistoryDialog.tsx` — diálogo + loop de progresso (espelha `ImportContactsDialog.tsx`).

**Modificar:**
- `src/providers/whatsapp/evolution-go/parser.ts` — exportar `extractContent`, `jidToE164`, `tsToIso` (hoje internos). Espelhado.
- `src/providers/whatsapp/import/core.ts` — extrair `landNormalizedChat(account, db, phone, normalized, stats)` de `importChat` (passos 3–5) e reusar nos dois fluxos (Evolution + Go). Espelhado; testes Evolution seguem verdes.
- `supabase/functions/whatsapp-import-history/index.ts` — passar a importar `makeImportDb` de `_shared/import-db.ts` (remoção da cópia inline; comportamento idêntico, `provider="evolution"`).
- `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` — botão "Importar histórico" (Go-only, Owner) + "Desfazer importação" quando houver staging.

**Reúso (sem alterar):** `IImportDb`/`IImportStats`/`INormalizedRecord` de `import/core.ts`; dedup por `provider_message_id`; `requireCaller`/`servePost`/`parseJsonBody`/`bestEffortAudit` dos `_shared`.

---

### Task 1: Exportar helpers de conteúdo do parser Go

**Files:**
- Modify: `src/providers/whatsapp/evolution-go/parser.ts`

**Interfaces:**
- Produces: `export function extractContent(msg): IGoContent`, `export function jidToE164(jid): string`, `export function tsToIso(v): string`, `export type IGoMessageBody`, `export interface IGoContent`.

- [ ] **Step 1:** Trocar `function extractContent` → `export function extractContent`; `function jidToE164` → `export function jidToE164`; `function tsToIso` → `export function tsToIso`. Adicionar `export` a `interface IGoContent` e `interface IGoMessageBody`. Nenhuma mudança de lógica.
- [ ] **Step 2:** `bun run test src/providers/whatsapp/evolution-go/parser.test.ts` (se existir) ou `bun run build` — esperado: verde (mudança puramente de visibilidade).
- [ ] **Step 3:** Commit `refactor(whatsapp-go): export whatsmeow content helpers for reuse`.

---

### Task 2: Extrair `landNormalizedChat` de `import/core.ts`

**Files:**
- Modify: `src/providers/whatsapp/import/core.ts`
- Test: `src/providers/whatsapp/import/core.test.ts` (já existe — deve permanecer verde)

**Interfaces:**
- Produces: `export async function landNormalizedChat(args: { account: IImportAccount; db: IImportDb; phone: string; normalized: INormalizedRecord[]; stats: IImportStats; }): Promise<void>`
- Consumes: `IImportDb`, `INormalizedRecord`, `IImportAccount`, `IImportStats` (já no módulo).

- [ ] **Step 1: Escrever o teste do comportamento extraído** (adicionar em `core.test.ts`):

```ts
import { landNormalizedChat, emptyImportStats } from "./core";

it("landNormalizedChat creates pool conversation + dedups by provider_message_id", async () => {
  const inserted: any[] = [];
  const db = {
    findCustomerByPhone: async () => null,
    resolveDefaultSellerId: async () => "seller-1",
    createPendingCustomer: async () => ({ id: "cust-1", sellerId: "seller-1" }),
    findOpenConversation: async () => null,
    createConversation: async (i: any) => { expect(i.assignedSellerId).toBeNull(); return { id: "conv-1" }; },
    filterKnownProviderMessageIds: async () => new Set<string>(),
    insertImportedMessages: async (rows: any[]) => { inserted.push(...rows); },
    advanceConversationActivity: async () => {},
  };
  const stats = emptyImportStats();
  await landNormalizedChat({
    account: { id: "acc-1", storeId: "store-1" },
    db: db as any,
    phone: "+5555999990000",
    normalized: [
      { providerMessageId: "m1", direction: "in", text: "oi", mediaType: null, status: "delivered", sentAt: "2026-01-01T00:00:00.000Z" },
      { providerMessageId: "m1", direction: "in", text: "dup", mediaType: null, status: "delivered", sentAt: "2026-01-01T00:00:00.000Z" },
    ],
    stats,
  });
  expect(stats.conversationsCreated).toBe(1);
  expect(inserted).toHaveLength(1); // in-memory dedup by id
  expect(inserted[0].conversationId).toBe("conv-1");
});
```

- [ ] **Step 2:** `bun run test src/providers/whatsapp/import/core.test.ts` → FAIL (`landNormalizedChat` não existe).
- [ ] **Step 3: Extrair a função.** Mover os passos 2–5 atuais de `importChat` (de "Normalize + deduplicate" até `advanceConversationActivity`) para `landNormalizedChat`, recebendo `normalized: INormalizedRecord[]` já pronto (o dedup in-memory por `providerMessageId` fica DENTRO de `landNormalizedChat`). `importChat` passa a: coletar páginas → mapear `normalizeRecord` → chamar `landNormalizedChat`. Manter a regra `assignedSellerId: null` e o comentário do pool.
- [ ] **Step 4:** `bun run test src/providers/whatsapp/import/core.test.ts` → PASS (testes Evolution antigos + o novo).
- [ ] **Step 5:** Commit `refactor(whatsapp): extract landNormalizedChat for reuse by Go history import`.

---

### Task 3: Núcleo de agregação do HistorySync (puro, TDD)

**Files:**
- Create: `src/providers/whatsapp/import/history-core.ts`
- Test: `src/providers/whatsapp/import/history-core.test.ts`

**Interfaces:**
- Consumes: `extractContent`, `jidToE164`, `tsToIso` (Task 1); `INormalizedRecord`, `IImportStats` (core.ts).
- Produces:
```ts
export interface IGoHistoryChunk { syncType?: number; conversations?: unknown[]; phoneNumberToLidMappings?: Array<{ lidJID?: string; pnJID?: string }>; }
export interface IGoHistoryItem { phone: string; name: string | null; messages: INormalizedRecord[]; }
export interface IGoAggregateStats { individualChats: number; lidResolved: number; lidUnresolved: number; groups: number; broadcasts: number; totalMessages: number; }
export function createHistoryAggregator(): {
  addChunk(chunk: IGoHistoryChunk): void;
  finalize(): { items: IGoHistoryItem[]; stats: IGoAggregateStats };
};
export function normalizeWhatsmeowRecord(webMessageInfo: unknown): INormalizedRecord | null;
```

- [ ] **Step 1: Escrever os testes** (fixtures sintéticas — espelham a forma real validada: `conversations[].{ID,name,messages[]}`, `messages[].message.{key{id,fromMe},messageTimestamp,message}`, `phoneNumberToLidMappings[].{lidJID,pnJID}`):

```ts
import { createHistoryAggregator, normalizeWhatsmeowRecord } from "./history-core";

const wmText = (id: string, fromMe: boolean, text: string, tsSec: number) => ({
  message: { key: { id, fromMe }, messageTimestamp: tsSec, message: { conversation: text } },
});

it("normalizeWhatsmeowRecord maps a text message", () => {
  const r = normalizeWhatsmeowRecord(wmText("m1", false, "olá", 1735689600).message);
  expect(r).toMatchObject({ providerMessageId: "m1", direction: "in", text: "olá", status: "delivered" });
});

it("rejects records without key.id or with insane timestamp", () => {
  expect(normalizeWhatsmeowRecord({ key: {}, messageTimestamp: 1 })).toBeNull();
  expect(normalizeWhatsmeowRecord({ key: { id: "x" }, messageTimestamp: 9_999_999_999_999 })).toBeNull(); // ms epoch → future → reject
});

it("aggregates individuals, resolves @lid via mapping, dedups across chunks", () => {
  const agg = createHistoryAggregator();
  agg.addChunk({
    syncType: 2,
    conversations: [
      { ID: "5555999990000@s.whatsapp.net", name: "Cliente A", messages: [wmText("a1", false, "oi", 1735689600)] },
      { ID: "111@lid", name: "Cliente B", messages: [wmText("b1", false, "lid msg", 1735689601)] },
      { ID: "999@g.us", name: "Grupo", messages: [wmText("g1", false, "grupo", 1735689602)] },
    ],
    phoneNumberToLidMappings: [{ lidJID: "111@lid", pnJID: "5555888880000@s.whatsapp.net" }],
  });
  // same a1 again in a later chunk → must NOT duplicate
  agg.addChunk({ syncType: 3, conversations: [{ ID: "5555999990000@s.whatsapp.net", messages: [wmText("a1", false, "oi", 1735689600)] }] });
  const { items, stats } = agg.finalize();
  const byPhone = Object.fromEntries(items.map((i) => [i.phone, i]));
  expect(items).toHaveLength(2);                          // A + resolved B; group skipped
  expect(byPhone["+5555888880000"].messages).toHaveLength(1); // @lid resolved to phone
  expect(byPhone["+5555999990000"].messages).toHaveLength(1); // dedup across chunks
  expect(stats).toMatchObject({ individualChats: 1, lidResolved: 1, groups: 1 });
});

it("skips @lid without a mapping (unresolvable)", () => {
  const agg = createHistoryAggregator();
  agg.addChunk({ syncType: 2, conversations: [{ ID: "222@lid", messages: [wmText("c1", false, "x", 1735689600)] }], phoneNumberToLidMappings: [] });
  const { items, stats } = agg.finalize();
  expect(items).toHaveLength(0);
  expect(stats.lidUnresolved).toBe(1);
});
```

- [ ] **Step 2:** `bun run test src/providers/whatsapp/import/history-core.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar `history-core.ts`.** `normalizeWhatsmeowRecord`: porta de `normalizeRecord` (mesmos guards — sem `key.id` → null; ts não-finito/≤0 → null; `ts*1000 > now+24h` → null; `extractContent(message)`; `contentType "unknown"` sem texto → null; `direction = key.fromMe ? "out" : "in"`; status `out → "sent"`, `in → "delivered"`; `sentAt = new Date(ts*1000).toISOString()`). `createHistoryAggregator`: estado = `lidMap: Map<string,string>` + `convs: Map<rawJid, { name: string|null; byId: Map<string, INormalizedRecord> }>` + contadores. `addChunk`: acumula `lidMap` (de `phoneNumberToLidMappings`, ignora entradas sem `pnJID @s.whatsapp.net`); para cada conversation acumula por `ID` cru as mensagens normalizadas (dedup por `providerMessageId` no `byId`), guarda `name`. `finalize`: para cada `rawJid` — resolve (individual direto; `@lid` via `lidMap` se destino `@s.whatsapp.net`; senão conta `lidUnresolved`/`groups`/`broadcasts` e pula); `phone = jidToE164(resolved)` (pula se vazio); **merge por phone** (colisão individual+lid resolvido → mesmo phone, une `byId`); monta `items` com `messages.length>0`; calcula stats.
- [ ] **Step 4:** `bun run test src/providers/whatsapp/import/history-core.test.ts` → PASS.
- [ ] **Step 5:** `bun run scripts/sync-whatsapp-shared.ts` (espelha `history-core.ts` + `parser.ts` + `core.ts`).
- [ ] **Step 6:** Commit `feat(whatsapp-go): history sync aggregation core with @lid rescue (TDD)`.

---

### Task 4: Migration — tabela de staging

**Files:**
- Create: `supabase/migrations/2026XXXXXXXXXX_whatsapp_go_history_staging.sql`

- [ ] **Step 1: Escrever a migration.**

```sql
create table if not exists public.whatsapp_go_history_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  store_id uuid not null,
  phone text not null,
  contact_name text,
  messages jsonb not null,                 -- INormalizedRecord[]
  landed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id, phone)
);
create index if not exists idx_wa_go_history_items_pending
  on public.whatsapp_go_history_items (account_id) where not landed;

alter table public.whatsapp_go_history_items enable row level security;
-- service_role (edge) bypassa RLS; Owner pode ler para transparência/undo.
create policy "wa_go_history_items_owner_read" on public.whatsapp_go_history_items
  for select to authenticated
  using (public.current_app_role() = 'owner');
```

> Confirmar o nome do helper de papel (`current_app_role()` ou equivalente já usado em policies owner-only desta base) antes de aplicar; ajustar se necessário.

- [ ] **Step 2:** Aplicar via MCP `apply_migration` (com OK do dono), `version` = nome do arquivo. Espelho no Git no mesmo PR.
- [ ] **Step 3:** Commit `feat(db): staging table for Evolution Go history import`.

---

### Task 5: Adapter `IImportDb` compartilhado (edge)

**Files:**
- Create: `supabase/functions/_shared/import-db.ts`
- Modify: `supabase/functions/whatsapp-import-history/index.ts`

**Interfaces:**
- Produces: `export function makeImportDb(admin: SupabaseClient, provider: "evolution" | "evolution-go"): IImportDb`

- [ ] **Step 1:** Mover `makeImportDb` (inline em `whatsapp-import-history/index.ts`, linhas ~67–196) para `_shared/import-db.ts`, recebendo `provider` e usando-o no `insertImportedMessages` (`provider: provider`) em vez do literal `"evolution"`. Importar `IImportDb` de `../_shared/whatsapp/import/core.ts`.
- [ ] **Step 2:** No edge Evolution, remover a cópia inline e `import { makeImportDb } from "../_shared/import-db.ts"`; chamar `makeImportDb(admin, "evolution")`.
- [ ] **Step 3:** `npx supabase functions deploy whatsapp-import-history --project-ref njizaasajkdqptlxddqn` em ambiente de validação **apenas se o dono autorizar**; senão deixar para o passo de deploy final. Verificação local: `deno check` não roda no projeto — validar por revisão + smoke do dono.
- [ ] **Step 4:** Commit `refactor(edge): share makeImportDb adapter across import edges`.

---

### Task 6: Edge `whatsapp-import-history-go`

**Files:**
- Create: `supabase/functions/whatsapp-import-history-go/index.ts`

**Comportamento (POST `{ accountId, action }`):**
- `requireCaller(req, ["owner"])`; resolver conta por `accountId` + `store_id = profile.store_id`; exigir `provider === "evolution-go"` (senão 422). `instanceId = provider_config.instanceId`.
- **`action: "prepare"`** → buscar os ids dos logs `endpoint = '/whatsapp-webhook/evolution-go#HistorySync'` cujo `response_payload->>'instanceId' = instanceId` (ou `request_payload->>'instanceId'`), ordenados por `created_at`. **Stream**: para cada id, `select request_payload` (1 chunk por vez), `agg.addChunk(payload.data.Data)`, descartar. `const { items, stats } = agg.finalize()`. Upsert em `whatsapp_go_history_items` (`onConflict: "account_id,phone"`, `ignoreDuplicates: false` para refletir re-distilação) com `landed=false` para itens novos. Retornar `{ total: items.length, stats }`.
- **`action: "land"`** → ler até `BATCH=25` itens `where account_id=? and landed=false order by created_at`; para cada: `normalized = item.messages`; `await landNormalizedChat({ account: { id, storeId }, db: makeImportDb(admin, "evolution-go"), phone: item.phone, normalized, stats })`; marcar `landed=true`. `remaining = count(landed=false)`. Retornar `{ done: remaining===0, landed: batch.length, remaining, stats }`. Auditar `whatsapp_go_history_imported` quando `done`.
- **`action: "undo"`** → para os itens em staging do account: coletar todos os `providerMessageId` (de `messages`), `delete from messages where provider_message_id in (...)` (em chunks de 200); apagar conversations do account que ficaram sem mensagens; apagar customers `pending_review` sem mensagens/sem outras conversas (best-effort, log dos pulos); `delete from whatsapp_go_history_items where account_id=?`. Auditar `whatsapp_go_history_import_undone`. Retornar `{ removedMessages, removedConversations }`.

- [ ] **Step 1:** Implementar o edge conforme acima, reusando `servePost`, `requireCaller`, `parseJsonBody`, `json`, `bestEffortAudit`, `makeImportDb` (Task 5), `createHistoryAggregator`/`landNormalizedChat` (Tasks 2–3, de `_shared/whatsapp/import/...`).
- [ ] **Step 2:** Garantir `--no-verify-jwt` **NÃO** se aplica aqui (este edge é autenticado/owner, como `whatsapp-import-history`).
- [ ] **Step 3:** Commit `feat(edge): whatsapp-import-history-go (prepare/land/undo)`.

---

### Task 7: API frontend

**Files:**
- Create: `src/features/admin-settings/api/whatsappImportHistory.ts`

- [ ] **Step 1:** Espelhar `whatsappImportContacts.ts`: funções `prepareGoHistory(accountId)`, `landGoHistory(accountId)`, `undoGoHistory(accountId)` que chamam o edge `whatsapp-import-history-go` via o client supabase (functions.invoke), tipando os retornos (`{total,stats}` / `{done,landed,remaining,stats}` / `{removedMessages,removedConversations}`). Tratar erro `{ error, code }`.
- [ ] **Step 2:** `bun run build` → verde.
- [ ] **Step 3:** Commit `feat(admin): api client for Go history import`.

---

### Task 8: Diálogo + botões na tela de contas

**Files:**
- Create: `src/features/admin-settings/components/ImportHistoryDialog.tsx`
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`

- [ ] **Step 1:** `ImportHistoryDialog.tsx` (espelha `ImportContactsDialog.tsx`): ao confirmar, chama `prepareGoHistory` → mostra `total`; faz loop `landGoHistory` até `done`, atualizando barra de progresso (`landed acumulado / total`); ao fim, toast com `stats` (conversas, mensagens, @lid resgatados). Estados de erro com retry. Texto PT-BR com acentos. Aviso de que mídias não são baixadas (só texto/legenda) e de que isto pode criar muitos clientes `pending_review`.
- [ ] **Step 2:** Em `WhatsAppAccountsPage.tsx`, no card Go (gated `!isMock && provider === "evolution-go"` + Owner), adicionar botão **"Importar histórico"** ao lado de "Importar contatos" e, condicional a haver staging, **"Desfazer importação"** (chama `undoGoHistory` com confirmação).
- [ ] **Step 3:** `bun run build` + `bun run lint` → verde.
- [ ] **Step 4:** Commit `feat(admin): "Importar histórico" / "Desfazer" buttons for Evolution Go accounts`.

---

### Task 9: Gate + mirror + deploy

- [ ] **Step 1:** `bun run scripts/sync-whatsapp-shared.ts` (re-espelhar; conferir `git status` — só conteúdo real de `history-core.ts`/`parser.ts`/`core.ts`, ignorar phantom-M de CRLF).
- [ ] **Step 2:** `bun run test` (suite completa) + `bun run build` → verdes.
- [ ] **Step 3:** Bump de versão (MINOR, codinome novo) + entrada PT-BR no `CHANGELOG.md` (Added: importação do histórico de conversas do Evolution Go com resgate de @lid; desfazer importação).
- [ ] **Step 4 (com OK do dono):** Deploy dos edges: `npx supabase functions deploy whatsapp-import-history-go --project-ref njizaasajkdqptlxddqn` e (se Task 5 alterou) `whatsapp-import-history`. Aplicar a migration (Task 4) via MCP.
- [ ] **Step 5:** Smoke do dono na conta de teste (`Teste-AIL-Go-VI`): prepare → land até done → conferir Inbox filtrando pela instância; depois validar "Desfazer". Push + PR (sem merge sem OK).

---

## Validação por replay (sem re-parear)

Os 20 chunks (24 MB) da `Teste-AIL-Go-VI` (instance `2c31ae8c-b836-4886-8993-4864c4326e8f`) já estão em `integration_logs` — todo o desenvolvimento e o smoke rodam sobre eles. Escala medida: **546 individuais + 6.402 @lid resgatáveis = ~6.948 conversas importáveis**; 744 @lid irrecuperáveis + 32 grupos + 4 broadcasts são pulados (contabilizados nas stats).

## Riscos & mitigações

- **Memória do `prepare` (24 MB):** stream chunk-a-chunk + agregador incremental (nunca segura os 24 MB juntos).
- **Wall-clock do `land`:** modelo cursored (lotes de 25, loop no cliente) — idêntico ao import Evolution já em produção.
- **Poluir produção com dados da conta de teste:** ação **`undo`** (manifesto = staging) remove com precisão por `provider_message_id`.
- **Mirror destrutivo (`rmSync`):** adapter com supabase-js fica em `_shared/import-db.ts` (fora da árvore espelhada).
- **`provider_config.instanceId` vs `whatsapp_accounts.id`:** o filtro de `prepare` usa o `instanceId` do payload (não o id da conta) — confirmar a chave em `response_payload`/`request_payload` antes de codar o SELECT.
