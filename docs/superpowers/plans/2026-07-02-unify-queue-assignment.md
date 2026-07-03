# Unificação "Sem atribuição" → "Em fila" + Eco do Celular — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um único conceito "Em fila" (sem dono ⇒ `status='aguardando'`), com acoplamento status⇄atribuição em todos os pontos de mutação, import/eco caindo na fila e o evento `SendMessage` do Evolution Go processado como eco (com mídia).

**Architecture:** Engine puro de acoplamento em `src/providers/data/engine/` consumido por mock + supabase + hooks; o predicado de fila (`isQueuedConversation`, `.or()` term, RPCs de busca) fica **intacto** — os dados convergem para ele. Webhook/import mudam no núcleo runtime-agnostic `src/providers/whatsapp/` e são espelhados via script de sync. Spec: `docs/superpowers/specs/2026-07-02-unify-queue-assignment-design.md`.

**Tech Stack:** React 19 + TanStack Router/Query, Vitest, Supabase (PostgREST + RPCs SQL + Edge Functions Deno), Bun.

## Global Constraints

- **Diretório de trabalho:** worktree `D:\claude\gallo-basediesel\.claude\worktrees\unify-queue-assignment` (branch `feat/unify-queue-assignment`). TODOS os comandos rodam a partir dela.
- **Camadas congeladas — NÃO tocar:** `can_access_conversation` e RPCs gated-once (`conversation_contacts`, `last_messages_for_conversations`, `conversation_customer`), policy/helper de signing de mídia (`20260620160000`), realtime e query keys do atendimento.
- **`isQueuedConversation` (src/features/inbox-alerts/engine/isQueuedConversation.ts) NÃO muda** — predicado, interface e testes existentes permanecem.
- **Espelho WhatsApp:** todo commit que toca `src/providers/whatsapp/**` DEVE rodar `bun scripts/sync-whatsapp-shared.ts` e incluir o espelho `supabase/functions/_shared/whatsapp/**` no MESMO commit.
- **Migrations SQL:** apenas VERSIONADAS em `supabase/migrations/` — NUNCA aplicadas em prod durante a implementação (aplicação manual via MCP com OK do dono, no rollout).
- **NUNCA mergear/deployar** — entrega termina em PR aberto.
- Comentários de código em inglês; strings de UI em pt-BR com acentos corretos.
- Gate por task: `bunx vitest run <arquivos tocados>`; gate final: `bun run test` + `bun run build`. `bunx tsc --noEmit` tem baseline de erros pré-existentes — avalie só o delta dos arquivos tocados.
- Subagentes que explorarem código devem rodar `graphify query "<pergunta>"` antes de greps/reads amplos (regra do repo).

---

### Task 1: Engine puro `assignmentStatusCoupling`

**Files:**
- Create: `src/providers/data/engine/assignmentStatusCoupling.ts`
- Create: `src/providers/data/engine/assignmentStatusCoupling.test.ts`
- Modify: `src/providers/data/index.ts` (re-export no barrel)

**Interfaces:**
- Consumes: `ConversationStatus` de `@/shared/types` (`"aguardando" | "em_andamento" | "aguardando_cliente" | "resolvida" | "arquivada"`).
- Produces (usado pelas Tasks 2, 3, 6):
  - `statusOnAssign(current: ConversationStatus): ConversationStatus | null`
  - `statusOnUnassign(current: ConversationStatus): ConversationStatus | null`
  - `type ManualStatusCoupling = "assign-self" | "unassign" | null`
  - `coupleManualStatusChange(next: ConversationStatus, hasAssignee: boolean): ManualStatusCoupling`

- [ ] **Step 1: Write the failing test**

`src/providers/data/engine/assignmentStatusCoupling.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  statusOnAssign,
  statusOnUnassign,
  coupleManualStatusChange,
} from "./assignmentStatusCoupling";

describe("statusOnAssign", () => {
  it("advances a queued conversation to em_andamento", () => {
    expect(statusOnAssign("aguardando")).toBe("em_andamento");
  });
  it("never touches other statuses (no-op → null)", () => {
    expect(statusOnAssign("em_andamento")).toBeNull();
    expect(statusOnAssign("aguardando_cliente")).toBeNull();
    expect(statusOnAssign("resolvida")).toBeNull();
    expect(statusOnAssign("arquivada")).toBeNull();
  });
});

describe("statusOnUnassign", () => {
  it("returns open conversations to the queue (aguardando)", () => {
    expect(statusOnUnassign("em_andamento")).toBe("aguardando");
    expect(statusOnUnassign("aguardando_cliente")).toBe("aguardando");
  });
  it("re-opens a resolved conversation into the queue", () => {
    expect(statusOnUnassign("resolvida")).toBe("aguardando");
  });
  it("never touches the archive axis, and aguardando is a no-op", () => {
    expect(statusOnUnassign("arquivada")).toBeNull();
    expect(statusOnUnassign("aguardando")).toBeNull();
  });
});

describe("coupleManualStatusChange", () => {
  it("assigns the actor when an unowned conversation is moved to an owned status", () => {
    expect(coupleManualStatusChange("em_andamento", false)).toBe("assign-self");
    expect(coupleManualStatusChange("aguardando_cliente", false)).toBe("assign-self");
  });
  it("unassigns when an owned conversation is moved back to aguardando", () => {
    expect(coupleManualStatusChange("aguardando", true)).toBe("unassign");
  });
  it("does nothing on the remaining combinations", () => {
    expect(coupleManualStatusChange("aguardando", false)).toBeNull();
    expect(coupleManualStatusChange("em_andamento", true)).toBeNull();
    expect(coupleManualStatusChange("aguardando_cliente", true)).toBeNull();
    expect(coupleManualStatusChange("resolvida", false)).toBeNull();
    expect(coupleManualStatusChange("resolvida", true)).toBeNull();
    expect(coupleManualStatusChange("arquivada", false)).toBeNull();
    expect(coupleManualStatusChange("arquivada", true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/providers/data/engine/assignmentStatusCoupling.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/providers/data/engine/assignmentStatusCoupling.ts`:

