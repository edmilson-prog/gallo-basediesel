# Colaboradores por demanda na conversa (multi-atendente) — Design

**Data:** 2026-07-04 · **Branch:** `feat/conversation-collaborators` (worktree isolada) · **Status:** aprovado pelo dono (brainstorming 2026-07-04)

## Contexto e problema

Hoje uma conversa tem exatamente **um** atendente responsável (`IConversation.assignedSellerId`, `src/shared/types/conversation.ts:31`), exibido no painel do cliente como "Atendente responsável" (`AtendimentoTab.tsx:59-77`, a tela da screenshot que motivou este pedido). Não existe forma de um segundo atendente entrar numa conversa alheia para ajudar pontualmente sem assumir a conversa inteira (o que mudaria o dono via `assignSeller`/transferência).

**Achado-chave da exploração:** a fundação para isso já existe em produção, herdada do PRD "Switchboard" (multi-instância, v0.97.0) e nunca finalizada até a camada de aplicação:

- Tabela `conversation_participants` (`conversation_id`, `seller_id`, `added_by`, `added_at`) — **já aplicada em prod** (`supabase/migrations/20260615130200_whatsapp_multi_participants.sql`), RLS habilitada (`docs/database/tables/TABLE-conversation_participants.md`).
- `is_conversation_participant()` já é um dos ramos do `can_access_conversation` (`20260620120000_access_model_two_gates.sql`), então um participante já **lê** a conversa e as mensagens hoje, se a linha existir.
- `send/core.ts:186-207` (núcleo runtime-agnostic de `whatsapp-send`) já autoriza o **envio** de mensagem quando `isConversationParticipant` é true.
- Tipo `IConversationParticipant` já existe em `src/shared/types/conversation.ts:239-245`.
- Flag `IPlatformSettings.participantCrossInstance` (`platform.ts:228`) e o toggle Owner-only (`ParticipantCrossInstanceCard.tsx`) já decidem se o convite pode cruzar instâncias diferentes — default desligado.

O que falta é **camada de aplicação**: contrato de provider, UI de convite/remoção, exibição de múltiplos atendentes (hoje tudo assume 1 dono escalar) e os fluxos de notificação/presença que tornam a colaboração visível em tempo real. Esta spec cobre exatamente essa camada, sem alterar o modelo de acesso "2 portões" já validado (`docs/dev/conversation-access-model.md`): **Portão A (Atendimento)** ganha um jeito de popular o ramo "participante" que já existe; **Portão B (Carteira, `customers.seller_id`)** não é tocado.

## Decisões do dono (registro)

1. **Gatilho de entrada — ambos**: convite manual explícito (dialog) **e** @menção em nota interna também adiciona automaticamente.
2. **Permanência — híbrida**: o colaborador fica até ser removido manualmente **ou** até a conversa ser resolvida/arquivada (limpeza automática nesse momento).
3. **Permissões**: responsável da conversa ou staff **adicionam**; qualquer um dos dois **remove** qualquer colaborador; o próprio colaborador também pode **se remover** ("Sair da conversa").
4. **Notificação — card flutuante persistente** (Opção B do companion visual), reaproveitando o **mesmo padrão** do aviso de nova versão (`VersionUpdatePrompt`, `src/features/version-update/`) **+** notificação in-app padrão (sino), sem modal bloqueante.
5. **@menção automática**: menciona → adiciona na hora, **sem** pedido de confirmação — mas só quando quem escreve a nota é o responsável ou staff (evita que um colaborador comum conceda acesso a terceiros só citando o nome).
6. **Presença ao vivo — incluída nesta entrega** (indicador de "quem está vendo esta conversa agora").
7. **UI no painel do cliente — Opção C**: seção própria "Colaboradores (N)" na `AtendimentoTab`, com lista expandida e ação de remover por pessoa (não funde com a linha "Atendente responsável").
8. **Visibilidade no Inbox**: conversas onde o vendedor é colaborador **aparecem em "Minhas conversas"**, com uma tag "Colaborando" para diferenciar de carteira própria.
9. **Execução**: implementação isolada em git worktree própria dentro do projeto (`superpowers:using-git-worktrees`), nada fora de `D:\claude\gallo-basediesel`.

