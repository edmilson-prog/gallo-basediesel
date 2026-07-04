# Contador de tempo de espera na busca do Atendimento — desenho

**Data:** 2026-07-03
**Autor:** AILA Sistemas Inteligentes
**Status:** aprovado (escopo RPC-only)
**Branch:** `feat/search-rpcs-queued-at`

## Contexto

O contador de tempo de espera na fila (feature `Ledger`, PR #226, em produção) exibe, nos cards **"Em fila"** do Atendimento, há quanto tempo o cliente aguarda sem atendimento. A fonte da verdade é a coluna `conversations.queued_at`, mantida por trigger no banco e lida pelo frontend em `ConversationListItem` como `conversation.queuedAt ?? conversation.lastMessageAt`.

O caminho de **listagem padrão** da fila carrega `queued_at` corretamente (a coluna está em `COLUMNS` do provider). Porém, quando o usuário faz uma **busca por texto** no Inbox, os cards não vêm da listagem — vêm de dois RPCs `SECURITY DEFINER`:

- `search_conversations` — busca por identidade do contato (nome/telefone do cliente ou lead);
- `search_conversation_messages` — busca dedicada no texto das mensagens.

Nenhum dos dois projeta `queued_at`. Assim, durante a busca, `row.queued_at` chega `undefined`, o mapeador cai em `lastMessageAt` e o contador exibe um valor **subestimado** (reinicia a cada mensagem recebida) — exatamente a imprecisão que a feature existe para evitar. Este é o único follow-up conhecido daquele PR (documentado como fora de escopo por decisão do plano original).

## Objetivo

Fazer os dois RPCs de busca devolverem `queued_at`, restaurando a precisão do contador **também durante a busca** (por contato e por mensagem), sem alterar semântica de acesso, ordenação ou desempenho.

## Descoberta-chave: o frontend já está preparado

Em `src/providers/data/impl/supabase/conversations.ts`:

- O tipo `ConversationRow` já declara `queued_at: string | null`;
- `rowToConversation` já mapeia `queuedAt: row.queued_at ?? undefined`;
- Os **dois** caminhos de busca já reusam esse mapeador:
  - `searchConversations`: `rows.map(rowToConversation)`;
  - `searchMessages`: `rowToConversationWithMatch` faz `...rowToConversation(row)`.

Portanto, **assim que os RPCs projetarem a coluna, o contador funciona na busca sem qualquer mudança de frontend.** Hoje o valor chega `undefined` apenas porque o RPC não seleciona `queued_at`.

## Escopo

**Dentro do escopo:**
- Uma migration que redefine `search_conversations` e `search_conversation_messages` adicionando `queued_at` ao `RETURNS TABLE` e à projeção do `SELECT`.

**Fora do escopo (por decisão):**
- Qualquer mudança de frontend (nenhuma é necessária).
- Polimento cosmético do engine `waitTime.ts` (guardas de `NaN`/negativo, `waitTone` morto) — inalcançável na UI, sem impacto para o usuário.
- Os "gaps" de processo (uso indevido de `git stash` entre worktrees; ordem migration→merge) — já registrados como lições de memória; não são trabalho de código.
- `count_conversations` — retorna apenas contagem, não alimenta a renderização dos cards; nada a mudar.

## Desenho técnico

### Migration única: `supabase/migrations/20260703160000_search_rpcs_return_queued_at.sql`

Para cada um dos dois RPCs:

1. **`DROP FUNCTION IF EXISTS`** com a lista exata de tipos de argumento (16 args cada). Necessário porque acrescentar coluna ao `RETURNS TABLE` altera o tipo de retorno — o Postgres recusa `CREATE OR REPLACE` nesse caso.
2. **`CREATE FUNCTION`** reproduzindo o corpo atual **verbatim**, com duas únicas adições:
   - `queued_at timestamptz` no `RETURNS TABLE` (imediatamente após `created_at`, espelhando a ordem de `COLUMNS` no provider);
   - `c.queued_at` (em `search_conversations`) / `cc.queued_at` (em `search_conversation_messages`) na lista do `SELECT`, na mesma posição.
3. **Reemitir** `revoke all on function … from public, anon` e `grant execute on function … to authenticated` — as permissões são removidas junto com o `DROP`.

Nada mais do corpo muda: mesmo `security definer`, mesmo `set search_path to ''`, mesmo gate `can_access_conversation`, mesmos filtros, mesma ordenação e paginação.

### Assinaturas atuais a preservar (para o DROP)

- `search_conversations(text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean)`
- `search_conversation_messages(text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer)`

## Desempenho

`queued_at` é uma **coluna de passagem** da mesma linha que os RPCs já varrem — **sem novo JOIN, sem novo predicado, sem novo índice**. O custo de execução é idêntico ao atual. Isso responde ao motivo pelo qual os RPCs de busca foram deixados fora do escopo original (zona sensível de performance): aqui não há alargamento de varredura, apenas uma coluna a mais na projeção.

## Rollout

- **Sem armadilha de ordem** (ao contrário da migration-mãe): não há mudança de frontend, e a coluna nova no retorno é retrocompatível (o mapeador tolera ausência via `?? undefined`). A migration pode ser aplicada isoladamente, em qualquer ordem relativa a deploys.
- Migration **gated**: aplicar em produção via MCP `apply_migration` com o OK do dono; `queued_at` já existe em prod (backfill da migration-mãe concluído).
- Espelhar o arquivo em `supabase/migrations/` no mesmo PR (regra do projeto).

## Verificação

- Chamar `search_conversations` e `search_conversation_messages` em produção com um termo que case uma conversa **em fila** e confirmar que `queued_at` volta preenchido (não `null`) para essa linha — espelha a validação da migration-mãe.
- Conferir paridade da lista: uma busca por texto deve exibir o mesmo tempo de espera que a listagem padrão para a mesma conversa em fila.
- `bun run build` verde (mudança é SQL; não deve haver delta de frontend).

## Riscos

- **Baixo.** O único risco é uma divergência acidental do corpo ao reescrever a função no DROP+CREATE. Mitigação: copiar o corpo verbatim das migrations vigentes (`20260701130000` e `20260701140000`) e revisar o diff coluna a coluna no review.
