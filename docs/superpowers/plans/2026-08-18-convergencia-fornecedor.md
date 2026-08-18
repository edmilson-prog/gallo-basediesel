# Convergência da entidade Fornecedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar a entidade Fornecedor do PRD-216 (Tally, em produção) com a tela de Fornecedores construída no PR #524, sem quebrar a invariante do Tally de que fornecedor é um CNPJ.

**Architecture:** A tabela `public.suppliers`, o tipo `ISupplier` e o `ISuppliersProvider` que já estão na `main` são a base; a migration só acrescenta colunas anuláveis e alarga duas policies. O código do #524 é portado por cima com renomeações de campo. O backfill de 124 linhas é substituído por uma **fila de pendentes derivada** de `parts.supplier`.

**Tech Stack:** React 19 + TypeScript strict, TanStack Router + Query, Tailwind v4 + shadcn/ui, Vitest, Supabase, bun.

**Spec:** `docs/superpowers/specs/2026-08-18-convergencia-fornecedor-design.md`

**Origem do código portado:** a worktree do PR #524, em
`D:/claude/gallo-basediesel/.claude/worktrees/financeiro-grupo-fornecedor-1d23ec`.
Esse código foi revisado task a task e passou por uma revisão final de branch inteira — porte com fidelidade, aplicando só as adaptações que cada task nomeia. Não reescreva o que já foi revisado.

## Global Constraints

- **A invariante do Tally é intocável:** `cnpj` continua `not null`, e o índice único `(store_id, cnpj)` continua como está. Nenhuma task afrouxa isso.
- **A migration é escrita, NÃO aplicada.** Nenhuma task chama `apply_migration` nem roda DDL por `execute_sql`. `SELECT` read-only é permitido e esperado.
- **Tokens semânticos apenas** — nunca hex, nunca `--gallo-*`. Claro e escuro têm que funcionar.
- **Todo texto de UI vem de `SUPPLIERS_STRINGS`**, em português do Brasil com acentuação correta.
- **Número sem origem não vira zero.** "Em aberto", "Vence esta semana" e "Prazo médio de pagamento" continuam fora da tela — dependem de `payable`, que não existe. Falha de carga é distinguida de lista vazia.
- TypeScript `strict: true`, sem `any`, `noUncheckedIndexedAccess` ligado.
- Features consomem dados só pelo barrel `@/providers/data`.
- Package manager **bun**. Testes **Vitest**. Conventional Commits em inglês.
- Lint: este checkout tem ~1500 erros `Delete ␍` de CRLF em arquivos que ninguém tocou — falso positivo conhecido. Cada task roda `npx eslint` sobre **todos** os caminhos que criou ou alterou, e só erros que não sejam CRLF contam.

---

### Task 1: Tipo unificado e migration aditiva

**Files:**
- Modify: `src/shared/types/supplier.ts`
- Modify: `src/shared/types/index.ts`
- Create: `supabase/migrations/20260818120000_suppliers_commercial_fields.sql`

**Interfaces:**
- Produces: `ISupplier` estendido; `ISupplierEntry`; `ISupplierStats`; `IPendingSupplier`; `SupplierPaymentMethod`.

- [ ] **Step 1: Estender o tipo**

Em `src/shared/types/supplier.ts`, acrescentar ao `ISupplier` existente — **sem remover nem renomear nada do que já está lá**:

```ts
/** Forma de pagamento preferida combinada com o fornecedor. */
export type SupplierPaymentMethod = "boleto" | "pix" | "transferencia" | "debito_automatico";
```

e, dentro de `ISupplier`, após `category`:

```ts
  /** Prazo de entrega combinado, em dias. */
  leadTimeDays?: number;
  preferredPaymentMethod?: SupplierPaymentMethod;
  /** O que se compra dele — texto livre alimentado no cadastro. */
  suppliedItems?: string[];
  /** Situação cadastral na Receita, capturada na consulta do cadastro. */
  registryStatus?: string;
  /** CNAE principal, mesma origem. */
  registryActivity?: string;
  city?: string;
  state?: string;
  notes?: string;
```

