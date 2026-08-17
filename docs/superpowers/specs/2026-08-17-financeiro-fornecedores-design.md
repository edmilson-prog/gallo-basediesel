# Grupo FINANCEIRO na sidebar + tela de Fornecedores

**Data:** 2026-08-17
**Branch:** `claude/financeiro-grupo-fornecedor-1d23ec`
**Fonte da verdade:** projeto Claude Design "GALLO Base Diesel — Design System"
(`0dddcf0e-782d-4f2e-be6c-0a094c427bbe`), arquivos:

- `ui_kits/financeiro/index.html` (alvo — `FinApp`, as dez páginas do grupo)
- `ui_kits/financeiro/README.md` — a tese do kit, o grupo proposto e a lista
  explícita do que **não tem contraparte no schema**
- `ui_kits/financeiro/fin-shell.jsx` — `FIN_NAV` (o grupo novo na sidebar)
- `ui_kits/financeiro/fin-fornecedores.jsx` — a lista, a faixa de KPIs, a ficha lateral
- `ui_kits/financeiro/fin-fornecedor-det.jsx` — `FinNovoFornecedor` (cadastro
  CNPJ-primeiro) e `FinFornecedorDetalhe` (gaveta de ficha completa)
- `ui_kits/financeiro/fin-ui.jsx` — paleta `FIN`, primitivas (`FinStat`, `FinChip`,
  `FinCard`, `FinSeg`, `FinButton`)
- `colors_and_type.css` — fundações de cor e tipografia

**Esta é a fatia 1 de um kit de dez telas.** O dono decidiu a ordem: Fornecedores
primeiro, o resto em sequência depois. As demais telas (Contas a receber, Contas
a pagar, Previsibilidade, KPIs, Gráficos básicos e avançados) ficam **fora** deste
spec e ganham o seu quando chegar a vez.

---

## Tese do kit

O financeiro da GALLO **não existe no app**. O controle de recebimento é uma
planilha mensal (abas `JUN-25` → `AGO-26`); o repositório só tem
`src/routes/app.configuracoes.financeiro.tsx`, o papel `Financeiro` e a migration
`20260609003351_rls_slice2_financial_staff_only.sql`. O kit propõe um **grupo
próprio na sidebar** porque o financeiro hoje está espalhado dentro de Gestão,
misturado com o analítico comercial.

Para Fornecedores especificamente, a tese é: **fornecedor é a contraparte do
cliente**. O prazo médio de pagamento (31 d no kit) fica lado a lado com o prazo
médio de recebimento (34 d) — "é essa diferença que o financeiro precisa fechar".

---

## Estado do repositório (verificado, 2026-08-17)

| Pergunta | Resposta |
|---|---|
| Existe tabela `suppliers`? | **Não.** Nenhuma das 75 tabelas criadas em `supabase/migrations/` |
| Existe `payables` / `receivables`? | **Não.** As métricas financeiras do kit não têm origem |
| Existe recurso RBAC `supplier`? | **Não.** `resources.ts` tem 49 recursos; `supplier`, `payable` e `receivable` não estão entre eles |
| Onde fornecedor aparece hoje? | `parts.supplier` (texto), `parts.supplier_code` (texto), `parts.suppliers` (jsonb — histórico de entrada), `expenses.supplier` (texto) |
| Consulta de CNPJ já existe? | **Sim** — `useMinhaReceita` + `minhaReceitaMapper` + `newCustomerLookup`, usados no Novo cliente do CRM |

### Dados de produção que sustentam a tela

```
parts:     4.005 peças · 4.005 com nome de fornecedor · 127 nomes distintos
           dos quais 3.311 peças são "Não informado" → ~126 nomes reais
parts.suppliers (jsonb): 151 entradas, todas com data e custo — todas de "UFI Filters"
expenses:  120 despesas · 82 com fornecedor · 10 nomes distintos
```

**Consequência de projeto:** *Compras 12 meses* e *Últimas entradas* — que o
README do kit dá como sem contraparte — **têm origem real** em `parts.suppliers`.
São esparsas (um fornecedor só, hoje), mas verdadeiras. Só *Em aberto*, *Vence
esta semana* e *Prazo médio de pagamento* dependem de fato do `payable` que ainda
não existe.

---

## Decisões tomadas com o dono

