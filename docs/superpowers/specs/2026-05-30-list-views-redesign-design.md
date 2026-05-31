# Refatoração das Listas de Orçamentos & Pedidos — Design

> **Status:** aprovado no brainstorming · aguardando revisão da spec
> **Data:** 2026-05-30
> **Versão-alvo:** 0.52.0 (MINOR) · codinome sugerido **"Ledger"** (a confirmar no bump)
> **Rotas:** `/app/orcamentos` (`QuotesListPage`) e `/app/pedidos` (`OrdersListPage`)
> **Mantido por:** AILA Sistemas Inteligentes

---

## 1. Contexto

As listas de **Orçamentos** e **Pedidos** são páginas-gêmeas (mesmo esqueleto: `Header → FiltersBar → Table → Pagination`). Elas sofrem da mesma família de problemas já corrigida nas fichas de cliente e veículo:

1. **Espaço lateral desperdiçado.** A `QuotesTable` é renderizada com largura **fixa** — `<Table className="table-fixed" style={{ width: totalWidth }}>`, onde `totalWidth` é a **soma das larguras das colunas (~1180px)**, ancorada à esquerda. Em monitor largo (~1600px úteis) sobram ~400px de vazio à direita. (A `OrdersTable` já é `w-full`, então não tem o vazio — mas a página continua "crua".)
2. **Organização crua.** Acima da tabela só existe um cabeçalho com a contagem ("N encontrados"). Nenhuma hierarquia, nenhum contexto.
3. **Pobre em inteligência.** Para uma plataforma que se posiciona como "cérebro comercial acima do ERP", a visão do dinheiro no funil não resume nada: nenhum valor em aberto, convertido, taxa de conversão, ticket, ou itens **expirando/vencidos** (acionáveis). Todos esses números já estão nos dados carregados.

**Fato habilitador:** `useQuotesList` e `useOrdersList` já buscam o conjunto inteiro (`pageSize: 1000`) e paginam no cliente. O dataset filtrado completo já está em memória — KPIs e contagens de status saem **sem nenhuma query nova**.

---

## 2. Objetivos / Não-objetivos

**Objetivos**
- Eliminar o vazio lateral (tabela fluida).
- Enriquecer as duas listas com uma faixa de KPIs e abas de status com contagem.
- Oferecer **3 visualizações selecionáveis** (Cockpit / Console / Linhas), padrão **Cockpit**, lembradas por lista.
- Maximizar reuso: um framework genérico de "list views" consumido pelas duas páginas.

**Não-objetivos (YAGNI)**
- Nenhum backend, migração ou mudança no modelo de dados.
- Sem exportação (CSV/PDF), sem seleção em massa, sem ações em lote.
- Sem multi-seleção de status (troca intencional — ver §8).
- Sem novos gráficos (a faixa de KPIs é numérica, como o `CustomerStatStrip`).
- Sem alterar `/app/orcamentos/$id`, `/novo`, nem as listas do portal/loja.

---

## 3. Decisões capturadas (brainstorming)

| # | Decisão |
|---|---------|
| D1 | **3 visualizações selecionáveis**, não uma só. |
| D2 | Padrão = **Cockpit (A)**. |
| D3 | Seletor = **controle segmentado no cabeçalho** (espelha `VehicleLayoutSwitcher`). |
| D4 | Persistência **por lista** (chaves separadas), via `localStorage`. |
| D5 | Escopo = **Orçamentos + Pedidos**, mesmo framework. |
| D6 | KPIs e contagens **calculados no cliente** sobre o conjunto filtrado já carregado. |
| D7 | As **abas de status substituem** o popover "Status" da barra de filtros. |
| D8 | KPIs e contagens de abas refletem o conjunto filtrado **exceto o filtro de status** (estáveis ao trocar de aba). |

---

## 4. Arquitetura

### 4.1 Fronteira de reuso

