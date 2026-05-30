# Design — Página dedicada de detalhamento do cliente

- **Data:** 2026-05-29
- **Rotas afetadas:** `/app/clientes/$id` (refeita) e `/app/clientes` (gatilho de nome + botão expandir no painel)
- **Branch:** worktree dedicada (`festive-torvalds-4b0ff7`)
- **Tipo:** feature de UI/UX (adiciona uma segunda forma de visualização do detalhamento; sem mudança de dados, providers ou RBAC)
- **Abordagem escolhida:** **C — Híbrido** (faixa de stats → hero analítico bento → 7 abas intactas)

## Problema

A página `/app/clientes` mostra o detalhamento do cliente **somente** num painel lateral (`CustomerProfile variant="column"`, ~40% da largura). É ótimo para consulta rápida sem sair da lista, mas espreme muita informação num espaço estreito e não escala conforme o cliente acumula histórico.

A rota `/app/clientes/$id` **já existe**, porém hoje:
- só é acionada em mobile (`< 768px`) ou por acesso direto;
- renderiza o **mesmo** `CustomerProfile` (header + 7 abas), apenas centralizado em `max-w-3xl` — ou seja, **não aproveita** o espaço extra nem mostra mais informação.

Queremos **duas formas de visualização coexistindo**:
1. **Painel lateral** (atual) — consulta rápida, sem sair da lista. **Preservado.**
2. **Página dedicada** — acionada ao clicar no nome do cliente; largura total, mais respiro e **blocos novos** que não cabem no painel.

## Decisão

Adotar o padrão já estabelecido no redesign do detalhe de veículos (`docs/superpowers/specs/2026-05-29-vehicle-detail-layout-design.md`): **trilho `max-w-7xl`, header full-bleed, faixa de stats full-width e bento de 12 colunas**.

Sobre esse padrão, a página recebe um **hero analítico** com 4 blocos novos no topo e **mantém as 7 abas atuais intactas** logo abaixo (abordagem Híbrida). Isso entrega o "detalhar mais" sem reescrever as abas que já funcionam — menor risco.

Abordagens descartadas:
- **A (Espelho de veículos puro):** abas dentro de uma lane larga ainda deixam vazio quando a aba ativa é curta.
- **B (Painel executivo):** reescreve a `OverviewTab` e o modelo de abas → maior esforço e risco de regressão.

## Modelo de interação

- **Tabela (`CustomersTable`):**
  - Clicar no **nome** do cliente (na célula `name`) → `navigate({ to: "/app/clientes/$id", params: { id } })`.
  - Clicar em **qualquer outra parte da linha** → abre o painel lateral (`url.setSelectedId`), comportamento atual.
  - Implementação: o nome vira um elemento clicável (`<button>`/`<a>`) com `onClick` que chama um novo callback `onOpenDetail(id)` e faz `e.stopPropagation()` para não disparar o `onSelectDetail` da linha.
  - Mobile (`< 768px`) já navega para a página — preservado.
- **Painel lateral (`CustomerProfile variant="column"`):** ganha um botão **"expandir"** no header (ícone `mdi:arrow-expand` ou `mdi:open-in-new`, `aria-label="Abrir página completa"`) → navega para `/app/clientes/$id`. Permite subir do quick-view para a página sem voltar à lista.
- **Setas ↑↓** continuam restritas à navegação entre linhas na tabela (sem alteração).

## Arquitetura de componentes

A página dedicada deixa de reusar `CustomerProfile variant="page"` como container e passa a ter um shell próprio que **compõe** peças reutilizadas:

```
CustomerDetailPage                         (novo — espelha VehicleDetailPage)
├── CustomerDetailHeader                   (novo — full-bleed, breadcrumb, ações)
│     └── reusa ProfileBadges, PreConversionBadge, CoverageBanner, ProfileMenu
├── CustomerStatStrip                      (novo — faixa de stats full-width)
├── <hero bento 12-col>
│     ├── CustomerPurchaseEvolutionCard    (novo — AreaChart recharts)
│     ├── CustomerRelationshipTimeline     (novo)
│     └── CustomerPendingActionsCard       (novo)
└── ProfileTabs                            (reuso — 7 abas intactas)
```

