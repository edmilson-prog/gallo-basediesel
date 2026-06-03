# Product (SKU) Detail Page Redesign — Design Doc

- **Date:** 2026-06-01
- **Topic:** Refatoração do detalhamento de produto/peça (`/app/catalogo/$id`), enriquecendo o modelo com dados do ERP DINTEC e oferecendo 3 layouts selecionáveis.
- **Status:** Approved (brainstorming) — pending spec review
- **Related:** mirrors the vehicle detail redesign (`2026-05-30-vehicle-detail-redesign-design.md`) and the shared `src/shared/detail-views/` pattern — same anatomy (switcher + persisted layout + mode-agnostic cards), part-specific identity.

---

## 1. Context & Problem

A página de detalhe da peça (`src/features/catalog/pages/PartDetailPage.tsx`) é uma **pilha vertical de 5 seções full-width rasas** (Header → Aplicações → Equivalências → Comercial → Estoque). O cliente descreveu como **"superficial e mal distribuída"**: trata todos os blocos com o mesmo peso, desperdiça espaço lateral e mostra pouca informação por tela.

Os prints do ERP **DINTEC** ("Cadastro de Produto" + "Cadastro de Valores do Produto") revelam que o detalhamento real de um SKU é muito mais rico do que o modelo atual `IPart` comporta:

- **Códigos confusos:** a DINTEC usa o **código interno do fornecedor** no campo "Código de Barras", em vez do **GTIN/EAN real** (consultável no SEFAZ). O modelo atual só tem `sku` + `oemCodes[]`.
- **Múltiplas tabelas de preço:** Padrão (markup 120%), Ecommerce (140%), Oficina (100%), Atacado (60%), Varejo (80%) — todas derivadas do mesmo custo base. O modelo atual tem **um único** `unitPrice`.
- **Atributos fiscais e logísticos** ausentes: NCM, ICMS %, Substituição Tributária, origem, peso, localização física, qtd por caixa, fraciona, unidade.
- **Multi-fornecedor + custo médio (C.M.):** a DINTEC lista vários fornecedores com NF/data/custo/qtd e calcula um custo médio ponderado. O modelo atual tem um único campo `supplier: string`.

GALLO se posiciona como o **cérebro comercial acima do ERP**. O detalhe do SKU é onde o vendedor cita preço (por canal), confere estoque/localização e decide compra. O redesign transforma a página de um registro estático raso em uma **visão operacional densa, escaneável e acionável**, mantendo a linguagem visual já estabelecida (switcher + 3 layouts) para o produto parecer coeso.

## 2. Goals / Non-Goals

**Goals**

1. **Estender o modelo `IPart`** (aditivo/opcional) com os grupos de dados da DINTEC: identidade & códigos (GTIN + status SEFAZ + código do fornecedor + referência + grupo + tipo), tabelas de preço, fiscal, logística, multi-fornecedor + custo médio.
2. **Popular os mocks** com dados realistas e determinísticos para todos os novos campos.
3. Redesenhar a página com **3 modos de layout** que o usuário alterna — **Balcão (A, default)**, **Painel (B)**, **Ficha (C)** — via switcher segmentado no header, persistido globalmente em `localStorage`.
4. Alargar para o rail estabelecido de **1600px** (header full-bleed, conteúdo centralizado).
5. **Resolver a confusão GTIN × código do fornecedor** com hierarquia visual explícita e estado de validação SEFAZ (validado / não consultado / inválido).
6. Exibir as **5 tabelas de preço** em formato comparativo escaneável (custo base único, markup como badge em escala, valores `tabular-nums`).
7. Reusar componentes/seções existentes (`ApplicationsSection`, `EquivalentsSection`, histórico de preço) e preservar todo o comportamento atual: editar, duplicar, ativar/desativar, auditoria, permissões (`usePermission`/`useCurrentRole`).

**Non-Goals**

