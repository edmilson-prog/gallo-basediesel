# WhatsApp Multi-Instância — Plano 3: Roteamento server-side

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o roteamento determinístico e seguro sob multi-instância: (a) índices únicos parciais + resolução **exatamente-1-match** no webhook; (b) predicado de envio que aceita **participante** (Camada 2) e restringe o **pool ao acesso por instância** (Camada 1).

**Architecture:** Núcleos runtime-agnostic em `src/providers/whatsapp/**` espelhados para `supabase/functions/_shared/whatsapp/**` via `scripts/sync-whatsapp-shared.ts`. O adapter `supabase/functions/_shared/whatsappSendAdapter.ts` e o db do webhook (`supabase/functions/whatsapp-webhook/index.ts`) NÃO são espelhados — editados direto. Deploy via CLI Supabase.

**Tech Stack:** Deno (Edge Functions), TypeScript, Vitest (testes do core), supabase-js (admin/service_role).

**Depende dos Planos 1 e 2.** ⚠️ **Regra do espelho:** após editar `src/providers/whatsapp/**`, rodar `bun run scripts/sync-whatsapp-shared.ts` e **redeployar**. Migrations e deploys atingem **produção** → autorização explícita do dono a cada passo.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260615130500_whatsapp_multi_unique_instance.sql` | Create | Índices únicos parciais em `instanceName`/`phoneNumberId` |
| `supabase/functions/whatsapp-webhook/index.ts` | Modify | `findEvolutionAccount`/`findMetaAccount`/`findEvolutionAccountAnyStatus` → exatamente-1-match |
| `src/providers/whatsapp/send/core.ts` | Modify | `ISendDb` (+2 métodos), `ISendConversationContext` (+`whatsappAccountId`), predicado |
| `src/providers/whatsapp/send/core.test.ts` | Modify | Casos de participante e pool-por-instância |
| `supabase/functions/_shared/whatsapp/send/core.ts` | (gerado) | Espelho — via sync, não editar à mão |
| `supabase/functions/_shared/whatsappSendAdapter.ts` | Modify | `getSendContext` (+`whatsappAccountId`); impl de `isConversationParticipant`/`sellerAccessesAccount` |

---

## Task 1: Índices únicos parciais de instância

**Files:**
- Create: `supabase/migrations/20260615130500_whatsapp_multi_unique_instance.sql`

- [ ] **Step 1: Auditar duplicatas em prod (read-only, requer autorização)**

Rodar (MCP `execute_sql` com "ok" do dono, ou `! psql`):

```sql
select 'evolution' as provider, provider_config->>'instanceName' as key, count(*)
from public.whatsapp_accounts
where provider='evolution' and provider_config ? 'instanceName'
group by 2 having count(*) > 1
union all
select 'meta', provider_config->>'phoneNumberId', count(*)
from public.whatsapp_accounts
where provider='meta' and provider_config ? 'phoneNumberId'
group by 2 having count(*) > 1;
```

Expected: **0 linhas**. Se houver, resolver as duplicatas (corrigir `provider_config`) ANTES — a criação do índice único falha com duplicatas existentes.

- [ ] **Step 2: Escrever a migration**

`supabase/migrations/20260615130500_whatsapp_multi_unique_instance.sql`:

```sql
-- Multi-instância — resolução determinística: cada instanceName (evolution) e cada
-- phoneNumberId (meta) identifica NO MÁXIMO uma conta. O webhook resolve por esses
-- valores; sem unicidade, multi-instância colidiria silenciosamente.
create unique index if not exists whatsapp_accounts_evolution_instance_uq
  on public.whatsapp_accounts ((provider_config ->> 'instanceName'))
  where provider = 'evolution' and provider_config ? 'instanceName';

create unique index if not exists whatsapp_accounts_meta_phone_number_id_uq
  on public.whatsapp_accounts ((provider_config ->> 'phoneNumberId'))
  where provider = 'meta' and provider_config ? 'phoneNumberId';
```

- [ ] **Step 3: Aplicar (com autorização)**

Run: `npx supabase db push`
Expected: aplica sem erro (graças ao Step 1).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260615130500_whatsapp_multi_unique_instance.sql
git commit -m "feat: unique partial indexes on instanceName/phoneNumberId"
```

---