Depois, no mesmo arquivo, os três tipos derivados vindos do #524. Copie-os de `src/shared/types/suppliers.ts` da worktree de origem (blocos `ISupplierEntry` e `ISupplierStats`, incluindo os comentários que explicam por que `openAmount`, `nextDueDate` e `onTimeDeliveryRate` estão deliberadamente ausentes), e acrescente:

```ts
/**
 * Nome de fornecedor que aparece em `parts.supplier` e ainda não tem cadastro.
 * Derivado em tempo de leitura — nunca gravado. Some da fila assim que existe
 * um `ISupplier` cuja razão social normaliza para a mesma chave.
 */
export interface IPendingSupplier {
  /** A chave normalizada — identidade estável da linha na fila. */
  key: string;
  /** O nome como o catálogo o escreve, já em Title Case. */
  displayName: string;
  /** Quantas peças referenciam este nome. */
  partCount: number;
}
```

- [ ] **Step 2: Exportar no barrel**

Em `src/shared/types/index.ts`, no bloco que já exporta de `./supplier`, acrescentar `ISupplierEntry`, `ISupplierStats`, `IPendingSupplier` e `SupplierPaymentMethod`.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/20260818120000_suppliers_commercial_fields.sql`. Três partes, todas aditivas:

```sql
-- Convergência da tela de Fornecedores (ui_kit financeiro) com o fornecedor
-- do PRD-216. A tabela, o vínculo por CNPJ e o índice único são do Tally e
-- ficam como estão: aqui só entram as colunas comerciais que a tela precisa,
-- o alargamento da RLS para o papel Financeiro e o recurso RBAC.
--
-- Nada nesta migration pode quebrar a importação de NF-e: não há drop, não há
-- not null, não há alteração de índice.

------------------------------------------------------------- 1. colunas
alter table public.suppliers
  add column if not exists lead_time_days integer
    check (lead_time_days is null or lead_time_days >= 0),
  add column if not exists preferred_payment_method text
    check (preferred_payment_method is null or preferred_payment_method = any (array[
      'boleto','pix','transferencia','debito_automatico'
    ]::text[])),
  add column if not exists supplied_items text[],
  add column if not exists registry_status text,
  add column if not exists registry_activity text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists notes text;

comment on column public.suppliers.supplied_items is
  'O que se compra deste fornecedor. Anulável de propósito: um cadastro nascido
   do <emit> de um XML não tem essa informação, e inventá-la é pior que deixar
   em branco — mesma disciplina de created_from_xml.';

------------------------------------------------------------- 2. RLS
-- `is_staff()` é owner|manager e exclui `financeiro`. A tela de Fornecedores
-- foi decidida com o dono para Owner, Gestor e Financeiro, então as duas
-- policies do Tally ganham o ramo do papel. É alargamento, nunca restrição.
-- O embrulho (select …) é do Tally e se mantém: sem ele o helper roda por
-- linha, e este projeto já teve storm de statement_timeout por isso.
alter policy suppliers_select on public.suppliers
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or (select public.current_app_role()) = 'financeiro')
  );

alter policy suppliers_write on public.suppliers
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or (select public.current_app_role()) = 'financeiro')
  )
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or (select public.current_app_role()) = 'financeiro')
  );

------------------------------------------------------------- 3. RBAC
-- Chave `supplier`, no singular: `supplies` é do Tally e governa a tela de
-- notas de entrada. São recursos distintos de propósito — quem confere nota
-- não necessariamente administra cadastro de fornecedor.
insert into public.rbac_resources (key, label, "group", sort_order)
values ('supplier', 'Fornecedores', 'Financeiro', 27)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope)
values
  ('Owner',      'supplier', array['view','create','edit','delete'], 'all'),
  ('Gestor',     'supplier', array['view','create','edit'],          'store'),
  ('Financeiro', 'supplier', array['view','create','edit'],          'store')
on conflict (role_id, resource) do nothing;
```

- [ ] **Step 4: Validar contra o banco, read-only**

Confirmar que o `sort_order` 27 não colide e que a chave `supplier` não existe:

```sql
select key, "group", sort_order from public.rbac_resources
where "group" = 'Financeiro' or key in ('supplier','supplies') order by sort_order;
```

Esperado: `supplies` presente com o grupo do Tally, `supplier` ausente, e nenhum recurso do grupo `Financeiro` em 27.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types supabase/migrations/20260818120000_suppliers_commercial_fields.sql
git commit -m "feat(suppliers): extend the supplier entity with commercial fields"
```