```ts
import type { ConversationStatus } from "@/shared/types";

/**
 * Status ⇄ assignment coupling (spec 2026-07-02-unify-queue-assignment):
 * an OPEN conversation without an assignee sits in the queue (`aguardando`);
 * an assigned conversation is being attended (`em_andamento`). These helpers
 * are the single source of the transitions applied by assignSeller/unassign
 * (mock + supabase) and by the manual StatusControl coupling. The archive
 * axis is manual-only and never auto-touched.
 */

/** Assigning someone pulls a queued conversation into "being attended". */
export function statusOnAssign(current: ConversationStatus): ConversationStatus | null {
  return current === "aguardando" ? "em_andamento" : null;
}

/** Unassigning returns the conversation to the queue — except the archive axis. */
export function statusOnUnassign(current: ConversationStatus): ConversationStatus | null {
  if (current === "arquivada" || current === "aguardando") return null;
  return "aguardando";
}

export type ManualStatusCoupling = "assign-self" | "unassign" | null;

/**
 * Manual status change coupling (owner-approved corollary): picking an
 * "owned" status on an unowned conversation claims it for the actor; picking
 * "aguardando" on an owned conversation returns it to the queue.
 */
export function coupleManualStatusChange(
  next: ConversationStatus,
  hasAssignee: boolean,
): ManualStatusCoupling {
  if (!hasAssignee && (next === "em_andamento" || next === "aguardando_cliente"))
    return "assign-self";
  if (hasAssignee && next === "aguardando") return "unassign";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/providers/data/engine/assignmentStatusCoupling.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Re-export via barrel**

Em `src/providers/data/index.ts`, adicione ao final dos exports existentes:

```ts
export {
  statusOnAssign,
  statusOnUnassign,
  coupleManualStatusChange,
  type ManualStatusCoupling,
} from "./engine/assignmentStatusCoupling";
```

(Consumidores em `features/` importam SEMPRE de `@/providers/data` — o ESLint bloqueia subpaths.)

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/engine/assignmentStatusCoupling.ts src/providers/data/engine/assignmentStatusCoupling.test.ts src/providers/data/index.ts
git commit -m "feat(conversations): pure status<->assignment coupling engine"
```

---

### Task 2: Acoplamento no provider MOCK

**Files:**
- Modify: `src/mocks/api/conversations.ts:257-278` (métodos `assignSeller` e `unassign`)

**Interfaces:**
- Consumes: `statusOnAssign`/`statusOnUnassign` (Task 1, import direto `@/providers/data/engine/assignmentStatusCoupling` — permitido dentro de `src/mocks/**`).
- Produces: `assignSeller`/`unassign` com os MESMOS tipos do contrato `IConversationsProvider` (sem mudança de assinatura).

- [ ] **Step 1: Modificar `assignSeller` e `unassign`**

O arquivo já importa `getMockState` (usado por `abcRank`) e `patchById`/`MockNotFoundError`. Adicione o import:

```ts
import { statusOnAssign, statusOnUnassign } from "@/providers/data/engine/assignmentStatusCoupling";
```

Substitua os dois métodos (hoje em `src/mocks/api/conversations.ts:257-278`):

```ts
  async assignSeller(id: ID, sellerId: ID): Promise<IConversation> {
    return runApi("conversationsApi", "assignSeller", () => {
      const current = getMockState().conversations.find((c) => c.id === id);
      if (!current) throw new MockNotFoundError("conversation", id);
      // Coupling: assigning pulls a queued conversation into em_andamento.
      const nextStatus = statusOnAssign(current.status);
      const updated = patchById("conversations", id, {
        assignedSellerId: sellerId,
        isSdrActive: false,
        ...(nextStatus ? { status: nextStatus } : {}),
      });
      if (!updated) throw new MockNotFoundError("conversation", id);
      return updated;
    });
  },

  async unassign(id: ID): Promise<IConversation> {
    return runApi("conversationsApi", "unassign", () => {
      const current = getMockState().conversations.find((c) => c.id === id);
      if (!current) throw new MockNotFoundError("conversation", id);
      // Spread-merge in patchById sets the field to `undefined`, which the store
      // reads back as "no assignee" (pool) — the mock equivalent of NULL.
      // Coupling: returning to the pool re-queues the conversation (aguardando),
      // except on the manual-only archive axis.
      const nextStatus = statusOnUnassign(current.status);
      const updated = patchById("conversations", id, {
        assignedSellerId: undefined,
        ...(nextStatus ? { status: nextStatus } : {}),
      });
      if (!updated) throw new MockNotFoundError("conversation", id);
      return updated;
    });
  },
```

> Nota: sem teste de API stateful aqui — as transições são 100% do engine testado na Task 1; estes métodos são adaptadores finos (padrão do arquivo).

- [ ] **Step 2: Rodar a suíte dos mocks**

Run: `bunx vitest run src/mocks/api/conversations.test.ts`
Expected: PASS (nenhum caso existente depende do comportamento antigo).

- [ ] **Step 3: Commit**

```bash
git add src/mocks/api/conversations.ts
git commit -m "feat(mocks): couple status to assign/unassign in conversations api"
```

---

### Task 3: Acoplamento no provider SUPABASE (`unassign`) + mapeamento de patch

**Files:**
- Modify: `src/providers/data/impl/supabase/conversations.ts:402-418` (método `unassign`)
- Verify/Modify: o mapper `conversationPatchToRow` no MESMO arquivo (procure `function conversationPatchToRow`) — precisa mapear `assignedSellerId: null` → `assigned_seller_id: null` (a Task 6 envia `null` explícito pelo `update`).

**Interfaces:**
- Consumes: `statusOnUnassign` (Task 1, import relativo `../../engine/assignmentStatusCoupling`).
- Produces: `unassign(id)` sem mudança de assinatura; `update(id, { assignedSellerId: null, status })` passa a persistir o NULL.

- [ ] **Step 1: Modificar `unassign`**

Adicione o import no topo do arquivo:

```ts
import { statusOnUnassign } from "../../engine/assignmentStatusCoupling";
```

Substitua o método `unassign` (hoje `src/providers/data/impl/supabase/conversations.ts:402-418`):

```ts
  async unassign(id: ID): Promise<IConversation> {
    // Direct table UPDATE to null the assignee — returns the conversation to the
    // pool/queue. The conversations_update WITH CHECK accepts the resulting
    // unassigned row (assigned_seller_id is null arm), so staff and the current
    // assignee alike may hand a conversation back.
    // Coupling (spec 2026-07-02): re-queue the status too, except when archived
    // (manual-only axis) — read the current status first to decide.
    const client = getSupabaseClient();
    const { data: current, error: readError } = await client
      .from(TABLE)
      .select("status")
      .eq("id", id)
      .single();
    if (readError)
      throw new Error(`[supabase] conversations.unassign(${id}) failed: ${readError.message}`);
    const nextStatus = statusOnUnassign((current as { status: IConversation["status"] }).status);
    const { data, error } = await client
      .from(TABLE)
      .update({
        assigned_seller_id: null,
        ...(nextStatus ? { status: nextStatus } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] conversations.unassign(${id}) failed: ${error.message}`);
    return rowToConversation(data as ConversationRow);
  },