`CustomerProfile` permanece como está para o `variant="column"` (painel lateral) e para o uso dentro do visualizador de conversas. O `variant="page"` deixa de ser usado pela rota `$id` (pode ser mantido para compatibilidade ou removido se não houver outro consumidor — verificar antes de remover).

## Solução detalhada

### 1. Roteamento e shell (`app.clientes.$id.tsx` + `CustomerDetailPage.tsx`)
- `app.clientes.$id.tsx` passa a renderizar `<CustomerDetailPage customerId={id} />` sem o wrapper `max-w-3xl`.
- `CustomerDetailPage` reusa `useCustomerProfile(customerId)` para carregar o cliente (estados loading/notFound/error como hoje, no padrão do `CustomerProfile`).
- Layout raiz: `flex h-full min-h-0 flex-col overflow-y-auto bg-background`. Header full-bleed; corpo em `mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6`.

### 2. Header (`CustomerDetailHeader.tsx`)
- Conteúdo interno também no trilho `max-w-7xl` (alinha com o corpo), header full-bleed (`border-b bg-card`).
- **Breadcrumb** "Clientes › {nome}" com link de volta (`Link to="/app/clientes"`), `text-xs text-muted-foreground`.
- Avatar 64px (`display.bg/fg`), H1 com o nome (`getCustomerDisplay`), `ProfileBadges` + `PreConversionBadge`, `CoverageBanner`.
- Ações: **Criar orçamento** (mesma lógica `handleCreateQuote` do `ProfileHeader`) + `ProfileMenu`.
- Reaproveitar ao máximo a lógica do `ProfileHeader` existente (extrair se necessário, sem duplicar regras).

### 3. Faixa de stats (`CustomerStatStrip.tsx`)
- Full-width entre header e hero, no padrão de `VehicleTechSpecs`:
  - `grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden sm:grid-cols-3 lg:grid-cols-5`.
  - Célula: `bg-card px-4 py-3`; label `text-[10px] uppercase tracking-wide text-muted-foreground` com ícone; valor `text-sm` (tabular-nums em valores numéricos).
- Células: **Ticket médio · LTV · Recência · Frequência (orderCount12m) · ABC (classe + share)**.
- Fonte: `customer.purchaseStats`, `customer.lastPurchaseAt`, `customer.abcClass`, `customer.abcShare`. Fallback `—` quando ausente (cliente sem pedidos).
- Ícone + texto sempre presentes (nunca cor como único indicador).

### 4. Hero analítico (bento 12 colunas)
```
<div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
  <CustomerPurchaseEvolutionCard className="lg:col-span-6" />
  <CustomerRelationshipTimeline   className="lg:col-span-3" />
  <CustomerPendingActionsCard     className="lg:col-span-3" />
</div>
```
- `< lg`: 1 coluna, ordem gráfico → pendências → timeline.

#### 4a. `CustomerPurchaseEvolutionCard.tsx` (gráfico)
- `AreaChart` (recharts), padrão `SellerMiniChart`: `stroke=var(--primary)`, fill gradiente, `ResponsiveContainer`, `dot={false}`.
- Dados: pedidos do cliente (`useOrdersProvider().listByCustomer` ou equivalente usado por `CustomerOrdersList`) agregados por **mês** (últimos 12 meses), somando o total de pedidos pagos. Linha de referência opcional na média mensal.
- Header do card: título "Evolução de compras" + janela ("12 meses").
- Estado vazio: cliente sem pedidos → placeholder com hint.
- Respeitar `prefers-reduced-motion` (desabilitar animação do chart).