**Compartilhado (genérico, agnóstico de domínio)** — `src/shared/list-views/`:
- O mecanismo de troca de visualização (tipo, config, hook, seletor).
- A **casca visual** das peças: faixa de KPIs, abas de status, e os três "shells" de arranjo (Cockpit/Console/Linhas) que só posicionam *slots*.

**Por domínio (ligações)** — `src/features/quotes/` e `src/features/orders/`:
- O **cálculo** dos KPIs e das contagens de status (números próprios de cada domínio).
- As **tabelas** (a padrão fluida e a variante de linhas duplas).
- A **composição** na página: ler a visualização escolhida, montar os slots, renderizar o shell.

### 4.2 Fluxo de dados

```
provider.list({ pageSize: 1000, ... sem status })   ← já existe, só removemos o status dos params
        │
        ▼
applyClientFilters (total, store, validade, origem…)  +  filtro de vendedor
        │
        ▼
   allFiltered   ──────────────┬──────────────┬───────────────────────────────
   (pré-status)                │              │
                               ▼              ▼
                       computeStats()   statusCounts()        afterStatus = allFiltered
                       → IStatCell[]     → contagem por aba    .filter(status ∈ filtros)
                               │              │                       │
                               ▼              ▼                  sort + paginate
                          ListStatStrip   ListStatusTabs              │
                                                                       ▼
                                                                  data (página) + total
                                                                       │
                                                                       ▼
                                                              Table / TableRows
```

`useQuotesList` / `useOrdersList` passam a expor **`allFiltered`** (conjunto pós-filtros-comuns, **pré-status** e pré-paginação), além de `data` (página) e `total` (contagem pós-status, para a paginação).

---

## 5. Inventário de arquivos

### 5.1 Compartilhado — `src/shared/list-views/` (Fase 1)
| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `config.ts` | novo | `ListLayout = "cockpit" \| "console" \| "rows"`; `LIST_LAYOUTS`; `DEFAULT_LIST_LAYOUT = "cockpit"`; labels/ícones/dicas pt-BR. |
| `useListLayout.ts` | novo | `(storageKey) → [layout, setLayout]`, leitura síncrona do `localStorage` (lazy initializer), grava no setter. Espelha `useVehicleDetailLayout`. |
| `ListLayoutSwitcher.tsx` | novo | `ToggleGroup type="single"` segmentado com ícones + `title` (dica). Espelha `VehicleLayoutSwitcher`. |
| `ListStatStrip.tsx` | novo | Renderiza `cells: IStatCell[]` com `orientation`. Padrão do `CustomerStatStrip` (grid `gap-px` sobre `bg-border`, células `bg-card`). |
| `ListStatusTabs.tsx` | novo | Renderiza `tabs: IStatusTab[]`, `activeKey`, `onSelect`, `orientation`. |
| `LayoutShells.tsx` | novo | `CockpitShell`, `ConsoleShell`, `RowsShell` — arranjam slots. |
| `index.ts` | novo | Barrel de exportações. |

### 5.2 Orçamentos — `src/features/quotes/` (Fase 1)
| Arquivo | Tipo | Mudança |
|---|---|---|
| `utils/quoteListStats.ts` | novo | `quoteStatCells(quotes, now): IStatCell[]` e `quoteStatusCounts(quotes): Record<QuoteStatus, number>`. |
| `hooks/useQuotesList.ts` | modificar | Remover `status` dos params do provider; aplicar status no cliente; expor `allFiltered`. |
| `components/list/QuotesTable.tsx` | modificar | Tabela **fluida** (`w-full` + `min-width`), mantendo redimensionamento. |
| `components/list/QuotesTableRows.tsx` | novo | Variante de linhas duplas (layout Linhas). |
| `components/list/QuotesFiltersBar.tsx` | modificar | Remover o popover "Status" (vira aba). |
| `components/list/QuotesHeader.tsx` | modificar | Aceitar `layout`/`onLayoutChange` e renderizar `ListLayoutSwitcher`. |
| `pages/QuotesListPage.tsx` | modificar | Ler layout; computar stats/abas de `allFiltered`; montar slots; renderizar shell. |

