# Spec — "Assumir antes de responder" (gate de envio em conversas do pool)

**Data:** 2026-06-23
**Feature:** `src/features/conversations`
**Tipo:** Entrega 100% frontend (sem migration, sem RLS, sem redeploy de Edge)
**Status:** Design aprovado — pronto para plano de implementação

---

## 1. Problema / motivação

Hoje, um atendente/vendedor que enxerga uma conversa **sem responsável** (no "pool"
de uma instância que ele acessa) consegue **enviar mensagem ao cliente sem assumir**
a conversa. Isso quebra a organização do atendimento: respostas saem sem dono
registrado, dificultando rastreabilidade e métricas de atendimento.

**Regra de negócio desejada:** enquanto a conversa **não estiver atribuída a ele**,
o atendente/vendedor **vê tudo normalmente (leitura inalterada)**, mas **não consegue
enviar mensagem**. Para responder, ele precisa **assumir a conversa para si**.

## 2. Decisões tomadas (Q&A)

| Decisão | Escolha |
|---|---|
| **Escopo de papéis** | Apenas **não-staff** (papéis operacionais). Owner/Gestor continuam enviando livremente, sem precisar assumir. |
| **UX do bloqueio** | **Banner "Assumir e responder"** no lugar do campo — 1 clique atribui a conversa e libera o envio. |
| **Reforço no servidor** | **Não** nesta entrega. Apenas bloqueio de interface. *Não é fronteira de segurança* — um envio direto via API ainda passaria. |
| **Notas internas** | **Liberadas** sem atribuição. Só o **envio de mensagem ao cliente** exige assumir. Agendamento segue o envio (= bloqueado). |

## 3. A regra (gate)

A conversa exige **assumir-para-responder** quando **as duas** condições valem:

1. `conversation.assignedSellerId` é **nulo** (pool, sem dono); **e**
2. o usuário **não é staff**.

**Definição de staff (isento):** `usePermission("conversation", "view", "store")`
— quem vê a loja inteira (Owner/Gestor). Escolhido em vez do nome do papel para
respeitar papéis customizados via RBAC e ficar coerente com o `showAssignee` já
usado em `ConversationPage`.

**Função pura testável:**

```ts
// src/features/conversations/engine/assignmentGate.ts
export function mustAssignToReply(
  conversation: Pick<IConversation, "assignedSellerId">,
  ctx: { isStaff: boolean },
): boolean {
  if (ctx.isStaff) return false;
  return conversation.assignedSellerId == null;
}
```

**Consequências do modelo de 2 portões (já existente):**
- Conversa **atribuída a você** → `assignedSellerId === seu sellerId` → não bloqueia.
- Você é **participante co-responsável** → a conversa tem dono (`assignedSellerId != null`)
  → não bloqueia (mantém a co-responsabilidade do multi-instância).
- Conversa **atribuída a outro** → não-staff nem enxerga (atribuída = exclusiva);
  staff é isento.
- Portanto o gate cobre **exatamente o pool** (conversas sem dono).

**Leitura permanece 100% inalterada** (mensagens, mídias, ficha, copilot, status).

## 4. UX do bloqueio

No lugar da barra de digitação, um banner:

> 🔒 **Conversa na fila, sem responsável.** Assuma para responder ao cliente.
> **[ Assumir e responder ]**  ·  📝 Nota interna

- **"Assumir e responder"** (primário): atribui a conversa ao usuário atual
  reusando o fluxo já existente — `conversationsProvider.assignSeller` + toast com
  ação "desfazer" + auditoria `conversation.self_assign`. Ao concluir, a conversa
  é revalidada (`detail.refresh`) e o composer normal reaparece, pronto para digitar.
- Usuário **sem `sellerId`** (admin sem vínculo de vendedor): banner **sem botão**,
  com o texto *"Peça a um gestor para atribuir esta conversa a você."* (não pode
  self-assign).
- **📝 Nota interna**: continua acessível; abre o `InlineNoteComposer` já existente
  (desdobra acima do banner). Não envia nada ao cliente.

## 5. Caminhos de envio cobertos

**Bloqueados** quando "precisa assumir":
- Texto (Enter e botão **Enviar**)
- Anexo (imagem / documento / áudio)
- Nota de voz
- Agendar mensagem (`ScheduleButton`)
- Templates HSM
- Biblioteca de ativos / produto / slash `/` / respostas rápidas
- Sugestões IA (ocultas — inserem texto no campo bloqueado)
- **"Enviar todos" do `ComboTray`** (no `ConversationPage`)

**Liberados:**
- Notas internas da conversa
- Toda a leitura (mensagens, mídias, ficha, copilot, status)

## 6. Estrutura de código (unidades)

Tudo em `src/features/conversations` (+ ajuste pontual no `QuickActions` para DRY).