---

### Task 2: Engines portados

**Files:**
- Create: `src/features/suppliers/engine/supplierName.ts` e `.test.ts`
- Create: `src/features/suppliers/engine/completeness.ts` e `.test.ts`
- Create: `src/features/suppliers/engine/supplierForm.ts` e `.test.ts`

**Interfaces:**
- Consumes: `ISupplier` (Task 1).
- Produces: `normalizeSupplierName`, `canonicalSupplierName`, `supplierNameMatches`, `SUPPLIER_NAME_ALIASES`, `supplierCompleteness`, `SUPPLIER_MISSING_LABELS`, `resolveSupplierDocState`, `canSaveSupplier`, `isSupplierDocLookupPending`, `supplierDocumentPatchValue`.

- [ ] **Step 1: Portar `supplierName` sem alterações**

Copiar `src/features/suppliers/engine/supplierName.ts` e seu `.test.ts` da worktree de origem, **sem mudar nada**. O módulo não depende do tipo, e é a chave de junção da fila de pendentes.

Atenção ao regex de diacríticos: ele tem que ficar na forma de escape ASCII `\u0300-\u036f`, seis caracteres. Este ambiente já corrompeu isso três vezes gravando os caracteres combinantes literais. Confira depois de copiar:

```bash
grep -c 'u0300' src/features/suppliers/engine/supplierName.ts
```
Tem que imprimir `2`.

- [ ] **Step 2: Portar `completeness` com a régua encurtada**

Copiar o módulo e seu teste, e então **remover `document` da lista de campos**: todo fornecedor cadastrado tem CNPJ por construção, então cobrá-lo seria cobrar algo impossível de faltar.

`FIELDS` passa a ser `["paymentTerms", "leadTimeDays", "contact", "suppliedItems"]`, `total` passa de 5 para 4, e `SUPPLIER_MISSING_LABELS` perde a chave `document`. `isFilled` troca `supplier.suppliedItems.length > 0` por `(supplier.suppliedItems?.length ?? 0) > 0`, porque o campo agora é opcional no tipo.

Atualizar os testes: os percentuais mudam (1 de 4 é 25%, não 20%), a lista de `missing` perde `document`, e o caso "conta um registro cru como nada preenchido" agora espera `total: 4`.

- [ ] **Step 3: Portar `supplierForm` sem alterações**

Copiar o módulo e seu teste da worktree de origem, inteiros. Ele já carrega o corte de três vias do documento (`supplierDocumentPatchValue`) e o fechamento da corrida (`isSupplierDocLookupPending`), ambos resultado de rounds de revisão — não reescreva.

- [ ] **Step 4: Rodar os testes**

```bash
bun run test -- src/features/suppliers/engine
```
Esperado: os 11 de `supplierName`, os de `completeness` ajustados, e os 23 de `supplierForm`, todos passando.

- [ ] **Step 5: Commit**

```bash
git add src/features/suppliers/engine
git commit -m "feat(suppliers): port the name, completeness and form engines"
```

---

### Task 3: Contrato e providers estendidos

**Files:**
- Modify: `src/providers/data/contracts/suppliers.ts`
- Modify: `src/providers/data/impl/supabase/suppliers.ts`
- Modify: `src/providers/data/impl/mock/suppliers.ts`
- Create: `src/providers/data/impl/supabase/suppliers.search.test.ts`
- Modify: `src/providers/data/index.ts` (se algum tipo novo precisar sair pelo barrel)

**Interfaces:**
- Consumes: `ISupplier`, `ISupplierStats`, `IPendingSupplier` (Task 1); `normalizeSupplierName`, `SUPPLIER_NAME_ALIASES` (Task 2).
- Produces: `ISuppliersProvider` com `archive`, `stats`, `statsMany`, `pendingFromCatalog`; `buildSupplierSearchOr`.

- [ ] **Step 1: Estender o contrato**

Em `src/providers/data/contracts/suppliers.ts`, acrescentar à interface — mantendo os cinco métodos do Tally intactos, `findByCnpj` inclusive:

```ts
  /** Desativa sem apagar: escreve `active = false`. Histórico nunca some. */
  archive(id: ID): Promise<ISupplier>;
  /** Métricas derivadas de um fornecedor. Custa um scan do catálogo. */
  stats(id: ID): Promise<ISupplierStats>;
  /** O mesmo para vários, numa passada só sobre `parts`. */
  statsMany(ids: ID[]): Promise<Map<ID, ISupplierStats>>;
  /** Nomes de `parts.supplier` que ainda não têm cadastro. */
  pendingFromCatalog(storeId: ID): Promise<IPendingSupplier[]>;
```

- [ ] **Step 2: Portar as colunas novas para a impl Supabase**

Em `src/providers/data/impl/supabase/suppliers.ts`, acrescentar a `SupplierRow`, a `COLUMNS`, a `rowToSupplier` e a `supplierToRow` os oito campos novos. Seguir exatamente o estilo que já está no arquivo: `?? undefined` na leitura, `?? null` na escrita, e para `supplied_items` ler `row.supplied_items ?? undefined`.

- [ ] **Step 3: Corrigir a busca `.or()` — defeito pré-existente**

O `list` atual monta `corporate_name.ilike.%${params.search}%,cnpj.ilike.%${digits}%`. Dois problemas, os mesmos que a revisão final do #524 encontrou na implementação irmã: `,`, `(` e `)` são delimitadores do `.or()` do PostgREST e não estão neutralizados, e dentro de um `.or()` composto o coringa do ilike tem que ser `*`, não `%`.

Extrair `buildSupplierSearchOr`, espelhando `buildContactSearchOr` em `src/providers/data/impl/supabase/contacts.ts` — mesma neutralização, mesmo coringa, mesma forma. Criar `suppliers.search.test.ts` cobrindo: entrada vazia, termo alfanumérico comum, termo com os três delimitadores (`"a,b(c)"`), a cláusula de CNPJ quando há dígitos, e uma asserção explícita de que nenhuma cláusula usa `%`.

Este conserto é do código do Tally, não do portado — registre no relatório que foi encontrado aqui.

- [ ] **Step 4: Portar `stats`, `statsMany` e `archive`**

Copiar da worktree de origem, de `impl/supabase/suppliers.ts`: `joinKey`, `fetchPartsBySupplierKey`, `statsFromParts`, `stats`, `statsMany`, `SUPPLIERS_IN_CHUNK_SIZE` e o `chunk` que ele usa. Esse código passou por dois rounds de revisão: a passada é paginada com `fetchLargePage`, o `.in()` vai em blocos de 120, e a agregação é por chave normalizada. **Não reescreva.**

`archive` é novo e trivial: `update(id, { active: false })`.

Adaptar só o que o tipo exige: onde o código de origem lia `supplier.name`, agora é `supplier.corporateName`.

- [ ] **Step 5: Implementar `pendingFromCatalog` (Supabase)**

Lê os nomes de `parts.supplier` da loja, aplica `canonicalSupplierName` para descartar placeholders e normalizar, agrupa por `normalizeSupplierName`, conta peças, e remove as chaves que já têm cadastro — comparando contra `corporateName` dos fornecedores da loja pela mesma chave.

Usar a mesma passada paginada de `fetchPartsBySupplierKey` em vez de uma consulta nova sem `.range()`: o catálogo tem 4.005 peças e o teto do PostgREST é 1000.

- [ ] **Step 6: Semear e estender o mock**

O mock do Tally nasce com `store: ISupplier[] = []`, porque a Fase 1 não tinha tela. Agora tem. Semear doze fornecedores espelhando o kit — copiar os nomes, categorias, condições e itens de `src/mocks/data/seedSuppliers.ts` da worktree de origem, adaptando ao tipo novo: `corporateName` no lugar de `name`, `cnpj` obrigatório (use CNPJs válidos de teste, um por fornecedor), `active: true`, `createdFromXml: false`.

Manter `__resetSuppliersMock` funcionando e passar a repovoar a semente em vez de esvaziar.

