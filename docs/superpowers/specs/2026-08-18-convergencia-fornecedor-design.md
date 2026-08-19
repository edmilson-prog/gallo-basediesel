# Convergência da entidade Fornecedor — Tally (PRD-216) × tela de Fornecedores

**Data:** 2026-08-18
**Branch:** `claude/financeiro-fornecedor-convergencia` (nasce de `origin/main`)
**Substitui:** PR #524, convertido em rascunho
**Spec anterior:** `docs/superpowers/specs/2026-08-17-financeiro-fornecedores-design.md` — continua válido no que descreve a TELA; este documento corrige a camada de dados

---

## Por que este documento existe

O PR #524 construiu fornecedor como entidade nova, com tabela, tipo, contrato e provider próprios. Enquanto ele era construído, o PRD-216 (Tally) **fez a mesma coisa** e chegou primeiro: os quatro PRs foram mergeados e as migrations aplicadas em produção em 17/08 às 23:45.

A colisão só apareceu ao tentar aplicar a migration. Não é uma colisão de tabela — é a pilha inteira, nos mesmos caminhos de arquivo:

| | Tally (na `main`, em produção) | PR #524 |
|---|---|---|
| Tabela | `public.suppliers` — 16 colunas | `public.suppliers` — 21 colunas |
| Tipo | `src/shared/types/supplier.ts` → `ISupplier` | `src/shared/types/suppliers.ts` → `ISupplier` |
| Contrato | `contracts/suppliers.ts` — 5 métodos | `contracts/suppliers.ts` — 7 métodos |
| Hook | `useSuppliersProvider` | `useSuppliersProvider` |
| Impls | `impl/{mock,supabase}/suppliers.ts` | mesmos caminhos |
| Migration | `20260817120000_fiscal_notes_schema.sql` | mesmo número de versão |

As duas implementações são **complementares**, não contraditórias. A do Tally é orientada a importação: `findByCnpj` é a chave que decide entre vincular a nota a um cadastro existente ou criar um do bloco `<emit>` do XML. A do #524 é orientada a gestão: busca, paginação, `stats`/`statsMany`, arquivar.

---

## O que a tabela do Tally garante, e que não vamos quebrar

A coluna `cnpj` é `not null`, e há um índice único em `(store_id, cnpj)`. O comentário da tabela diz, com todas as letras, que o vínculo da nota é pelo CNPJ.

Pendem dessa tabela, em produção: `fiscal_notes.supplier_id` (FK), duas tabelas de aprendizado com FK `on delete cascade` e políticas que a subconsultam, e a função de lançamento de nota.

**Para o Tally, fornecedor É um CNPJ.** Essa invariante fica intacta.

---

## Decisões tomadas com o dono

| Questão | Decisão |
|---|---|
| Os 124 fornecedores do catálogo não têm CNPJ | **Fila de cadastro, sem afrouxar.** A tabela continua só com quem tem CNPJ. Os nomes soltos viram uma fila de pendência **derivada** de `parts.supplier`, exibida na tela, e cada item abre o cadastro CNPJ-primeiro já preenchido |
| Onde a convergência entra | **Branch nova a partir da `main`**, com o código do #524 portado por cima já adaptado; o #524 fecha apontando para cá |

Decisões que tomei e registro aqui para serem contestadas:

| Questão | Decisão | Motivo |
|---|---|---|
| `category` vira enum? | **Não, continua texto livre** | O check de 4 valores quebraria linhas do Tally; a linha existente tem `category` nulo. O TypeScript estreita com fallback para `parts` |
| Versão | **0.183.0** | `0.181.0` já é do Tally e `0.182.1` é a atual — o bump do #524 ficou obsoleto |
| Fornecedores fica em qual grupo? | **FINANCEIRO**, como manda o ui_kit | O kit é a fonte da verdade citada no pedido. Suprimentos não ganha item duplicado. Uma linha inverte isso, se o dono preferir |

---

## A entidade unificada

Um só `ISupplier`, no arquivo que já está na `main` (`src/shared/types/supplier.ts`). O tipo do #524 (`suppliers.ts`, plural) é apagado.

**Campos que já existem e ficam como estão:** `id`, `storeId`, `cnpj`, `corporateName`, `tradeName`, `stateRegistration`, `address`, `paymentTerms`, `contactName`, `contactEmail`, `contactPhone`, `category`, `active`, `createdFromXml`, `createdAt`, `updatedAt`.

**Campos que a migration acrescenta**, todos anuláveis, todos vindos do #524:

| Coluna | Para quê |
|---|---|
| `lead_time_days` | Prazo de entrega — métrica da ficha |
| `preferred_payment_method` | Forma preferida (boleto/pix/transferência/débito automático) |
| `supplied_items` (`text[]`) | "O que compramos" |
| `registry_status`, `registry_activity` | Situação e CNAE, snapshot da Receita |
| `city`, `state` | Hoje o Tally só tem `address` como texto único |
| `notes` | Observações do cadastro |

**Renomeações no meu código, não no banco:** `name` para `corporateName`, `document` para `cnpj`, `status` (`active`/`inactive`) para `active` booleano, `source` (`manual`/`catalog_backfill`) para `createdFromXml` booleano.