#### 4b. `CustomerRelationshipTimeline.tsx` (timeline)
- Timeline vertical (`border-l` + nós), nós em ordem cronológica:
  - **Cliente desde** — `firstPurchaseAt` (ou `createdAt` como fallback).
  - **Convertido de lead** — quando `convertedFromLeadAt` existe (com link/relação ao lead de origem; reusar a semântica do `PreConversionBadge`).
  - **Última compra** — `lastPurchaseAt` (+ "há N dias").
  - **Notas recentes** — 1–2 últimas `customer.notes` (autor + data), com "ver todas" levando à aba Notas.
- Cada nó: ícone + texto (nunca só cor). Estado vazio quando não há eventos.

#### 4c. `CustomerPendingActionsCard.tsx` (pendências)
- Card destacado: `bg-primary/5 border border-primary/40` (token-based, não hex).
- Linhas acionáveis (ícone + label + contagem + deep-link), ocultando as de contagem zero:
  - **Orçamentos abertos** — `quotesProvider.list({ customerId })` filtrando status `enviado`/`rascunho` → aba Orçamentos.
  - **Veículos aguardando aprovação** — `vehiclesProvider.list` por cliente, `cadastroStatus === "pendente"` → aba Veículos.
  - **Recomendações não vistas** — `recommendationsProvider.list({ subjectId, resolved:false, type: MVP_TYPES })` → aba Recomendações.
  - **Recompra atrasada** — heurística: recência (`daysSince(lastPurchaseAt)`) acima do intervalo médio de compra (derivado de `orderCount12m`); badge de alerta.
- Estado "tudo em dia" quando não há pendências (ícone check + mensagem positiva).
- Cada contagem usa `useQuery` próprio (lazy/independente), sem bloquear o render do resto da página.

### 5. Abas (reuso + ajuste mínimo na Visão geral)
- Renderiza `ProfileTabs` **intacto** abaixo do hero (mesmas 7 abas, mesmos providers, mesma navegação por ←/→).
- **Único ajuste:** `OverviewTab` recebe um `variant?: "column" | "page"` (default `column`):
  - `page`: grid 2 colunas no desktop (`md:grid-cols-2`) — ex. coluna 1 `CadastraisCard`; coluna 2 `StatusWalletCard` + `TagsCard` + `PortalCard` — e **oculta o `MetricsCard`** (a faixa de stats já cobre os KPIs, eliminando a duplicação).
  - `column`: comportamento atual (1 coluna, com `MetricsCard`).
- `ProfileTabs` precisa propagar esse `variant` até a `OverviewTab` (nova prop opcional `overviewVariant`).

### 6. Ritmo de espaçamento e tokens
- `space-y-6` entre seções (header → strip → hero → abas); `space-y-3`/`gap-3` interno aos cards.
- Padding de card unificado em `px-4 py-3` no estilo da faixa de veículos.
- **Somente tokens semânticos** (`bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-primary`, `bg-primary/5`…). Charts via `var(--primary)`/`var(--muted-foreground)`. Nunca hex nem `--gallo-*` diretos.

## Strings (i18n pt-BR — `customers/i18n/pt-BR.ts`)
Adicionar bloco para a página dedicada (todas com acentuação correta, UTF-8). Exemplos:
- `detail.breadcrumb`: "Clientes"
- `detail.openFullPage`: "Abrir página completa"
- `detail.evolution.title`: "Evolução de compras"
- `detail.evolution.window`: "12 meses"
- `detail.evolution.empty`: "Sem pedidos para exibir ainda."
- `detail.timeline.title`: "Relacionamento"
- `detail.timeline.customerSince`: "Cliente desde"
- `detail.timeline.convertedFromLead`: "Convertido de lead"
- `detail.timeline.lastPurchase`: "Última compra"
- `detail.timeline.empty`: "Sem eventos de relacionamento."
- `detail.pending.title`: "Pendências e ações"
- `detail.pending.openQuotes`: "Orçamentos abertos"
- `detail.pending.vehiclesToApprove`: "Veículos para aprovar"
- `detail.pending.unseenRecommendations`: "Recomendações"
- `detail.pending.overdueRepurchase`: "Recompra atrasada"
- `detail.pending.allClear`: "Tudo em dia com este cliente."

