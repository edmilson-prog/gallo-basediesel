# Regras de UX — GALLO Base Diesel

> **Status:** vigente (2026-06-11) · **Escopo:** todas as telas do app (`/app/*`)
> **Obrigatório** para implementações futuras de telas de lista e headers de página.
> Referências vivas: TopBar, Catálogo, Clientes, Veículos, Orçamentos e Pedidos já seguem 100% destas regras — na dúvida, copie delas.

Este documento consolida os padrões de UX estabelecidos na plataforma. Toda tela nova (ou reforma de tela existente) deve aderir a eles para manter consistência visual e de interação.

---

## 1. Header de página — Glassmorphism

Todo header fixo de página (e o TopBar global) usa a receita de vidro fosco, **somente com tokens semânticos** (nunca hex ou `--gallo-*`):

```
border-b border-border/40 bg-background/85 shadow-lg shadow-foreground/5
backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50
```

Regras:

- `bg-background/85` é o **fallback opaco** para navegadores sem `backdrop-filter`; a transparência real (`/50`) entra via `supports-[backdrop-filter]:`.
- Nunca usar `bg-card` opaco em header de página — o conteúdo deve aparecer desfocado atrás do vidro.
- O TopBar adiciona um "glint" de borda superior (`before:` com gradiente `via-foreground/15`) — exclusivo dele, não replicar em headers internos.
- ⚠️ **Tailwind v4 + `sticky`:** nunca adicionar `relative` num elemento que já é `sticky` (ambos setam `position`; a ordem do CSS gerado decide quem ganha e pode quebrar o sticky). `sticky` já ancora filhos absolutos.

Exemplos: `src/features/shell/components/TopBar.tsx`, `src/features/catalog/components/list/CatalogHeader.tsx`.

## 2. Linha de progresso de scroll

Toda tela de lista com header fixo exibe uma linha de progresso na **fronteira exata entre o chrome fixo e a área rolável** (não na base do título — na divisa onde o conteúdo desaparece ao rolar).

Componente: `src/features/shell/components/ScrollProgressBar.tsx`.

- **Visual:** gradiente `from-primary/60 to-primary` com glow `shadow-primary/50`, `h-0.5`, ponta `rounded-r-full`, transição de 150ms (`motion-reduce:transition-none`). Acompanha o tema ativo automaticamente.
- **Posicionamento:** o componente é `absolute inset-x-0 bottom-0` — monte-o dentro de um ancestral posicionado na borda inferior do bloco fixo, ou num "seam" `relative` de altura zero imediatamente antes do container rolável (ver slot `progress` dos `LayoutShells`).
- **Container de scroll:** o app rola em containers aninhados, nunca na janela.
  - Sem props, o componente detecta o ancestral rolável mais próximo (caso TopBar dentro do `<main>`).
  - Quando o scroller é **irmão** do header (padrão das telas de lista), passe-o explicitamente: `container={scrollEl}` + callback ref `scrollRef={setScrollEl}` exposto pela tabela/shell. Atenção: nos layouts Cockpit/Console, quem rola é o **wrapper interno do `<Table>`** (`containerRef`), não o div do shell.
- **Mecânica:** escreve `transform: scaleX()` direto no DOM via `requestAnimationFrame` (zero re-render por frame); `ResizeObserver` + `MutationObserver` re-medem quando conteúdo assíncrono cresce a página; overflow residual < 24px é tratado como "sem scroll" (evita linha 100% enganosa).
- ⚠️ **Tailwind v4:** `scale-x-*` usa a propriedade CSS `scale` (não `transform`) — não combine a classe com transform inline via JS; o estado inicial do bar é `style={{ transform: "scaleX(0)" }}`.

Exemplos de wiring: `CatalogListPage` (wrapper relative), `QuotesListPage`/`OrdersListPage` (slot `progress` dos shells + `containerRef` da tabela), `CustomersListPage`/`VehiclesListPage` (callback ref no `<Table containerRef>`).

## 3. Campo de busca padrão (telas de lista)

Toda busca de tela de lista segue a UX da antiga busca global:

- **Largura dinâmica:** wrapper `relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none`; em repouso `max-w-sm` (~384px; Clientes usa `max-w-[260px]` por densidade), focado `max-w-2xl` (~672px). O campo cresce sobre o espaço livre — os vizinhos (botões, switchers) recebem `shrink-0`.
- **Atalho `/`:** listener global de `keydown` foca o campo; **ignorar** quando o evento nasce em `INPUT`, `TEXTAREA` ou `isContentEditable` (não roubar a digitação), e respeitar `e.defaultPrevented`.
- **Badge `kbd`:** dica visual "/" dentro do campo, à direita (`hidden sm:flex`), com `opacity-0` enquanto focado.
- **`Escape`** desfoca (e recolhe) o campo.
- **Input:** `type="search"`, ícone `mdi:magnify` à esquerda (`pl-8`), `pr-9` para o badge.
- **Debounce:** quando a busca dispara query/filtro pesado, manter debounce local de 300ms (ver `CatalogHeader`).

