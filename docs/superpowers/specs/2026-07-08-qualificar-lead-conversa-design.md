# Qualificar conversa como lead — design

**Data:** 2026-07-08
**Branch:** `feat/leads-production` (worktree isolada `.claude/worktrees/leads-production`, a partir de `origin/main`)

## Contexto

O pedido original era "colocar em produção os leads" — mas investigação mostrou que o backend do pipeline de Leads (PRD-017) já está `_DONE` havia tempo: rota, feature folder completo (`src/features/leads/`), provider mock e Supabase (`src/providers/data/impl/supabase/leads.ts`), tudo registrado no `factory.ts`. `VITE_DATA_SOURCE=supabase` já está ativo no ambiente de desenvolvimento, que aponta para o projeto de produção — ou seja, a tela de Leads já opera sobre dados reais.

A real lacuna, confirmada por exploração de código:

- **`ConversationMenu.tsx`** declara a prop `lead: ILead | null` na interface mas nem a desestrutura — não existe nenhum item de menu para vincular uma conversa a um lead.
- **`NewLeadModal`** é 100% manual: usuário digita nome/telefone do zero, sem qualquer pré-preenchimento ou vínculo com uma conversa de origem.
- O vínculo `conversation.leadId` ↔ `lead.conversations[]` só é populado em `src/mocks/generators/{scriptedConversations,bootstrap}.ts` (dados de seed) — nunca em runtime.
- O caminho de **leitura** já existe: `useConversationDetail` busca `lead` quando `conversation.leadId` está setado (`conversation.leadId ? leadsProvider.get(...) : null`), e `getConversationDisplay(conversation, customer, lead)` já sabe usar esse `lead` para exibir nome/telefone quando não há `customer`.
- A coluna `lead_id` já existe em `conversations` (Supabase) e `IConversationsProvider.update` já aceita `leadId` — confirmado em `supabase/.../conversations.ts:67,128`. **Nenhuma migration é necessária.**

Ou seja: o que falta não é o pipeline de Leads em si, é a **ponte entre Inbox e Leads** — a ação de qualificar uma conversa como lead, que depois transiciona pelo Kanban (Novo → Qualificação → Orçamento → Negociação → Fechado) e, se ganha, vira cliente via `ConvertLeadModal` (já existente).

### Fora de escopo desta entrega

- **Bug do KPI zerado no Kanban** (`KanbanMetricsBar` computa taxa de conversão/tempo médio/valor médio sobre o mesmo array já filtrado por `includeLost`/`includeConverted`, que exclui por padrão os leads fechados — confirmado com dados reais de produção: 5 leads em `stage-fechado`, 4 convertidos + 1 perdido, invisíveis com os filtros padrão). Fica registrado como item separado de backlog.
- **Gap simétrico no `ConvertLeadModal`**: ao converter um lead em cliente, nada atualiza `conversation.customerId`/`conversation.leadId` das conversas vinculadas. Mesma família de problema, mas na direção oposta (lead → cliente); não faz parte desta entrega.
- Redesign visual do Kanban de Leads (polimento de cards/cores/tokens semânticos, avaliado com o agente de design, mas explicitamente pausado pelo usuário nesta rodada).
- Múltiplas conversas por lead / UI para desvincular e revincular.

## Objetivo desta entrega

Permitir que um atendente, a partir de uma conversa no Inbox, qualifique-a como lead — criando o registro no pipeline pré-preenchido com os dados da conversa e fechando o vínculo nos dois sentidos (`conversation.leadId` e `lead.conversations`).

## Design

### 1. Localização da ação

Novo item em `ConversationMenu.tsx` (dropdown "⋮" do header da conversa), junto aos demais itens (Transferir, Arquivar, etc.).

**Condição de exibição:**
- **"Qualificar como lead"** — quando `usePermission("lead", "create")` é `true` **e** `!conversation.customerId && !conversation.leadId` (conversa ainda não tem cliente nem lead vinculado).
- **"Ver lead"** — quando `conversation.leadId` já está setado; navega para `/app/leads/$id`.
- Nenhum item novo quando a conversa já tem `customerId` (já é cliente — qualificar como lead não se aplica).