- **Sem** reformulação do formulário de cadastro/edição (`PartForm`, `/novo`, `/editar`) — fica para uma próxima rodada. Os novos campos são exibidos no detalhe e populados pelos mocks; não há edição deles ainda.
- **Sem** provider/contract/API novos além do que `IPartsProvider` já expõe; nenhuma mudança de backend (Fase 1 mock).
- **Sem** consulta real ao SEFAZ — o `sefazStatus` é dado mock; o botão "Consultar agora" é um placeholder (toast) na superfície do detalhe.
- **Sem** mudanças na **lista** de catálogo (`/app/catalogo`), busca ou nas telas que consomem `unitPrice`/`unitCost`/`supplier` (preservados).
- **Sem** entidade `IPriceList` separada (multi-loja) — tabelas de preço ficam embutidas no `IPart` (decisão de brainstorming).

## 3. Requirements (decisões capturadas no brainstorming)

| #   | Decisão                                | Escolha                                                                                           |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Superfície a refatorar                 | **Detalhe interno (admin)** — `/app/catalogo/$id`                                                 |
| 2   | Modelagem das tabelas de preço         | **Tabelas nomeadas com markup %** (`priceTables[]`), preço derivado do custo                      |
| 3   | Grupos de dados da DINTEC a incorporar | **Todos os 4** — Identificação & códigos · Fiscal · Logística & estoque · Multi-fornecedor & C.M. |
| 4   | Layouts                                | **Manter os 3 como modos selecionáveis pelo usuário; A (Balcão) é default**                       |
| 5   | Switcher                               | **Segmented control no header** (sempre visível, 1 clique), espelhando veículo/pedidos            |
| 6   | Persistência da preferência            | **Global** (localStorage `gallo-part-detail-layout`), default `counter`                           |
| 7   | Escopo desta rodada                    | **Detalhe + modelo + mocks** (formulário fica para depois)                                        |

## 4. Data Model (`IPart` estendido)

Tudo **aditivo e opcional** — `unitCost`, `unitPrice`, `marginPercent`, `supplier` permanecem para compatibilidade com lista, busca, orçamentos, DRE (PRD-048) e demais consumidores. Convenção: `unitCost` = **custo base** (custo total da DINTEC); a tabela "Padrão" tem `price ≈ unitPrice`.

### 4.1 Novos tipos (`src/shared/types/catalog.ts`)

```ts
/** Status da validação do GTIN junto ao SEFAZ. */
export type SefazStatus = "validated" | "not_checked" | "invalid";

/** Tabela de preço nomeada — preço derivado do custo base por um markup. */
export interface IPriceTable {
  id: string; // "padrao" | "ecommerce" | "oficina" | "atacado" | "varejo"
  label: string; // "Padrão", "Ecommerce", …
  /** Markup como decimal sobre o custo (1.20 = +120%). */
  markupPercent: number;
  /** Preço final calculado = unitCost * (1 + markupPercent). */
  price: Money;
}

/** Lançamento de fornecedor associado à peça (entrada de estoque na DINTEC). */
export interface IPartSupplier {
  id: ID;
  name: string;
  /** Código interno do fornecedor para esta peça. */
  supplierCode?: string;
  /** Nota fiscal de entrada. */
  invoiceNumber?: string;
  invoiceDate?: ISO8601;
  cost: Money;
  quantity: number;
}

/** Atributos fiscais exibidos no detalhe. */
export interface IPartFiscal {
  ncm?: string;
  /** Alíquota de ICMS em % (ex.: 17). */
  icmsPercent?: number;
  /** Substituição tributária aplicável. */
  taxSubstitution?: boolean;
  /** Origem da mercadoria (texto curto, ex.: "Nacional"). */
  origin?: string;
}
```

### 4.2 Campos adicionados a `IPart`

```ts
// Identidade & códigos
gtin?: string;                 // código de barras GLOBAL (EAN-13)
sefazStatus?: SefazStatus;
sefazCheckedAt?: ISO8601;
supplierCode?: string;         // código INTERNO do fornecedor (≠ GTIN)
reference?: string;            // "Referência" (ex.: 5675517)
group?: string;                // "Grupo" (ex.: "1-FILTRO")
partType?: string;             // "Tipo"

// Preços
priceTables?: IPriceTable[];   // 5 tabelas; Padrão é a âncora

// Fiscal
fiscal?: IPartFiscal;

// Logística
weightKg?: number;
storageLocation?: string;      // localização física (ex.: "A-12")
boxQuantity?: number;          // qtd por caixa
fractionable?: boolean;        // "Fraciona"
unitOfMeasure?: string;        // ex.: "UN", "PC", "L"

// Multi-fornecedor + custo médio
suppliers?: IPartSupplier[];
averageCost?: Money;           // C.M. ponderado pelas entradas
```

