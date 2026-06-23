# Filtro "Atribuição" multi-seleção — Design

**Data:** 2026-06-23
**Branch:** `feat/assignment-filter-multiselect`
**Tipo:** Médio (frontend + provider + contrato + 1 migration aditiva de RPC)

## Problema

O filtro **Atribuição** da Inbox (`/app/atendimento`) é hoje **seleção única** (radio):
`Atribuídas a mim` · `Sem atribuição` · `Em fila` · `Todas` · (staff) lista *Por vendedor*.
O dono quer poder **marcar/combinar mais de um filtro de atribuição por vez**, e essa
capacidade de combinar **deve valer para todos os usuários, independentemente de
papel/permissões/grupo**.

## Decisão de produto (confirmada com o dono)

A **multi-seleção/combinação é universal** (todo usuário pode combinar os filtros que
já enxerga). O **conjunto de opções por papel permanece igual**: `Por vendedor` e
`Todas` seguem **staff-only** (gate `canSeeAllAssignments` inalterado), porque para um
usuário não-staff a RLS (modelo de 2 portões) não retornaria conversas atribuídas a
outro vendedor — opções vazias só confundiriam.

## Semântica

- **Combinação = OR/união:** a lista mostra conversas que casam com **qualquer** filtro
  de atribuição selecionado.
- **Tokens de atribuição:** `me`, `unassigned` (pool), `queue` (pool + SDR inativo +
  status `aguardando`), e ids de vendedor (staff).
- **"Todas" = conjunto vazio** (sem restrição de atribuição → tudo que a RLS já
  permite). Marcar "Todas" limpa os demais; marcar qualquer outro token desmarca
  "Todas". Para não-staff não há "Todas" visível, mas conjunto vazio também significa
  "tudo que posso acessar".
- **Default inicial:** `["me"]` para usuário com `sellerId`; `[]` (todas) caso contrário
  — espelha o default atual.
- **Filtro ativo (`activeCount`):** atribuição conta como ativa quando o conjunto difere
  do default.

## Componentes

### 1. Estado dos filtros — `src/features/conversations/hooks/useInboxFilters.ts`

- `AssignmentFilter` (string única) → o estado passa a carregar `assignment: string[]`
  (conjunto de tokens). Mantém compat de leitura com URLs antigas (valor único vira
  array de 1).
- **URL:** `?assignment=me,unassigned,<sellerId>` (CSV). Default `["me"]` omitido da URL
  (mantém a URL limpa). `[]` (Todas) é representado pela ausência? Não — ausência = default
  `["me"]`. Para "Todas" explícito, serializa um sentinel `all` na URL (`?assignment=all`)
  que `readState` traduz para `[]`. Assim "Todas" é distinguível do default na URL.
- `setAssignment(tokens: string[])` substitui `setAssignment(value: string)`; o setter
  normaliza (default → remove da URL; `[]` → `all`).
- `filtersToListParams`: produz `assignmentAny` (ver contrato). A **fila embute** suas
  restrições no próprio termo OR — **não** seta mais `params.status='aguardando'` global
  (hoje o `queue` sobrescreve o status global; isso some). O filtro global de Status
  (dropdown) continua sendo a única fonte de `params.status` (além do `sort='waiting'`).

### 2. UI do dropdown — `src/features/conversations/components/InboxFilters.tsx`

- `DropdownMenuRadioGroup`/`DropdownMenuRadioItem` → `DropdownMenuCheckboxItem` (mesmo
  padrão já usado no filtro **Tags**). Toggle por item.
- Itens não-staff: Mim · Sem atribuição · Em fila.
- Itens staff (gate `canSeeAllAssignments` **inalterado**): "Todas" + separador +
  rótulo "Por vendedor" + um checkbox por vendedor.
- **"Todas"** renderiza `checked` quando o conjunto está vazio; clicar limpa os demais.
  Clicar qualquer outro token desmarca "Todas".
- **Rótulo do botão (trigger):** 1 token → o nome do token (ex.: "Atribuídas a mim",
  nome do vendedor); 0 tokens → "Todas"; 2+ → "N selecionados".
- `usePreventDropdownClose`/manter o menu aberto entre toggles (checkbox items já não
  fecham o menu por padrão no shadcn — confirmar; usar `onSelect={(e)=>e.preventDefault()}`
  se necessário para não fechar a cada clique).

### 3. Contrato da camada de dados — `src/providers/data/contracts/conversations.ts`

Novo campo opcional em `IListConversationsParams`:

```ts
/** Combined assignment filter (Inbox multi-select). OR across the provided
 *  criteria; when omitted/empty, NO assignment constraint is applied. Coexists
 *  with the scalar assignedSellerId/unassigned used by other callers. */
assignmentAny?: {
  sellerIds?: ID[];   // includes "me" resolved to currentSellerId
  unassigned?: boolean; // pool (assigned_seller_id IS NULL)
  queue?: boolean;      // pool + is_sdr_active=false + status='aguardando'
};
```

Os campos escalares (`assignedSellerId`, `unassigned`, `isSdrActive`) ficam **intactos**
para os demais consumidores (ficha do cliente, dashboards, etc.). A Inbox passa a usar
`assignmentAny`.

### 4. Provider mock — `src/providers/data/impl/mock/conversations.ts`

Quando `assignmentAny` está presente com ≥1 critério, filtra em memória por OR:
`sellerIds.includes(c.assignedSellerId)` OU (`unassigned` && `c.assignedSellerId == null`)
OU (`queue` && `c.assignedSellerId == null` && `!c.isSdrActive` && `c.status=='aguardando'`).
Vazio/ausente → sem restrição.

### 5. Provider supabase — `src/providers/data/impl/supabase/conversations.ts`

- **Query de tabela:** quando `assignmentAny` tem ≥1 critério, compõe um `.or(term, term, …)`:
  - vendedores → `assigned_seller_id.in.(uuid1,uuid2)`
  - unassigned → `assigned_seller_id.is.null`
  - queue → `and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)`
  - Helper puro `buildAssignmentOrFilter(assignmentAny): string | null` (testável) gera a
    string PostgREST. Vazio → `null` (sem `.or()`).
- **Caminho de busca:** passa os novos params do RPC (ver migration). `me` é resolvido para
  o id em `filtersToListParams` (já recebe `currentSellerId`), então o provider só vê
  `sellerIds`.

### 6. Migration — RPC `search_conversations` (aditiva, retrocompatível)

Arquivo `supabase/migrations/20260623XXXXXX_search_conversations_assignment_any.sql`.

- `DROP FUNCTION` da assinatura antiga (14 args) + `CREATE` da nova como **superset**:
  mantém todos os params antigos (com seus nomes) e adiciona
  `p_assigned_seller_ids uuid[] default null` e `p_include_queue boolean default false`.
  Como todos os novos têm default e os antigos continuam existindo, **o frontend antigo
  (que chama só os params antigos) segue funcionando** → migration pode ser aplicada
  antes do deploy do frontend, sem janela de quebra.
- Predicado de atribuição vira OR retrocompatível:

```sql
and (
  -- nenhum critério de atribuição informado → sem restrição
  ( p_assigned_seller_id is null
    and (p_assigned_seller_ids is null or cardinality(p_assigned_seller_ids) = 0)
    and not p_unassigned
    and not p_include_queue )
  or (p_assigned_seller_id is not null and c.assigned_seller_id = p_assigned_seller_id)
  or (p_assigned_seller_ids is not null and c.assigned_seller_id = any (p_assigned_seller_ids))
  or (p_unassigned and c.assigned_seller_id is null)
  or (p_include_queue and c.assigned_seller_id is null
        and c.is_sdr_active = false and c.status = 'aguardando')
)
```

- `security definer`, `set search_path to ''`, gate `can_access_conversation(c.id)` e
  todos os demais filtros **inalterados**. `revoke`/`grant` reaplicados para a nova
  assinatura.
- ⚠️ Aplicada **manualmente em prod via MCP** (o workflow "DB deploy" está em no-op), com
  autorização do dono, **antes** do merge/deploy do frontend. Registrar a version igual ao
  nome do arquivo.

## Testes (TDD)

- `useInboxFilters` / `filtersToListParams`: tokens → `assignmentAny`; `queue` não seta
  status global; `["me"]` resolve `sellerIds=[currentSellerId]`; `[]`/Todas → sem
  `assignmentAny`; combinação me+unassigned+seller.
- Serialização/parse dos tokens na URL (`validateInboxSearch`/`readState`), incluindo o
  sentinel `all` e compat de valor único legado.
- `buildAssignmentOrFilter` (helper supabase): gera a string `.or` correta por combinação;
  vazio → null.
- Mock `list`: OR sobre `assignmentAny`.

## Fora de escopo / invariantes preservadas

- **Sem mudança de RLS** e **sem mudança no gate de permissão** (`canSeeAllAssignments`).
- Campos escalares do contrato preservados para outros consumidores.
- Demais filtros (Status, Canal, Instância, Tags, Período, Ordenação, Escaladas) inalterados.

## Sequência de entrega (prod)

1. Migration versionada + **aplicada manualmente em prod** (autorização do dono).
2. PR com frontend/provider/contrato/testes → **merge do dono** → deploy Vercel.
   (Ordem importa: RPC superset primeiro garante zero janela de quebra.)