### 5.3 Pedidos — `src/features/orders/` (Fase 2)
| Arquivo | Tipo | Mudança |
|---|---|---|
| `utils/orderListStats.ts` | novo | `orderStatCells(orders, now): IStatCell[]` e `orderStatusCounts(orders): Record<OrderStatus, number>`. |
| `hooks/useOrdersList.ts` | modificar | Separar o filtro de status (aplicar por último); expor `allFiltered`. |
| `components/list/OrdersTable.tsx` | modificar | Garantir fluidez (já `w-full`); ajustes finos. |
| `components/list/OrdersTableRows.tsx` | novo | Variante de linhas duplas. |
| `components/list/OrdersFiltersBar.tsx` | modificar | Remover o popover "Status". |
| `components/list/OrdersHeader.tsx` | modificar | Aceitar `layout`/`onLayoutChange` + `ListLayoutSwitcher`. |
| `pages/OrdersListPage.tsx` | modificar | Idem Orçamentos. |

### 5.4 Versionamento (final da Fase 2)
`package.json`, `CHANGELOG.md`, `CLAUDE.md` → bump **0.52.0** + codinome.

---

## 6. Contratos compartilhados (tipos)

```ts
// config.ts
export type ListLayout = "cockpit" | "console" | "rows";
export const LIST_LAYOUTS: readonly ListLayout[] = ["cockpit", "console", "rows"];
export const DEFAULT_LIST_LAYOUT: ListLayout = "cockpit";

// ListStatStrip.tsx
export type StatTone = "default" | "good" | "warn" | "bad";
export interface IStatCell {
  icon: string;            // nome iconify (mdi:*)
  label: string;           // pt-BR, maiúsculas pequenas
  value: React.ReactNode;  // já formatado (R$, %, contagem)
  tone?: StatTone;         // colore o valor
}

// ListStatusTabs.tsx
export interface IStatusTab {
  key: string;             // valor do status, ou "all" para "Todos"
  label: string;
  count: number;
  dotClassName?: string;   // bolinha de cor do status (opcional)
}
```

**Mapa de `tone` → cor do valor** (mesma paleta dos badges de status, que já usam `emerald/amber/rose`):
- `default` → `text-foreground`
- `good` → `text-emerald-600 dark:text-emerald-400`
- `warn` → `text-amber-600 dark:text-amber-400`
- `bad` → `text-destructive`

### Shells (contratos de slots)
- `CockpitShell({ strip, tabs, filters, table })` — coluna vertical: `strip`+`tabs`+`filters` **fixos** (não rolam); `table` num `flex-1 overflow-y-auto`.
- `ConsoleShell({ rail, table })` — `aside w-72` (rola) com o `rail` (strip vertical + abas verticais + filtros) e `table` em `flex-1 overflow-y-auto`. Em telas `< md`, empilha (rail vira topo).
- `RowsShell({ strip, filters, table })` — como o Cockpit, sem abas no topo (vão para dentro dos filtros) e com `strip` compacto.

A página é a **composidora**: calcula `stripCells`/`statusTabs` e injeta `<ListStatStrip>`, `<ListStatusTabs>`, a barra de filtros e a tabela (padrão ou linhas) nos slots, escolhendo o shell por um `switch(layout)`.

---

## 7. As 3 visualizações

O **cabeçalho é constante** (título + contagem + busca + [Orçamento: botão "+ Novo"] + **seletor segmentado**). Só o corpo muda. A **paginação** permanece fixa no rodapé.