JSDoc em inglês em cada campo, no estilo do arquivo atual.

## 5. Layout-mode state & persistence

Mesma mecânica leve do veículo (lazy `useState` initializer lendo `localStorage` de forma síncrona — sem FOUC).

- **`src/features/catalog/config/layout.ts`** (novo)
  - `export type PartDetailLayout = "counter" | "panel" | "sheet";`
  - `export const PART_DETAIL_LAYOUTS: PartDetailLayout[] = ["counter", "panel", "sheet"];`
  - `export const DEFAULT_PART_DETAIL_LAYOUT: PartDetailLayout = "counter";`
  - `export const PART_DETAIL_LAYOUT_STORAGE_KEY = "gallo-part-detail-layout";`
- **`src/features/catalog/hooks/usePartDetailLayout.ts`** (novo)
  - Retorna `[layout, setLayout]`. `typeof window` guard, valor inválido/ausente → `counter`. Mesmo padrão de `useVehicleDetailLayout`/`useDetailLayout`.

| Layout        | Rótulo (pt-BR) | Ícone                       | Descrição                                                                                             |
| ------------- | -------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `counter` (A) | **Balcão**     | `mdi:view-split-vertical`   | Sidebar sticky (identidade + KPIs + GTIN/SEFAZ + C.M. + localização) + workspace em abas. **Default** |
| `panel` (B)   | **Painel**     | `mdi:view-grid-outline`     | Bento grid de cards, visão panorâmica                                                                 |
| `sheet` (C)   | **Ficha**      | `mdi:file-document-outline` | Header denso sticky + abas full-width (melhor p/ tabelas largas)                                      |

## 6. Page composition

**`PartDetailPage.tsx`** (modificado) mantém root `min-h-[calc(100vh-4rem)] bg-background`. Nova estrutura:

```
<div min-h-… bg-background flex flex-col>
  <PartDetailHeader … layout onLayoutChange />        // full-bleed, rail 1600, switcher + ações
  <div mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6>
    <PartStatStrip part />                              // 5 KPIs (sempre)
    {layout === "counter" && <PartLayoutCounter … />}
    {layout === "panel"   && <PartLayoutPanel … />}
    {layout === "sheet"   && <PartLayoutSheet … />}
  </div>
  {/* AlertDialog de ativar/desativar — inalterado */}
</div>
```

- Handlers atuais (`handleEdit`, `handleDuplicate`, `handleConfirmToggle`, estados, `usePart`, `usePermission`, `auditLog`, invalidação de query) **permanecem na página exatamente como hoje**.
- Os 3 composers recebem um contrato compartilhado e apenas **arranjam** cards — sem lógica de negócio.
- Loading/erro/not-found: comportamento atual preservado; skeleton vira layout-agnostic (header + stat strip + blocos genéricos).

### 6.1 Contrato dos composers (`layouts/types.ts`)

```ts
export interface IPartLayoutProps {
  part: IPart;
}
```

(`canEdit`/ações ficam no header; o histórico de preço é auto-contido via `useAuditsProvider`, como hoje.)

## 7. Component Inventory

### 7.1 Novo — switcher

- **`components/detail/PartLayoutSwitcher.tsx`** — `ToggleGroup type="single"` (espelha `VehicleLayoutSwitcher`/`DetailLayoutSwitcher`): props `{ value, onChange }`, 3 itens com ícone + label, `aria-label`, `title` (hint), label colapsa para ícone em telas estreitas.

### 7.2 Novo — building blocks (mode-agnostic, compostos diferente por layout)