## Task 2: Webhook — resolução exatamente-1-match

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts:62-108`

> Constante de colunas usada abaixo: `const ACCT_COLS = "id, store_id, provider, phone_number, credentials_ref, provider_config, status";` (extrair se ainda não existir, ou reusar a string já presente nas 3 funções).

- [ ] **Step 1: `findEvolutionAccount` — filtrar no banco + exigir 1**

Substituir o corpo de `findEvolutionAccount` (linhas ~82-95):

```typescript
async findEvolutionAccount(instanceName) {
  if (!instanceName) return null;
  const { data } = await admin
    .from("whatsapp_accounts")
    .select(ACCT_COLS)
    .eq("provider", "evolution")
    .neq("status", "disconnected")
    .eq("provider_config->>instanceName", instanceName);
  const rows = data ?? [];
  if (rows.length === 0) return null;
  if (rows.length > 1) {
    console.warn(JSON.stringify({
      level: "warn", msg: "ambiguous evolution instanceName — refusing to route",
      instanceName, count: rows.length,
    }));
    return null; // fail-closed: ambíguo não roteia
  }
  return toAccountRecord(rows[0]);
}
```

- [ ] **Step 2: `findEvolutionAccountAnyStatus` — idem, incluindo desconectadas**

Substituir (linhas ~96-108): igual ao Step 1, porém **sem** `.neq("status","disconnected")`. Mesmo guard de `rows.length > 1` (warn + `null`).

- [ ] **Step 3: `findMetaAccount` — exatamente-1 por phoneNumberId, fallback por phone**

Substituir (linhas ~62-81):

```typescript
async findMetaAccount(phoneNumberId, accountPhoneDigits) {
  if (phoneNumberId) {
    const { data } = await admin
      .from("whatsapp_accounts")
      .select(ACCT_COLS)
      .eq("provider", "meta")
      .neq("status", "disconnected")
      .eq("provider_config->>phoneNumberId", phoneNumberId);
    const rows = data ?? [];
    if (rows.length > 1) {
      console.warn(JSON.stringify({
        level: "warn", msg: "ambiguous meta phoneNumberId — refusing to route",
        phoneNumberId, count: rows.length,
      }));
      return null;
    }
    if (rows.length === 1) return toAccountRecord(rows[0]);
  }
  // Fallback legado: por dígitos do telefone (contas sem phoneNumberId no config).
  const { data } = await admin
    .from("whatsapp_accounts")
    .select(ACCT_COLS)
    .eq("provider", "meta")
    .neq("status", "disconnected");
  const matches = (data ?? []).filter(
    (row) => String(row.phone_number).replace(/\D/g, "") === accountPhoneDigits,
  );
  if (matches.length === 1) return toAccountRecord(matches[0]);
  if (matches.length > 1) {
    console.warn(JSON.stringify({
      level: "warn", msg: "ambiguous meta phone fallback — refusing to route",
      count: matches.length,
    }));
  }
  return null;
}
```

- [ ] **Step 4: Deploy do webhook (com autorização — usa `--no-verify-jwt`)**

Run: `npx supabase functions deploy whatsapp-webhook --project-ref njizaasajkdqptlxddqn --no-verify-jwt`
Expected: deploy OK. (O `--no-verify-jwt` é exigido pelo webhook público e requer autorização explícita do dono.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "fix: webhook resolves account by exactly-one-match (multi-instance safe)"
```

---

## Task 3: `send/core.ts` — predicado com participante + pool por instância

**Files:**
- Modify: `src/providers/whatsapp/send/core.ts:65-111,170-180`
- Test: `src/providers/whatsapp/send/core.test.ts:47-98`

- [ ] **Step 1: Estender o teste (casos novos que falham)**

Em `core.test.ts`, dentro de `IFakeOpts` (linha 34) adicionar:
```typescript
  whatsappAccountId?: string | null;
  isParticipant?: boolean;
  accessesAccount?: boolean;
```
No objeto retornado por `getSendContext` (dentro de `makeDb`, linha 58-69), adicionar ao `conversation`:
```typescript
        whatsappAccountId:
          opts.whatsappAccountId === undefined ? "acc-1" : opts.whatsappAccountId,
```
E adicionar ao objeto `db` (após `audit`, antes do `};` da linha 96):
```typescript
    isConversationParticipant: async () => opts.isParticipant ?? false,
    sellerAccessesAccount: async () => opts.accessesAccount ?? false,
```
Adicionar os casos (no final do arquivo, dentro do `describe`):
```typescript
it("blocks a non-staff seller on a pool conversation of an instance they cannot access", async () => {
  const { db } = makeDb({ assignedSellerId: null, accessesAccount: false });
  await expect(send({}, db, SELLER)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("allows a participant (co-responsible) to send", async () => {
  const { db, calls } = makeDb({ assignedSellerId: "seller-OTHER", isParticipant: true });
  await send({}, db, SELLER);
  expect(calls.sent.length).toBe(1);
});

it("allows pool send when the seller accesses the instance", async () => {
  const { db, calls } = makeDb({ assignedSellerId: null, accessesAccount: true });
  await send({}, db, SELLER);
  expect(calls.sent.length).toBe(1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/whatsapp/send/core.test.ts`
