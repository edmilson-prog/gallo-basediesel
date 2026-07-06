# Colaboradores de conversa (on-demand)

> **Feature:** vários atendentes interagem na **mesma** conversa de WhatsApp, por
> demanda, sem transferir a carteira do cliente.
> **PR:** [#239](https://github.com/edmilson-prog/gallo-basediesel/pull/239) ·
> **Branch:** `worktree-conversation-collaborators`
> **Spec/Plano:** `docs/superpowers/specs/2026-07-04-conversation-collaborators-design.md`,
> `docs/superpowers/plans/2026-07-04-conversation-collaborators.md`
> **Modelo de acesso:** `docs/dev/conversation-access-model.md` (regra dos "2 portões")

Este documento consolida **tudo o que foi implementado e corrigido**: a feature
original, a revisão de código multi-agente, as correções, as migrations e as
decisões do dono. Serve de referência única para o smoke, a manutenção e o
merge.

---

## 1. Visão geral

O atendimento do GALLO usa o **modelo de 2 portões** para leitura de conversa por
papéis não-staff:

- **Portão A — Atendimento (por instância):** você vê a conversa se estiver
  atribuído a ela e tiver acesso ao número de origem (`can_access_conversation`).
- **Portão B — Carteira (por dono):** você vê o cliente da sua carteira
  (`customers.seller_id`).

Um **colaborador é exclusivamente Portão A**: ganha acesso de leitura + resposta
àquela conversa, **sem** virar dono do cliente e **sem** alterar a carteira.
Quando a flag de loja `participantCrossInstance` está **desligada** (padrão), o
acesso do participante é feito em **AND** com o acesso à instância — ou seja,
convidar alguém que não tem acesso ao número criaria um "colaborador fantasma"
que não conseguiria abrir a conversa. Toda a feature respeita esse invariante.

Formas de virar colaborador:
1. **Convite manual** pela seção "Colaboradores" da ficha (staff ou o responsável).
2. **@menção** numa nota interna — o mencionado é auto-adicionado (`source='mention'`).

Ao encerrar (resolver/arquivar) a conversa, os colaboradores são **limpos** — a
próxima rodada de colaboração começa vazia.

---

## 2. Arquitetura e camadas

### 2.1 Modelo de domínio
- `IConversationParticipant` e o campo `source: 'manual' | 'mention'` +
  `IConversation.isCollaborator` — `src/shared/types/conversation.ts`
  (commit `d97c7386`).

### 2.2 Tabela e RLS
- Tabela `public.conversation_participants` (`conversation_id`, `seller_id`,
  `added_by`, `added_at`, `source`) — origem em
  `supabase/migrations/20260615130200_whatsapp_multi_participants.sql`.
- Políticas: `cp_select` (leitura), `cp_insert`/`cp_delete` (escrita, separadas
  para permitir a auto-remoção) — ver §4.

### 2.3 Provider Pattern (camada de dados)
- Contrato: `IConversationParticipantsProvider` —
  `src/providers/data/contracts/conversationParticipants.ts` (commit `e8bed687`).
- Mock: `src/providers/data/impl/mock/conversationParticipants.ts` delega para
  `src/mocks/api/conversationParticipants.ts` (commit `79f8f85f`).
- Supabase: `src/providers/data/impl/supabase/conversationParticipants.ts`
  (commit `00512150`).
- Hook de acesso: `useConversationParticipantsProvider()` (barrel `@/providers/data`).

### 2.4 Hooks
- `useConversationCollaborators` — mutações add/remove + gates de permissão
  (`canManage`, `canRemove`) espelhando `cp_insert`/`cp_delete` — commit `3b0d2909`.
- `useConversationDetail` — resolve os colaboradores com o `ISeller` de cada um
  (`ICollaboratorWithSeller`) — commit `71e426ad`.
- `useCollaboratorAddedListener` — card flutuante em tempo real — commit `4e77f64f`.
- `useConversationPresence` / `useConversationPresenceTracker` — "quem está vendo
  agora" — `src/features/conversations/hooks/useConversationPresence.ts`.

### 2.5 Componentes
- `AddCollaboratorDialog` — convite (busca de vendedor com filtro de elegibilidade).
- `CollaboratorRow` — linha de colaborador com dot de presença e botão remover.
- `CollaboratorAddedPrompt` — card flutuante "Você foi adicionado a uma conversa".
- `PresenceDot` — dot verde "vendo agora" compartilhado.
- Seção "Colaboradores" na ficha: `src/features/customers/components/tabs/AtendimentoTab.tsx`
  (commit `235259a9`).
- Tag "Colaborando" na lista: `src/features/conversations/components/ConversationListItem.tsx`
  (commit `5775bb64`).

---

## 3. Fluxos

| Fluxo | Onde | Observações |
|---|---|---|
| Convite manual | `AddCollaboratorDialog` → `useConversationCollaborators.addCollaborator` | Candidatos filtrados por `resolveInviteCandidates` (exclui responsável, colaboradores existentes, **o próprio usuário** e — com a flag OFF — quem não acessa a instância). |
| @menção auto-add | `useConversationNotes.createNote` → `resolveMentionParticipants` → `passesInstanceGate` | Só adiciona quem passa no mesmo portão de instância do convite manual. |
| Remoção | `useConversationCollaborators.removeCollaborator` | Staff, o responsável ou o próprio colaborador (auto-remoção). |
| Presença ao vivo | `useConversationPresence(Tracker)` + `PresenceDot` | Dot verde na linha do **responsável** e de **cada colaborador**. |
| Card + sino | `useCollaboratorAddedListener` (realtime) + trigger `notify_conversation_participant_added` (sino) | Card reage a manual **e** menção; sino só ao manual. |
| Tag "Colaborando" | `ConversationListItem` | Só quando `isCollaborator && assignedSellerId !== eu` (não marca a própria conversa). |
| Encerrar limpa | trigger `trg_clear_participants_on_close` (prod) / `clearConversationParticipantsSync` (mock) | Resolver/arquivar zera os participantes. |

---

## 4. Migrations

Todas versionadas em `supabase/migrations/` e **aplicadas em produção**
(`njizaasajkdqptlxddqn`). As 4 primeiras foram aplicadas em 2026-07-05 antes da
revisão; as 2 follow-up depois da revisão/decisões; a 7ª é um **fix pós-go-live**
(feature já em prod na v0.134.0 — ver §5.4).

| Arquivo | O que faz |
|---|---|
| `20260615130200_whatsapp_multi_participants.sql` | Cria `conversation_participants` (pré-feature, multi-instância). |
| `20260704120000_conversation_participants_lifecycle.sql` | Coluna `source` + separa `cp_write` em `cp_insert`/`cp_delete` (permite auto-remoção) + trigger `trg_clear_participants_on_close`. |
| `20260704120100_conversation_participants_notify.sql` | Trigger `notify_conversation_participant_added` (sino só para `source='manual'`). |
| `20260704120200_conversation_collaborators_inbox_visibility.sql` | `count_conversations` e `search_conversations` ganham o braço EXISTS de colaborador em "Minhas conversas" + coluna `is_collaborator`. |
| `20260705090000_list_conversations_rpc.sql` | RPC `list_conversations` (lista rápida do Inbox ciente de colaborador; `.or()` do PostgREST não expressa o EXISTS). |
| **`20260705170000_conversation_collaborators_followups.sql`** | **(follow-up da revisão)** (a) publica `conversation_participants` no `supabase_realtime`; (b) trigger `set_conversation_participant_added_by` preenche `added_by`; (c) guarda de auto-adição no `notify`; (d) `search_conversation_messages` ganha braço de colaborador + `is_collaborator`. |
| **`20260705180000_cp_select_co_participants.sql`** | **(decisão do dono)** `cp_select` ganha braço `is_conversation_participant(conversation_id)` — colaborador vê os co-participantes. |
| **`20260705190000_waar_select_same_store.sql`** | **(fix pós-go-live)** Divide `waar_staff_all` de `whatsapp_account_access_rules` em `waar_select` (SELECT same-store) + `waar_write` (escrita staff-only). Sem isso, o responsável não-staff lia `[]` das regras e o dialog zerava os candidatos. Ver §5.4. |

---

## 5. Revisão de código multi-agente

**Metodologia:** 89 agentes — 5 revisores por dimensão (migrations/RLS,
paridade de provider, frontend/UX, auditoria de cache congelado,
conformidade com a spec) sobre o diff completo da branch, seguidos de
**verificação adversarial** (3 lentes: correção, reprodução, impacto) por
achado. **28 achados brutos → 16 únicos confirmados; nenhum crítico**; as áreas
congeladas do atendimento (assinatura de mídia em lote #137, cache de mensagens,
canais realtime, RPCs gated-once do Turnstile) ficaram intactas.

### 5.1 Importantes (corrigidos)

| # | Defeito | Correção | Commit |
|---|---|---|---|
| 1 | Card flutuante nunca dispara em prod: `conversation_participants` não estava na publication `supabase_realtime`. | `alter publication ... add table` (idempotente). | `aa53d2cb`/`23125596` (migration `...170000` a) |
| 2 | `added_by` sempre NULL (client não envia) → sino/card sempre "Um atendente". | Trigger `BEFORE INSERT` preenche `added_by = current_seller_id()`. | migration `...170000` b |
| 3 | Busca por conteúdo de mensagem excluía conversas em que o vendedor só colabora. | `search_conversation_messages` recriada com braço de colaborador + `is_collaborator`. | migration `...170000` d |
| 4 | Listener realtime sem gate de fonte → em modo mock o app inteiro quebrava. | `if (!IS_SUPABASE) return;` em `useCollaboratorAddedListener`, como os hooks irmãos. | `4831d33d` |
| 5 | @menção não aplicava o portão de instância → "colaborador fantasma". | `passesInstanceGate` extraído e aplicado em `useConversationNotes`. | `45273f18` + `caca3cd9` |
| 6 | Dot de presença ausente na linha do **responsável** (spec §5). | `AssigneeChip` ganhou prop `viewing` + `PresenceDot` compartilhado. | `d013a82a` |

### 5.2 Menores (corrigidos)

| Defeito | Correção | Commit |
|---|---|---|
| Candidatos incluíam o próprio usuário (auto-convite/auto-sino). | `resolveInviteCandidates` exclui `currentSellerId`. | `45273f18` |
| Tag "Colaborando" aparecia na própria conversa após transferência. | Guarda `assignedSellerId !== eu` no `ConversationListItem`. | `d013a82a` |
| Mock nunca populava `isCollaborator` → tag invisível no demo. | `stampIsCollaborator` em `list`/`searchMessages`. | `fccd7302` |
| Mock não limpava participantes em `archive()`/`update()` terminal. | Espelha `trg_clear_participants_on_close` no mock. | `fccd7302` |
| @menção deixava a ficha stale (contador de colaboradores). | Invalida `["conversation-detail", id]` após o auto-add. | `caca3cd9` |
| Dialog sem estado de erro → mensagem enganosa de acesso em falha de rede. | Ramo de erro no `CommandEmpty`. | `d013a82a` |
| Rejeição não tratada no convite → ruído no Sentry. | `catch` em `handleSelect` (toast já sai no `onError`). | `d013a82a` |
| Corrida no canal de presença (dot morto ao reabrir rápido). | Sufixo monotônico `bootId:++channelSeq` no wire-topic, como `realtime.ts`. | `4831d33d` |
| Trigger de notificação sem guarda de auto-adição. | `new.added_by = new.seller_id` → early return no `notify`. | migration `...170000` c |
| Dialog sem `DialogDescription` (a11y). | Descrição adicionada. | `7967ee6d` |

### 5.3 Diagnóstico do "Nenhum vendedor disponível para convidar"

**Não era bug.** Em prod a flag `participantCrossInstance` está **desligada** e a
Matriz Oficial **não tem regras de acesso por número**, então a regra de
elegibilidade corretamente não encontra candidatos. O dialog agora **explica o
motivo** e aponta para Configurações → WhatsApp (commit `7967ee6d`). Para
liberar amplamente: ligar aquele toggle **ou** conceder acesso por número.

### 5.4 Fix pós-go-live: candidatos vazios para responsável não-staff (v0.134.0, 2026-07-05)

**Sintoma parecido com o §5.3, causa diferente.** Já em produção (v0.134.0), o
dialog mostrava *"Nenhum vendedor com acesso a este número está disponível para
convidar"* numa conversa cujo **responsável não é staff** (ex.: Tiago), apesar de
existirem candidatos válidos.

**Causa raiz:** o `AddCollaboratorDialog` resolve os candidatos **no cliente**,
lendo 3 tabelas — `sellers` (same-store ✅), `stores.settings` (same-store ✅,
`participantCrossInstance=false`) e **`whatsapp_account_access_rules`**. Essa
última tinha uma única policy RLS **`waar_staff_all` (`ALL`, `is_staff()`)** →
**só staff lia as regras**. O responsável não-staff — que *pode* convidar via
`cp_insert`/`canManageCollaborators` — lia `[]`, então `passesInstanceGate` →
`resolveAccessRecipients([], …)` devolvia conjunto vazio e **filtrava todos** os
candidatos. O gate falhava "fechado".

**Fix:** migration `20260705190000_waar_select_same_store.sql` divide a policy —
`waar_select` (SELECT para autenticado da mesma loja; regras de acesso são config
interna de roteamento, mesma sensibilidade da lista de vendedores já legível
same-store) + `waar_write` (INSERT/UPDATE/DELETE staff-only, inalterado). **Zero
frontend** → vale em prod sem redeploy (basta recarregar a página, pois o React
Query cacheia a lista por 5 min).

**Verificação (simulação RLS real):** com `set local role authenticated` + claims
de vendedor não-staff da loja → `is_staff=false`, `store` correta e **8 regras
visíveis** da instância (antes: 0). Dado de prod: a instância "Vendas" tem 8
regras `seller` (uma por vendedor ativo), então a lista fica cheia (todos menos o
responsável e o usuário logado).

**Lição:** reimplementar um gate de acesso **no cliente** lendo N tabelas RLS é
frágil — se **uma** delas é staff-only, o gate falha fechado para não-staff.
Commit `faccca7c` (PR #241).

---

## 6. Decisões do dono (2026-07-05)

| Decisão | Resposta | Implementação |
|---|---|---|
| Colaborador vê os **outros** colaboradores? | **Sim** | Migration `...180000` (`cp_select` + `is_conversation_participant`). |
| Notificação **combinada** na @menção ("mencionou e adicionou")? | **Não** | Mantido: sino "mencionou você" + card realtime "você foi adicionado". |
| Trilha de **auditoria** de add/remove? | **Sim** | `useConversationCollaborators` grava `conversation.participant_add`/`participant_remove` em `audit_logs` (commit `9caa2681`). Sem migration — bloqueador de 403 resolvido a montante pelo PR #235 (`audits.create` usa `return=minimal`). |

---

## 7. Paridade mock ↔ supabase

O modo demo (mock) espelha o comportamento de produção:
- Inclusão em "Minhas conversas" via `sellerCollaboratesOnSync` +
  `stampIsCollaborator` (tag "Colaborando").
- Limpeza em close/archive/update terminal (`clearConversationParticipantsSync`).
- `added_by` preenchido com o vendedor mock atual.
- Notificação in-app só no caminho manual.

O gate de instância na @menção e a exclusão do próprio usuário vivem em engines
**puros e testados** (`src/features/conversations/engine/collaboratorCandidates.ts`,
`.../mentions.ts`), então valem igual nas duas fontes.

---

## 8. Validação e gates

- **Testes:** 1601 Vitest verdes (14 novos na rodada de correções).
- **Build:** `bun run build` ok; sem novos erros de `tsc` nos arquivos tocados.
- **Migrations:** 7 aplicadas e verificadas em prod (2 follow-up + 1 fix
  pós-go-live #241, §5.4).
- **PR #239:** MERGEADO na `main` (merge commit `9cd34695`) → release
  **v0.134.0 Ensemble** (PR #240). Fix pós-go-live no **PR #241**.

**Pendências (com o dono):**
1. **Smoke** dos fluxos (convite, remoção, @menção, card, sino com nome real,
   dot de presença no responsável, lista completa de colaboradores, tag
   "Colaborando", busca por mensagem achando colaborações). Incluir o fix §5.4:
   como responsável **não-staff**, abrir "Adicionar colaborador" e confirmar que
   a lista de vendedores aparece (recarregar a página primeiro).

---

## 9. Referências rápidas

**Migrations:** `20260704120000`, `...120100`, `...120200`, `20260705090000`,
`20260705170000`, `20260705180000`, `20260705190000` (+ base `20260615130200`).

**Commits da feature (originais):** `4635a5cd` (split RLS), `f37da330` (notify),
`6fb7d2c7` (Inbox), `d97c7386`/`e8bed687`/`79f8f85f`/`00512150` (tipos+contrato+
providers), `3b0d2909` (hook), `71e426ad` (detail), `6b378f2f` (menção),
`4e77f64f`/`528325d1` (card realtime), `2b87bdd9`/`235259a9`/`5775bb64` (UI),
`6a6c3ef7` (RPC `list_conversations`).

**Commits da revisão/correções:** `7967ee6d`, `45273f18`, `caca3cd9`,
`4831d33d`, `fccd7302`, `d013a82a`, `aa53d2cb`, `23125596`, `9caa2681`.

**Fix pós-go-live (§5.4):** `faccca7c` (PR #241).

**Arquivos-chave:** ver §2. **Regressão de RLS:** `supabase/tests/rls-regression.sql`.