- **`components/detail/PartStatStrip.tsx`** — 5 KPI cells (espelha `VehicleStatStrip`: `grid grid-cols-2 gap-px bg-border … lg:grid-cols-5`, tokens semânticos). Cells: **Preço Padrão · Custo médio (C.M.) · Estoque** (vs mínimo; accent âmbar/destructive quando ≤ mínimo) **· Localização · Margem**. Degrada para "—" quando ausente. Props `{ part }`.
- **`components/detail/PartIdentityCard.tsx`** — imagem, nome (uppercase), SKU, badges Original/Equivalente + ativo/inativo (move o conteúdo do `PartDetailHeader` atual para um card reusável). Inclui o **bloco GTIN** (grande, `font-mono`, ícone `mdi:barcode`) + **`PartSefazBadge`** + **código do fornecedor subordinado** (`text-muted-foreground`, label "Cód. fornecedor"), além de Referência/Grupo/Tipo em chips. Props `{ part }`.
- **`components/detail/PartSefazBadge.tsx`** — badge de estado: `validated` (emerald + check + "Validado em DD/MM"), `not_checked` (âmbar outline "Não consultado no SEFAZ" + botão "Consultar agora" → toast placeholder), `invalid` (destructive "GTIN não encontrado"). **Cor + ícone + texto** sempre (a11y). Props `{ status, checkedAt? }`.
- **`components/detail/PartPricingTable.tsx`** — tabela comparativa das 5 tabelas: colunas `Tabela | Markup % | Preço | Margem (R$)`. Custo base exibido **uma vez** acima. Markup como **badge/pill com intensidade em escala** (neutro → primary). Linha **Padrão** destacada (`bg-muted`/`border-primary`). Valores monetários à direita com `tabular-nums`. Botão "Histórico de preço" reusa a lógica de `useAuditsProvider` da `CommercialSection` atual (extraída para um subcomponente/popover). Fallback: deriva tabelas de `unitCost` quando `priceTables` ausente. Props `{ part }`.
- **`components/detail/PartFiscalCard.tsx`** — NCM, ICMS %, Substituição Tributária, origem em pares label/chip. Empty state quando `fiscal` ausente. Props `{ part }`.
- **`components/detail/PartLogisticsCard.tsx`** — peso, localização, qtd por caixa, fraciona (sim/não), unidade + estoque atual vs mínimo (`StockBadge` reusado). Props `{ part }`.
- **`components/detail/PartSuppliersTable.tsx`** — tabela de fornecedores (nome, cód., NF, data, custo, qtd) + **C.M. ponderado** em destaque no topo/rodapé. Linhas compactas, `tabular-nums`, empty state. Props `{ part }`.

### 7.3 Novo — composers de layout

- **`components/detail/layouts/PartLayoutCounter.tsx`** (A, default)
  - `grid lg:grid-cols-12`. **Aside esquerda sticky** (`lg:col-span-4 lg:sticky lg:top-6 lg:self-start`): `PartIdentityCard` + mini-resumo (C.M., localização). **Direita** (`lg:col-span-8`): shadcn `Tabs` — **Comercial** (default: `PartPricingTable` + `PartFiscalCard` resumido em chips) · **Fiscal & Logística** (`PartFiscalCard` + `PartLogisticsCard`) · **Fornecedores** (`PartSuppliersTable`) · **Aplicações** (`ApplicationsSection`) · **Equivalências** (`EquivalentsSection`).
- **`components/detail/layouts/PartLayoutPanel.tsx`** (B, bento)
  - `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4` com `auto-rows` e `col-span`/`row-span` variados: `PartIdentityCard` (largo, topo) · `PartPricingTable` (2×2, destaque) · `PartLogisticsCard` (1×1) · `PartFiscalCard` (1×1) · `PartSuppliersTable` (2×1) · `EquivalentsSection` (1×1) · `ApplicationsSection` full-width com scroll interno. Colapsa para 1 coluna no mobile.
- **`components/detail/layouts/PartLayoutSheet.tsx`** (C, ficha)
  - Header denso (identidade + KPIs em chips, reusa `PartIdentityCard` compacto) + shadcn `Tabs` **full-width** com as mesmas abas do Balcão, dando largura total às tabelas largas (Aplicações/Fornecedores).

### 7.4 Reuso (sem ou com mudança mínima)

