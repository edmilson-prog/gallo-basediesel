# Refatoração da página de Novo Orçamento — Design

> **Data:** 2026-06-02 · **Feature:** editor de orçamento (substitui o formulário de 5 seções)
> **Origem:** brainstorming com consultoria do agente `design-specialist`.

## Problema

A página `Novo orçamento` (`src/features/quotes/pages/NewQuotePage.tsx`) tem três limitações:

1. **Desperdício lateral.** O container usa `mx-auto w-full max-w-5xl` (1024px) centralizado, enquanto o resto do app usa largura cheia. Em telas widescreen sobram margens vazias dos dois lados.
2. **Adição de itens lenta — um de cada vez.** O `AddItemModal` seleciona **uma** peça e fecha (`onAdd(item); onClose()`) a cada adição. Para N peças, o vendedor reabre o modal N vezes. Não há multi-seleção nem aproveitamento dos dados ricos de catálogo/veículo.
3. **Tela pobre em informação.** Cliente é texto solto; linha de item tem só nome/qtd/unit/desc/subtotal; resumo tem só os 4 totais. Dados valiosos (estoque, equivalentes, veículos do cliente, recompra, margem) não aparecem.

## Reenquadramento

A página deixa de ser um "formulário de 5 seções" e passa a ser um **editor de documento comercial** — a metáfora correta é um PDV de balcão de autopeças. A copy "Preencha as 5 seções abaixo" e a numeração 1–5 (que dá peso visual igual a Cliente, Itens, Desconto, Pagamento e Notas) são abandonadas. **Itens** é o herói da página.

## Eixos de configuração (escolha do vendedor)

Dois seletores, **ambos construídos por completo** e **persistidos por vendedor** (localStorage na Fase 1, perfil na Fase 2). Hook único: `useQuoteEditorPrefs`.

### Eixo 1 — Layout (`2col` | `cheio` | `rodape`)

Seletor (segmented control) na barra de ação no topo. Default: `2col`.

- **`2col` (recomendado):** corpo fluido à esquerda (Cliente compacto → Itens herói → Pagamento/Notas) + **resumo sticky** à direita (~360–400px). Desconto, frete e alerta de aprovação migram para dentro do resumo. Barra de ação sticky no topo. Total sempre visível.
- **`cheio`:** coluna única em largura cheia, empilhada. Remove só o `max-w-5xl`. Total ao fim. Menor complexidade visual.
- **`rodape`:** Cliente + Pagamento em 2 colunas no topo, Itens em largura cheia, e total + desconto + frete + CTA numa **barra sticky no rodapé** (estilo PDV/checkout).

Abaixo de `lg`, qualquer layout degrada para resumo em barra sticky de rodapé (padrão mobile de checkout).

### Eixo 2 — Modo de adição (`continuo` | `catalogo` | `rapido`)

Seletor no topo da seção Itens. Default: `continuo`.

- **`continuo` (recomendado):** busca fixa acima da tabela que **não fecha ao adicionar**; resultados com quick-add (`＋`) e quantidade; Enter adiciona o item em foco. Estado-zero mostra sugestões por veículo + recompra. Embute atalhos para abrir o catálogo e o item avulso.
- **`catalogo`:** botão abre um **drawer lateral** (shadcn `Sheet`) com a lista do catálogo, **checkboxes** para multi-seleção, filtros por veículo/categoria, ajuste de quantidade na própria lista e "Adicionar N itens" de uma vez. A lista do orçamento permanece parcialmente visível.
- **`rapido`:** barra de busca tipo command-palette (shadcn `Command`/cmdk), teclado-first (digita → ↑↓ → Enter adiciona → continua buscando). Mínimo de UI.

Os três modos compartilham a mesma fonte de resultados (`searchPartsByText` / `searchPartsByApplication`, já existentes) e o mesmo `onAdd`. **Adicionar uma peça já presente incrementa a quantidade da linha existente** (com micro-realce), não duplica.

## Arquitetura de componentes

Estrutura alvo em `src/features/quotes/components/new/` (decompõe o `NewQuotePage` atual, que hoje tem ~550 linhas):