## 1. Modelo de dados e RLS (deltas pequenos sobre fundação existente)

Nenhuma mudança de schema em `conversation_participants` nem em `conversations`/`customers`. Duas migrations pequenas e aditivas:

### 1.1 Desdobrar `cp_write` (self-remove)

Hoje `cp_write` é uma única policy `ALL` (`USING`/`WITH CHECK` idênticos): `is_staff() OR assigned_seller_id = current_seller_id()`. Postgres não permite diferenciar comandos dentro de uma policy `ALL`, então ela é substituída por duas policies:

```sql
drop policy if exists cp_write on public.conversation_participants;

create policy cp_insert on public.conversation_participants
  for insert to authenticated
  with check (
    is_staff()
    or exists (select 1 from conversations c
               where c.id = conversation_participants.conversation_id
                 and c.assigned_seller_id = current_seller_id())
  );

create policy cp_delete on public.conversation_participants
  for delete to authenticated
  using (
    is_staff()
    or seller_id = current_seller_id()  -- self-remove
    or exists (select 1 from conversations c
               where c.id = conversation_participants.conversation_id
                 and c.assigned_seller_id = current_seller_id())
  );
```

`cp_select` não muda. Efeito: **inserir** continua restrito a staff/responsável (decisão #3); **remover** ganha o terceiro caso (o próprio participante).

Na mesma migration, coluna nova (aditiva) para distinguir a origem do convite — evita depender de heurística para a tag "via @menção" (§3):

```sql
alter table public.conversation_participants
  add column source text not null default 'manual'
  check (source in ('manual', 'mention'));
```

### 1.2 Trigger de limpeza ao encerrar/arquivar

```sql
create or replace function public.clear_conversation_participants_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('resolved', 'archived') and old.status is distinct from new.status then
    delete from public.conversation_participants where conversation_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_clear_participants_on_close
  after update of status on public.conversations
  for each row
  execute function public.clear_conversation_participants_on_close();
```

Mesmo espírito de "resolvida/arquivada = eixo fechado" já usado para o dono (`docs/dev/attendance-close-history.md` — resolvida some, sem dono). Reabrir por novo inbound **não** restaura colaboradores — colaboração é por demanda, precisa de novo convite.

### 1.3 RPCs de listagem ganham o ramo "colaborador" (para "Minhas conversas")

`search_conversations` e `count_conversations` (`supabase/migrations/20260702180000_count_conversations_rpc.sql` e a RPC de busca irmã) já são `SECURITY DEFINER` gated-once. Ganham mais uma condição no filtro "minhas conversas" (hoje `assigned_seller_id = v_seller_id`):

```sql
or exists (
  select 1 from conversation_participants cp
  where cp.conversation_id = c.id and cp.seller_id = v_seller_id
)
```

**Importante (lição já paga neste projeto):** essa condição entra **dentro** das RPCs `SECURITY DEFINER` existentes — nunca via RLS por-linha em `conversations`, que é exatamente o padrão que já causou `statement_timeout` no passado (`docs/dev/conversation-access-model.md`, lição de performance). `conversation_participants` por conversa é pequena (poucas linhas), mas a comparação aqui é contra a **lista inteira de conversas do vendedor** — por isso o `EXISTS` correlacionado dentro da RPC, não uma policy adicional.

## 2. Camada de provider (Provider Pattern)

### Contrato novo — `IConversationParticipantsProvider`

`src/providers/data/contracts/conversationParticipants.ts`, no mesmo espírito de `rotationParticipants.ts`:

```ts
export interface IConversationParticipantsProvider {
  list(conversationId: ID): Promise<IConversationParticipant[]>;
  add(conversationId: ID, sellerId: ID, source: "manual" | "mention"): Promise<IConversationParticipant>;
  remove(conversationId: ID, sellerId: ID): Promise<void>;
}
```

`IConversationParticipant` (`conversation.ts:239-245`) ganha o campo `source: "manual" | "mention"` correspondente à coluna nova de §1.1.

- **Supabase impl**: `insert`/`delete` diretos na tabela — a enforcement é a RLS de §1.1, sem RPC nova (mesmo raciocínio de `assignSeller`/`unassign` quando a operação não tira a linha do escopo de quem a executa; aqui nunca tira, porque quem insere/remove já é staff/responsável/o próprio removido). `list` é um `select` simples sob `cp_select`.
- **Mock impl**: array in-memory no mesmo padrão dos demais providers mock; `src/mocks/api/conversations.ts` ganha um mapa `conversationId → IConversationParticipant[]` seedado vazio (colaboração é sempre por demanda, não faz sentido semear dados fictícios permanentes aqui).
- Registrado em `factory.ts`, barrel de `contracts/index.ts`, hook `useConversationParticipantsProvider()`.
- Auditoria: ambos os métodos (na implementação supabase, espelhando o padrão de `assignSeller`) chamam `recordAuditLog` com `action: "conversation.participant_add"` / `"conversation.participant_remove"`.

### Extensão em `mentions.ts`

O engine de menções (`src/features/conversations/engine/mentions.ts`) ganha uma função pura nova, ex. `resolveMentionParticipants(note, { conversation, currentSeller })`, que decide **quais** sellers mencionados devem virar participantes:

- Elegível: mencionado não é o responsável nem já é participante.
- Condição de efetivação: `currentSeller` (quem escreve a nota) é staff **ou** é o responsável da conversa (`conversation.assignedSellerId === currentSeller.id`).
- Se não elegível/condição falha: função retorna lista vazia (a menção continua funcionando como hoje — destaque + notificação de menção — só não concede acesso).

O ponto de integração (`conversationNotes.ts` / hook de criação de nota) chama essa função pura e, para cada seller retornado, chama `conversationParticipantsProvider.add(conversationId, sellerId, "mention")` e dispara **uma única** notificação combinada (§4) em vez da notificação de menção padrão.

## 3. UI — seção "Colaboradores" e convite

### Painel do cliente (`AtendimentoTab.tsx`)

Nova seção abaixo da linha "Respondendo por" (`ContextRow` label="origin", `:59-77`), título "Colaboradores (N)":

- Cada colaborador: avatar/iniciais (reaproveita o estilo de `AssigneeChip`), nome, indicador de presença ao vivo (§5), tag pequena "via @menção" quando `participant.source === "mention"`, e um "✕" de remoção.
- Visibilidade do "✕": renderiza sempre; a ação só executa (chama `remove`) se `hasPermission` local corresponder à regra #3 — staff, responsável da conversa, ou `seller.id === currentUser.sellerId` (o próprio saindo). Espelha a RLS de §1.1 no client, no estilo de `assignmentGate.ts`.
- Ação "+ Adicionar colaborador": só renderiza para staff/responsável (mesma regra). Abre `AddCollaboratorDialog`.

### `AddCollaboratorDialog`

Busca de vendedores (`Command`/`cmdk`, mesmo padrão de outros pickers do projeto, ex. `ConversationTagPicker`), filtrando candidatos por uma função pura nova `resolveInviteCandidates(sellers, { conversation, settings })`:

- Mesma loja.
- Exclui o responsável atual e quem já é colaborador.
- Se `conversation.whatsappAccountId` existe **e** `platformSettings.participantCrossInstance` está **desligado**: só entram vendedores que já têm acesso à instância dessa conversa (evita convidar alguém que viraria colaborador mas continuaria sem enxergar nada — beco sem saída de UX, decorrente da regra de acesso `is_conversation_participant AND (flag OR instância acessível OR sem número)`).
- Se a flag está ligada, ou a conversa não tem `whatsappAccountId` (pool/lead anônimo): qualquer vendedor da loja aparece.

Confirmar chama `add(conversationId, sellerId, "manual")`; sucesso fecha o dialog e a lista de colaboradores atualiza via realtime (§5) ou refetch otimista.

### i18n

Novo grupo em `CUSTOMER_STRINGS.atendimento` (pt-BR, acentos corretos): `collaborators`, `addCollaborator`, `leaveConversation`, `removeCollaborator`, `viaMention`.

## 4. Notificação

Fluxo, disparado tanto pelo convite manual quanto pela auto-adição via @menção (§2):

1. `add()` grava uma notificação in-app (tabela/pipeline de notificações já existente), tipo novo `conversation_collaborator_added`, endereçada ao `sellerId` adicionado, payload `{ conversationId, customerName, addedByName }`. Isso já alimenta o sino sem mudança na UI do sino.
2. Componente novo `CollaboratorAddedPrompt`, montado uma vez em `AppLayout.tsx` (ao lado de `<VersionUpdatePrompt />`, `:80`), escuta essa notificação chegando em tempo real (mesmo canal/realtime que já entrega notificações ao sino) e renderiza o card flutuante: título "Você foi adicionado a uma conversa", corpo "[Cliente] — adicionado por [Fulano]", ação primária "Abrir conversa" (navega para a conversa) e opção de minimizar/dispensar — **mesmo componente visual e mesma lógica de minimizar/selo** de `VersionUpdatePrompt`, adaptados para este conteúdo (não é o mesmo componente reaproveitado 1:1 no código, porque o gatilho e o conteúdo são diferentes, mas replica o padrão visual e o hook de estado minimizado/dispensado).
3. Caso de @menção com auto-adição: **uma única** notificação combinada ("Fulano te mencionou e te adicionou a esta conversa"), não duas.

## 5. Presença ao vivo por conversa

Reaproveita a infraestrutura de `useStorePresence.ts` (canal `RealtimeChannel` ref-counted por tópico, com fan-out de eventos de join/sync — `src/features/shell/hooks/useStorePresence.ts:34-179`). O manager ref-counted (`acquire`/`release`/`IPresenceEntry`) é **extraído** para `src/shared/lib/presenceChannel.ts` como utilitário genérico por tópico (pequena refatoração dirigida por esta feature — a lógica de compartilhamento de canal e re-join não muda, só deixa de estar hardcoded para `presence:store:<id>`); `useStorePresence`/`usePresenceTracker` passam a ser wrappers finos sobre esse núcleo, comportamento idêntico ao de hoje.

Hooks novos em `src/features/conversations/hooks/`:

- `useConversationPresenceTracker(conversationId)`: monta enquanto o painel/thread daquela conversa está aberto na tela; `track({ sellerId })` no tópico `presence:conversation:<id>`; `untrack()` + `release()` ao desmontar (trocar de conversa, fechar o painel, navegar para fora).
- `useConversationPresence(conversationId)`: lê o `Set<sellerId>` presente no tópico — alimenta o pontinho verde na linha "Atendente responsável" e em cada linha de "Colaboradores".

Puramente sinal de UI ("quem está vendo agora") — não interfere em `conversation_participants`/RLS ("quem pode responder"). Sem suíte automatizada (mesmo padrão já aceito para `useStorePresence`).

## 6. Visibilidade no Inbox

- Filtro "Minhas conversas" passa a incluir o `EXISTS` de §1.3 nas RPCs de busca/contagem; o provider mock (`src/mocks/api/conversations.ts`) ganha a mesma condição lógica para paridade.
- `ConversationListItem.tsx` ganha uma tag pequena "Colaborando" quando `conversation.assignedSellerId !== currentUser.sellerId` e o vendedor está em `conversation_participants` para aquele item (dado já disponível na resposta da RPC, sem round-trip extra).

## 7. Casos de borda

| Caso | Comportamento |
|---|---|
| Convite duplicado (já colaborador/responsável) | Bloqueado na busca do dialog (não aparece na lista); corrida concorrente → `insert` colide na PK composta, tratado como idempotente (ignora erro de duplicidade). |
| Conversa sem `whatsappAccountId` (pool/lead anônimo) | Convite libera qualquer vendedor da loja, sem filtro de instância — mesma regra que já existe para acesso. |
| Troca de responsável com colaboradores ativos | Colaboradores não são afetados pela transferência de dono; só a resolução/arquivamento limpa a lista (§1.2). |
| Conversa reaberta após arquivamento | Volta sem colaboradores — é intencional, precisa de novo convite. |
| Mensagem enviada por colaborador | Já funciona hoje no backend (`send/core.ts:186-207`); a bolha já exibe o autor via `IMessage.authorId`, sem mudança necessária. |
| Responsável tentando "sair" da seção Colaboradores | Não se aplica — o responsável não é uma linha de colaborador; sair da conversa como dono usa o fluxo existente de devolver à fila/transferir, fora de escopo. |
| Multiloja | Busca de convite nunca cruza lojas, igual a todo o resto do app. |

## 8. Testes (Vitest, TDD nos engines)

- `resolveInviteCandidates` (engine puro): filtragem por loja, exclusões, e a condição da flag `participantCrossInstance`/instância acessível/sem número.
- `resolveMentionParticipants` (engine puro em `mentions.ts`): decide adicionar apenas quando quem menciona é staff/responsável; não adiciona duplicata; não adiciona o próprio responsável.
- Gate de UI (espelha a RLS, estilo `assignmentGate.ts`): quem pode ver/acionar "✕" e "+ Adicionar".
- Mock provider: `list/add/remove`, incluindo idempotência de duplicata.
- RLS: 2 casos novos em `supabase/tests/rls-regression.sql` — self-delete permitido; delete de terceiro por quem não é staff/responsável, negado.
- Presença ao vivo e o card flutuante de notificação: sem suíte automatizada (dependem de Realtime ao vivo), mesmo padrão já aceito no projeto para `useStorePresence`/`VersionUpdatePrompt`.

## 9. Fora de escopo (deferido)

- Enforcement server-side de "quem pode ver o botão + no dialog" — v1 confia na RLS para a ação real (insert/delete) e na UI para a experiência; não há novo endpoint a proteger além do que a RLS de §1.1 já cobre.
- Indicador de "digitando..." por atendente ou qualquer forma de lock/coordenação para evitar duas respostas simultâneas — fora do pedido original.
- Estado intermediário de "convite pendente/aceite" — decisão #5 já descartou confirmação explícita.
- Métricas de colaboração (quantas vezes uma conversa teve colaboradores, tempo de resposta por colaborador) — candidato natural de evolução futura no painel de Atendimento.

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Ampliar as RPCs `search_conversations`/`count_conversations` sem reproduzir o custo do `EXISTS` correlacionado por linha | `EXISTS` sobre `conversation_participants` filtrado por `seller_id` (indexado por `cp_seller_idx`) e `conversation_id` (PK) — custo por linha é um index scan, não uma varredura; validar com `EXPLAIN` antes de aplicar em prod. |
| Extração do manager de presença (`presenceChannel.ts`) quebrar o comportamento hoje testado apenas manualmente de `useStorePresence` | Extração é mecânica (mover código, generalizar o parâmetro de tópico); comportamento de `useStorePresence`/`usePresenceTracker` deve permanecer bit-a-bit idêntico — validar com o mesmo smoke manual já usado para presença por loja (tela de Usuários). |
| Convite “beco sem saída” (colaborador adicionado sem acesso real por causa do flag cross-instance) | Filtro `resolveInviteCandidates` já exclui esses candidatos da busca (§3) — o problema é prevenido na UI, não corrigido depois. |
| Duas notificações para a mesma auto-adição via @menção (mention + collaborator_added) | Ponto de integração único (§2) decide e dispara uma só notificação combinada quando a menção efetiva a adição. |

## 11. Rollout

1. Implementação completa em worktree isolada `feat/conversation-collaborators` (mock + supabase + testes verdes).
2. Migrations de §1.1–§1.3 aplicadas via MCP **somente com OK do dono**, espelhadas no Git no mesmo PR.
3. PR aberto (nunca merge sem OK); smoke do dono cobrindo: convite manual, remoção (staff/responsável/self), @menção com e sem permissão, limpeza automática ao resolver/arquivar, card flutuante + sino, presença ao vivo, aparecimento em "Minhas conversas" com a tag "Colaborando".
4. Version bump MINOR + codinome no merge, conforme fluxo do projeto.
