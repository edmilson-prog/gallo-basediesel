# Design — Filtro de instâncias da Inbox por acesso do usuário

**Data:** 2026-06-23
**Branch:** `worktree-fix+inbox-instance-access-filter` (worktree a partir da main local `b844043`)
**Tipo:** Bugfix (visibilidade / UX de acesso por instância)
**Tier de risco (AILA pre-task):** Médio

---

## 1. Problema

Na tela de **Atendimento** (Inbox), o usuário **Lucas Costa** (`seller_internal`, não-staff) está
"enxergando" **4 instâncias de WhatsApp** no filtro **"Instância"** (`GALLO Matriz (Oficial)`,
`GALLO Campanhas`, `Teste-AILA`, `Comercial Lucas`), quando deveria ver apenas as **2** às quais
tem acesso.

### Evidência (produção)

- Lucas = seller `5a6400ed-5aec-4bf1-b641-31635f15c887`, papel `seller_internal` (não é `owner`/`manager`).
- Regras de acesso dele em `whatsapp_account_access_rules`: `Comercial Lucas` (kind `seller`) e
  `GALLO Campanhas` (kind `seller`) → **exatamente 2 instâncias**.
- O helper SQL `current_seller_accessible_account_ids()` já retornaria essas 2 para ele.

### Causa raiz

`InboxPage` carrega `accounts = whatsappAccountsProvider.list({ storeId })`
([InboxPage.tsx:71](../../../src/features/conversations/pages/InboxPage.tsx)) — **todas** as contas da
loja, sem filtro por acesso (tanto no mock quanto no Supabase; a RLS de SELECT de `whatsapp_accounts`
é `store_id = current_store_id()`, store-wide e **intencional**). Esse mesmo array alimenta:

1. `accountsById` (resolver label/cor de origem nas linhas) — **precisa de todas**.
2. `instances={accounts}` → o filtro "Instância" (linha 308) — **vaza**.
3. `connectedAccounts` → `NewConversationDialog` (escolha do número de origem outbound, linha 409) — **vaza**.

O ponto (3) é mais grave que (2): Lucas pode **escolher enviar** por uma instância sem acesso, não só vê-la.

---

## 2. Decisões (alinhadas com o dono)

1. **Escopo:** corrigir **os dois** pontos — o filtro `instances` **e** a escolha de número outbound.
2. **Abordagem:** **frontend**, sem migration/deploy de banco. O gate do filtro é **UX** — a proteção real
   das conversas já está no banco (`can_access_conversation`).

### Achado que viabiliza a abordagem frontend sem migration

A função `public.current_seller_accessible_account_ids()`:

- é `SECURITY DEFINER`,
- tem `EXECUTE` concedido a `authenticated` (ACL `authenticated=X`),
- não recebe argumentos (resolve o viewer pelo JWT: `current_seller_id`/`current_app_role`/`current_store_id`),
- aplica a regra correta: **staff (`owner`/`manager`) → todas as contas da loja; não-staff → só as que
  têm regra em `whatsapp_account_access_rules`**.

Logo, dá para chamá-la direto via `supabase.rpc('current_seller_accessible_account_ids')`, reusando a
**mesma fonte de verdade** que governa o acesso às conversas — **sem nenhuma migration**.

> Por que não filtrar lendo as `whatsapp_account_access_rules` no front: a tabela tem **uma única policy
> `waar_staff_all` que exige `is_staff()`** — um não-staff (Lucas) **não consegue ler as próprias regras**.
> O RPC `SECURITY DEFINER` contorna isso de forma segura e já existe.

---

## 3. Solução

### 3.1 Contrato — `providers/data/contracts/whatsappAccounts.ts`

Novo método:

```ts
/**
 * IDs das contas WhatsApp que o usuário atual pode OPERAR (atendimento).
 * - Supabase: resolvido pelo JWT via RPC `current_seller_accessible_account_ids`
 *   (mesma fonte de verdade de `can_access_conversation`). Staff → todas;
 *   não-staff → só as com regra em `whatsapp_account_access_rules`.
 * - Mock: o modo demonstração NÃO modela o gate de acesso por instância →
 *   retorna todas (a interseção no consumidor preserva o comportamento atual).
 */
listAccessibleAccountIds(): Promise<ID[]>;
```

### 3.2 Supabase — `providers/data/impl/supabase/whatsappAccounts.ts`

```ts
async listAccessibleAccountIds(): Promise<ID[]> {
  const { data, error } = await getSupabaseClient()
    .rpc("current_seller_accessible_account_ids");
  if (error) throw new Error(`[supabase] whatsappAccounts.listAccessibleAccountIds failed: ${error.message}`);
  // PostgREST pode devolver setof scalar como string[] ou como [{ ... }]; toleramos ambos.
  return (data ?? []).map((row: unknown) =>
    typeof row === "string" ? row : (row as { current_seller_accessible_account_ids: string })
      .current_seller_accessible_account_ids,
  );
}
```