| Questão | Decisão |
|---|---|
| Quais itens o grupo FINANCEIRO recebe agora | **Só o que existe:** Fornecedores (novo) + Fluxo de caixa, Despesas, Comissões e DRE Gerencial, movidos de Gestão. Os outros seis entram conforme forem implementados — nenhum item leva a beco (lição de `project_agenda_placeholder_action_dead_ends`) |
| Métricas que dependem de contas a pagar | **Cadastro real, métricas ausentes.** Nada de dado inventado. O que não tem origem não aparece como "R$ 0,00" — sai da tela e volta com a fatia do Contas a pagar |
| Os ~126 nomes soltos em `parts.supplier` | **Viram cadastro, com faxina** — descartando `"Não informado"`, unificando duplicatas óbvias (`UFI` / `UFI Filters`), corrigindo caixa alta e entidades HTML (`&amp;`) |
| Quem enxerga | **Owner, Gestor, Financeiro.** Mesma faixa de Despesas e Fluxo de caixa. Vendedor fora — coerente com a barreira de custo/margem já aplicada no catálogo |
| Gaveta "Ficha completa" | **Entra nesta fatia**, com as seções que têm dado real; o bloco de títulos em aberto aparece como estado explícito apontando para o Contas a pagar |
| Kit é dark puro com hex fixo (`#141011`, dourado `#E0BB4E`) | **Traduzir para tokens semânticos.** Estrutura, densidade e hierarquia fiéis; cor por `bg-background` / `text-foreground` / `severity-*`, funcionando em claro e escuro (exigência do `CLAUDE.md`) |

---

## Arquitetura

### 1. Modelo de domínio

`src/shared/types/suppliers.ts`, exportado pelo barrel `src/shared/types/index.ts`:

```ts
export type SupplierCategory = "parts" | "services" | "freight" | "financial";
export type SupplierStatus = "active" | "inactive";

export interface ISupplier {
  id: ID;
  storeId: ID;                        // multi-loja desde o modelo
  /** Razão social — o nome que o cadastro da Receita devolve. */
  name: string;
  /** Nome fantasia, quando difere da razão social. */
  tradeName?: string;
  /** CNPJ só dígitos; ausente nos semeados do catálogo. */
  document?: string;
  category: SupplierCategory;
  /** Texto livre com vocabulário sugerido: "à vista", "28 dias", "30/60/90". */
  paymentTerms?: string;
  leadTimeDays?: number;
  contactName?: string;
  contactPhone?: string;
  preferredPaymentMethod?: "boleto" | "pix" | "transferencia" | "debito_automatico";
  /** O que se compra dele — texto livre, alimentado no cadastro. */
  suppliedItems: string[];
  status: SupplierStatus;
  /** Snapshot da consulta à Receita, para não reconsultar a cada abertura. */
  registryStatus?: string;    // ATIVA, BAIXADA…
  registryActivity?: string;  // CNAE principal
  city?: string;
  state?: string;
  /** Origem do registro: cadastro manual ou backfill do catálogo. */
  source: "manual" | "catalog_backfill";
  notes?: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
```

Métricas derivadas **não** moram na entidade — são calculadas e entregues por
`stats()` (ver contrato), para que a chegada do `payable` só acrescente campos:

```ts
export interface ISupplierStats {
  supplierId: ID;
  linkedParts: number;          // peças cujo `supplier` casa com este cadastro
  purchasesLast12Months: Money; // soma das entradas em parts.suppliers
  lastEntries: ISupplierEntry[];// nota, data, custo, quantidade
  monthlyPurchases: Money[];    // 12 posições, para o gráfico da gaveta
  // Reservados para a fatia do Contas a pagar — ausentes por ora:
  // openAmount, nextDueDate, onTimeDeliveryRate
}
```

### 2. Camada de dados

- **Contrato** `src/providers/data/contracts/suppliers.ts` —
  `list(params) / get(id) / create(input) / update(id, patch) / archive(id) / stats(id)`.
  `list` devolve `IPaginatedResult<ISupplier>` (paginação obrigatória: ver
  `project_provider_list_pagination_truncation_fix`).
- **Mock** `src/mocks/api/suppliers.ts` + gerador determinístico por seed, e
  `src/providers/data/impl/mock/suppliers.ts` embrulhando-o.