```

- [ ] **Step 2: Garantir que `conversationPatchToRow` propaga `assignedSellerId: null`**

Localize `conversationPatchToRow` no mesmo arquivo. Se o mapeamento usar checagem de `!== undefined` (padrão do arquivo), `null` já passa — apenas confirme. Se usar checagem truthy (`if (patch.assignedSellerId)`), troque por:

```ts
  if (patch.assignedSellerId !== undefined) row.assigned_seller_id = patch.assignedSellerId;
```

(`null` deve chegar ao PostgREST como `assigned_seller_id: null`.)

- [ ] **Step 3: Build para validar tipos do arquivo**

Run: `bun run build`
Expected: sucesso (esbuild transpila; erros de sintaxe/imports aparecem aqui).

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/impl/supabase/conversations.ts
git commit -m "feat(supabase): re-queue status on conversation unassign"
```

---

### Task 4: Migration — `transfer_conversation` com acoplamento (body-only)

**Files:**
- Create: `supabase/migrations/20260702150000_transfer_conversation_status_coupling.sql`

**Interfaces:**
- Produces: mesma assinatura `public.transfer_conversation(uuid, uuid)` (grants preservados por CREATE OR REPLACE). Consumida por `assignSeller` do provider supabase (inalterado).

- [ ] **Step 1: Criar o arquivo de migration (NÃO aplicar)**

Conteúdo integral — cópia do corpo atual (`supabase/migrations/20260614190000_conversation_transfer_rpc.sql:28-76`) com a linha de `status` adicionada no UPDATE:

```sql
-- Status <-> assignment coupling (spec 2026-07-02-unify-queue-assignment):
-- assigning a seller through transfer_conversation now advances a queued
-- ('aguardando') conversation to 'em_andamento' — an assigned conversation is
-- by definition being attended. Body-only change: same signature, grants and
-- authorization rules as 20260614190000.

create or replace function public.transfer_conversation(
  p_conversation_id uuid,
  p_to_seller_id uuid
)
returns setof public.conversations
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_store uuid := public.current_store_id();
  v_seller uuid := public.current_seller_id();
  v_conv public.conversations;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'conversation % not found', p_conversation_id using errcode = 'P0002';
  end if;

  if v_conv.store_id is distinct from v_store then
    raise exception 'not allowed to transfer this conversation' using errcode = '42501';
  end if;

  if not (
    public.is_staff()
    or v_conv.assigned_seller_id = v_seller
    or v_conv.assigned_seller_id is null
  ) then
    raise exception 'not allowed to transfer this conversation' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.sellers s
    where s.id = p_to_seller_id
      and s.store_id = v_store
      and coalesce(s.active, true)
  ) then
    raise exception 'invalid transfer target' using errcode = '22023';
  end if;

  return query
    update public.conversations
       set assigned_seller_id = p_to_seller_id,
           is_sdr_active = false,
           status = case when status = 'aguardando' then 'em_andamento' else status end,
           updated_at = now()
     where id = p_conversation_id
    returning *;
end;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260702150000_transfer_conversation_status_coupling.sql
git commit -m "feat(sql): advance queued status on transfer_conversation (mirror only)"
```

---

### Task 5: Simetria nos undos dos hooks

**Files:**
- Modify: `src/features/conversations/hooks/useSelfAssign.ts:45-55` (undo)
- Modify: `src/features/conversations/hooks/useReturnToQueue.ts:39-50` (undo)

**Interfaces:**
- Consumes: `IConversationsProvider.unassign(id)` / `assignSeller(id, sellerId)` (contrato existente — agora com acoplamento das Tasks 2-4).

- [ ] **Step 1: `useSelfAssign` — undo devolve à fila via `unassign`**

`canSelfAssign` exige `assignedSellerId == null`, logo `before` é sempre null — o undo correto é devolver à fila (status regressa junto). Substitua o handler do toast (hoje `useSelfAssign.ts:45-55`):

```ts
          onClick: () => {
            // canSelfAssign implies the conversation came from the pool —
            // undo returns it there (unassign also re-queues the status).
            void Promise.resolve(conversationsProvider.unassign(conversation.id))
              .then(() => {
                opts?.onDone?.();
                toast.success(INBOX_STRINGS.undone);
              })
              .catch(() => toast.error(INBOX_STRINGS.actionFailed));
          },
```

- [ ] **Step 2: `useReturnToQueue` — undo restaura via `assignSeller`**

Substitua o handler do toast (hoje `useReturnToQueue.ts:39-50`):

```ts
          onClick: () => {
            // Nothing to restore if it was already in the pool.
            if (before == null) return;
            // assignSeller (transfer RPC) re-advances the re-queued status too.
            void Promise.resolve(conversationsProvider.assignSeller(conversation.id, before))
              .then(() => {
                opts?.onDone?.();
                toast.success(INBOX_STRINGS.undone);
              })
              .catch(() => toast.error(INBOX_STRINGS.actionFailed));
          },
```

- [ ] **Step 3: Build + commit**

Run: `bun run build` — Expected: sucesso.

```bash
git add src/features/conversations/hooks/useSelfAssign.ts src/features/conversations/hooks/useReturnToQueue.ts
git commit -m "fix(conversations): make assign/return undo symmetric with status coupling"
```

---

### Task 6: Acoplamento no controle manual de status

**Files:**
- Modify: `src/features/conversations/hooks/useConversationStatusActions.ts`
- Modify: `src/features/conversations/i18n/pt-BR.ts` (2 strings novas em `CONVERSATION_STRINGS.statusControl`)

**Interfaces:**
- Consumes: `coupleManualStatusChange` via `@/providers/data` (Task 1); `conversationsProvider.update` (contrato existente).
- Produces: `setStatus(next, action?)` — assinatura inalterada; agora o patch pode carregar `assignedSellerId`.

- [ ] **Step 1: Estender `setStatus` com o acoplamento**

Substitua o corpo de `useConversationStatusActions.ts` (arquivo completo, hoje 47 linhas):

