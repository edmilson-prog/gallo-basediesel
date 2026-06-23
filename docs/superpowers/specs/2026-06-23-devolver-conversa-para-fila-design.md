# Spec — "Devolver para a fila" (desatribuir conversa, owner/gestor)

**Data:** 2026-06-23
**Feature:** `src/features/conversations`
**Tipo:** Entrega 100% frontend (sem migration, sem RLS nova, sem redeploy de Edge)
**Status:** Design aprovado — pronto para plano de implementação

---

## 1. Problema / motivação

Um owner/gestor consegue hoje **reatribuir** uma conversa de um atendente para outro
(barra flutuante `QuickActions` na lista e item "Transferir" no menu kebab `⋮` da
conversa aberta). Mas **não há como devolver uma conversa atribuída de volta para a
fila** (pool, sem responsável). Quando o gestor quer apenas "tirar das mãos" de um
atendente sem escolher outro — devolvendo ao revezamento/pool — não existe ação.

**Regra de negócio desejada:** o owner/gestor pode **devolver uma conversa para a
fila** (desatribuir → `assignedSellerId = null`), a partir dos **mesmos dois lugares**
onde a transferência já vive: a barra flutuante da lista e o menu kebab.

## 2. Decisões tomadas (Q&A)

| Decisão | Escolha |
|---|---|
| **Escopo de papéis** | Apenas **staff** (owner/gestor, `conversation/edit/store`). Não é só preferência de UX: a RLS `conversations_update` (`WITH CHECK`) só deixa `is_staff()` setar `assigned_seller_id = null`; um vendedor comum **não consegue** devolver ao pool nem via RPC. Logo o botão é staff-only e some para os demais. |
| **Onde fica** | Nos **dois** lugares onde a transferência já existe: barra flutuante `QuickActions` (lista) **e** menu kebab `ConversationMenu` (conversa aberta). |
| **Confirmação** | **Toast com "Desfazer"** (mesmo padrão de transferir/arquivar). Ação reversível, sem diálogo de confirmação. |
| **Reforço no servidor** | **Não** — apenas a ação de UI usando a RLS existente. Sem migration. |

## 3. A regra (gate)

O botão "Devolver para a fila" aparece quando **as duas** condições valem:

1. o usuário **é staff** (`usePermission("conversation", "edit", "store")`); **e**
2. `conversation.assignedSellerId` **não é nulo** (há um responsável para remover).

Se a conversa já está no pool, não há o que devolver → botão oculto.

**Função pura testável** (estende o engine existente `engine/assignmentGate.ts`,
ao lado de `mustAssignToReply`):

```ts
// src/features/conversations/engine/assignmentGate.ts
export function canReturnToQueue(
  conversation: Pick<IConversation, "assignedSellerId">,
  ctx: { isStaff: boolean },
): boolean {
  if (!ctx.isStaff) return false;
  return conversation.assignedSellerId != null;
}
```

> Atenção: o gate de **mostrar** é `edit/store` (staff). Ele é DIFERENTE e mais
> restrito que o `canTransferOrArchive`/`canManageThis` usados hoje para
> transferir/arquivar (`edit/store` **ou** `edit/own` na própria conversa). Não
> reaproveitar aquele predicado — usar `canReturnToQueue`.

## 4. Comportamento (ação)

Ao clicar "Devolver para a fila":

1. **Desatribui:** `conversationsProvider.unassign(conversation.id)` (novo método —
   ver §6.2). A conversa volta ao pool/fila.
2. **Toast com Desfazer** (5 s): "Conversa devolvida à fila" + ação **Desfazer**, que
   restaura o responsável anterior via `update(id, { assignedSellerId: before })`
   (`before` é o id do vendedor anterior, não-nulo → type-safe; staff RLS permite).
3. **Auditoria:** `recordAuditLog` com `action: "conversation.return_to_queue"`,
   `before: { assignedSellerId: before }`, `after: { assignedSellerId: null }`.

Leitura e demais comportamentos permanecem inalterados.

## 5. UX (dois lugares)

Especialista de UI/UX (ui-ux-pro-max) consultado. Diretrizes aplicadas:

**`QuickActions` (barra flutuante da lista):**
- Novo botão de ícone ghost, mesmo tamanho (`h-7 w-7`) e estilo dos atuais
  (transferir = `mdi:account-switch`, arquivar = `mdi:archive-arrow-down-outline`).
- Ícone: `mdi:account-arrow-left-outline` (sai do dono → volta à fila).
- `aria-label` + `Tooltip` (side `left`): **"Devolver para a fila"**.
- Posição: depois de Transferir, antes de Arquivar (agrupa as ações de atribuição).
- Hover com tom de alerta suave (`text-amber-600`/`hover:bg-amber-500/10` em tokens) —
  **não** vermelho destrutivo pleno, pois é reversível. Cor nunca é o único sinal
  (ícone + tooltip carregam o significado).