- **Supabase** `src/providers/data/impl/supabase/suppliers.ts` — `create`
  store-scoped exige `storeId` explícito (`project_supabase_create_store_scope`).
- **Fiação** no barrel `@/providers/data` e em `factory.ts`. A feature **nunca**
  importa `@/mocks` (fronteira do ESLint).

`stats()` na impl Supabase é uma agregação sobre `parts` — filtro por
`supplier` normalizado, não por `id`, enquanto o vínculo for por nome.

### 3. Migration

Arquivo único `supabase/migrations/<timestamp>_suppliers.sql`, com quatro partes:

1. **`create table public.suppliers`** — colunas em `snake_case`, FK `store_id →
   stores(id)`, índice em `(store_id, status)` e índice único parcial em
   `(store_id, document)` quando `document is not null`.
2. **RLS ligada**, políticas espelhando `expenses` (staff financeiro). Ver
   `20260609003351_rls_slice2_financial_staff_only.sql`.
3. **Seed do recurso RBAC** — linha em `rbac_resources` (`key = 'supplier'`) e
   linhas em `role_permissions` para Owner, Gestor e Financeiro. **Sem isto o
   item some do menu até para o Owner** (`project_rbac_resource_needs_db_seed`).
4. **Backfill com faxina** — `insert … select distinct` sobre `parts.supplier`,
   descartando `"Não informado"`, aplicando `initcap`, decodificando `&amp;` e
   colapsando as duplicatas conhecidas. `source = 'catalog_backfill'`.

> ⚠️ A migration é **escrita, não aplicada**. Aplicação em produção é manual e
> exige OK explícito do dono (`project_migrations_apply_manual_mcp`).

### 4. Navegação

`src/features/shell/config/navigation.ts` ganha o grupo `FINANCEIRO` **entre
Comercial e SDR** (ordem do `FIN_NAV` do kit):

```
FINANCEIRO
  Fornecedores      permission: { resource: 'supplier' }   ← novo
  Fluxo de Caixa    permission: { resource: 'cashflow' }   ← movido de Gestão
  Despesas          permission: { resource: 'expense' }    ← movido de Gestão
  Comissões         roles: [Owner, Gestor, Vendedor, Financeiro]  ← movido, gate intacto
  DRE Gerencial     roles: [Owner]                          ← movido, gate intacto
```

Os quatro movidos **mantêm rota, gate e comentário** — muda só o grupo em que
aparecem. Gestão fica com o analítico comercial.

**As URLs não mudam.** `/app/gestao/despesas` continua sendo `/app/gestao/despesas`;
renomear rota quebra link salvo e é PR mecânico à parte. A rota nova é
`/app/financeiro/fornecedores` (`ROUTES.FINANCEIRO_FORNECEDORES`).

### 5. Feature

`src/features/suppliers/` com o barrel `index.ts`:

```
components/list/    SuppliersHeader, SuppliersTable, SuppliersFilters, SuppliersRail
components/detail/  SupplierSheet (gaveta), SupplierFormDialog (novo/editar)
engine/             supplierName.ts (normalização + match), completeness.ts   ← testados
hooks/              useSuppliersData, useSupplierMutations, useSupplierStats
pages/              SuppliersListPage
i18n/pt-BR.ts
```

Rota `src/routes/app.financeiro.fornecedores.tsx` com
`requireAuth` na mesma faixa do gate do menu — **só `roles` ou só `permission`**,
nunca os dois (combinam com AND e tornam o grant do editor de papéis inerte:
`project_requireauth_and_ceiling_inert`).

---

## A tela

### Tradução do kit