- **Cockpit (padrão):** `ListStatStrip` (horizontal, 5 células) → `ListStatusTabs` (horizontal) → barra de filtros → **tabela padrão fluida**. KPIs e abas sempre visíveis; só as linhas rolam.
- **Console:** trilho à esquerda (`w-72`) com `ListStatStrip` vertical + abas verticais + filtros; **tabela padrão** à direita ocupando o resto.
- **Linhas:** `ListStatStrip` compacto (3 células) → filtros → **tabela de linhas duplas** (`QuotesTableRows`/`OrdersTableRows`), com mais contexto por linha.

### Tabela de linhas duplas — colunas
- **Orçamentos:** `Nº + Cliente / Cidade` · `Origem / Vendedor` · `Total / nº de itens` · `Status / validade ("vence em 3d")`.
- **Pedidos:** `Nº + Cliente / Cidade` · `Origem / Vendedor` · `Total / nº de itens` · `Status / pagamento + entrega`.

---

## 8. Abas de status

- As abas são o **controle primário de status**: uma ativa por vez ou **"Todos"**, cada uma com a **contagem** vinda de `allFiltered` (estável ao trocar de aba — D8).
- Clicar numa aba → `patch({ statuses: [key] })`; clicar "Todos" → `patch({ statuses: [] })`.
- Aba ativa = `statuses.length === 1 ? statuses[0] : (statuses.length === 0 ? "all" : nenhuma)` (um deep link com múltiplos status não destaca aba — caso raro).
- **O popover "Status" é removido** das barras de filtro (`QuotesFiltersBar`/`OrdersFiltersBar`). Perde-se a multi-seleção de status — troca intencional (raríssima nessa tela); os demais filtros (origem, vendedor, período, valor, validade; pagamento/entrega em pedidos) **permanecem**.
- **Orçamentos:** `Todos` + 6 (`rascunho, enviado, aceito, recusado, expirado, convertido`).
- **Pedidos:** `Todos` + 8 status agregados (`computeOrderStatus`). As abas quebram em duas linhas (flex-wrap) quando necessário.

---

## 9. KPIs (fórmulas exatas)

Calculados sobre **`allFiltered`** (pós-filtros-comuns, pré-status). `now` injetado pela página (`useMemo(() => new Date(), [])`). Dinheiro via `formatBRL`; percentuais com 0 casas; divisão por zero → `"—"`.

### 9.1 Orçamentos — `quoteStatCells(Q, now)` (5 células)
Sejam: `aberto = Q.filter(s ∈ {rascunho, enviado})`; `convertido = Q.filter(s === "convertido")`; `apresentado = Q.filter(s ∈ {enviado, aceito, recusado, expirado, convertido})`.

| # | Label | Valor | Ícone | Tone |
|---|---|---|---|---|
| 1 | EM ABERTO | `Σ aberto.total` | `mdi:cash-clock` | default |
| 2 | CONVERTIDO | `Σ convertido.total` | `mdi:swap-horizontal-bold` | good |
| 3 | CONVERSÃO | `apresentado.length ? convertido.length / apresentado.length : —` (%) | `mdi:trending-up` | default |
| 4 | TICKET MÉDIO | `Q.length ? Σ Q.total / Q.length : —` | `mdi:cash-multiple` | default |
| 5 | EXPIRANDO ≤3D | `Q.filter(s === "enviado" && validityBucket(validUntil, now) ∈ {critical, warning}).length` | `mdi:clock-alert-outline` | warn |

### 9.2 Pedidos — `orderStatCells(O, now)` (5 células)
Seja `ativo = O.filter(o => computeOrderStatus(o) ∉ {cancelado, devolvido})`.

| # | Label | Valor | Ícone | Tone |
|---|---|---|---|---|
| 1 | VALOR TOTAL | `Σ ativo.total` | `mdi:cash-multiple` | default |
| 2 | RECEBIDO | `Σ O.filter(paymentStatus === "pago").total` | `mdi:cash-check` | good |
| 3 | A RECEBER | `Σ O.filter(paymentStatus ∈ {pendente, parcial, vencido}).total` | `mdi:cash-clock` | default |
| 4 | A EXPEDIR | `O.filter(fulfillmentStatus ∈ {pendente, separacao} && !canceledAt).length` | `mdi:package-variant` | warn |
| 5 | VENCIDOS | `O.filter(o => o.paymentStatus === "vencido" || isPaymentOverdue(o, now)).length` | `mdi:alert-circle-outline` | bad |