**`ConversationMenu` (kebab `⋮`):**
- Novo `DropdownMenuItem` logo após "Transferir", com ícone
  `mdi:account-arrow-left-outline` + texto **"Devolver para a fila"**.
- Mesmo gate `canReturnToQueue` (staff + atribuída).

## 6. Estrutura de código (unidades)

### 6.1 Engine puro (estendido)
`engine/assignmentGate.ts` — adicionar `canReturnToQueue(...)` (§3). Testado (TDD).

### 6.2 Provider — novo método `unassign`
`update({ assignedSellerId: undefined })` **não serve**: no Supabase o
`conversationPatchToRow` ignora `undefined` (no-op) e o tipo não aceita `null`.
Por isso um método dedicado, simétrico a `assignSeller`:

- **Contrato** (`contracts/conversations.ts`): `unassign(id: ID): Promise<IConversation>`
  — "Remove o responsável (devolve ao pool/fila). Permitido apenas a staff na RLS."
- **Mock** (`impl/mock/conversations.ts` + `mocks/api/conversations.ts`): limpa com
  `assignedSellerId: undefined` (na store mock, `undefined` zera o campo).
- **Supabase** (`impl/supabase/conversations.ts`): `update` direto na tabela
  `set assigned_seller_id = null` (a RLS `is_staff()` autoriza; sem RPC nova).

### 6.3 Hook reutilizável
`hooks/useReturnToQueue.ts` — espelha `useSelfAssign`: orquestra
`unassign` + toast com Desfazer (restaura via `update`) + auditoria
`conversation.return_to_queue`. Recebe `{ onDone }`. Consumido pelos **dois**
componentes (DRY — uma só fonte de verdade para a ação, o toast e o audit).

### 6.4 `QuickActions` (alterado)
Calcula `canReturnToQueue(conversation, { isStaff: canEditStore })` e renderiza o
novo botão (§5) usando `useReturnToQueue(conversation, { onDone: onMutated })`.

### 6.5 `ConversationMenu` (alterado)
Idem: novo `DropdownMenuItem` gated por `canReturnToQueue` usando o mesmo hook
(`onDone: onMutated`).

### 6.6 i18n (pt-BR)
`i18n/pt-BR.ts`:
- `INBOX_STRINGS.returnToQueue = "Devolver para a fila"` (tooltip/aria do QuickActions)
- `INBOX_STRINGS.returnedToQueue = "Conversa devolvida à fila"` (toast)
- `CONVERSATION_STRINGS.menu.returnToQueue = "Devolver para a fila"` (item do kebab)
- `CONVERSATION_STRINGS.returnedToQueue = "Conversa devolvida à fila"` (toast)

Reaproveitar `undo`/`undone`/`actionFailed` já existentes em ambos os namespaces.

## 7. Testes (Vitest)

`assignmentGate.test.ts` — adicionar casos de `canReturnToQueue`:
- staff + atribuída → `true`
- staff + pool (sem responsável) → `false`
- não-staff + atribuída → `false`
- não-staff + pool → `false`

(O projeto roda Vitest em `environment: "node"`, sem jsdom/testing-library — **não**
introduzir testes de componente. A verificação de UI é manual + `bun run build` +
suíte, como na entrega "assumir antes de responder".)

## 8. Não-objetivos (escopo fechado)

- **Sem** migration, RLS nova, RPC nova ou alteração de Edge Function.
- **Não** habilitar devolução à fila para vendedor comum (a RLS bloqueia; o botão
  some). Sem auto-atribuição/lógica de fila no servidor.
- **Não tocar** no cache de mensagens/mídias/realtime do atendimento (camada
  congelada: signing em lote, query keys, RPC gated-once).
- **Sem** mudar a transferência (reatribuir A→B) existente.

## 9. Riscos / observações

- **Simetria do undo:** o "Desfazer" restaura o responsável anterior com
  `update({ assignedSellerId: before })` — staff, type-safe (`before` é `ID`).
  Não usa `assignSeller` para o undo (evita o efeito colateral `isSdrActive=false`
  da RPC).
- **`unassign` no Supabase é um `update` de tabela direto** (não RPC). Está coberto
  pela policy `conversations_update` (USING + WITH CHECK com `is_staff()`),
  confirmada em `20260609123057_rls_conversations_pool.sql`.
- **Responsividade:** o `AssigneeChip full` do header é `hidden lg:inline-flex`, mas o
  kebab e a barra flutuante aparecem em todas as larguras — a ação fica acessível
  independentemente da largura da tela.
