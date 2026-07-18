# Edição inline da ficha de produto (catálogo) — design

**Data:** 2026-07-18
**Branch:** `worktree-catalog-inline-edit` (worktree isolada, a partir de `origin/main`)

## Contexto

A ficha de produto (`PartDetailPage`, `/app/catalogo/$id`) foi recentemente redesenhada (PR #330) seguindo o kit de design importado de claude.ai/design (`ui_kits/catalog/`) — 3 layouts (Balcão/Painel/Ficha), faixa de KPIs, cards de Identidade/Tabelas de preço/Fiscal/Logística/Fornecedores/Aplicações/Equivalências, todos **somente-leitura**.

Hoje o botão **"Editar"** do header navega para uma rota separada (`/app/catalogo/$id/editar` → `PartEditPage`), que renderiza `PartForm`: uma lista vertical de seções, de cima a baixo. Esse formulário cobre só um subconjunto do modelo `IPart` — nome, descrição, OEM (principal + alternativos), marca, fornecedor, original, categoria/subcategoria, preço, custo, estoque, aplicações, equivalências. Os campos "enriquecimento DINTEC" que a ficha exibe (`IPart` — ver `src/shared/types/catalog.ts`) **não têm editor nenhum hoje**: GTIN, `sefazStatus`, código de fornecedor, referência, grupo, tipo, `priceTables` (tabelas por canal), dados fiscais (`IPartFiscal`: NCM/ICMS/substituição tributária/origem), dados logísticos (peso/localização/qtd. por caixa/fracionável/unidade), histórico de fornecedores (`IPartSupplier[]`) e referências cruzadas de concorrentes (`IPartCrossReference[]`).

Pedido do usuário: tornar a ficha editável **sem modal e sem navegar para outra página** — os campos devem abrir para edição no próprio lugar onde já são exibidos.

### Fora de escopo desta entrega

- **Criação de peça nova** (`PartNewPage`/`PartForm`, rota `/app/catalogo/novo`) — continua exatamente como está. Este projeto só troca o fluxo de **editar uma peça existente**.
- **Consulta ao SEFAZ do GTIN** — placeholder "Fase 2" já existente (`CATALOG_STRINGS.detail.sefaz.checkSoon`), não é implementado aqui.
- **Editar ou excluir entradas antigas de fornecedor** — histórico de compras é tratado como registro; só é possível **adicionar** uma nova entrada.
- **Editar linhas de aplicações/equivalências além do que `ApplicationsEditor`/`EquivalentsEditor` já suportam hoje** — esses editores são reaproveitados como estão, sem novos campos.
- Redesign visual adicional dos cards fora do que a edição exige.

## Objetivo desta entrega

Substituir o fluxo de edição por página separada por edição inline, campo a campo, dentro dos mesmos cards que já exibem os dados na ficha — cobrindo **todos** os campos do modelo `IPart` hoje exibidos (incluindo os campos DINTEC sem editor), com um único ciclo salvar/cancelar por peça.

## Design

### 1. Ciclo de vida da edição

`PartDetailPage` passa a possuir:

- `editing: boolean` (substitui a navegação para `/editar`).
- `draft: IPartDraft` — inicializado via `toPartDraft(part)` ao entrar em modo de edição; descartado ao cancelar.
- `errors` — mesma forma de validação usada hoje em `PartEditPage` (ver seção 6).
- `saving: boolean`.

Transições:

- **Editar** (clique no header) → `editing = true`, `draft = toPartDraft(part)`.
- **Cancelar** → `editing = false`, `draft` descartado. Nenhuma chamada ao provider.
- **Salvar alterações** → valida; se inválido, mantém `editing = true` e mostra erros nos campos correspondentes (mesmo padrão de `errors` por campo do `PartForm`/`Field`); se válido, monta o patch (seção 5), chama `partsProvider.update`, roda auditoria e reconciliação de equivalências, invalida as queries `["part", id]` e `["catalog-list"]`, `editing = false`, toast de sucesso.

Enquanto `editing = true`:
- O botão **Voltar ao catálogo** e o **`PartLayoutSwitcher`** (Balcão/Painel/Ficha) ficam desabilitados — evita perder alterações não salvas por navegação ou troca de layout. Não é implementado diálogo de confirmação de saída nesta entrega (YAGNI — a trava de UI já resolve o caso comum).
- O header troca **Editar / Duplicar / Desativar** por **Cancelar / Salvar alterações** (botão primário).

`PartStatStrip` passa a receber o `draft` (quando `editing`) em vez de só `part`, para refletir preço/margem "ao vivo" enquanto o usuário digita — sem ganhar inputs próprios; os inputs vivem nos cards abaixo.

### 2. Fluxo de props (sem Context novo)

Os 3 composers de layout (`PartLayoutCounter`, `PartLayoutPanel`, `PartLayoutSheet`) recebem, além de `part`: `editing`, `draft`, `onDraftChange` (ou setters equivalentes) e repassam para os cards que já arranjam — nenhuma mudança de grid/arranjo. Isso é decisão deliberada: **sem** Context ad hoc por feature, consistente com o padrão já usado no codebase (ex.: `WorkScheduleTab` — formulário controlado, estado no componente pai, passado explicitamente).

Cada card decide sua própria renderização:

```ts
// Esqueleto do contrato de cada card afetado
interface IPartCardEditableProps<TSlice> {
  part: IPart;              // fonte de verdade quando editing=false
  editing: boolean;
  draft: TSlice;             // slice do IPartDraft relevante para este card
  onChange: (patch: Partial<TSlice>) => void;
}
```

Quando `editing=false`, cada card renderiza exatamente como hoje, a partir de `part` — **zero mudança de comportamento em modo leitura**.

### 3. `IPartDraft` — forma dos dados

Novo tipo (arquivo sugerido: `src/features/catalog/utils/draft.ts`), cobrindo todo campo editável exibido na ficha:

```ts
export interface IPartDraft {
  // Identificação
  name: string;
  description: string;
  oemPrimary: string;
  oemAlternatives: string;
  brand: string;
  supplier: string;
  isOriginal: boolean;
  category: PartCategory | undefined;
  subcategory: string | undefined;
  gtin: string;
  reference: string;
  group: string;
  partType: string;

  // Comercial
  unitCost: number;
  priceTables: IPriceTable[];       // sempre materializado (ver seção 4)

  // Fiscal
  fiscal: {
    ncm: string;
    icmsPercent: number | undefined;
    taxSubstitution: boolean;
    origin: string;
  };

  // Logística
  weightKg: number | undefined;
  storageLocation: string;
  boxQuantity: number | undefined;
  fractionable: boolean;
  unitOfMeasure: string;

  // Estoque
  stockAvailable: number;
  stockMinimum: number;

  // Coleções (reaproveitam editores existentes / novos)
  applications: IApplicationDraft[];        // já existe (ApplicationsEditor)
  equivalentPartIds: ID[];                  // já existe (EquivalentsEditor)
  crossReferences: IPartCrossReference[];   // novo (seção 4)

  // Fornecedores — append-only (seção 4)
  newSupplierEntry: {
    name: string;
    supplierCode: string;
    invoiceNumber: string;
    invoiceDate: string;
    cost: number | undefined;
    quantity: number | undefined;
  } | null;
}

export function toPartDraft(part: IPart): IPartDraft { /* ... */ }
```

`toPartDraft` usa os mesmos fallbacks de `fromPart` (`PartForm.tsx`) para os campos que já existiam lá, e inicializa os campos novos a partir de `part.gtin ?? ""`, `part.fiscal?.ncm ?? ""`, etc. `priceTables` é sempre inicializado via `resolvePriceTables(part)` (função já existente em `utils/pricing.ts`) — se a peça não tinha tabelas explícitas, o draft já nasce com as 5 calculadas, prontas para edição.

### 4. Mecânicas por seção

**`PartIdentityCard`** — inputs para nome, descrição (textarea), OEM principal + alternativos (mesmo parsing de `parseOemCodes` já usado em `PartEditPage`), marca, fornecedor, original (switch), categoria/subcategoria (mesmos `Select` do `PartForm`, com `getSubcategoriesFor`), GTIN (texto, mesma formatação de exibição), referência, grupo, tipo. Sem novas validações de formato (GTIN continua texto livre — validação de dígito verificador fica fora de escopo).

**`PartPricingTable`** — cada uma das 5 linhas (`PRICE_CHANNELS`: Padrão/Ecommerce/Oficina/Varejo/Atacado) vira editável: um input de **markup %** e um de **preço** por linha, sincronizados (editar um recalcula o outro via `computePrice`/inverso, ambos já existentes em `utils/pricing.ts`). Ao salvar, `part.priceTables` grava as 5 entradas do draft **como estão** (materializadas) — deixam de ser recalculadas dinamicamente a cada leitura via `buildPriceTables`. Isso replica o comportamento real do DINTEC (cada tabela é um valor próprio, não uma fórmula) e é intencional mesmo para peças que hoje não têm `priceTables` explícito.

  - **Trava Owner:** quando `priceLocked` (não-Owner), toda a tabela (inputs de markup/preço) e o campo Custo ficam **desabilitados**, mesmo em modo edição — não é possível editar preço nem custo sem ser Owner. Mesma regra de hoje, só que abrangendo as 5 linhas em vez de um campo único.
  - **Espelho `unitPrice`:** ao salvar, `patch.unitPrice = priceTables.find(t => t.id === "padrao").price` — mantém `PartPriceHistory` (que lê `before.unitPrice`/`after.unitPrice` da auditoria) e o fallback de `PartStatStrip` funcionando sem alterar esse código já validado.

**`PartFiscalCard`** — NCM (texto), ICMS % (número), substituição tributária (switch), origem: `Select` com as 9 origens padrão da NF-e (`0` Nacional … `8` Nacional c/ conteúdo importado > 40%) — lista fixa em `utils/fiscalOrigins.ts`, sem chamada a serviço externo.

**`PartLogisticsCard`** — peso (número, kg), localização (texto), quantidade por caixa (número), fracionável (switch), unidade de medida (texto ou `Select` com valores comuns: UN/PC/L/KG/CX — decisão de implementação, sem impacto no modelo).

**`PartSuppliersTable`** — histórico existente permanece **somente-leitura**, mesmo em modo edição. Abaixo da tabela, um formulário de uma linha (`PartSupplierEntryForm`, novo) para preencher fornecedor/código/NF/data/custo/quantidade de uma **nova** entrada. Ao salvar, se os campos obrigatórios da nova entrada estiverem preenchidos (nome + custo + quantidade), ela é **anexada** ao array `suppliers` existente; se vazio, nada é adicionado (novo fornecedor é opcional a cada edição, não obrigatório).

**`ApplicationsSection`/`PartApplicationsCard`** — troca o conteúdo por `ApplicationsEditor` (já existe, usado hoje em `PartForm`) quando `editing=true`.

**`EquivalentsSection`/`PartEquivalentsCard`** — troca o conteúdo por `EquivalentsEditor` (já existe) quando `editing=true`.

**`PartCrossReferenceSection`** — hoje é somente leitura (lista `brand`/`code`). Ganha um novo mini-editor `PartCrossReferenceEditor` (adicionar linha marca+código / remover linha), no mesmo espírito visual do `EquivalentsEditor` — sem busca/autocomplete (são marcas de concorrentes, texto livre).

### 5. Patch e persistência

Ao salvar, o patch enviado a `partsProvider.update(part.id, patch)` cobre:

```ts
{
  name, description, oemCodes, brand, supplier, isOriginal,
  category, subcategory,
  gtin, reference, group, partType,
  unitCost,
  unitPrice,          // espelhado da tabela "Padrão" (ver seção 4)
  priceTables,        // as 5 linhas materializadas
  fiscal: { ncm, icmsPercent, taxSubstitution, origin },
  weightKg, storageLocation, boxQuantity, fractionable, unitOfMeasure,
  stockAvailable, stockMinimum,
  applications,       // via draftsToApplications (já existe)
  equivalentPartIds,
  crossReferences,
  suppliers,          // array anterior + nova entrada (se preenchida)
}
```

Se `priceLocked` (não-Owner), `unitCost`/`unitPrice`/`priceTables` são **omitidos** do patch (o card já os manteve desabilitados, mas a omissão no patch é a garantia real contra bypass client-side).

### 6. Validação

Mesmas regras de hoje (`PartEditPage.validate`): nome, OEM principal e marca obrigatórios; categoria obrigatória; preço padrão > 0. Nenhum campo novo (DINTEC) se torna obrigatório — todos continuam opcionais, coerente com o comentário já existente no modelo (`IPart`: "DINTEC enrichment — all optional/additive"). Checagem de OEM duplicado via `provider.findByOem` (excluindo a própria peça), igual a hoje.

### 7. Auditoria e reconciliação

- `part_update` sempre que salvar (before/after com `name`/`oemCodes`/`brand`, igual a hoje).
- `part_price_change` quando o preço da tabela "Padrão" mudar (mesma condição de hoje, agora derivada de `priceTables` em vez de um campo `unitPrice` isolado).
- Reconciliação bidirecional de equivalências via `useEquivalentsBidirectional().reconcile(part.id, previousIds, nextIds)` — inalterada.

### 8. Remoção da rota separada

- Remove `src/routes/app.catalogo.$id.editar.tsx` e `src/features/catalog/pages/PartEditPage.tsx`.
- `handleEdit` em `PartDetailPage` deixa de navegar — passa a setar `editing = true`.
- `PartForm`, `ApplicationsEditor`, `EquivalentsEditor` **permanecem** — continuam servindo `PartNewPage` (criação) e são reaproveitados (não duplicados) dentro dos novos cards editáveis.
- `handleDuplicate` (navega para `/app/catalogo/novo?from=id`) **não muda**.

## Testes

- **Unidade:** `toPartDraft` (mapeamento fiel part → draft, incluindo fallbacks), montagem do patch a partir do draft (função pura extraída, não misturada com o componente de página), cálculo de markup↔preço nas linhas da tabela (reaproveita `computePrice`/`marginOnPrice` já testados).
- **Componente:** cada card novo/alterado, em `editing=true`, renderiza os inputs esperados e chama `onChange` com o patch correto ao digitar — mesmo padrão dos testes já existentes de `ApplicationsEditor`/`EquivalentsEditor`.
- **Fluxo (página):** `PartDetailPage` — entrar em edição, alterar campos de mais de um card, salvar → `partsProvider.update` chamado uma única vez com o patch completo esperado, `auditLog` chamado com as ações corretas, queries invalidadas; cancelar → nenhuma chamada ao provider, draft descartado, layout switcher e Voltar reabilitados.
- Regressão: suíte completa de `src/features/catalog/**` continua verde (cards em `editing=false` devem se comportar exatamente como antes do PR #330 seguinte).