### 3.3 Mock — `mocks/api/whatsappAccounts.ts` + `providers/data/impl/mock/whatsappAccounts.ts`

```ts
// mocks/api: modo demonstração não modela o gate → todas.
async listAccessibleAccountIds(): Promise<ID[]> {
  return runApi("whatsappAccountsApi", "listAccessibleAccountIds", () =>
    selectAllWhatsAppAccounts().map((a) => a.id),
  );
}
```

A interseção no `InboxPage` com `accounts` (já filtrado por `storeId`) garante que o demo continua
mostrando exatamente o que mostra hoje — **sem regressão**.

### 3.4 Helper puro — `features/conversations/utils/selectAccessibleAccounts.ts`

```ts
/**
 * Subconjunto de `accounts` cujo id está em `accessibleIds`.
 * `accessibleIds === null` (ainda carregando) → [] (o filtro não exibe instâncias
 * não autorizadas nem por um instante).
 */
export function selectAccessibleAccounts(
  accounts: IWhatsAppAccount[],
  accessibleIds: Set<ID> | null,
): IWhatsAppAccount[] {
  if (accessibleIds === null) return [];
  return accounts.filter((a) => accessibleIds.has(a.id));
}
```

### 3.5 InboxPage — `features/conversations/pages/InboxPage.tsx`

- Novo estado `accessibleIds: Set<ID> | null` (inicial `null`), populado por
  `whatsappAccountsProvider.listAccessibleAccountIds()` num `useEffect` (com guarda `cancelled`,
  espelhando o effect de `accounts`).
- `accessibleAccounts = useMemo(() => selectAccessibleAccounts(accounts, accessibleIds), [...])`.
- **`accountsById` continua derivando de `accounts` (todas)** → conversas da carteira que chegaram por
  uma instância sem acesso de atendimento ainda resolvem label/cor da origem.
- `instances={accessibleAccounts}` (filtro).
- `NewConversationDialog accounts={accessibleAccounts.filter((a) => a.status === "connected")}`.
- `showOrigin` permanece baseado em `accounts` (todas) — o badge de origem deve aparecer para qualquer
  conversa visível, inclusive as de carteira de outra instância.

---

## 4. Fluxo de dados (depois)

```
listAccessibleAccountIds() ─┐
  (Supabase: RPC pelo JWT)   ├─► accessibleIds:Set ─┐
  (Mock: todas)              │                       ├─► selectAccessibleAccounts(accounts, ids)
list({ storeId }) ───────────┴─► accounts (todas) ──┤        │
                                  │                  │        ├─► instances (filtro)
                                  └─► accountsById ◄─┘        └─► NewConversationDialog (origem outbound)
                                      (labels p/ TODAS)
```

---

## 5. O que NÃO muda

- RLS de `whatsapp_accounts` (SELECT segue **store-wide** — necessário para `accountsById`).
- `can_access_conversation` e o acesso real às conversas (já correto; portão A = instância, portão B = carteira).
- Webhook server-side (`whatsapp-webhook`) — atribuição por carteira/fila, fora de escopo.
- Telas admin (staff-only) que listam todas as instâncias (`WhatsAppAccountsPage`, `AddInstanceWizard`,
  `InstanceAccessSheet`) — corretas como estão.

---

## 6. Testes (TDD)

Arquivo co-localizado `features/conversations/utils/selectAccessibleAccounts.test.ts`:

1. `accessibleIds = null` (loading) → `[]`.
2. Não-staff: subconjunto (só as 2 com id em `accessibleIds`).
3. Staff: `accessibleIds` contém todas → retorna todas.
4. `accessibleIds` vazio (`Set()`) → `[]`.
5. `accessibleIds` com id inexistente em `accounts` → ignorado (interseção, sem erro).

Gate de CI: `bun run build` + `bun run test` verdes; `bunx tsc --noEmit` sem **novos** erros (baseline
pré-existente avaliado por delta).

---

## 7. Rollout

- **Só merge + deploy Vercel.** Zero migration, zero deploy de Edge/banco.
- Smoke do dono: logar como Lucas → o filtro "Instância" deve listar apenas `GALLO Campanhas` e
  `Comercial Lucas`; ao iniciar conversa nova, a origem só deve oferecer essas duas. Logar como Owner →
  todas as 4 continuam aparecendo.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|------|-----------|
| Formato do retorno do RPC (scalar vs objeto) | Mapeamento tolerante a ambos. |
| Flash de instâncias não autorizadas durante o load | `accessibleIds === null` → `[]` (filtro só aparece resolvido). |
| Quebrar label/cor de conversa de carteira de outra instância | `accountsById` mantém **todas** as contas. |
| Regressão no modo demo (mock) | Mock retorna todas → interseção preserva comportamento atual. |
| Duplicação de lógica de acesso no front | Evitada: o RPC é a fonte única; o front só consome e faz interseção. |
