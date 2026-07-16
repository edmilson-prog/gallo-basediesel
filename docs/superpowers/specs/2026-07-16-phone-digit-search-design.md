# Busca por telefone/documento normalizada por dígitos (9º dígito incluso) — Design

- **Data:** 2026-07-16
- **Status:** Aprovado (brainstorming com o dono nesta data)
- **Origem:** Investigação da mensagem de +55 33 (9) 8888-4188 (16/07 15h46): o contato está
  gravado como `+553388884188` (sem o 9º dígito, formato vindo do JID do WhatsApp) e **nenhuma
  busca da plataforma o encontra quando o termo é digitado com o 9** (`98888-4188`). A busca
  também é sensível a pontuação (hífen/espaço no termo quebram o match).

## Problema

Toda busca livre que casa telefone usa comparação literal de substring (`ilike '%termo%'`)
contra a coluna bruta:

| Superfície | Onde | Sintoma |
| --- | --- | --- |
| Inbox (busca de conversas) | RPC `search_conversations` — `cu.phone ilike` / `l.phone ilike` (def. vigente `20260714100000`) | Termo com 9º dígito ou pontuação não acha |
| Tela de Clientes + diálogo "Nova conversa" | `buildCustomerSearchOr` em `src/providers/data/impl/supabase/customers.ts` (`phone/cnpj/cpf.ilike`) | Idem; CNPJ/CPF exigem pontuação idêntica à gravada |
| Tela de Leads | `src/providers/data/impl/supabase/leads.ts` (`phone.ilike`) | Idem |

O único ponto do sistema que entende o 9º dígito é o fluxo de criação de conversa
(`src/features/conversations/engine/phoneBR.ts`, PR #302) — a lógica nunca chegou à busca.
O **mock** de clientes já normaliza dígitos (pontuação), mas não trata o 9 — o supabase está
atrás do mock.

Fora de escopo (não casam telefone): `search_conversation_messages` (busca texto de mensagem)
e `count_conversations` (não recebe termo). O fluxo "Nova conversa" para número inédito
(checagem WhatsApp com fallback do 9) permanece como está.

## Decisões de escopo (dono, 2026-07-16)

1. Corrigir as **3 superfícies**: Inbox + Clientes + Leads.
2. Normalizar **CNPJ/CPF junto** com telefone (mesma mecânica, paridade com o mock).
3. Abordagem **A — colunas geradas + variantes do termo** (abaixo). Rejeitadas: B (mover
   Clientes/Leads para RPCs — reescrita invasiva da listagem PostgREST com paginação/count) e
   C (ilike intercalado client-side — falsos positivos, não indexável).

## Design

### 1. Banco — 1 migration nova, retrocompatível

**a) Colunas geradas** (`generated always as (regexp_replace(coalesce(col,''), '\D', '', 'g')) stored`):

- `customers.phone_digits`, `customers.cnpj_digits`, `customers.cpf_digits`
- `leads.phone_digits`

O `ALTER TABLE` materializa os valores das linhas existentes (poucos milhares de linhas);
o Postgres mantém as colunas em sincronia sozinho — sem trigger, sem backfill manual.
PostgREST enxerga colunas geradas como colunas normais para filtro (é exatamente o que o
`.or()` do provider precisa — PostgREST não filtra por expressão).

**b) Índices GIN pg_trgm** nos 4 `*_digits` (`extensions.gin_trgm_ops`; extensão já habilitada
pelo PRD-108) — mantém `%termo%` indexável na listagem de Clientes.

**c) RPC `search_conversations` redefinida** com parâmetro novo
`p_search_digit_variants text[] default null`:

- `DROP FUNCTION` da assinatura antiga antes do `CREATE` — mudança de assinatura criaria
  **overload**, e PostgREST não resolve overloads quando chaves são omitidas do body (armadilha
  já documentada no comentário de `buildSearchRpcParams`). Uma única função com default cobre
  frontend antigo e novo. `notify pgrst, 'reload schema'` ao final.
- Bloco de match de customers ganha (mantendo os `ilike` atuais intactos):

  ```sql
  or (p_search_digit_variants is not null and exists (
        select 1 from unnest(p_search_digit_variants) v
        where cu.phone_digits like '%' || v || '%'))
  ```

  e o bloco de leads o equivalente com `l.phone_digits`.
- Sem mudança de RLS/policies — a RPC segue `security definer` com os mesmos portões.

### 2. Engine puro — `src/shared/utils/digitSearch.ts` (+ teste co-localizado)

