# Busca acha conversas de outros atendentes (metadados, sem abrir) — Design

- **Data:** 2026-07-16
- **Status:** Aprovado (decisão do dono nesta data)
- **Origem:** Sequência do PR #314 (busca global). Caso real: Tiago buscou `11995218891` e não
  achou — a conversa (cliente "Smart Kz Prog", `e42e95ad`) está **em atendimento com Lucas
  Costa**. A busca global ignora filtros, mas os portões de acesso (modelo 2 portões) escondem
  de não-staff qualquer conversa atribuída a outro atendente. O dono decidiu: a busca deve
  **achar e mostrar com quem está, SEM abrir** — expõe metadados (existência + responsável +
  contato), o conteúdo das mensagens continua protegido.

## Decisões (dono, 2026-07-16)

1. Resultado de busca de não-staff passa a incluir conversas da mesma loja **atribuídas a
   qualquer atendente** (qualquer instância, qualquer status — coerente com a busca global).
2. Ao clicar num resultado que o usuário **não pode abrir**: aviso claro ("Em atendimento com
   {nome}") em vez de navegar para o thread. Nada de tela "Conversa indisponível".
3. **"Buscar nas mensagens" NÃO é ampliado** — pesquisa conteúdo, e conteúdo segue gated.
4. Guarda de papel (decisão de design, proteção extra): a visibilidade de metadados só vale
   para quem **opera ao menos uma instância** (`current_seller_accessible_account_ids()`
   não-vazio). Financeiro/SDR — que não operam número — continuam sem ver nada. Staff já vê
   tudo (inalterado).
5. (Pós review final) O card travado MOSTRA nome/telefone do contato — resolvidos pela
   própria RPC de busca (`contact_name`/`contact_phone`), não por alargamento da
   `conversation_contacts`. Sem isso o card renderizava "Lead anônimo" (as RPCs de
   enriquecimento são gated) e pareceria quebrado no uso real.

## Design

### 1. Migration — `search_conversations` (3ª redefinição, mesmo padrão drop/create)

Nova migration em `supabase/migrations/` (drop pela assinatura exata de 17 args da
`20260716210000`, create com a mesma assinatura, grants re-emitidos p/
`authenticated, postgres, service_role`, `notify pgrst, 'reload schema'`):

- **Portão novo de busca** no bloco de acesso (após o arm do pool sem instância):

  ```sql
  or (
    -- Search-visibility (metadata-only) arm: attendants can FIND same-store
    -- conversations assigned to any seller — who has it is the answer the
    -- search exists to give. Opening stays gated (is_accessible below).
    -- Restricted to users operating at least one instance so roles with no
    -- attendance surface (Financeiro/SDR) keep seeing nothing.
    c.assigned_seller_id is not null
    and exists (select 1 from acc where acc.id is not null)
  )
  ```

- **Coluna nova no RETURNS TABLE**: `is_accessible boolean` —
  `public.can_access_conversation(c.id) as is_accessible` no SELECT. Custo: 1 EXISTS por
  linha **retornada** (página ≤ 30) — não é RLS por-linha em varredura; padrão gated-once
  preservado. `can_access_conversation` tem exatamente os arms de abertura do thread
  (verificado em prod 2026-07-16), então o flag espelha fielmente "consegue abrir".

### 2. Provider + tipo

- `src/providers/data/impl/supabase/conversations.ts`: `ConversationRow` ganha
  `is_accessible?: boolean`; `rowToConversation` mapeia `isAccessible: row.is_accessible`.
  (Linhas de `list_conversations`/realtime não trazem a coluna ⇒ `undefined` ⇒ tratado como
  acessível no consumo — retrocompatível nos dois sentidos do rollout.)
- `src/shared/types/conversation.ts`: `IConversation.isAccessible?: boolean` — presente
  apenas em linhas vindas da RPC de busca (mesmo precedente do `isCollaborator`).
- Mock: linhas de busca com `isAccessible: true` (demo é operado como staff; nuance já
  documentada no spec da busca global).

### 3. UI — clique bloqueado com aviso

- `InboxPage`: no handler de seleção de conversa, se `conversation.isAccessible === false`,
  NÃO navegar; exibir toast informativo (sonner):
  `Em atendimento com {nome}` — nome resolvido via `sellersById` (já carregado durante a
  busca para todos os papéis desde o PR #314); fallback sem nome: `outro atendente`.
- String em `src/features/conversations/i18n/pt-BR.ts` (pt-BR com acentos):
  `searchLockedWith: (name: string) => \`Em atendimento com ${name}\`` + fallback
  `searchLockedFallbackName: "outro atendente"`.
- O card do resultado permanece visual normal (o `AssigneeChip` já diz com quem está).

### 4. Fora de escopo / invariantes

- `search_conversation_messages`, `list_conversations`, `count_conversations`: intocados.
- RLS de `conversations`/`messages`, `can_access_conversation`, RPCs do thread: intocados —
  a fronteira de LEITURA DE CONTEÚDO não muda; só a RPC de busca (SECURITY DEFINER) expõe
  metadados a mais, por decisão do dono.
- Cache do atendimento: intocado.

## Testes e validação

- Sem engine novo (mudança de SQL + mapeamento + guarda de clique). Gate: `bun run test` +
  `bun run build`; tsc/eslint por delta.
- Validação SQL pós-migration (com OK do dono): impersonar o portão via SQL — a conversa
  `e42e95ad` (Lucas) deve retornar na busca com `is_accessible=false` para um seller que não
  é Lucas nem colaborador.
- Smoke do dono: Tiago busca `11995218891` → resultado aparece com nome/telefone do contato
  e chip "Lucas"; clique → toast "Em atendimento com Lucas Costa"; abrir segue impossível;
  sem caixa de ações vazia no hover.

## Rollout

1. PR único com migration espelhada. Aplicar migration em prod (OK do dono) → merge (OK do
   dono) → deploy. Janela mista é segura nos dois sentidos: frontend novo + RPC antiga ⇒
   `is_accessible` undefined (tratado como acessível) e sem linhas novas; frontend antigo +
   RPC nova ⇒ linhas novas aparecem e o clique cai na tela "Conversa indisponível" existente
   (defesa em profundidade do thread segue valendo).