### 6.1 Novo — engine puro
`engine/assignmentGate.ts` — função `mustAssignToReply(...)` (seção 3). Testada (TDD).

### 6.2 Novo — hook reutilizável
`hooks/useSelfAssign.ts` — extrai a lógica hoje embutida em
`QuickActions.handleAssignToMe`:
- `assignSeller(conversation.id, currentUser.sellerId)`
- toast "Conversa atribuída a você" com ação **desfazer** (restaura `assignedSellerId`
  anterior via `update`)
- auditoria `conversation.self_assign` (mesmos campos `before`/`after`)
- recebe `{ onDone }` (chamado após sucesso — usado para `refresh`)

Consumido por **`QuickActions`** (refatorado para usar o hook, **sem mudança de
comportamento**) e pelo **banner**.

### 6.3 Novo — componente de apresentação
`components/AssignToReplyBanner.tsx` — puro, sem efeitos de dados:
- props: `canAssign: boolean`, `onAssign: () => void`, `onToggleNote: () => void`,
  `assigning?: boolean`
- renderiza o aviso + botão primário (quando `canAssign`) + botão "Nota interna"
- quando `!canAssign`: troca o botão pelo texto de orientação (sem ação)

### 6.4 Alterado — `MessageInput`
- Nova prop `mustAssignToReply?: boolean` (+ `onAssigned?: () => void`).
- Quando `mustAssignToReply` é `true`: renderiza `AssignToReplyBanner` (e o
  `InlineNoteComposer` quando aberto) **no lugar** da barra de digitação; o restante
  dos caminhos de envio não é renderizado/acionável.
- Usa `useSelfAssign(conversation, { onDone: onAssigned })` para o botão do banner.
- O modo `readOnly`/`archived` existente (early-return) permanece **inalterado** e
  tem precedência (arquivada continua arquivada).

### 6.5 Alterado — `ConversationPage`
- Calcula `const isStaff = usePermission("conversation", "view", "store")` (já
  existe como `showAssignee`; reutilizar/renomear conforme legibilidade) e
  `const mustAssign = mustAssignToReply(conversation, { isStaff })`.
- Passa `mustAssignToReply={mustAssign}` e `onAssigned={detail.refresh}` ao
  `MessageInput`.
- Passa o flag ao `ConversationComboTray` para suprimir o "Enviar todos" (ou não
  renderizar a bandeja) quando `mustAssign`.

### 6.6 i18n (pt-BR)
Novas strings em `CONVERSATION_STRINGS` / `INBOX_STRINGS`:
- título do banner (ex.: "Conversa na fila, sem responsável")
- descrição ("Assuma para responder ao cliente")
- botão "Assumir e responder"
- botão "Nota interna"
- variante sem vínculo ("Peça a um gestor para atribuir esta conversa a você")

Strings já existentes a reutilizar: `INBOX_STRINGS.assignedToYou`, `INBOX_STRINGS.undo`,
`INBOX_STRINGS.undone`, `INBOX_STRINGS.actionFailed`.

## 7. Testes (Vitest)

1. **`assignmentGate.test.ts`** (TDD, função pura):
   - pool + não-staff → `true`
   - pool + staff → `false`
   - atribuída (qualquer dono) + não-staff → `false`
   - atribuída + staff → `false`
2. **`AssignToReplyBanner.test.tsx`**:
   - `canAssign=true` → renderiza botão "Assumir e responder" e dispara `onAssign`
   - `canAssign=false` → sem botão; mostra texto de orientação; expõe "Nota interna"
   - botão "Nota interna" dispara `onToggleNote`

## 8. Não-objetivos (escopo fechado)

- **Sem** mudança no servidor / Edge `whatsapp-send` (`processSendRequest` mantém o
  `isPoolAccessible` atual). Não é fronteira de segurança nesta entrega.
- **Sem** migration, RLS ou alteração de provider de dados.
- **Não tocar** no cache de mensagens/mídias/realtime do atendimento (camada
  congelada: signing em lote, query keys, RPC gated-once).
- Comportamento de **staff** e de **conversas já atribuídas** permanece inalterado.
- **Sem** auto-atribuição silenciosa ao enviar (descartado por decisão).

## 9. Riscos / observações

- **`usePermission` vs papel customizado:** usar o escopo `view/store` cobre papéis
  customizados com `base_role` de gestor. Um papel operacional customizado que
  (indevidamente) tivesse `view/store` ficaria isento — comportamento coerente com
  o resto do RBAC.
- **`ComboTray` órfão:** itens de combo só entram via `AssetPicker` (dentro do
  composer, já bloqueado). Suprimir o "Enviar todos" no pool cobre o caso raro de
  itens pré-existentes na bandeja.
- **Refactor do `QuickActions`:** extrair `useSelfAssign` toca um componente
  existente; os testes devem garantir paridade (assign + toast desfazer + audit).