Implementar os quatro métodos novos no mock: `archive` grava `active: false`; `stats`/`statsMany` devolvem zeros com a estrutura correta (o mock não tem histórico de entrada, e inventar número é o que este slice existe para não fazer); `pendingFromCatalog` devolve uma lista pequena e fixa, para a fila ter o que mostrar em modo mock.

- [ ] **Step 7: Rodar tudo**

```bash
bun run test && bun run build && npx eslint src/providers/data
```

- [ ] **Step 8: Commit**

```bash
git add src/providers/data
git commit -m "feat(suppliers): extend the provider with stats, archive and the pending queue"
```

---

### Task 4: Grupo FINANCEIRO, rota, i18n e página mínima

**Files:**
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/shell/config/navigation.ts`
- Create: `src/routes/app.financeiro.fornecedores.tsx`
- Create: `src/features/suppliers/i18n/pt-BR.ts`
- Create: `src/features/suppliers/hooks/useSuppliersList.ts`
- Create: `src/features/suppliers/pages/SuppliersListPage.tsx`
- Create: `src/features/suppliers/index.ts`
- Create: `src/features/shell/config/navigation.financeiro.test.ts`

- [ ] **Step 1: Portar o teste de navegação, adaptado à sidebar nova**

Copiar `navigation.financeiro.test.ts` da worktree de origem e ajustar: a sidebar agora tem **Suprimentos** entre Comercial e SDR. O grupo FINANCEIRO entra **depois de Suprimentos e antes de SDR**, então o caso de posição passa a afirmar `indexOf("Financeiro") === indexOf("Suprimentos") + 1`.

Manter os outros cinco casos como estão, incluindo o que usa um `IRoleBearer` com papel `Vendedor` para exercitar `hasPermission` de verdade — esse caso nasceu de um round de revisão porque a versão original passava `null` e não conseguia falhar.

- [ ] **Step 2: Rodar e ver falhar**

```bash
bun run test -- src/features/shell/config/navigation.financeiro.test.ts
```

- [ ] **Step 3: Declarar a rota e o grupo**

`ROUTES.FINANCEIRO_FORNECEDORES = "/app/financeiro/fornecedores"`.

O grupo FINANCEIRO, entre Suprimentos e SDR, com Fornecedores mais os quatro movidos de Gestão (Fluxo de Caixa, Despesas, Comissões, DRE Gerencial) — copiar o bloco da worktree de origem, que preserva `to`, gate e comentário de cada um, e remover os quatro do grupo Gestão.

- [ ] **Step 4: Portar i18n, hook e página**

Copiar da worktree de origem. Adaptar no `useSuppliersList`: o filtro de busca passa a olhar `corporateName` e `cnpj` em vez de `name` e `document`.

No i18n, trocar a chave `kpis.withDocument` ("Com CNPJ") por `kpis.pending` ("Pendentes de cadastro") — a manchete agora é o backlog da fila, não o preenchimento do CNPJ.

- [ ] **Step 5: Rota**

Copiar o arquivo de rota da worktree de origem. Ele já traz a guarda só com `permission`, sem teto de `roles` — os dois combinam com AND e o teto tornaria inerte o grant do editor de papéis. Não embrulhar em `DashboardLayout`: a página traz o próprio shell de altura calculada.

- [ ] **Step 6: Verificar e commitar**

```bash
bun run build && bun run test && npx eslint src/features/suppliers src/features/shell/config src/routes/app.financeiro.fornecedores.tsx
```

`src/routeTree.gen.ts` é gerado pelo plugin do Vite e desta vez a mudança é real — commite junto, nunca edite à mão.

```bash
git add src/features src/routes src/routeTree.gen.ts
git commit -m "feat(suppliers): add the FINANCEIRO nav group and the suppliers route"
```

---

### Task 5: Tela — indicadores, filtros, tabela e a fila de pendentes

**Files:**
- Create: `src/features/suppliers/utils/columns.ts` e `.test.ts`
- Create: `src/features/suppliers/utils/sort.ts`
- Create: `src/features/suppliers/utils/supplierDisplay.ts`
- Create: `src/features/suppliers/hooks/useSuppliersStatsIndex.ts`
- Create: `src/features/suppliers/components/list/` — `SuppliersKpiStrip`, `SuppliersFiltersBar`, `SuppliersSearch`, `SuppliersColumnsMenu`, `SuppliersTable`, `SuppliersPendingQueue`
- Modify: `src/features/suppliers/pages/SuppliersListPage.tsx`

- [ ] **Step 1: Portar tudo o que já existe**

Copiar da worktree de origem os seis componentes, os três utilitários e o hook, **sem reescrever**. Esse conjunto passou por um round de revisão que corrigiu: as larguras de coluna alimentadas com o conjunto completo (senão uma coluna reexibida vira `"undefinedpx"`), o dropdown de colunas além do menu de clique-direito, o cabeçalho clicável para ordenar convivendo com o segmentado, e o `formatBRL` compartilhado no lugar de formatadores locais.

Adaptações mecânicas de campo: `name` para `corporateName`, `document` para `cnpj`, `status === "active"` para `active`.

- [ ] **Step 2: Trocar o KPI de CNPJ pelo de pendentes**

Em `SuppliersKpiStrip`, a segunda célula deixa de ser "Com CNPJ" e passa a ser "Pendentes de cadastro", alimentada pelo comprimento da fila. Clicar continua filtrando — agora alternando para a fila.

- [ ] **Step 3: Construir a fila**

`SuppliersPendingQueue` é o componente novo. Recebe `IPendingSupplier[]` e renderiza, na mesma densidade da tabela: o nome em Title Case, quantas peças o referenciam, e um botão "Cadastrar" que abre o formulário com a razão social preenchida (a Task 7 liga o formulário; aqui o callback é uma prop).

A fila aparece **abaixo da tabela**, sob um cabeçalho próprio que diz quantos são, e some inteira quando está vazia. Não é uma aba: os dois conjuntos são visíveis ao mesmo tempo, porque a tese da tela é justamente a distância entre eles.

- [ ] **Step 4: Montar na página**

Estado, ordenação sobre `visible`, indicadores sobre `all`, `ScrollProgressBar` na divisa, coluna da tabela com `min-w-0`, coluna do rail reservada. Copiar a montagem da worktree de origem e acrescentar a fila.

- [ ] **Step 5: Verificar e commitar**

```bash
bun run test && bun run build && npx eslint src/features/suppliers && grep -rnE "#[0-9a-fA-F]{6}|--gallo-" src/features/suppliers
```

```bash
git commit -am "feat(suppliers): add the KPI strip, table and the pending-registration queue"
```

---

### Task 6: Ficha lateral e gaveta

**Files:**
- Create: `src/features/suppliers/components/SupplierMetric.tsx`
- Create: `src/features/suppliers/components/list/SupplierRail.tsx`
- Create: `src/features/suppliers/components/detail/SupplierSheet.tsx`
- Create: `src/features/suppliers/components/detail/SupplierPurchasesChart.tsx`
- Create: `src/features/suppliers/hooks/useSupplierStats.ts`
- Modify: `src/features/suppliers/pages/SuppliersListPage.tsx`
- Modify: `src/shared/utils/format.ts` (acrescentar `formatShortDateBR`, se ainda não existir na `main`)

- [ ] **Step 1: Portar os quatro componentes e o hook**

Copiar da worktree de origem. Todos passaram por revisão; o rail e a gaveta já compartilham `SupplierMetric`, e `useSupplierStats` busca um fornecedor só em vez de disparar o lote — conserto de um round anterior.

Adaptações de campo: `name` para `corporateName`, `document` para `cnpj`.

- [ ] **Step 2: Preservar a regra da honestidade**

Confira, ao portar, que continua valendo: `formatBRL(undefined)` dando "—" enquanto os stats carregam e "R$ 0,00" só para zero medido; o bloco "Títulos em aberto" sempre no estado explícito de que o contas a pagar não existe; o gráfico não desenhado quando não há compras. Esses três são o motivo de o slice existir.

- [ ] **Step 3: Ligar na página e verificar**

```bash
bun run test && bun run build && bunx tsc --noEmit 2>&1 | grep "src/features/suppliers"
```
O último tem que não imprimir nada.

```bash
git commit -am "feat(suppliers): add the supplier rail and the full sheet"
```

---

### Task 7: Formulário CNPJ-primeiro

**Files:**
- Create: `src/features/suppliers/hooks/useSupplierDocumentField.tsx`
- Create: `src/features/suppliers/hooks/useSupplierMutations.ts`
- Create: `src/features/suppliers/components/detail/SupplierFormDialog.tsx`
- Modify: `src/features/suppliers/pages/SuppliersListPage.tsx`

- [ ] **Step 1: Portar os três**

Copiar da worktree de origem. O hook do documento fechou uma corrida entre o debounce e os efeitos, e é testado pelo engine puro da Task 2 — não reescreva.

- [ ] **Step 2: Adaptar o payload ao contrato do Tally**

`create` do Tally recebe `Omit<ISupplier, "id" | "createdAt" | "updatedAt">`, então o formulário passa a enviar também `active: true` e `createdFromXml: false`. E `cnpj` deixa de ser opcional no cadastro: `canSaveSupplier` passa a exigir `docState === "done"` para criar, porque a tabela não aceita fornecedor sem CNPJ.

Na edição isso não muda nada — o documento já está lá e o corte de três vias de `supplierDocumentPatchValue` continua governando.

Ajustar os testes do engine que cobrem `canSaveSupplier` para o modo de criação.

- [ ] **Step 3: Ligar as três entradas**

"Novo fornecedor" abre vazio; o botão de editar do rail abre no selecionado; **"Cadastrar" de um item da fila abre com a razão social preenchida e o foco no campo de CNPJ** — é o gesto central da fila.

- [ ] **Step 4: Verificar e commitar**

```bash
bun run test && bun run build && npx eslint src/features/suppliers
```

```bash
git commit -am "feat(suppliers): add the CNPJ-first form wired to the pending queue"
```

---

### Task 8: Changelog e bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Conferir a corrida de versão**

```bash
git fetch origin && git tag -l | sort -V | tail -5 && node -p "require('./package.json').version" && gh pr list --state open --json number,title --jq '.[] | "#\(.number) \(.title)"'
```

O spec prevê **0.183.0**, mas confirme: a `main` andou duas versões durante o PR #524. Se alguém já pegou 0.183.0, use a seguinte.

- [ ] **Step 2: Escrever a entrada**

Formato da casa: `## [0.183.0] — <Codinome> · 2026-08-18`, um parágrafo em negrito escrito para o dono do negócio, depois `### Added` / `### Changed`. Leia as três entradas mais recentes do `CHANGELOG.md` para pegar o registro.