(Nomes finais podem ser ajustados na implementação; manter o padrão existente do arquivo.)

## Acessibilidade
- Hierarquia de headings `h1` (nome no header) → `h2` (títulos dos cards/seções) → `h3` (subtítulos internos).
- KPIs, status do timeline e pendências: ícone + texto + cor (cor nunca como único indicador).
- Botões de ícone (expandir, criar orçamento) com `aria-label`.
- Foco visível em todos os clicáveis; alvos de toque ≥ 44px.
- `prefers-reduced-motion` respeitado no `AreaChart` e em transições.
- Linhas/nós clicáveis com `cursor-pointer` e feedback de hover (`transition-colors`).

## Responsividade
- `≥ lg` (1024px+): faixa de stats 5 colunas; hero 6/3/3.
- `sm–lg`: faixa 3 colunas; hero empilha.
- `< sm`: faixa 2 colunas; tudo em 1 coluna. Sem scroll horizontal.

## Não-objetivos (fora de escopo)
- Sem mudança de modelo de dados, providers, RBAC ou rotas além de refazer `/app/clientes/$id`.
- Sem novos pacotes (recharts e Iconify já existem).
- Painel lateral (`variant="column"`) inalterado, exceto o novo botão "expandir".
- Abas exceto `OverviewTab` permanecem byte-a-byte iguais.
- Sem App-shell de rail fixo (Fase 2).

## Arquivos afetados
- `src/routes/app.clientes.$id.tsx` — renderiza `CustomerDetailPage`, remove `max-w-3xl`.
- `src/features/customers/pages/CustomerDetailPage.tsx` — **novo** shell da página.
- `src/features/customers/components/detail/CustomerDetailHeader.tsx` — **novo**.
- `src/features/customers/components/detail/CustomerStatStrip.tsx` — **novo**.
- `src/features/customers/components/detail/CustomerPurchaseEvolutionCard.tsx` — **novo**.
- `src/features/customers/components/detail/CustomerRelationshipTimeline.tsx` — **novo**.
- `src/features/customers/components/detail/CustomerPendingActionsCard.tsx` — **novo**.
- `src/features/customers/components/list/CustomersTable.tsx` — nome clicável → `onOpenDetail` com `stopPropagation`.
- `src/features/customers/pages/CustomersListPage.tsx` — passa `onOpenDetail` (navigate) à tabela.
- `src/features/customers/components/CustomerProfile.tsx` — botão "expandir" no header do `variant="column"` (ou em `ProfileHeader` condicionado ao variant).
- `src/features/customers/components/ProfileHeader.tsx` — possível ajuste para o botão expandir / extração de lógica reusada pelo `CustomerDetailHeader`.
- `src/features/customers/components/ProfileTabs.tsx` — propaga `overviewVariant`.
- `src/features/customers/components/tabs/OverviewTab.tsx` — prop `variant` (2 colunas + oculta MetricsCard no `page`).
- `src/features/customers/i18n/pt-BR.ts` — novas strings.

## Verificação
- `bun run build` (gate real — vite + tsc noEmit) deve passar.
- `bunx eslint` nos arquivos tocados, sem erros.
- `tsc --noEmit` filtrado aos arquivos tocados (o projeto tem erros pré-existentes não relacionados).
- Validação visual **manual pelo usuário** — não abrir browser/preview automaticamente para validar.

## Consistência
`max-w-7xl` casa com veículos/loja/catálogo/carrinho/produto (páginas operacionais ricas em conteúdo). O padrão faixa-de-stats + bento 12-col já foi aprovado no detalhe de veículos, garantindo coerência visual entre os detalhamentos da plataforma.