| Kit (`fin-fornecedores.jsx`) | Implementação |
|---|---|
| Faixa de 5 KPIs: Ativos · Compras 12m · Em aberto · Vence esta semana · Prazo médio de pagamento | **Ativos · Com CNPJ · Peças vinculadas · Compras 12 meses · Prazo médio de entrega.** Os três que dependem de `payable` saem; os que entram têm origem real |
| Chips de categoria (`Todos / Peças / Serviços / Frete / Financeiro`) | 1:1, com contagem por categoria |
| Segmented de ordenação (`Em aberto / Compras / Vencimento / Entrega no prazo`) | **`Nome / Peças / Compras / Cadastro`** — mesma primitiva, critérios que existem |
| Tabela: Fornecedor · Condição · Compras 12m · Em aberto · Vence · No prazo | **Fornecedor · Condição · Peças · Compras 12m · Cadastro · Contato.** Colunas redimensionáveis (`useResizableColumns`, chave `gallo-suppliers-column-widths`) e menu de visibilidade no clique-direito do cabeçalho |
| Célula de fornecedor com iniciais coloridas por categoria | 1:1 |
| Barra de % e cor por faixa (OTIF) | Reaproveitada para **completude do cadastro** — verde/âmbar/vermelho pelos mesmos cortes |
| Ficha lateral sticky 366px | 1:1 — identidade, chips, 4 métricas, "O que compramos", "Últimas entradas" |
| Modal Novo fornecedor CNPJ-primeiro via BrasilAPI | `useMinhaReceita` (padrão já adotado no Novo cliente), com guarda de CNPJ duplicado |
| Gaveta Ficha completa 600px | 1:1, com o bloco de títulos em aberto como estado explícito |

Sem busca no kit; entra a **busca padrão do app** (largura dinâmica, atalho `/`,
badge `kbd`, `Escape` desfoca), obrigatória em tela de lista pelo
`docs/dev/ux-guidelines.md`. Header glassmorphism e `ScrollProgressBar` na divisa
do bloco fixo, pelas mesmas regras.

### A lista é uma fila de enriquecimento

Mesma leitura que o kit do catálogo estabeleceu, e pela mesma razão: os ~126
fornecedores semeados entram **só com nome**. A coluna *Cadastro* não mostra um
vazio — mostra **o que falta** (`sem CNPJ`, `sem condição`, `sem contato`) e o
clique abre o formulário no campo que falta. O KPI *Com CNPJ* é o tamanho do
backlog, e clicar nele filtra.

### Estados vazios honestos

Três lugares dizem, com todas as letras, que a origem ainda não existe:

1. **Rail — "Últimas entradas"** quando o fornecedor não tem entrada em
   `parts.suppliers`: "Sem notas de entrada registradas."
2. **Gaveta — "Títulos em aberto"**: "O contas a pagar ainda não existe no
   sistema. Quando existir, os títulos deste fornecedor aparecem aqui."
3. **Gaveta — "Compras mês a mês"** sem histórico: o gráfico não é desenhado.

Nenhum deles inventa `R$ 0,00`.

---

## Testes

Vitest, co-localizado, no `engine/`:

- `supplierName.test.ts` — normalização (caixa alta, `&amp;`, acento, espaço
  duplo), colapso de duplicatas conhecidas, e o match peça↔fornecedor por nome
  normalizado. Casos-âncora vindos do dado real: `UFI` ≡ `UFI Filters`,
  `POTTER &amp; HOPPE INJECAO ELETRONICA LTDA` → `Potter & Hoppe Injeção
  Eletrônica Ltda`, `"Não informado"` → descartado.
- `completeness.test.ts` — quais campos contam para a completude e em que ordem
  o "o que falta" é apresentado.

Gate prático: `bun run build` + `bun run test`. `bunx tsc --noEmit` avaliado por
delta sobre os arquivos criados na branch (há baseline pré-existente).

---

## Fora de escopo (explícito)

- As outras nove telas do kit financeiro.
- `payable` / `receivable` como entidades — e portanto as três métricas que delas
  dependem.
- Trocar `parts.supplier` (texto) por `parts.supplier_id` (FK). Toca 4.005 linhas
  e o catálogo inteiro; é fatia própria, e o match por nome normalizado segura o
  vínculo até lá.
- Renomear as rotas dos quatro itens movidos de Gestão.
- Pedido de compra e nota de entrada — as duas ações da gaveta (`Novo pedido de
  compra`, `Agendar pagamentos`) ficam desabilitadas com a razão à vista.

## Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Recurso RBAC no código sem linha no banco → menu some para todos | Seed na mesma migration, e verificação por SQL antes de fechar |
| Migration escrita e não aplicada → tela 404 em produção | Registrado aqui e no PR; aplicação depende de OK do dono |
| Faxina de nomes colapsando fornecedores que são de fato distintos | Só as duplicatas evidenciadas pelo dado (`UFI`/`UFI Filters`); o resto é preservado, e a tela permite mesclar depois |
| 3.311 peças em `"Não informado"` seguem sem fornecedor | Fora de escopo; a lista de enriquecimento do catálogo é quem cobra isso |