```ts
import { useState } from "react";
import { toast } from "sonner";
import type { ConversationStatus, IConversation } from "@/shared/types";
import {
  coupleManualStatusChange,
  recordAuditLog,
  useConversationsProvider,
} from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

export function useConversationStatusActions(
  conversation: IConversation,
  onChanged?: () => void,
): {
  setStatus: (next: ConversationStatus, action?: string) => Promise<void>;
  isPending: boolean;
} {
  const conversationsProvider = useConversationsProvider();
  const { currentUser } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const setStatus = async (next: ConversationStatus, action = "conversation.status_change") => {
    const before = conversation.status;
    const beforeAssignee = conversation.assignedSellerId ?? null;
    if (!currentUser || next === before || isPending) return;
    setIsPending(true);
    try {
      // Coupling (spec 2026-07-02): an "owned" status on an unowned conversation
      // claims it for the actor; "aguardando" on an owned one returns it to the
      // queue. RLS: claim = null->self arm; unassign = new-row-null arm.
      const decision = coupleManualStatusChange(next, beforeAssignee != null);
      const patch: Partial<IConversation> = { status: next };
      let coupledToast: string | null = null;
      if (decision === "assign-self" && currentUser.sellerId) {
        patch.assignedSellerId = currentUser.sellerId;
        coupledToast = CONVERSATION_STRINGS.statusControl.autoAssignedToYou;
      } else if (decision === "unassign") {
        patch.assignedSellerId = null;
        coupledToast = CONVERSATION_STRINGS.statusControl.autoReturnedToQueue;
      }
      await conversationsProvider.update(conversation.id, patch);
      onChanged?.();
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action,
        resource: "conversation",
        resourceId: conversation.id,
        before: { status: before, assignedSellerId: beforeAssignee },
        after: { status: next, assignedSellerId: patch.assignedSellerId ?? beforeAssignee },
      });
      toast.success(
        CONVERSATION_STRINGS.statusControl.statusChanged(CONVERSATION_STRINGS.statusLabel[next]),
      );
      if (coupledToast) toast.info(coupledToast);
    } catch {
      toast.error(CONVERSATION_STRINGS.statusControl.actionFailed);
    } finally {
      setIsPending(false);
    }
  };

  return { setStatus, isPending };
}
```

- [ ] **Step 2: Strings novas**

Em `src/features/conversations/i18n/pt-BR.ts`, dentro do objeto `statusControl` de `CONVERSATION_STRINGS` (procure `statusControl:` — contém `triggerLabel`, `statusChanged`, `actionFailed`), adicione:

```ts
    autoAssignedToYou: "Conversa atribuída a você",
    autoReturnedToQueue: "Conversa devolvida à fila",
```

- [ ] **Step 3: Build + commit**

Run: `bun run build` — Expected: sucesso.

```bash
git add src/features/conversations/hooks/useConversationStatusActions.ts src/features/conversations/i18n/pt-BR.ts
git commit -m "feat(conversations): manual status change couples assignment (claim/return)"
```

---

### Task 7: Token do filtro — normalizar `unassigned` → `queue`

**Files:**
- Modify: `src/features/conversations/hooks/useInboxFilters.ts:7` (tipo), `:70-86` (parse), `:293-313` (filtersToListParams)
- Modify: `src/features/conversations/hooks/useInboxFilters.test.ts`

**Interfaces:**
- Produces: `parseAssignmentTokens` normaliza o token legado; `filtersToListParams` NUNCA emite `assignmentAny.unassigned` (Task 8 remove o campo do contrato).

- [ ] **Step 1: Atualizar os testes (novo comportamento)**

Em `useInboxFilters.test.ts`, substitua o caso "splits CSV..." (L34-40) e o caso "ORs me + unassigned..." (L64-69), e adicione o caso de normalização:

```ts
  it("splits CSV, trims, de-dups, preserves order", () => {
    expect(parseAssignmentTokens("me, queue ,me,seller-9", SELLER)).toEqual([
      "me",
      "queue",
      "seller-9",
    ]);
  });
  it("normalizes the legacy 'unassigned' token (pre-unification URLs/localStorage) to 'queue'", () => {
    expect(parseAssignmentTokens("unassigned", SELLER)).toEqual(["queue"]);
    expect(parseAssignmentTokens("me,unassigned,queue", SELLER)).toEqual(["me", "queue"]);
  });
```

```ts
  it("ORs me + queue + a specific seller", () => {
    const p = filtersToListParams(baseState({ assignment: ["me", "queue", "seller-9"] }), {
      currentSellerId: SELLER,
    });
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER, "seller-9"], queue: true });
  });
```

E no describe `serializeAssignmentTokens`, troque o caso CSV (L54-56):

```ts
  it("joins multiple tokens as CSV", () => {
    expect(serializeAssignmentTokens(["me", "queue"], SELLER)).toBe("me,queue");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/conversations/hooks/useInboxFilters.test.ts`
Expected: FAIL nos casos novos (normalização e OR sem `unassigned`).

- [ ] **Step 3: Implementar**

Em `useInboxFilters.ts`:

(a) Tipo (L7):

```ts
export type AssignmentFilter = "me" | "queue" | "all" | string;
```

(b) `parseAssignmentTokens` (L70-86) — normalização dentro do loop:

```ts
/** Legacy token of the retired "Sem atribuição" option. Every pre-unification
 *  URL, favorite and localStorage restore still carries it — fold into "queue"
 *  here (the single point both the URL and the persisted restore flow through),
 *  otherwise the stale token would fall into the seller-id branch and silently
 *  degrade the filter. */
const LEGACY_UNASSIGNED_TOKEN = "unassigned";

export function parseAssignmentTokens(
  raw: string | undefined,
  currentSellerId: ID | null,
): string[] {
  if (raw === undefined) return defaultAssignmentTokens(currentSellerId);
  if (raw === ASSIGNMENT_ALL) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    let token = part.trim();
    if (token === LEGACY_UNASSIGNED_TOKEN) token = "queue";
    if (token.length > 0 && !seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}
```

(c) `filtersToListParams` (L293-313) — remover o braço `unassigned` (o parse já normalizou):

```ts
  if (filters.assignment.length > 0) {
    const sellerIds: ID[] = [];
    let queue = false;
    for (const token of filters.assignment) {
      if (token === "me") {
        if (ctx.currentSellerId) sellerIds.push(ctx.currentSellerId);
      } else if (token === "queue") {
        queue = true;
      } else {
        sellerIds.push(token);
      }
    }
    const assignmentAny: { sellerIds?: ID[]; queue?: boolean } = {};
    if (sellerIds.length > 0) assignmentAny.sellerIds = Array.from(new Set(sellerIds));
    if (queue) assignmentAny.queue = true;
    if (Object.keys(assignmentAny).length > 0) params.assignmentAny = assignmentAny;
  }
```