### 2. O modal

Estender `NewLeadModal` (não duplicar) com props opcionais:

```ts
export interface INewLeadModalProps {
  open: boolean;
  onClose: () => void;
  stages: IPipelineStage[];
  sellers: ISeller[];
  onCreated?: (lead: ILead) => void;
  // novos, opcionais:
  conversationId?: ID;
  initialName?: string;
  initialPhone?: string;
}
```

Quando aberto a partir da conversa (`conversationId` presente):
- `name`/`phone` inicializam com `initialName`/`initialPhone` (vindos do `contact` resolvido pela conversa — `IConversationContact`), em vez de vazios.
- `origin` permanece travado em `"whatsapp"` (já é o default do modal).
- `sellerId` pré-seleciona `conversation.assignedSellerId` quando presente; senão mantém a regra atual (`currentUser.sellerId` ?? primeiro vendedor).
- `stageId`/`temperature` seguem os defaults atuais (primeiro estágio da pipeline; usuário escolhe temperatura).

### 3. Fluxo de dados ao salvar

Dentro de `handleSave` (em `NewLeadModal`), após o `provider.create(...)` atual, quando `conversationId` estiver presente:

1. `leadsProvider.update(lead.id, { conversations: [conversationId] })`.
2. `conversationsProvider.update(conversationId, { leadId: lead.id })`.
3. Auditoria: novo action `lead.qualified_from_conversation` (distinto de `lead.created`, para diferenciar nos relatórios quem foi criado manualmente na tela de Leads vs. qualificado a partir de uma conversa). Registra `resourceId: lead.id`, `after: { conversationId, sellerId, stageId, origin, temperature }`.
4. `onCreated?.(lead)` — no caso do fluxo de conversa, o callback chama `onMutated?.()`/`detail.refresh()` da `ConversationPage` (em vez de navegar para `/app/leads/$id`, que é o que acontece hoje quando o modal abre a partir da tela de Leads).
5. Toast de sucesso com ação secundária "Ver lead" (navegação opcional — o atendente permanece na conversa por padrão).

### 4. Erros / edge cases

- Falha no passo de criação do lead (`provider.create`): toast de erro, nada é persistido — mesmo comportamento atual do `NewLeadModal`.
- Falha nos passos 1–2 (lead criado mas vínculo não fechou): o lead existe mas fica órfão da conversa. Não há rollback do lead (evita duplicar lógica de exclusão) — loga o erro e mostra toast avisando que o lead foi criado mas o vínculo com a conversa falhou, sugerindo tentar novamente ou vincular manualmente depois.
- `contact` ainda não resolvido quando o modal abre (raro — ex.: RLS/pool edge case): campos nascem vazios, usuário preenche manualmente; não bloqueia a ação.
- Permissão: se `usePermission("lead", "create")` for `false`, o item de menu simplesmente não aparece (mesma regra já usada em `LeadsPage.canCreate`).

### 5. Testes

- Unit test (Vitest) para uma função pura extraída, ex. `getLeadMenuAction(conversation, canCreateLead): "qualify" | "view" | null`, cobrindo as 4 combinações de `customerId`/`leadId` presentes/ausentes cruzadas com a permissão.
- Não há lógica de negócio complexa o suficiente para justificar mais cobertura — o restante é wiring de UI e chamadas a providers já existentes e já exercitados (`NewLeadModal`, `conversationsProvider.update`).

### 6. Rollout

- Sem migration (coluna `lead_id` já existe e já é gravável).
- Sem Edge Function nova.
- Sem mudança de rota.
- Muda apenas frontend: `ConversationMenu.tsx`, `NewLeadModal.tsx` (props opcionais), `ConversationPage.tsx`/`ConversationHeader.tsx` (passar as novas props para o menu), auditoria (`auditLog`).