Implementação de referência: `src/features/vehicles/components/list/VehiclesHeader.tsx` (original) e réplicas em Catálogo, Clientes, Orçamentos e Pedidos.

## 4. Tabelas de lista

- **Colunas redimensionáveis:** usar o hook compartilhado `useResizableColumns` (`src/shared/hooks/useResizableColumns.ts`):
  - Definição de colunas com `{ id, label, defaultWidth, sortBy }`.
  - Persistência em `localStorage` com chave `gallo-<feature>-column-widths`.
  - Tabela `table-fixed` + `<colgroup>` com as larguras + `style={{ minWidth: totalWidth }}`.
  - Handle de resize: `<span role="separator" aria-orientation="vertical">` absoluto na borda direita do `<th>` (`w-1.5 cursor-col-resize touch-none hover:bg-primary/40`), com `onClick` stopPropagation para não disparar o sort.
- **Delimitadores verticais SOMENTE no header** (nunca no corpo):
  ```
  <TableRow className="... [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
  ```
- **Visibilidade de colunas — clique-direito no cabeçalho:** a linha de header é envolvida em `ContextMenu` (shadcn) — botão direito em qualquer `<th>` abre o menu **"Colunas visíveis"**, com um `ContextMenuCheckboxItem` por coluna opcional e a ação **"Exibir todas"** (desabilitada quando tudo já está visível). O mesmo conteúdo é oferecido num dropdown na última coluna de ações (ícone), para descoberta via mouse/touch. Regras:
  - Colunas obrigatórias (a de identificação, ex.: nome/marca) não entram no menu — sempre visíveis.
  - Persistência em `localStorage` (`gallo-<feature>-columns`), na ordem canônica das colunas (utils `readVisibleOptional`/`writeVisibleOptional`).
  - Strings via i18n da feature: título "Colunas visíveis", ação "Exibir todas".
  - Referências: `VehiclesColumnsMenu.tsx` + `VehiclesTable` (vehicles), `CatalogColumnsMenu.tsx` + `CatalogTable` (catálogo).
- **Header sticky:** `sticky top-0` com `bg-background` (ou `bg-background/95 backdrop-blur` quando full-bleed) e `z` acima das linhas.
- **Células:** `truncate` em texto livre; valores monetários `text-right tabular-nums`; datas `text-xs text-muted-foreground`.
- **Ordenação:** clique no label alterna `asc/desc`; ícone `mdi:arrow-up/down` ativo, `mdi:unfold-more-horizontal` com `opacity-40` inativo.
- **Scroll:** expor o container rolável via callback ref (`scrollRef` → `<Table containerRef>`) para a linha de progresso (§2).

Implementações de referência: `CatalogTable` (original), `QuotesTable`, `OrdersTable`.

## 5. Tokens, temas e acessibilidade (transversal)

- Componentes consomem **apenas tokens semânticos** (`bg-background`, `text-foreground`, `border-border`, `text-primary`…). Severidades via `text-/bg-/border-severity-{info|success|warning|critical}`. Nunca hex nem `--gallo-*` (PRD-001).
- Animações sempre condicionadas: `motion-safe:` para ligar, `motion-reduce:transition-none` para desligar.
- Elementos decorativos com `aria-hidden`; controles com `aria-label` em pt-BR; banners críticos com `role="alert"` montados uma vez por episódio.
- Texto de UI em pt-BR **com acentuação correta**.

## 6. Checklist para nova tela de lista

1. [ ] Header com receita glass (§1) — título `shrink-0`, controles à direita `shrink-0`.
2. [ ] Busca com largura dinâmica + `/` + `kbd` + `Escape` (§3).
3. [ ] Tabela `table-fixed` com `useResizableColumns` + delimitadores verticais só no header + menu de colunas no clique-direito do cabeçalho (§4).
4. [ ] `scrollRef`/`containerRef` exposto e `ScrollProgressBar` na divisa do bloco fixo (§2).
5. [ ] Estados de loading (skeleton), vazio e erro centralizados, com CTA de limpar filtros/criar.
6. [ ] Tokens semânticos, `motion-reduce`, aria-labels (§5).