Atualize também o comentário do bloco (L289-292) para refletir que o queue é o único token de pool.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/features/conversations/hooks/useInboxFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/hooks/useInboxFilters.ts src/features/conversations/hooks/useInboxFilters.test.ts
git commit -m "feat(inbox): normalize legacy unassigned token into queue"
```

---

### Task 8: Contrato + camadas server/mock sem `assignmentAny.unassigned`

**Files:**
- Modify: `src/providers/data/contracts/conversations.ts:35-48`
- Modify: `src/providers/data/impl/supabase/assignmentFilter.ts` (+ test `assignmentFilter.test.ts`)
- Modify: `src/providers/data/impl/supabase/conversations.ts:165` (buildSearchRpcParams)
- Modify: `src/mocks/api/conversations.ts:112-138` (matchesAssignmentAny) + `src/mocks/api/conversations.test.ts`

**Interfaces:**
- Produces: `assignmentAny?: { sellerIds?: ID[]; queue?: boolean }` (campo `unassigned` REMOVIDO); o scalar `params.unassigned` permanece intocado. `p_unassigned` continua sendo enviado (sempre do scalar) — **zero mudança nas RPCs SQL de busca**.

- [ ] **Step 1: Atualizar testes primeiro**

`assignmentFilter.test.ts`: remova os casos que usam `{ unassigned: true }` (L19 e o combinado L27) e substitua pelo comportamento novo:

```ts
  it("composes seller ids + queue", () => {
    expect(buildAssignmentOrFilter({ sellerIds: [U1], queue: true })).toBe(
      `assigned_seller_id.in.(${U1}),and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)`,
    );
  });
```

`src/mocks/api/conversations.test.ts`: remova os casos de `{ unassigned: true }` (L19-21) e ajuste o combinado (L40-41) para `{ sellerIds: [...], queue: true }` com uma conversa `{ assignedSellerId: undefined, status: "aguardando", isSdrActive: false }` casando pelo braço queue.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/providers/data/impl/supabase/assignmentFilter.test.ts src/mocks/api/conversations.test.ts`
Expected: FAIL (tipos/comportamento antigos).

- [ ] **Step 3: Implementar**

(a) `contracts/conversations.ts` — remova a linha `unassigned?: boolean;` de `assignmentAny` (L45) e o comentário correspondente (L44); atualize o comentário do bloco (L36-40) trocando a menção "scalar `assignedSellerId`/`unassigned`/`isSdrActive`" (mantém — o scalar continua) e removendo só a referência ao campo interno.

(b) `assignmentFilter.ts` — remova `unassigned?: boolean;` de `IAssignmentAny` e a linha `if (assignmentAny.unassigned) terms.push("assigned_seller_id.is.null");` (L38).

(c) `impl/supabase/conversations.ts:165`:

```ts
    p_unassigned: params.unassigned ?? false,
```

(d) `mocks/api/conversations.ts` — em `matchesAssignmentAny` (L118-138): remova `unassigned` do tipo do parâmetro e o branch `if (unassigned && !conversation.assignedSellerId) return true;` (L129); ajuste a desestruturação. No guard de `applyNonSearchFilters` (L150-156), remova `params.assignmentAny.unassigned ||`. Ajuste também o tipo em `IListMockParams`/local (L50-53) se declarado ali.

- [ ] **Step 4: Run tests + build**

Run: `bunx vitest run src/providers/data/impl/supabase/assignmentFilter.test.ts src/mocks/api/conversations.test.ts && bun run build`
Expected: PASS + build ok. (O TypeScript aponta qualquer uso remanescente de `assignmentAny.unassigned` — deve restar NENHUM: a Task 7 já parou de emitir.)

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/contracts/conversations.ts src/providers/data/impl/supabase/assignmentFilter.ts src/providers/data/impl/supabase/assignmentFilter.test.ts src/providers/data/impl/supabase/conversations.ts src/mocks/api/conversations.ts src/mocks/api/conversations.test.ts
git commit -m "refactor(providers): drop assignmentAny.unassigned across contract, server and mock filters"
```

---

### Task 9: UI do filtro — remover "Sem atribuição"

**Files:**
- Modify: `src/features/conversations/components/InboxFilters.tsx:324-333`
- Modify: `src/features/conversations/i18n/pt-BR.ts:80`
- Modify: `src/features/conversations/utils/assignmentLabel.ts:5,22` + `assignmentLabel.test.ts`

- [ ] **Step 1: Atualizar testes do label**

`assignmentLabel.test.ts`: remova `unassigned: "Sem atribuição",` da fixture STRINGS (L7) e o caso que espera "Sem atribuição"; troque o caso `["me", "unassigned"]` (L28) por `["me", "queue"]` (mesmo esperado "2 selecionados").

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/conversations/utils/assignmentLabel.test.ts`
Expected: FAIL (interface exige a chave `unassigned`).

- [ ] **Step 3: Implementar**

(a) `assignmentLabel.ts`: remova `unassigned: string;` da interface (L5) e a linha `if (token === "unassigned") return strings.unassigned;` (L22).

(b) `i18n/pt-BR.ts:80`: remova a linha `unassigned: "Sem atribuição",` de `assignmentOptions`.

(c) `InboxFilters.tsx:324-333`: remova o comentário do pool + o `DropdownMenuCheckboxItem` do token `unassigned` (o item `queue` L334-340 permanece; mova o comentário L324-326 para cima dele, atualizado):

```tsx
              {/* Queue — visible to any inbox user. Non-staff sellers can view
                  and claim pool conversations per RLS, so this filter must not
                  be gated behind store scope. */}
              <DropdownMenuCheckboxItem
                checked={state.assignment.includes("queue")}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggleAssignment("queue")}
              >
                {INBOX_STRINGS.assignmentOptions.queue}
              </DropdownMenuCheckboxItem>
```

- [ ] **Step 4: Run tests + build**