- **`ApplicationsSection`**, **`EquivalentsSection`** — reusados como estão (já recebem `{ part }`; a `Section` interna serve de card).
- **`CommercialSection`** — o **histórico de preço** (lógica `useAuditsProvider`) é extraído para `PartPriceHistory.tsx` (popover/disclosure) e consumido por `PartPricingTable`. `CommercialSection` é descontinuada da composição (substituída por `PartPricingTable` + cards), mas o subcomponente de histórico é preservado.
- **`StockBadge`**, **`PartImage`** — reusados.

### 7.5 Modificado

- **`PartDetailPage.tsx`** — rail 1600, wiring do layout, nova composição (§6).
- **`PartDetailHeader.tsx`** — rail interno `max-w-[1600px]`; adiciona props `layout`/`onLayoutChange`; renderiza `PartLayoutSwitcher` no cluster de ações. A "ficha de identidade" (imagem/nome/SKU/badges/descrição) migra para `PartIdentityCard`; o header mantém voltar + ações + switcher.
- **`shared/types/catalog.ts`** — novos tipos + campos (§4).
- **`catalog/i18n/pt-BR.ts`** — novas strings (§9).
- **`mocks/generators/part.ts`** + **`mocks/data/partsCatalog.ts`** — geração dos novos campos (§8).

## 8. Mock data (determinístico, via `ISeededContext`)

Estender `generatePart` (sem quebrar a assinatura). Todos derivados de `ctx` (seeded) para estabilidade entre reloads:

- **`gtin`** — EAN-13 plausível (13 dígitos; dígito verificador correto via algoritmo módulo-10). ~85% das peças preenchidas.
- **`sefazStatus`** — distribuição ~70% `validated` (+ `sefazCheckedAt` recente), ~25% `not_checked`, ~5% `invalid`.
- **`supplierCode`** — código alfanumérico curto do fornecedor (ex.: derivado do nome + número).
- **`reference`** — número de referência do fabricante (6–7 dígitos).
- **`group`** — derivado da categoria (ex.: filtros → "1-FILTRO").
- **`partType`** — rótulo curto opcional.
- **`priceTables`** — 5 tabelas, **reconciliadas com a margem existente** para não divergir de `unitPrice`/DRE: a tabela **Padrão** usa `markupPercent = marginPercent` (logo `padrao.price === unitPrice`); os outros canais são **offsets relativos ao markup Padrão** (espelhando a ordem da DINTEC — Ecommerce > Padrão > Oficina > Varejo > Atacado): `ecommerce +0.20`, `oficina −0.20`, `varejo −0.40`, `atacado −0.60`, com markup final clampado a ≥ 0.05. `price = round(unitCost * (1 + markupFinal))`. Quando `unitCost === 0` (peça sem custo, PRD-048), `priceTables` fica `undefined` e o detalhe mostra empty state. (Os percentuais absolutos da DINTEC — 120/140/100/80/60 — emergem naturalmente quando a margem Padrão é 120%.)
- **`fiscal`** — NCM plausível por categoria (ex.: filtros `8421.23.00`), `icmsPercent` ∈ {7,12,17,18}, `taxSubstitution` ~30%, `origin` "Nacional"/"Importado".
- **Logística** — `weightKg` por faixa de categoria, `storageLocation` (ex.: `A-12`), `boxQuantity` ∈ {1,6,12,24}, `fractionable` bool, `unitOfMeasure` "UN"/"PC"/"L".
- **`suppliers`** — 1–3 lançamentos (nome de `SUPPLIER_NAMES`, NF, data, custo próximo do `unitCost` com variação, qtd); **`averageCost`** = média ponderada por qtd dos `cost` (helper em `utils/pricing.ts`).

## 9. Utils (puras, unit-testáveis por leitura)