Expected: FAIL — `isConversationParticipant`/`sellerAccessesAccount` não existem em `ISendDb`; o caso de pool bloqueado hoje passa indevidamente (pool aberto).

- [ ] **Step 3: Estender `ISendDb` e `ISendConversationContext`**

Em `src/providers/whatsapp/send/core.ts`, no `conversation` de `ISendConversationContext` (após `assignedSellerId: string | null;`, linha 70):
```typescript
    /** Instância de origem da conversa (null em canais não-WhatsApp). */
    whatsappAccountId: string | null;
```
Em `ISendDb` (após `getSendContext`, linha 81):
```typescript
  /** Camada 2: o seller é co-responsável (participante) desta conversa? */
  isConversationParticipant(conversationId: string, sellerId: string): Promise<boolean>;
  /** Camada 1: o seller acessa a instância (regras seller/role/store)? */
  sellerAccessesAccount(
    accountId: string,
    sellerId: string,
    role: string,
    storeId: string,
  ): Promise<boolean>;
```

- [ ] **Step 4: Reescrever o predicado (linhas 170-180)**

Substituir o bloco de permissão:

```typescript
  // Permission (RF-010/011 + multi-instância) — defense-in-depth sobre a RLS:
  // staff da loja, o responsável, um participante (co-responsável), ou o pool
  // de uma instância que o seller acessa (Camada 1). Canal sem instância mantém
  // o pool aberto da loja.
  const sameStore = conversation.storeId === sender.storeId;
  const isStaff = STAFF_ROLES.includes(sender.role);
  const isAssignee =
    sender.sellerId !== null && conversation.assignedSellerId === sender.sellerId;
  const isParticipant =
    sender.sellerId !== null &&
    (await db.isConversationParticipant(conversation.id, sender.sellerId));
  const isPoolAccessible =
    conversation.assignedSellerId === null &&
    (isStaff ||
      conversation.whatsappAccountId === null ||
      (sender.sellerId !== null &&
        (await db.sellerAccessesAccount(
          conversation.whatsappAccountId,
          sender.sellerId,
          sender.role,
          sender.storeId,
        ))));
  if (!sameStore || (!isStaff && !isAssignee && !isParticipant && !isPoolAccessible)) {
    throw new WhatsAppProviderError("FORBIDDEN", 403, "Sem permissão para enviar nesta conversa");
  }
```

- [ ] **Step 5: Rodar testes do core**

Run: `bun run test src/providers/whatsapp/send/core.test.ts`
Expected: PASS — incluindo os 3 casos novos; os antigos (assignee, manager, pool com acesso) seguem verdes.

- [ ] **Step 6: Espelhar para a Edge Function**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: `supabase/functions/_shared/whatsapp/send/core.ts` regenerado com o banner AUTO-GENERATED.

- [ ] **Step 7: Commit**

```bash
git add src/providers/whatsapp/send/core.ts src/providers/whatsapp/send/core.test.ts supabase/functions/_shared/whatsapp/send/core.ts
git commit -m "feat: send predicate accepts participant + instance-scoped pool"
```

---

## Task 4: Adapter — implementar as deps novas

**Files:**
- Modify: `supabase/functions/_shared/whatsappSendAdapter.ts:27-87` (e o objeto `db` retornado)

- [ ] **Step 1: Expor `whatsappAccountId` no contexto**

Em `getSendContext`, no objeto `conversation` retornado (que hoje tem id/storeId/status/assignedSellerId), adicionar:
```typescript
      whatsappAccountId: (conv.whatsapp_account_id as string | null) ?? null,
```
(A query já seleciona `whatsapp_account_id` — só não estava sendo exposto.)

- [ ] **Step 2: Implementar `isConversationParticipant` e `sellerAccessesAccount`**

No objeto que satisfaz `ISendDb` (junto de `getSendContext`, `audit`, etc.), adicionar:

```typescript
async isConversationParticipant(conversationId, sellerId) {
  const { data } = await admin
    .from("conversation_participants")
    .select("seller_id")
    .eq("conversation_id", conversationId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  return Boolean(data);
},

async sellerAccessesAccount(accountId, sellerId, role, storeId) {
  const { data } = await admin
    .from("whatsapp_account_access_rules")
    .select("kind, target_value")
    .eq("whatsapp_account_id", accountId);
  const rules = data ?? [];
  return rules.some((r) =>
    (r.kind === "seller" && r.target_value === sellerId) ||
    (r.kind === "role" && r.target_value === role) ||
    (r.kind === "store" && r.target_value === storeId),
  );
},
```