Run: `bunx vitest run src/features/conversations/utils/assignmentLabel.test.ts && bun run build`
Expected: PASS + build ok.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/InboxFilters.tsx src/features/conversations/i18n/pt-BR.ts src/features/conversations/utils/assignmentLabel.ts src/features/conversations/utils/assignmentLabel.test.ts
git commit -m "feat(inbox): unify assignment filter — remove Sem atribuicao option"
```

---

### Task 10: Import de histórico nasce "Em fila"

**Files:**
- Modify: `src/providers/whatsapp/import/core.ts:98` (contrato) e `:396` (landing) + comentário `:388-394`
- Modify: `src/providers/whatsapp/import/core.test.ts` (expectativa de status)
- Modify: `docs/superpowers/plans/2026-06-27-whatsapp-go-history-ingestion.md:16` (decisão superada)
- Mirror: `supabase/functions/_shared/whatsapp/**` (via script de sync)

- [ ] **Step 1: Atualizar o teste**

Em `src/providers/whatsapp/import/core.test.ts`, localize a asserção da criação de conversa (busque `status: "em_andamento"` dentro do arquivo) e troque a expectativa para `status: "aguardando"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/providers/whatsapp/import/core.test.ts`
Expected: FAIL na asserção de status.

- [ ] **Step 3: Implementar**

Em `src/providers/whatsapp/import/core.ts`:

(a) Contrato (L93-101) — literal do status:

```ts
  createConversation(input: {
    storeId: string;
    customerId: string;
    accountId: string;
    assignedSellerId: string | null;
    status: "aguardando";
    createdAt: string;
    lastMessageAt: string;
  }): Promise<{ id: string }>;
```

(b) Landing (L385-399) — status + comentário:

```ts
    conversation = await db.createConversation({
      storeId: account.storeId,
      customerId: customer.id,
      accountId: account.id,
      // Imported conversations land UNASSIGNED and QUEUED ('aguardando' — spec
      // 2026-07-02): connecting an instance drops its history into "Em fila"
      // for whoever operates that number to claim — never pinned to anyone.
      // Visibility comes from instance access (can_access_conversation); the
      // imported customer carries NO wallet owner until manually converted.
      assignedSellerId: null,
      status: "aguardando",
      createdAt: oldest,
      lastMessageAt: newest,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/providers/whatsapp/import/core.test.ts`
Expected: PASS.

- [ ] **Step 5: Atualizar o doc de decisão**

Em `docs/superpowers/plans/2026-06-27-whatsapp-go-history-ingestion.md`, linha 16, atualize a decisão: conversas importadas caem no pool com `status = 'aguardando'` ("Em fila") — decisão superada em 2026-07-02 pela spec de unificação (referencie `docs/superpowers/specs/2026-07-02-unify-queue-assignment-design.md`).

- [ ] **Step 6: Sync do espelho + commit**

```bash
bun scripts/sync-whatsapp-shared.ts
git add src/providers/whatsapp/import/core.ts src/providers/whatsapp/import/core.test.ts supabase/functions/_shared/whatsapp docs/superpowers/plans/2026-06-27-whatsapp-go-history-ingestion.md
git commit -m "feat(import): imported conversations land queued (aguardando)"
```

---

### Task 11: Eco cria conversa "Em fila"

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts:83-91` (contrato) e `:536-546` (echo)
- Modify: `src/providers/whatsapp/webhook/core.test.ts` (expectativa do echo)
- Mirror: `supabase/functions/_shared/whatsapp/**`

- [ ] **Step 1: Atualizar o teste do echo**

Em `core.test.ts`, no bloco do echo (`fromMe: true`, ~L681+), localize a asserção de criação de conversa com `status: "em_andamento"` e troque para `status: "aguardando"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/providers/whatsapp/webhook/core.test.ts`
Expected: FAIL na asserção.

- [ ] **Step 3: Implementar**

(a) Contrato `createConversation` (L83-91): o literal vira só fila —

```ts
    /** New conversations always land queued: inbound awaits staff, and an echo
     *  has no known author — someone claims it in the app (spec 2026-07-02). */
    status: "aguardando";
```

(b) Echo (L536-546):

```ts
      conversation = await db.createConversation({
        storeId: account.storeId,
        customerId: customer.id,
        accountId: account.id,
        // UNASSIGNED (pool): the webhook cannot know which seller sent from the
        // phone, so it never pins the chat — it lands QUEUED ('aguardando') for
        // someone to claim in the app (spec 2026-07-02). Visibility comes from
        // instance access (can_access_conversation).
        assignedSellerId: null,
        lastMessageAt: parsed.timestamp,
        status: "aguardando",
      });
```

(c) O caminho inbound (L626-644) já usa `"aguardando"` — nenhuma mudança; o literal do contrato agora força isso em compile-time.

- [ ] **Step 4: Run test + sync + commit**

Run: `bunx vitest run src/providers/whatsapp/webhook/core.test.ts` — Expected: PASS.

```bash
bun scripts/sync-whatsapp-shared.ts
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts supabase/functions/_shared/whatsapp
git commit -m "feat(webhook): phone-echo conversations land queued"
```

---

### Task 12: Evolution Go — processar `SendMessage` como eco

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts:397` (roteamento de captura)
- Modify: `src/providers/whatsapp/evolution-go/parser.ts:168-170` (aceitar o kind)
- Modify: `src/providers/whatsapp/evolution-go/parser.test.ts` + `src/providers/whatsapp/webhook/core.test.ts`
- Mirror: `supabase/functions/_shared/whatsapp/**`

**Interfaces:**
- Consumes: shape real do evento (validada em prod, integration_logs 2026-06-30): `{ event: "SendMessage", data: { Info: { ID, Chat, IsFromMe: true, Timestamp, Type }, Message: {...} } }` — payload idêntico ao `Message`.

- [ ] **Step 1: Testes primeiro**

`evolution-go/parser.test.ts` — junto ao caso existente "returns outbound-echo when IsFromMe=true" (L102-105), adicione:

```ts
  it("parses the SendMessage event kind (phone-sent) as outbound-echo", () => {
    const ev = messageEvent({ conversation: "mandei do celular" }, { IsFromMe: true });
    (ev as { event?: string }).event = "SendMessage";
    const parsed = parseEvolutionGoInbound(ev, "acc-1");
    expect(parsed.type).toBe("outbound-echo");
    if (parsed.type === "outbound-echo") {
      expect(parsed.text).toBe("mandei do celular");
    }
  });
```

`webhook/core.test.ts` — no bloco dos eventos Go capturados (busque `captureRawEvent`), adicione um caso: um evento `SendMessage` NÃO é capturado (o spy de `captureRawEvent` não é chamado) e produz `outcome: "echo-created"` (montando `db` como nos testes de echo existentes).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/providers/whatsapp/evolution-go/parser.test.ts src/providers/whatsapp/webhook/core.test.ts`
Expected: FAIL — parser lança "evento não suportado" e o core captura o SendMessage.

- [ ] **Step 3: Implementar**

(a) `evolution-go/parser.ts` — doc do topo (L3-5) ganha a linha do novo evento, e o gate (L168-170) aceita o kind:

```ts
  // `Message` = messages from others; `SendMessage` = own sends emitted by the
  // Go server for phone/companion-sent messages (evidence: integration_logs
  // 2026-06-30 — IsFromMe always true; API sends do NOT emit it). Same payload
  // shape, so both flow through the same parsing below.
  if (ev.event !== "Message" && ev.event !== "SendMessage") {
    throw new Error(`EvolutionGoProvider: evento não suportado pelo parser: ${ev.event}`);
  }