---

## A fila de cadastro pendente

É o que substitui o backfill, e é a peça de desenho nova deste documento.

`parts.supplier` guarda 127 strings distintas sobre 4.005 peças; 3.311 dessas peças dizem `"Não informado"`. Sobram ~124 nomes reais que **não são fornecedores cadastrados** — são nomes soltos.

A tela mostra os dois conjuntos, separados e rotulados:

1. **Cadastrados** — linhas de `public.suppliers`, com CNPJ, que a tabela e a ficha lateral já sabem exibir.
2. **Pendentes de cadastro** — derivados em tempo de leitura de `parts.supplier`, casados contra os cadastrados pela chave normalizada (`normalizeSupplierName`, já testado no #524). Cada pendente mostra o nome e quantas peças o referenciam; clicar abre o cadastro CNPJ-primeiro com a razão social preenchida.

Um pendente **some da fila** assim que um cadastro com nome equivalente existe. É a fila de enriquecimento do kit, sem inventar 124 registros pela metade — e sem tocar na invariante do Tally.

O contador de pendentes vira o indicador de manchete da tela, no lugar de "Com CNPJ": ele é o backlog, e clicar nele filtra.

---

## Contrato unificado

Um só `ISuppliersProvider`, no caminho que já está na `main`:

- `list(params)` — do Tally, mantido
- `get(id)` — do Tally, mantido
- `findByCnpj(cnpj, storeId)` — do Tally, **preservado**: é a chave da importação de NF-e
- `create(input)` / `update(id, patch)` — do Tally, mantidos
- `archive(id)` — do #524, passa a escrever `active = false`
- `stats(id)` e `statsMany(ids)` — do #524, já com as correções da revisão final: passada única paginada sobre `parts`, `.in()` em blocos de 120, agregação por chave normalizada
- `pendingFromCatalog(storeId)` — **novo**, alimenta a fila de pendentes

---

## Migration

Um arquivo, **aditivo e reversível**, sem `create table` e sem backfill:

1. `alter table public.suppliers add column if not exists` — as nove colunas acima, todas anuláveis, nenhuma com default que force reescrita.
2. `alter policy suppliers_select` e `suppliers_write` — acrescentar o ramo `financeiro`, hoje excluído por `is_staff()`. É **alargamento**, não restrição, e é o que o spec anterior decidiu com o dono (Owner, Gestor, Financeiro). Mantém o embrulho `(select …)` que o Tally já usa.
3. Seed do recurso RBAC `supplier` em `rbac_resources` e `role_permissions` — **não colide**: o Tally usou a chave `supplies`.

Sem `drop`, sem `not null`, sem alterar índice existente. Aplicar isso em produção não pode quebrar a importação de NF-e.

> ⚠️ Continua valendo: a migration é **escrita, não aplicada**. Aplicação em produção é manual e exige OK explícito do dono.

---

## O que é portado do PR #524 e o que muda

**Portado praticamente intacto:** os dois engines (`supplierName`, `completeness`), o engine do formulário (`supplierForm`, com o corte de três vias do documento e o `isSupplierDocLookupPending`), a tela inteira (faixa de indicadores, filtros, busca, tabela redimensionável, ficha lateral, gaveta, gráfico), o `SupplierFormDialog` CNPJ-primeiro, o `useSupplierDocumentField`, o grupo FINANCEIRO na sidebar e a rota.

**Muda:** os nomes de campo do tipo em cerca de dez arquivos; `archive` grava `active`; a régua de completude perde `document` como item pendente (todo cadastrado tem CNPJ por construção) e mantém os demais; a fila de pendentes entra na tela; o provider e o contrato passam a ser os da `main`, estendidos.

**Some:** `src/shared/types/suppliers.ts`, o `seedSuppliers.ts` do mock (o mock passa a usar o do Tally, estendido) e o backfill da migration.

---

## Fora de escopo

- Afrouxar `cnpj not null` — decisão explícita do dono.
- As outras nove telas do ui_kit financeiro.
- `payable`/`receivable`, e portanto "Em aberto", "Vence esta semana" e "Prazo médio de pagamento". A regra segue: número sem origem não vira zero.
- Trocar `parts.supplier` (texto) por FK.
- Mexer na tela de Suprimentos ou na importação de NF-e.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Alargar a RLS deles expõe fornecedor fiscal ao papel Financeiro | É intencional e foi decidido com o dono; `fiscal_notes` tem políticas próprias e não é alcançada |
| A fila de pendentes casa mal e mostra como pendente quem já está cadastrado | `normalizeSupplierName` já tem 11 testes; a fila ganha teste próprio com os casos reais (`UFI`/`UFI Filters`, sufixo societário) |
| Portar dez arquivos renomeando campos introduz erro silencioso | `tsc` pega renomeação de campo; o gate é `bunx tsc --noEmit` limpo no delta, além de build e testes |
| Outro trabalho colide de novo durante esta branch | Conferir `origin/main` e `supabase_migrations.schema_migrations` antes de abrir o PR, não só no começo |