- **`src/features/catalog/utils/pricing.ts`**
  - `PRICE_CHANNELS: { id; label; offset }[]` — os 5 canais e seus offsets relativos ao markup Padrão (`padrao: 0`, `ecommerce: +0.20`, `oficina: −0.20`, `varejo: −0.40`, `atacado: −0.60`).
  - `computePrice(baseCost: number, markupPercent: number): number` = `round(baseCost * (1 + markupPercent))`.
  - `buildPriceTables(baseCost: number, baseMarkup: number): IPriceTable[]` — aplica os offsets sobre `baseMarkup` (clamp ≥ 0.05); `padrao.price === computePrice(baseCost, baseMarkup)`. Usado tanto pelo gerador de mock quanto como fallback no detalhe (quando `priceTables` ausente e `baseCost > 0`).
  - `weightedAverageCost(suppliers: IPartSupplier[]): number | null` (ponderado por `quantity`).
  - `tableMargin(baseCost: number, price: number): number` (margem em R$).

## 10. Visual / Token Guidelines (da consultoria ui-ux-pro-max + regras do projeto)

- **Tokens semânticos apenas** — `bg-background`, `bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-destructive`. **Nunca** hex cru ou `--gallo-*`.
- **GTIN × código do fornecedor** — GTIN é o "documento de identidade": maior, `font-mono`, ícone de barras, label inequívoco "GTIN (EAN)". Código do fornecedor é secundário, subordinado (`text-muted-foreground`), agrupado ao contexto de compra. Nunca dois inputs idênticos lado a lado.
- **Estados SEFAZ** — emerald (validado) / âmbar (não consultado) / destructive (inválido), sempre **cor + ícone + texto**.
- **Tabelas de preço** — comparativa vertical; custo base 1×; markup como badge em escala; preço final em `text-foreground` forte; `tabular-nums`/`font-variant-numeric: tabular-nums` em toda coluna numérica; linha Padrão como âncora.
- **Densidade** — compacta porém **agrupada** (whitespace entre grupos, não dentro): linhas de tabela `h-9`/`py-2`, divisórias `border-b border-border`, sticky header em tabelas longas. Cada card com header-label claro.
- **Cor comunica, neutro domina** — verde primary reservado para ação PARTS e sinais positivos (SEFAZ validado, estoque OK, CTA). Semântica de status consistente com `MaintenanceRecommendations`/`StockBadge`.
- **Interação** — `cursor-pointer` em tudo clicável; hover por cor/borda (150–300ms), nunca scale que desloca layout; focus rings visíveis. Dark mode caprichado (`bg-card` elevado sobre `bg-background`, bordas visíveis).
- **Empty states desenhados** em cada bloco (fiscal/fornecedores/aplicações/equivalências/preços sem custo). Skeleton no loading.

## 11. Backward Compatibility & Risk

- Todos os novos campos de `IPart` são **opcionais** → nenhum consumidor existente (lista, busca, orçamentos, DRE, comissões) quebra. `unitPrice`/`unitCost`/`marginPercent`/`supplier` preservados e ainda populados.
- `ApplicationsSection`/`EquivalentsSection` reusados sem mudança de assinatura.
- Histórico de preço extraído de `CommercialSection` mantém a mesma query/contrato (`useAuditsProvider`, action `part_price_change`).
- **Risco:** flicker de layout antes da leitura do localStorage → mitigado pelo lazy initializer síncrono (sem FOUC), como no veículo.
- **Risco:** peça sem custo (`unitCost = 0`, ~30% do mock) → `priceTables`/C.M. com empty state explícito; KPIs degradam para "—".
- **Risco:** `gerar EAN-13` com dígito verificador errado → helper testado por leitura (módulo-10) + alguns `not_checked`/`invalid` propositais.

## 12. i18n (pt-BR, acentos corretos)

Adicionar em `CATALOG_STRINGS.detail`:

- `layout`: `{ ariaLabel: "Escolher layout da ficha", counter: "Balcão", panel: "Painel", sheet: "Ficha", counterHint, panelHint, sheetHint }`.
- `statStrip`: `{ standardPrice: "Preço Padrão", avgCost: "Custo médio", stock: "Estoque", location: "Localização", margin: "Margem", noStock, belowMin: (n) => … }`.
- `identity`: `{ gtinLabel: "GTIN (EAN)", supplierCode: "Cód. fornecedor", reference: "Referência", group: "Grupo", type: "Tipo", noGtin: "GTIN não cadastrado" }`.
- `sefaz`: `{ validated: "Validado no SEFAZ", validatedAt: (d) => `Validado em ${d}`, notChecked: "Não consultado no SEFAZ", invalid: "GTIN não encontrado no SEFAZ", check: "Consultar agora", checkSoon: "Consulta ao SEFAZ disponível na Fase 2." }`.
- `pricing`: `{ title: "Tabelas de preço", baseCost: "Custo base", table: "Tabela", markup: "Markup", price: "Preço", margin: "Margem", noTables: "Defina o custo para calcular as tabelas de preço." }`.
- `fiscal`: `{ title: "Fiscal", ncm: "NCM", icms: "ICMS", st: "Subst. tributária", origin: "Origem", yes: "Sim", no: "Não", empty: "Dados fiscais não cadastrados." }`.
- `logistics`: `{ title: "Logística", weight: "Peso", location: "Localização", boxQty: "Qtd. por caixa", fractionable: "Fraciona", unit: "Unidade", empty: "Dados logísticos não cadastrados." }`.
- `suppliers`: `{ title: "Fornecedores", name: "Fornecedor", code: "Código", invoice: "NF", date: "Data", cost: "Custo", qty: "Qtd", avgCost: "Custo médio (C.M.)", empty: "Nenhum fornecedor registrado." }`.
- `tabs`: `{ commercial: "Comercial", fiscalLogistics: "Fiscal & Logística", suppliers: "Fornecedores", applications: "Aplicações", equivalents: "Equivalências" }`.

Tudo voltado ao usuário; identificadores de código em inglês.

## 13. Accessibility

- Switcher: operável por teclado, `aria-pressed`/`aria-label`, focus rings, labels (ícone+texto).
- SEFAZ/estoque: status nunca só por cor — ícone + texto sempre.
- Tabelas: `<table>` semântica com `<th scope>`, header sticky com contraste adequado; valores importantes ≥ 4.5:1 (não usar `text-muted-foreground` em valores).
- Tap targets ≥ 40px; `prefers-reduced-motion` respeitado.

## 14. Verification Plan (sem test runner no projeto)

- `bun run build` (Vite + `tsc --noEmit`) deve passar.
- `bunx eslint` limpo nos arquivos novos/tocados; `bunx prettier --write` antes do commit (guard CRLF).
- Validação manual do usuário: alternar Balcão/Painel/Ficha, recarregar p/ confirmar persistência, peça rica vs. peça sem custo, GTIN nos 3 estados SEFAZ, light/dark + cada tema, scrollbar única.
- Self-check: sem hex cru / `--gallo-*`; `cursor-pointer` em clicáveis; empty state em todo bloco; `tabular-nums` nas colunas numéricas.

## 15. Out of Scope / Future

- Reformulação do `PartForm` para criar/editar os novos campos (próxima rodada).
- Consulta real ao SEFAZ e atualização automática via DINTEC (Fase 2).
- Entidade `IPriceList` por loja/canal (multi-loja avançado).
- Persistência por-peça do layout (rejeitado em favor de global, como veículo).

## 16. File-Change Summary

**New (~17):** `config/layout.ts`, `hooks/usePartDetailLayout.ts`, `components/detail/PartLayoutSwitcher.tsx`, `PartStatStrip.tsx`, `PartIdentityCard.tsx`, `PartSefazBadge.tsx`, `PartPricingTable.tsx`, `PartPriceHistory.tsx`, `PartFiscalCard.tsx`, `PartLogisticsCard.tsx`, `PartSuppliersTable.tsx`, `layouts/PartLayoutCounter.tsx`, `layouts/PartLayoutPanel.tsx`, `layouts/PartLayoutSheet.tsx`, `layouts/types.ts`, `utils/pricing.ts`.

**Modified (~6):** `pages/PartDetailPage.tsx`, `components/detail/PartDetailHeader.tsx`, `shared/types/catalog.ts`, `i18n/pt-BR.ts`, `mocks/generators/part.ts`, `mocks/data/partsCatalog.ts`.

**Comportamento preservado:** editar/duplicar/ativar-desativar, auditoria, permissões, histórico de preço, lista/busca/orçamentos, rota, `ApplicationsSection`/`EquivalentsSection`.