```
new/
  QuoteEditor.tsx            # orquestra layout + estado; substitui o corpo de NewQuotePage
  layout/
    QuoteEditorLayout.tsx    # aplica o eixo de layout (2col | cheio | rodape)
    QuoteActionBar.tsx       # barra sticky: voltar, número, status, seletor de layout, CTAs
  customer/
    CustomerChip.tsx         # cliente colapsado (chip inteligente) + CustomerAutocomplete (existente)
  items/
    ItemAdder.tsx            # despacha o sub-modo conforme o eixo de adição
    ContinuousAdder.tsx
    CatalogDrawer.tsx
    QuickAddBar.tsx
    ItemResultRow.tsx        # linha de resultado da busca (badges de catálogo)
    QuoteItemsTable.tsx      # tabela editável (linha de item rica)
    FreeItemDialog.tsx       # item avulso
    SuggestionRails.tsx      # estado-zero: sugestões por veículo (chips) + recompra
  summary/
    QuoteSummaryPanel.tsx    # resumo como painel de decisão (totais, desconto, frete, aprovação, margem)
  hooks/
    useQuoteEditorPrefs.ts   # persiste layout + modo por vendedor
    useQuoteDraft.ts         # auto-save de rascunho (Fase 3)
    useItemSearch.ts         # busca compartilhada pelos 3 modos
```

`AddItemModal.tsx` atual é descontinuado (sua lógica de busca migra para `useItemSearch` + `CatalogDrawer`). Componentes devem ser desacoplados o suficiente para reaproveitar no PWA de vendedor externo (`PWAQuickQuotePage`).

## Detalhamento de catálogo (Fase 2)

- **Linha de item rica** (`QuoteItemsTable` / `ItemResultRow`): thumbnail (`imageUrl`, cai para ícone de categoria via `getCategoryIcon`), selo **Original** (`isOriginal`) vs **Equivalente**, OEM (`oemCodes[0]`) + marca, **badge de estoque em 3 estados** (ok / baixo quando `stockAvailable <= stockMinimum` / zerado), link "ver equivalentes" (`equivalentPartIds` + `crossReferences`) inline, e **margem por linha** (`marginPercent`) visível só para `Owner`/`Gestor` (`isManagerOrOwner` já existe).
- **Cross-reference / equivalentes inline:** ao expandir, lista equivalentes resolvidos por `getEquivalents`, permitindo trocar a peça por equivalente com mais estoque/margem.

## Veículos e recompra (Fase 1)

- **Sugestões por veículo (multi):** ao abrir Itens com cliente selecionado, o estado-zero da busca traz peças que servem nos veículos do cliente (`vehiclesProvider.listByCustomer` + `searchPartsByApplication`). **Chips** alternam entre veículos quando há mais de um (corrige a limitação atual de usar só `firstVehicle`).
- **Recompra:** trilho "Já comprou antes" com itens do histórico (`ordersProvider.listByCustomer`), atalho para consumíveis recorrentes.

## Cliente chip inteligente (Fase 2)

Colapsa o cliente selecionado num chip com botão "alterar". Mostra **apenas dados já existentes**: tipo (B2B/B2C), `status`, `abcClass`, `lastPurchaseAt`, endereço de entrega e veículos (chips). Campos financeiros entram na Fase 3.

## Resumo como painel de decisão (Fase 2)

`QuoteSummaryPanel`: contadores (nº de itens, unidades, **peso total** somando `weightKg` — útil para frete), totais, **% de desconto vs limite** (`thresholdPct`), alerta de aprovação + justificativa contíguos, e **margem total** (gated `Owner`/`Gestor`). Reusa `recalculateQuote` / `requiresDiscountApproval`.

## Enriquecimento dependente de dados novos (Fase 3)

Tudo nesta seção **degrada graciosamente** quando o dado está ausente (não renderiza o elemento, sem erro).

- **Limite de crédito:** hoje só em `customer.portal.creditLimit` (quando portal provisionado). Exibir quando presente; caso contrário ocultar.
- **Título vencido / contas a receber:** **não existe** dado financeiro no modelo. Adicionar campo opcional de mock (`overdueTitlesCount?`) ao gerador de cliente para demonstração; ocultar quando ausente.
- **Tabela de preço do cliente:** não há vínculo simples cliente→tabela. Usar `customer.portalContract` quando presente; caso contrário, preço padrão da peça.
- **Kits de revisão (modelo novo):** `IServiceKit { id, storeId, name, vehicleApplication?: { brand; model }, category?: PartCategory, items: { partId; quantity }[] }`. Mock de alguns kits + config simples. Botão "＋ Kit de revisão" insere todos os itens do kit de uma vez.
- **Aceleradores:** item avulso (Fase 1), **atalhos de teclado** (`/` foca busca, `↑↓` navega, `Enter` adiciona, `Esc` limpa), **densidade** compacto/conforto da tabela, **auto-save de rascunho** (`useQuoteDraft`, localStorage, com "salvo às hh:mm").