```

(b) `webhook/core.ts:397` — deixa o `SendMessage` seguir para o parser:

```ts
    if (goEvent && goEvent !== "Message" && goEvent !== "Receipt" && goEvent !== "SendMessage") {
```

- [ ] **Step 4: Run tests + sync + commit**

Run: `bunx vitest run src/providers/whatsapp/evolution-go/parser.test.ts src/providers/whatsapp/webhook/core.test.ts` — Expected: PASS.

```bash
bun scripts/sync-whatsapp-shared.ts
git add src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/evolution-go/parser.ts src/providers/whatsapp/evolution-go/parser.test.ts src/providers/whatsapp/webhook/core.test.ts supabase/functions/_shared/whatsapp
git commit -m "feat(webhook): process evolution-go SendMessage events as outbound echoes"
```

---

### Task 13: Mídia do eco — download e storage

**Files:**
- Modify: `src/providers/whatsapp/types.ts:174-185` (`IOutboundEcho` += `mediaId?`)
- Modify: `src/providers/whatsapp/evolution/parser.ts:163-177` (echo carrega mediaId)
- Modify: `src/providers/whatsapp/evolution-go/parser.ts:181-192` (echo carrega mediaId)
- Modify: `src/providers/whatsapp/webhook/core.ts:548-576` (pipeline de mídia no echo)
- Modify: testes dos 2 parsers + `webhook/core.test.ts`
- Mirror: `supabase/functions/_shared/whatsapp/**`

**Interfaces:**
- Consumes: `engine.downloadInboundMedia(mediaId)` (funciona para qualquer mensagem do provedor — Evolution baixa por key id, Go por proto node; contrato do PR #203); `db.uploadMedia(path, data, mimeType)` e `db.setMessageMedia(messageId, path, status)` — adapters JÁ existentes no edge (nenhuma mudança no `index.ts`).
- Produces: eco com mídia armazenada no MESMO path pattern do inbound: `conversations/<convId>/<msgId>/media.<ext>` (a policy gated-once de storage cobre pelo `convId` no path — camada congelada intocada).

- [ ] **Step 1: Testes primeiro**

(a) `evolution/parser.test.ts` — no caso "parses fromMe media echo with caption and contentType" (L42-45), acrescente a asserção `expect(parsed.mediaId).toBe(<keyId do fixture>)` (o id passado em `key.id`).

(b) `evolution-go/parser.test.ts` — no caso "returns outbound-echo when IsFromMe=true", adicione um segundo caso com `imageMessage` esperando `parsed.mediaId` definido (mesmo encode `encodeGoMediaRef` do inbound).

(c) `webhook/core.test.ts` — novo caso no bloco do echo: echo com `mediaId` → `db.uploadMedia` chamado com path `conversations/<convId>/<msgId>/media.<ext>` e `db.setMessageMedia(msgId, path, "ok")`; um segundo caso onde `downloadInboundMedia` rejeita → `setMessageMedia(msgId, null, "failed")` e o outcome continua `echo-created` (espelhe os testes de mídia inbound existentes no mesmo arquivo).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/providers/whatsapp/evolution/parser.test.ts src/providers/whatsapp/evolution-go/parser.test.ts src/providers/whatsapp/webhook/core.test.ts`
Expected: FAIL (mediaId ausente; uploadMedia nunca chamado no echo).

- [ ] **Step 3: Implementar**

(a) `types.ts` — em `IOutboundEcho` (após `contentType`):

```ts
  /** Provider media handle for download — same semantics as IInboundMessage.mediaId. */
  mediaId?: string;
```

(b) `evolution/parser.ts` — mova o cálculo de `hasMedia` (hoje L179) para ANTES do branch `fromMe` e inclua no echo:

```ts
  const content = extractEvolutionContent(data.message ?? {});
  const hasMedia = ["image", "audio", "video", "document"].includes(content.contentType);

  if (data.key?.fromMe) {
    return {
      type: "outbound-echo",
      providerMessageId: data.key?.id ?? "",
      toPhone: jidToE164(remoteJid),
      contentType: content.contentType,
      text: content.text,
      // Evolution media downloads by MESSAGE key id (getBase64FromMediaMessage).
      mediaId: hasMedia ? data.key?.id : undefined,
      mediaCaption: content.mediaCaption,
      mediaFilename: content.mediaFilename,
      timestamp: timestampToIso(data.messageTimestamp),
      rawPayload,
    };
  }
```

(c) `evolution-go/parser.ts` — echo branch (L181-192) inclui o ref já extraído:

```ts
  if (info.IsFromMe) {
    return {
      type: "outbound-echo",
      providerMessageId: info.ID ?? "",
      toPhone: jidToE164(chat),
      contentType: content.contentType,
      text: content.text,
      mediaId: content.mediaId,
      mediaCaption: content.mediaCaption,
      mediaFilename: content.mediaFilename,
      timestamp,
      rawPayload,
    };
  }
```

(d) `webhook/core.ts` — no branch do echo, logo APÓS `await db.markProcessed(eventKey, traceId);` (hoje L559) e ANTES do `db.audit`, replique o passo 8 do inbound (mesma semântica best-effort):

```ts
    // Media (spec 2026-07-02): phone-sent media mirrors the inbound pipeline —
    // download now or mark failed; never blocks the echo record itself.
    if (parsed.mediaId) {
      try {
        const engine = args.buildProvider(account);
        const media = await withTimeout(
          engine.downloadInboundMedia(parsed.mediaId),
          args.mediaTimeoutMs ?? DEFAULT_MEDIA_TIMEOUT_MS,
        );
        const extension = MIME_EXTENSIONS[media.mimeType] ?? "bin";
        const path = `conversations/${conversation.id}/${message.id}/media.${extension}`;
        await db.uploadMedia(path, media.data, media.mimeType);
        await db.setMessageMedia(message.id, path, "ok");
      } catch (error) {
        warn("echo media download failed", {
          mediaId: parsed.mediaId,
          detail: error instanceof Error ? error.message : String(error),
        });
        await db.setMessageMedia(message.id, null, "failed");
      }
    }
```

E no `db.audit` do echo, acrescente `hasMedia: Boolean(parsed.mediaId),` no objeto `after` (paridade com o audit inbound).

- [ ] **Step 4: Run tests + sync + commit**

Run: `bunx vitest run src/providers/whatsapp/evolution/parser.test.ts src/providers/whatsapp/evolution-go/parser.test.ts src/providers/whatsapp/webhook/core.test.ts` — Expected: PASS.

```bash
bun scripts/sync-whatsapp-shared.ts
git add src/providers/whatsapp/types.ts src/providers/whatsapp/evolution/parser.ts src/providers/whatsapp/evolution/parser.test.ts src/providers/whatsapp/evolution-go/parser.ts src/providers/whatsapp/evolution-go/parser.test.ts src/providers/whatsapp/webhook/core.ts src/providers/whatsapp/webhook/core.test.ts supabase/functions/_shared/whatsapp
git commit -m "feat(webhook): download and store media for phone-sent echoes"
```

---

### Task 14: Migration de DADOS (espelho, aplicar só no rollout)

**Files:**
- Create: `supabase/migrations/20260702160000_unify_queue_status_data.sql`

- [ ] **Step 1: Criar o arquivo (NÃO aplicar)**

```sql
-- One-time data reconciliation (spec 2026-07-02-unify-queue-assignment):
-- align production rows with the status<->assignment invariant BEFORE the
-- unified "Em fila" filter ships. Idempotent — safe to re-run after the new
-- webhook/import deploys. Archived conversations are never touched.
-- ⚠️ Apply MANUALLY via MCP with the owner's OK, LAST in the rollout order.

-- Unowned open conversations (no SDR) are, by definition, queued.
-- (~1,144 rows at 2026-07-02: unassigned em_andamento; none in aguardando_cliente.)
update public.conversations
   set status = 'aguardando', updated_at = now()
 where assigned_seller_id is null
   and is_sdr_active = false
   and status in ('em_andamento', 'aguardando_cliente');

-- Owned conversations are being attended — never 'aguardando'.
-- (~41 rows at 2026-07-02.)
update public.conversations
   set status = 'em_andamento', updated_at = now()
 where assigned_seller_id is not null
   and status = 'aguardando';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260702160000_unify_queue_status_data.sql
git commit -m "feat(sql): data reconciliation for the queue/assignment invariant (mirror only)"
```

---

### Task 15: Gerador mock respeita a invariante

**Files:**
- Modify: `src/mocks/generators/conversation.ts:35-64`

- [ ] **Step 1: Acoplar status ao dono no seed**

O dataset mock é o "mundo já migrado" da demo. Substitua o trecho de decisão (L35-36 e L48-66) para derivar o status da atribuição:

```ts
  const isSdrActive = ctx.bool(0.25);
  const assignedSellerId = isSdrActive
    ? undefined
    : input.participant.kind === "customer"
      ? (input.participant.entity.sellerId ?? undefined)
      : ctx.pick(input.sellerIds);
  // Invariant (spec 2026-07-02): unowned open conversation = 'aguardando';
  // owned = attended statuses; SDR-driven = em_andamento without an owner.
  const status: ConversationStatus = isSdrActive
    ? "em_andamento"
    : assignedSellerId === undefined
      ? pickWeighted(ctx, [
          { value: "aguardando" as const, weight: 8 },
          { value: "arquivada" as const, weight: 2 },
        ])
      : pickWeighted(ctx, [
          { value: "em_andamento" as const, weight: 5 },
          { value: "aguardando_cliente" as const, weight: 3 },
          { value: "resolvida" as const, weight: 3 },
          { value: "arquivada" as const, weight: 1 },
        ]);
```

No objeto retornado, troque `assignedSellerId: isSdrActive ? undefined : ...` (L53-57) por `assignedSellerId,` e mantenha `status,`/`isSdrActive,`. Remova a constante `STATUS_WEIGHTS` se ficar órfã (confira outros usos no arquivo). Importe `ConversationStatus` de `@/shared/types` se ainda não importado.

- [ ] **Step 2: Rodar a suíte inteira do mock (o seed muda o dataset)**

Run: `bunx vitest run src/mocks`
Expected: PASS — se algum teste de seed contar por status fixo, ajuste a expectativa ao novo dataset determinístico (mesma seed ⇒ novos valores estáveis).

- [ ] **Step 3: Commit**

```bash
git add src/mocks/generators/conversation.ts
git commit -m "feat(mocks): seed conversations honoring the queue/assignment invariant"
```

---

### Task 16: Gates finais + PR (SEM merge)

**Files:**
- Nenhum novo — verificação e entrega.

- [ ] **Step 1: Suíte completa + build + lint**

Run: `bun run test && bun run build && bun run lint`
Expected: tudo verde (lint pode apontar baseline pré-existente — avalie só arquivos tocados).

- [ ] **Step 2: Type-check por delta**

Run: `bunx tsc --noEmit 2>&1 | grep -E "(assignmentStatusCoupling|useInboxFilters|assignmentFilter|conversations|parser|core|useConversationStatusActions|InboxFilters|assignmentLabel)" || echo "sem erros novos nos arquivos tocados"`
Expected: nenhum erro NOVO nos arquivos do plano (baseline ~315 erros pré-existentes em outros arquivos é conhecido).

- [ ] **Step 3: Verificar espelho sincronizado**

Run: `bun scripts/sync-whatsapp-shared.ts && git status --porcelain supabase/functions/_shared/whatsapp`
Expected: saída vazia (espelho já commitado; se aparecer diff, commit esquecido em task anterior — corrija).

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/unify-queue-assignment
gh pr create --title "feat: unify Sem atribuicao into Em fila + phone echo (status/assignment invariant)" --body "$(cat <<'EOF'
## Resumo
- Invariante status⇄atribuição: sem dono (aberta, sem SDR) = 'aguardando' (Em fila); com dono nunca 'aguardando'
- Acoplamento em assignSeller/unassign (mock+supabase+RPC transfer_conversation), undos simétricos e StatusControl (claim/devolução automática com toast)
- Filtro de Atribuição unificado: opção "Sem atribuição" removida; token legado `unassigned` normalizado para `queue` (URLs/favoritos/localStorage curados); zero mudança nas RPCs de busca
- Import de histórico e eco do celular criam conversa em fila ('aguardando')
- Evolution Go: evento `SendMessage` (mensagem enviada do aparelho) agora vira eco — com download e storage de mídia (mesmo path pattern inbound)
- Gerador mock alinhado à invariante

Spec: docs/superpowers/specs/2026-07-02-unify-queue-assignment-design.md

## Rollout (após merge, em ordem — NADA aplicado ainda)
1. Aplicar migration `20260702150000_transfer_conversation_status_coupling.sql` (MCP, OK do dono)
2. Redeploy Edge Functions: `whatsapp-webhook`, `whatsapp-import-history`, `whatsapp-import-history-go`
3. Aplicar migration de DADOS `20260702160000_unify_queue_status_data.sql` (MCP, OK do dono — POR ÚLTIMO)
4. Smoke: filtro com URL antiga; import → fila; mensagem do celular no número Vendas (texto e mídia) aparece; devolver à fila/assumir acoplam status

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR aberto; **não mergear** — smoke e merge são do dono.

---

## Self-review (cobertura da spec)

| Spec | Task |
|---|---|
| §1 Migração de dados (1.144 + 41) | 14 |
| §2 unassign regride / assign avança / StatusControl acopla (+corolário) / undos | 2, 3, 4, 5, 6 |
| §3 Import cria 'aguardando' + doc + espelho | 10 |
| §4a Eco nasce 'aguardando' | 11 |
| §4b Go SendMessage → eco | 12 |
| §4c Mídia do eco (Go + clássico) | 13 |
| §5 Filtro/UI/token legado/contrato/zero-SQL | 7, 8, 9 |
| Invariante na demo (mock seed) | 15 |
| Gates + PR + rollout checklist | 16 |
| Não tocado: isQueuedConversation, camadas congeladas, KPIs de status | Global Constraints |