---

## 10. Tabela fluida (correção do vazio)

- **`QuotesTable`:** trocar `style={{ width: totalWidth }}` por `className="w-full"` + `style={{ minWidth: totalWidth }}`. Com `table-fixed`, larguras de coluna explícitas e tabela a 100%, o navegador distribui o espaço extra proporcionalmente → preenche a largura; rola na horizontal apenas se a janela for menor que `minWidth`. O redimensionamento (`useResizableColumns`) continua funcionando (ajusta as proporções). Envolver num `overflow-x-auto`.
- **`OrdersTable`:** já é `w-full` (shadcn). Apenas confirmar o preenchimento e padronizar o cabeçalho de ordenação.

---

## 11. Persistência

- Chaves: `gallo-quotes-list-layout` e `gallo-orders-list-layout` (constantes em `config.ts` ou nos próprios pages).
- `useListLayout(storageKey)` lê de forma síncrona no `lazy initializer` do `useState` e grava no setter — sem flicker (SPA client-rendered; não precisa de script anti-FOUC no `index.html`, que é exclusivo do tema).
- Valor inválido/ausente → `DEFAULT_LIST_LAYOUT` (`cockpit`).

---

## 12. Tokens, estilo e acessibilidade

- **Apenas tokens semânticos** para superfícies/estruturas (`bg-background`, `bg-card`, `bg-card/60`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`). Cores de *status/tone* usam a paleta `emerald/amber/rose` **idêntica à dos badges existentes** (precedente no código) e `text-destructive` (semântico). Nada de hex direto nem `--gallo-*`.
- `ListStatStrip` é um `<dl>` (cada célula `<dt>`+`<dd>`), como o `CustomerStatStrip`.
- `ListLayoutSwitcher`: `ToggleGroup` com `aria-label` no grupo e em cada item, `title` com a dica.
- `ListStatusTabs`: `role="tablist"`/itens como botões com `aria-pressed`; foco visível; contraste ≥ 4.5:1.
- Alvos de toque ≥ 36px (abas/seletor seguem o `size="sm"` dos controles atuais).
- Linhas da tabela mantêm `cursor-pointer` + `hover:bg-muted/60` e navegação por clique já existente.

---

## 13. Faseamento

- **Fase 1 — Framework + Orçamentos.** Cria todo o `src/shared/list-views/`, valida-o no consumidor real (Orçamentos) e entrega `/app/orcamentos` redesenhado com as 3 visualizações. Verificação: `bun run build` + lint/prettier nos arquivos.
- **Fase 2 — Pedidos.** Aplica o mesmo padrão em `/app/pedidos` (stats próprios, variante de linhas, remoção do popover de status, seletor no header). Bump de versão **0.52.0** + codinome ao final.

Cada fase é independentemente funcional e commitável.

---

## 14. Riscos e mitigação

- **Mover o filtro de status para o cliente (Orçamentos):** baixo risco — os dados já vêm completos (`pageSize: 1000`); o provider continua filtrando o resto. Mantém paridade com Pedidos (que já filtra status no cliente).
- **Teto de 1000 linhas:** limitação **pré-existente** da paginação client-side; KPIs/contagens herdam o mesmo teto. Fora de escopo mudar isso.
- **Console em telas estreitas:** o trilho empilha acima da tabela em `< md` (sem scroll horizontal).
- **Abas de pedidos (9 chips):** quebram em linha; aceitável. No Console ficam verticais no trilho.

---

## 15. Em aberto

Nenhum item em aberto — pronto para o plano de implementação.