## Item avulso (Fase 1)

`FreeItemDialog` cria um `IQuoteItem` com nome/preço/qtd livres (o tipo já carrega snapshots `partName`/`partSku`/`unitPrice` desacoplados do catálogo). `partId` recebe um marcador (`avulso`) para indicar item sem cadastro.

## Hierarquia visual (tema Black Gold)

- Dourado (`bg-primary`) é "tinta cara": reservado para **um** elemento por contexto — o CTA primário e o **Total**.
- Estado "item no orçamento": borda lateral dourada de 2px + check, não só `bg-primary/10` (some no dark).
- Feedback ao adicionar (sem fechar): flash de realce na linha (~400ms) + contador "N itens adicionados" no resumo, em vez de um toast por item. Respeita `prefers-reduced-motion`.
- Estoque: neutro / âmbar quente (baixo) / vermelho (zerado, ainda vendável sob encomenda — aviso, não bloqueio).
- Placeholder de peça sem foto: ícone monocromático sobre `bg-muted`, não dourado.

## Acessibilidade (WCAG 2.2 AA — transversal)

- Busca de itens com semântica de combobox (`role="combobox"` + listbox + `aria-activedescendant`), navegação completa por teclado, `aria-live="polite"` anunciando contagem de resultados e adições.
- `scroll-padding-top` no container para que o foco de teclado nunca fique atrás dos elementos sticky.
- Inputs numéricos da tabela com `aria-label` ("Quantidade de {partName}", etc.).
- Alvos de clique (`＋`, remover, stepper) ≥24px.
- Drawer/dialog com focus trap e retorno de foco (Radix `Sheet`/`Dialog`).
- Validar contraste dos pares novos (estoque âmbar/vermelho sobre dark) no validador da rota `/design-system`.

## Faseamento

| Fase                             | Escopo                                                                                                                                                                                                          | Resolve                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **1 — Fundação**                 | Layouts (3 + seletor) · remoção do `max-w-5xl` · resumo sticky · adição contínua + 3 modos + seletor · incremento de duplicata · sugestões por veículo (multi) · recompra · item avulso · `useQuoteEditorPrefs` | As 2 dores diretas      |
| **2 — Detalhamento de catálogo** | Linha de item rica (badges, estoque 3 estados, equivalentes inline, margem gated) · resumo painel de decisão · cliente chip (dados existentes)                                                                  | Tela rica               |
| **3 — Dados novos + kits**       | Limite de crédito / título vencido / tabela de preço do cliente (mock + degradação) · `IServiceKit` + config · atalhos de teclado · densidade · auto-save                                                       | Enriquecimento avançado |

Um spec (este) cobre a visão; a implementação sai em **3 planos sequenciais** (um por fase).

## Fora de escopo / deferido

- **Tela de gestão de kits** (CRUD completo de `IServiceKit`): registrada como issue no git; a Fase 3 entrega só o modelo + mock + consumo no editor.
- Integração financeira real de contas a receber (Fase 2 do produto / Supabase).
- Persistência de preferências no perfil do servidor (Fase 2 do produto).

## Validação

Sem test runner no projeto. Validação por:

- `bun run build` (type-check `tsc --noEmit`) sem erros.
- `bun run lint` sem erros (respeitar `no-restricted-imports` — consumir providers via barrel `@/providers/data`).
- Verificação manual de UI pelo usuário (não abrir browser automaticamente).
- Não regredir: criação de orçamento (rascunho/enviar), cálculo de frete, aprovação de desconto, geração de número, `PWAQuickQuotePage`.

## Arquivos-chave

- `src/features/quotes/pages/NewQuotePage.tsx` — alvo da refatoração.
- `src/features/quotes/components/new/AddItemModal.tsx` — descontinuado.
- `src/features/quotes/components/new/CustomerAutocomplete.tsx` — base do cliente chip.
- `src/features/quotes/utils/quoteTotals.ts` — `recalculateQuote`, `requiresDiscountApproval`.
- `src/features/catalog/api/search.ts` — `searchPartsByText`, `searchPartsByApplication`, `getEquivalents`.
- `src/features/catalog/utils/categories.ts` — `getCategoryIcon`.
- `src/shared/types/catalog.ts` / `customer.ts` / `commercial.ts` — `IPart`, `ICustomer`, `IVehicle`, `IQuoteItem`, `IQuote`.
- Providers: `quotes`, `parts`, `vehicles`, `orders`, `settings` (todos com `listByCustomer` onde citado).