Codinome novo, verificado contra `git tag -l` e contra o changelog. `Counterpart` continua livre e continua descrevendo a tese.

O parágrafo tem que dizer a verdade sobre a fila: os nomes soltos do catálogo **não viraram cadastro**; viraram uma lista de pendências que encolhe conforme o dono cadastra.

- [ ] **Step 3: Bump e verificação**

```bash
bun run test && bun run build
```

```bash
git commit -am "chore(release): v0.183.0 <Codinome>"
```

---

## Self-Review

**Cobertura do spec:**

| Requisito | Task |
|---|---|
| Tipo unificado, sem remover campo do Tally | 1 |
| Migration aditiva: colunas, RLS alargada, RBAC | 1 |
| Invariante `cnpj not null` preservada | 1 (nenhuma task a toca) |
| Engines portados, régua encurtada | 2 |
| Contrato unificado de 9 métodos, `findByCnpj` preservado | 3 |
| `stats`/`statsMany` paginados e em blocos | 3 |
| Busca `.or()` corrigida | 3 |
| Mock semeado | 3 |
| Grupo FINANCEIRO depois de Suprimentos | 4 |
| Tela portada | 5, 6 |
| Fila de pendentes | 3 (dado), 5 (tela), 7 (gesto de cadastrar) |
| Regra da honestidade preservada | 6 |
| `category` texto livre | 1 (nenhum check adicionado) |
| Changelog e bump | 8 |

**Consistência de tipos:** `ISupplier` é estendido, nunca redefinido — o arquivo da `main` continua sendo o único. `IPendingSupplier` nasce na Task 1 e é consumido na 3 (provider), 5 (fila) e 7 (cadastro). `corporateName`/`cnpj`/`active` são os nomes em todas as tasks de UI; nenhuma menciona `name`, `document` ou `status`.