Novo módulo sem dependências (fica em `shared/` porque a camada de **providers** vai
consumi-lo — provider importar de `features/` violaria a fronteira; `phoneBR.ts` não muda):

- `digitsOf(term): string` — strip de não-dígitos.
- `buildDigitSearchCandidates(term): string[]` — termo em dígitos + no máximo 1 variante do
  9º dígito, deduplicado; `[]` quando o termo não tem dígitos. Regras por comprimento:

  | Dígitos do termo | Formato assumido | Variante adicionada |
  | --- | --- | --- |
  | 13 começando `55`, 5º dígito `9` | `55+DDD+9+local8` | sem o 9 (12) |
  | 12 começando `55` | `55+DDD+local8` | com 9 (13) |
  | 11 com 3º dígito `9` | `DDD+9+local8` | sem o 9 (10) |
  | 10 | `DDD+local8` | com 9 (11) |
  | 9 começando `9` | `9+local8` | sem o 9 (8) |
  | demais (inclui CNPJ 14 / CPF 11 sem shape de fone) | — | nenhuma (substring já cobre) |

  A variante só **alarga** o OR — nunca estreita; um candidato extra num termo ambíguo
  (ex.: 11 dígitos = CPF ou celular) não remove matches, no máximo adiciona.

### 3. Providers Supabase

- **`customers.ts` — `buildCustomerSearchOr`**: quando `buildDigitSearchCandidates(term)`
  retorna candidatos, acrescentar ao `.or()` `phone_digits.ilike.*c*`, `cnpj_digits.ilike.*c*`
  e `cpf_digits.ilike.*c*` por candidato (candidatos são só dígitos — sem risco com os
  delimitadores `,()` do PostgREST). Conserta a tela de Clientes e o "Nova conversa"
  (`customersProvider.list({ search })`).
- **`leads.ts`**: idem com `phone_digits.ilike.*c*`.
- **`conversations.ts` — `searchConversations`**: passar
  `p_search_digit_variants: candidates.length ? candidates : null` **no call site**, fora do
  `buildSearchRpcParams` compartilhado (senão `search_conversation_messages` receberia um
  parâmetro desconhecido e o PostgREST rejeitaria a chamada).

### 4. Paridade do mock

- `src/mocks/api/customers.ts`: trocar `normalize(phone).includes(digits)` por
  `candidates.some((c) => phoneDigits.includes(c))` (ganha o 9º dígito; CNPJ/CPF idem).
- `src/mocks/api/conversations.ts` — `matchesSearch` (linha ~90): hoje casa
  `phone.includes(needle)` literal; passa a casar também os candidatos de dígitos contra
  `digitsOf(phone)`.
- `src/mocks/api/leads.ts` (linha ~34): idem — o haystack literal ganha o casamento por
  candidatos de dígitos no phone.

### 5. Testes e validação

- TDD no engine: com/sem 9, com/sem DDI 55, pontuação variada, termo sem dígitos, termos
  curtos, CNPJ/CPF.
- Atualizar `customers.search.test.ts` para a nova expressão `.or()`.
- Gate de CI: `bun run build` + `bun run test` (tsc por delta nos arquivos novos).
- Smoke pós-migration com o caso real: buscar `98888-4188` na Inbox e em Clientes → deve
  achar o cliente `+553388884188`.

## Tratamento de erros

- Termo vazio / sem dígitos → comportamento atual inalterado (nenhum filtro de dígitos).
- RPC chamada sem o parâmetro novo (frontend antigo durante o rollout) → default `null`,
  comportamento atual.
- Falha da migration não afeta leitura existente (colunas novas são aditivas).

## Rollout (ordem obrigatória — lição registrada do projeto)

1. PR único com a migration **espelhada em `supabase/migrations/`** + código.
2. Aplicar a migration em produção via MCP **com OK explícito do dono** (colunas + índices +
   RPC retrocompatível). Frontend em produção continua funcionando inalterado.
3. Merge + deploy do frontend (Vercel).
4. Smoke do caso real (item 5 acima).

## Riscos

- **Reescrita de tabela** no `ALTER TABLE ... ADD COLUMN ... stored`: tabelas pequenas
  (customers ~3–5k linhas), executar fora de horário de pico por prudência.
- **Drop/create da RPC**: janela de milissegundos dentro da transação da migration; PostgREST
  faz reload de schema via `notify`.
- **Ruído em termos numéricos curtos** (ex.: buscar `44` casa telefones contendo `44`): já é
  o comportamento atual do `ilike` na coluna bruta — sem regressão.