- [ ] **Step 3: Deploy do whatsapp-send (com autorização; SEM `--no-verify-jwt`)**

Run: `npx supabase functions deploy whatsapp-send --project-ref njizaasajkdqptlxddqn`
Expected: deploy OK. (O `whatsapp-send` exige o JWT do usuário — não usar `--no-verify-jwt`.)

- [ ] **Step 4: Smoke manual (autorizado)**

O dono envia uma mensagem como vendedor numa conversa do pool de uma instância que ele acessa → entrega. Numa de instância que ele NÃO acessa (e não é responsável/participante) → 403 `FORBIDDEN`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/whatsappSendAdapter.ts
git commit -m "feat: send adapter resolves participant + instance access"
```

---

## Self-Review

**1. Spec coverage:** §6 #1 (índices únicos + webhook 1-match) → Tasks 1,2 ✅; §6 #3 (arm de participante + pool por instância no send) → Tasks 3,4 ✅; §6 #2 (role = claim cru) → `sellerAccessesAccount` compara `r.kind='role'` contra `sender.role` cru ✅; §3.2 invariante de saída (failover OFF) — este plano não introduz failover de saída; conta efetiva continua a primária ✅.
**2. Placeholder scan:** sem TODO/genéricos; SQL, TS e testes completos. Único texto-instrução (extrair `ACCT_COLS`) é explícito e opcional. ✅
**3. Type consistency:** `isConversationParticipant(conversationId, sellerId)` e `sellerAccessesAccount(accountId, sellerId, role, storeId)` idênticos entre `ISendDb` (core), o mock do teste e o adapter; `whatsappAccountId` adicionado ao contexto em core (tipo), teste (makeDb) e adapter (impl). ✅
**Riscos:** (a) `sellerAccessesAccount` não cobre `department` (adiado pós-211 — coerente com o MVP); (b) o `.eq("provider_config->>instanceName", …)` depende do índice da Task 1 para performance/unicidade — ordem das tasks respeita isso.

---

## ✅ Resultado da execução (2026-06-15)

**Plano 3 executado integralmente** na branch `feat/whatsapp-multi-instancia`. Produção tocada com autorização explícita do dono ("Aplicar tudo agora" + ok extra p/ o worker).

Commits (4):
- `1747e6f` — índices únicos parciais (`whatsapp_accounts_evolution_instance_uq`, `whatsapp_accounts_meta_phone_number_id_uq`)
- `615cdf5` — webhook exatamente-1-match (3 funções de resolução, fail-closed em ambiguidade)
- `cb5cf15` — predicado de envio (participante + pool por instância) — core + teste + espelho
- `6a9814d` — adapter (`whatsappAccountId` no contexto + `isConversationParticipant`/`sellerAccessesAccount`)

Produção:
- Migration `130500` aplicada via **MCP `apply_migration`** (NÃO `db push`): o histórico remoto mostrou os 130000–130400 do Plano 1 aplicados via MCP com timestamps `…190440`–`192033`; `db push` enxergaria os arquivos locais como pendentes e quebraria em `create table`. Auditoria pré-aplicação = **0 duplicatas**. Índices confirmados.
- Deploys: `whatsapp-webhook` (`--no-verify-jwt`), `whatsapp-send`, e **`scheduled-send-worker` (`--no-verify-jwt`)** — este NÃO estava no plano: consome o mesmo `makeSendDb`/`processSendRequest` e rodaria o predicado antigo; redeploy autorizado à parte.

Validação: build OK; test **686/686 (84 arquivos)**; tsc delta limpo em `send/core`; sanity SQL (`unique_idx=2`, participants/access_rules presentes, 2 regras backfill). Arquivos `_shared/whatsapp/**` aparecem ` M` por **CRLF (falso-positivo)** — `git diff --ignore-space-at-eol` vazio.

Desvios do plano: (1) **`db push` → MCP `apply_migration`** (estado real do histórico remoto). (2) Teste existente "allows staff … and sellers in pool" **dividido** — o novo predicado fecha o pool a quem não acessa a instância, então virou "allows staff in any conversation" + os 3 casos novos cobrem o pool. (3) **`scheduled-send-worker` redeployado** (gap do plano — mesma superfície compartilhada).

Smoke manual (Task 4 Step 4): **pendente com o dono**.

**Próximo:** Plano 4 (UI) — OriginChip, Hub Owner/Gestor, AddInstanceWizard, InstanceAccessSheet, NewConversationDialog.
