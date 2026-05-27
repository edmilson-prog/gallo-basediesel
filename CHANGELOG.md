# Changelog

All notable changes to **GALLO BASE DIESEL** are documented here.
Format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [0.30.0] — Vitals · 2026-05-26

Sequência do Bloco 4a (Gestão A — Onda 2) com a **Carteira Analítica
(PRD-046)** — visão temporal e por estado da saúde da carteira,
distinta da Positivação (PRD-044, foco binário "comprou no mês?")
e da Curva ABC (PRD-045, foco ranking de receita). Aqui o ângulo é
*contínuo + comparativo temporal*: como a base está distribuída
entre ativo/dormente/recuperação/perdido, quantos clientes saíram
no período (churn), quantos voltaram (recovery) e quem está a
poucos dias de cair de status (em risco).

**Engine pura.** `calculatePortfolioMetrics(start, end, context)`
em `src/features/portfolio-analytics/engine/` é função sem efeitos
colaterais: agrupa clientes por `customer.status`, compara o
status reconstruído na borda inicial vs. final da janela (via
`lastPurchaseAt` + `lifecycleThresholds`) para tally de transições
(`activeToDormant`, `activeToLost`, `dormantToLost`, `dormantToActive`,
`lostToActive`), conta novos clientes criados na janela, identifica
listas `atRisk` lookahead 15 dias (ativos prestes a virar dormentes
e dormentes prestes a virar perdidos). Retorna ainda `bySeller` com
a mesma matemática restrita ao portfólio de cada vendedor, incluindo
um **Health Score composite 0-100** ponderando 50% ativos + 25%
recovery + 25% inverso de churn — exposto com qualitativo (Excelente
> 80, Bom 60-80, Atenção 40-60, Crítico < 40) via `describeHealthScore`.

**Hook agregador.** `usePortfolioMetrics({ window, scope })` carrega
clientes, pedidos pagos na janela, **histórico completo de pedidos
até a borda final** (necessário para reconstruir o status em cada
bucket mensal do gráfico evolutivo), vendedores e settings da loja
via 5 queries TanStack em paralelo. Delega ao engine e constrói
adicionalmente a série `evolution` — bucket mensal com contagem
de ativos/dormentes/perdidos no fim de cada mês entre `fromIso` e
`toIso`. `useSellerPortfolio` é o complemento drill-down: combina
um `usePortfolioMetrics` escopado num único vendedor com o registro
do próprio seller.

**Página principal.** `/app/gestao/carteira-analitica` substitui
ausência de rota anterior. Header de filtros (período: mês atual /
trimestre / semestre / YTD / **últimos 12 meses default** /
personalizado + loja + vendedor, com URL-sync). 7 KPIs no topo:
total da carteira, %ativos (verde), %dormentes (âmbar), %perdidos
(vermelho), churn no período, recovery, crescimento líquido. **Donut
chart Recharts** com 4 fatias (cores semânticas verde/azul/âmbar/
vermelho) + legenda lateral com contagem e %. **Gráfico evolutivo
temporal** multi-linha mostrando ativo/dormente/perdido ao longo
dos meses do período. **Card "Transições no período"** com 6 setas
coloridas (active→dormant, active→lost, dormant→lost, dormant→active,
lost→active, novos). **Tabela "Saúde por vendedor"** com 9 colunas
(avatar com iniciais, nome, tamanho da carteira, %ativos/%dormentes/
%perdidos coloridos, churn + taxa, recovery + taxa, **Health Score
badge** colorido por qualitativo, ação drill-down). **Duas listas
de risco** lado a lado: "Em risco iminente" (ativos próximos do
limite dormente) e "Em risco crítico" (dormentes próximos do limite
perdido), com colunas cliente/vendedor/última compra/dias restantes
coloridos por urgência + botões Contatar e Abrir ficha.

**Drill-down por vendedor.** `/app/gestao/carteira-analitica/$sellerId`
com guard de acesso (Vendedor só pode abrir o próprio drill;
acessos cruzados redirecionam para EmptyState). Header com nome do
vendedor + **Health Score badge** + card resumo de %ativos/churn/
recovery. Mesmas visualizações (KPIs, donut, evolução, transições)
filtradas. Lista de carteira completa com 5 tabs por status
(Todos / Ativos / Dormentes / Perdidos / Em recuperação — esta
última apenas quando count > 0), tabela paginada 20/página com
nome do cliente, status colorido, última compra, LTV e ações.

**Widget no Painel Gestor (PRD-014).** `<PortfolioHealthWidget />`
adicionado na seção lateral junto a Metas e Positivação (grade
agora `lg:grid-cols-3` em vez de 2). Mini-donut PieChart + KPI
%ativos + contadores de churn/recovery + link "Abrir análise".

**Permissões.** Página guardada por `requireAuth` aceitando Owner,
Gestor, Vendedor (auto-redirect para próprio drill-down) e
Financeiro. Gestor preso na loja atual via `gestorLockedStoreId`.
Tabela "Saúde por vendedor" oculta para Vendedor. Listas de risco
contêm PII — escopo respeita carteira.

### Added

- `src/features/portfolio-analytics/` — feature completa (engine
  puro, 2 hooks de dados, hook de filtros URL-sync, 9 componentes,
  2 páginas, i18n + barrel)
- Engine `calculatePortfolioMetrics` puro com tally de transições,
  health score composite e at-risk lookahead — exportado pelo barrel
- Helpers `calculateHealthScore` e `describeHealthScore` para
  qualitativo (excelente/bom/atenção/crítico)
- Hook `usePortfolioMetrics` — 5 queries TanStack + engine + série
  temporal mensal reconstruída do histórico de pedidos
- Hook `useSellerPortfolio` — drill-down escopado em um vendedor
- Hook `usePortfolioFilters` — URL-sync com presets mês/trim/sem/
  YTD/12m + custom + loja + vendedor
- Componentes `PortfolioHeader`, `PortfolioKpis` (7 KPIs com accents
  semânticos), `PortfolioDistributionChart` (donut), `PortfolioEvolutionChart`
  (linhas multi-status), `PortfolioTransitionsCard`, `PortfolioBySellerTable`
  (9 colunas), `PortfolioRiskList`, `PortfolioHealthBadge`, `CustomerPortfolioList`
  (paginada por status), `PortfolioHealthWidget` (PRD-014)
- Rotas `/app/gestao/carteira-analitica` e
  `/app/gestao/carteira-analitica/$sellerId`
- Item de navegação "Carteira Analítica" (mdi:heart-pulse) no menu
  Gestão para os 4 roles
- Constante `ROUTES.GESTAO_CARTEIRA_ANALITICA`

### Changed

- Painel Gestor (PRD-014): grade da seção "Metas / Positivação /
  Saúde da carteira" passa de `lg:grid-cols-2` para `lg:grid-cols-3`
  acomodando o `<PortfolioHealthWidget />`

### Notas

- Drill-down do vendedor reusa o `usePortfolioMetrics` com escopo
  `sellerId`, mantendo a matemática centralizada
- Série evolutiva reconstrói status em cada bucket mensal a partir
  do `lastPurchaseAt` projetado — `recuperacao` é projetado apenas
  no último bucket por não haver audit trail histórico no mock
- Marco: Bloco 4a (Gestão A) fechado com Vendas + Metas + Cockpit +
  Positivação + ABC + Carteira Analítica

## [0.29.0] — Pareto · 2026-05-26

Continuação do Bloco 4a (Gestão A — Onda 2) com a **Curva ABC
(PRD-045)** — classificação automática de clientes via princípio
de Pareto, com detecção de migrações e drill-down por classe.
A rota `/app/gestao/abc`, antes placeholder Owner-only, vira
página completa para Owner, Gestor, Vendedor (escopo próprio) e
Financeiro, com KPIs, gráfico Pareto icônico, banners de migração
e admin dedicado para tunar os limites.

Inclui também **dois bug fixes runtime-críticos** em código
shippado nas versões 0.27.0 (Cockpit) e 0.28.0 (Coverage): o
contrato `IPaginatedResult` usa o campo `data`, não `items`. Os
hooks `useCockpitMetrics` e `usePositivationMetrics` estavam
acessando `.data?.items` que sempre retornava `undefined`, fazendo
as páginas renderizarem com dados vazios. `vite build` usa esbuild
sem `tsc` então a quebra de tipos passou despercebida. Mesma
correção aplicada para `seller.name` → `seller.fullName`. As
páginas Cockpit e Positivação agora funcionam de verdade. Bugs
equivalentes em `goals` e `sales-analytics` permanecem pendentes
para PR de cleanup separado.

**Engine pura.** `classifyABC(start, end, context)` em
`src/features/abc-curve/engine/` é função sem efeitos colaterais:
agrega receita por cliente nos pedidos pagos do período, ordena
desc, calcula participação cumulativa e classifica conforme os
cutoffs (defaults 80% e 95%). Devolve `byClass` (3 buckets com
contagem, receita e %), `records` (lista ranqueada com classe e
cumulativa), `classByCustomerId` (lookup rápido). `detectMigrations`
compara duas classificações por customerId e emite `subiu`, `caiu`,
`manteve`, `novo` ou `saiu`, com buckets dedicados para "subiu
para A", "caiu de A" e "novos em A".

**Hook agregador.** `useABCClassification({ window, previousWindow,
scope })` carrega clientes, pedidos current/previous e settings
da loja via 4 queries TanStack em paralelo, delega ao engine,
e suporta `settingsOverride` para a página admin pré-visualizar
mudanças sem persistir. Inteiramente compatível com filtros
URL-sync de período (3/6/12/24m + custom) e escopo
loja/vendedor.

**Página principal.** `/app/gestao/abc` com header de filtros +
5 KPIs (total classificados, receita do período, cards A/B/C
clicáveis com contagem + receita + %) + banners de migração
(verde = subiu, vermelho = caiu, azul = novo em A) + gráfico Pareto
Recharts (`ComposedChart` com barras coloridas por classe + linha
cumulativa + `ReferenceLine`s nos cutoffs A/B com label) + tabela
dos top 25 contribuintes com badge de classe, vendedor, receita,
% acumulada, migração e drill-down para a ficha do cliente.

**Drill-down por classe.** `/app/gestao/abc/$class` com guard de
classe válida (`A`/`B`/`C` apenas, redireciona com `EmptyState` se
inválido), 3 KPIs específicos da classe (count, receita, %),
tabela completa paginada (25/página) com a mesma estrutura da
tabela do top + colunas de migração coloridas.

**Admin.** `/app/configuracoes/curva-abc` (Owner-only) substitui
a ausência de sub-rota anterior. Sliders para periodMonths (3-24),
classAThreshold (70-90%) e classBThreshold (90-99%) com validação
de ordem (B precisa ser > A). Card de pré-visualização live mostra
3 mini-cards (A/B/C) com a contagem atual vs nova e Δ colorido.
Botão "Recalcular agora" invalida o cache do TanStack Query
forçando re-fetch. Save persiste via `usePlatformSettings` (que
já grava audit log automaticamente — `action='settings.abcCurve.update'`).

**Settings extensíveis.** Nova interface `IABCCurveSettings`
adicionada a `IPlatformSettings` com defaults (12m, 80%, 95%)
seedados em `seedStore.ts` para a Matriz.

**Permissões.** Rota guardada por `requireAuth` aceitando Owner,
Gestor, Vendedor (escopo próprio automaticamente) e Financeiro.
Vendedor não vê classificação de clientes alheios — o filtro de
seller no scope vira no-op travado em `sellerId` próprio. Config
admin é Owner-only.

**Sidebar.** Item "Curva ABC" agora visível para os 4 roles
(antes só Owner). Item config "Curva ABC" precisa ser plugado
no menu de admin-settings — adiado pois o submenu é complexo;
acesso por URL direta funciona.

### Added

- `src/features/abc-curve/` — feature completa (2 engines puros,
  2 hooks, 5 componentes, 3 páginas, utils + i18n + barrel)
- Engine `classifyABC` + `detectMigrations` puros, exportados pelo
  barrel para que Cockpit/PRD-040 e Goals/PRD-042 possam plugar
  no futuro (swap dos stubs)
- Hook `useABCClassification` — 4 queries TanStack em paralelo +
  delega aos engines + suporta `settingsOverride` para preview
- Hook `useABCFilters` — URL-sync com presets 3/6/12/24m + custom +
  store + seller
- Componentes `ABCHeader`, `ABCKpis`, `ParetoChart` (ComposedChart
  com ReferenceLines nos cutoffs), `MigrationBanners`,
  `ABCCustomersTable`
- Páginas `ABCCurvePage`, `ABCClassPage` (drill-down `/$class`) e
  `ABCSettingsPage` (admin)
- Rotas `/app/gestao/abc` (substitui placeholder),
  `/app/gestao/abc/$class` (nova) e `/app/configuracoes/curva-abc`
  (nova, Owner-only)
- Tipo `IABCCurveSettings` em `IPlatformSettings` + seed default
  (12m, 80/95) em `seedStore.ts`

### Fixed

- **Cockpit (PRD-040) e Positivação (PRD-044)**: hooks acessavam
  `query.data?.items` mas o contrato `IPaginatedResult` usa `data`.
  Correção: `query.data?.data`. Sem isso as páginas renderizavam
  vazias em runtime mesmo sem erro visível. `vite build` não roda
  `tsc` (apenas esbuild) então o bug passou pelo gate de release
- **Cockpit e Positivação**: `seller.name` não existe em `ISeller`
  (é `fullName`). Correção: usar `fullName`. Sem isso o label de
  vendedor renderizava "—" em toda a UI
- Validação `userRole !== undefined` substituída por
  `userRole !== null` (o auth provider devolve `RoleName | null`,
  não `undefined`)
- Vários ajustes TS-only nos hooks de filters e gráficos do
  Cockpit (typing de `prev` em `navigate.search`, fallback em
  destructure de `value.split("-")`)

### Changed

- Sidebar: "Curva ABC" agora visível para Owner, Gestor,
  Vendedor e Financeiro

### Notes

- Item "Curva ABC" no submenu de admin-settings (sidebar
  Configurações → Atendimento/Distribuição/…) não foi plugado
  porque a sidebar de config tem estrutura própria; acesso por
  URL `/app/configuracoes/curva-abc` funciona
- Bugs equivalentes ao `.items`/`.fullName` ainda existem em
  `goals/hooks/useGoals*`, `sales-analytics/hooks/useSales*` e
  `manager-dashboard/hooks` — não corrigidos neste PR para manter
  escopo focado em PRD-045. Painel Gestor, Vendas, Metas e
  Goals widget continuam silenciosamente exibindo dados vazios
  até o cleanup
- Recálculo agendado diário (RF-018) usa apenas botão manual no
  admin (`Recalcular agora` invalida cache). Edge Function de
  cron fica para Fase 2

---

## [0.28.0] — Coverage · 2026-05-26

Reabertura do Bloco 4a (Gestão A — Onda 2) com o sistema de
**Positivação (PRD-044)** — o painel que finalmente responde a
pergunta "quem da minha carteira ainda não comprou este mês?".
A rota `/app/gestao/positivacao`, antes placeholder Owner-only,
vira página completa para Owner, Gestor, Financeiro e Vendedor
(escopo próprio), com KPIs, gráfico evolutivo, drill-down por
vendedor, lista de não-positivados, lista de clientes em risco
de virarem dormentes, e widget compacto no Painel Gestor.

**Engine pura.** `calculatePositivation(start, end, context)` em
`src/features/positivation/engine/` é função sem efeitos
colaterais: recebe clientes, pedidos pagos no período, vendedores
e o `dormantDays` configurável (PRD-019 lifecycle thresholds),
devolve a base elegível (clientes ativos), o conjunto de
positivados (clientes com ao menos 1 `IOrder` `pago` com `paidAt`
no período), a taxa de positivação, a projeção linear capeada na
base, o breakdown por vendedor com taxa individual e a lista de
clientes em risco (cujo `lastPurchaseAt + dormantDays - now ≤ 15
dias`). Determinística com `now` injetável para testes.

**Hook agregador.** `usePositivationMetrics({ window, previousWindow,
scope })` carrega clientes, pedidos current/previous, vendedores
e configurações do store via 5 queries TanStack em paralelo,
delega ao engine, e devolve métricas + previousMetrics + tendências
calculadas via `computeTrend` (positivado/taxa = maior é melhor;
churn/em risco = menor é melhor) + série diária para o gráfico
de evolução. Reativo a mudanças no provider de pedidos.

**Página principal.** `/app/gestao/positivacao` com header de
filtros (período: mês atual/mês anterior/trimestre/YTD/custom,
loja, vendedor — todos URL-sync) + 5 KPIs no topo (base, positivados,
taxa, projeção, em risco) + gráfico Recharts de linha cumulativa
vs proporcional + tabela "Por vendedor" (oculta para Vendedor) com
drill-down clicável + duas listas paginadas (30/página) de clientes:
não-positivados e em risco. Cada cliente tem botão "Contatar"
(placeholder — abre `/app/atendimento` com nome pré-filtrado via
`?q=`) e "Abrir ficha" (vai para `/app/clientes/$id`).

**Drill-down.** `/app/gestao/positivacao/$sellerId` mostra a
carteira completa do vendedor com 4 abas (Todos / Positivados /
Não positivados / Em risco) + KPIs específicos. Vendedor só
consegue abrir o próprio drill-down (Gestor e Owner veem qualquer
um); tentativa de URL direta cai em `EmptyState` de acesso negado.

**Widget no Painel Gestor.** `<PositivationWidget />` plugado no
`/app/inicio` ao lado do `<GoalsWidget />` — KPI compacto da taxa
do mês com barra de progresso inline + projeção fim de mês + link
"Abrir" para a página completa.

**Permissões.** Rota guardada por `requireAuth` aceitando Owner,
Gestor, Vendedor e Financeiro. Vendedor é automaticamente travado
no próprio `sellerId` (filtro de vendedor vira no-op) e na própria
loja. Gestor é travado na própria loja. Owner livre cross-store.
Sidebar atualizada para refletir o novo escopo de roles.

### Added

- `src/features/positivation/` — feature completa (engine puro,
  3 hooks, 5 componentes, 2 páginas, i18n PT-BR e barrel)
- Engine `calculatePositivation` em `src/features/positivation/engine/`
  com `IPositivationMetrics`, `ISellerPositivation`, `IAtRiskCustomer`
- Hook `usePositivationMetrics` — agregador via 5 queries TanStack +
  delega ao engine + tendências vs período anterior + série diária
- Hook `usePositivationFilters` — URL-sync com 4 presets (mês atual,
  anterior, trimestre, YTD) + custom, loja, vendedor
- Componentes `PositivationHeader`, `PositivationKpis`,
  `PositivationEvolutionChart` (Recharts), `PositivationBySellerTable`,
  `CustomerListCard` (paginação client-side), `PositivationWidget`
- Páginas `PositivationPage` e `SellerPositivationPage`
- Rotas `/app/gestao/positivacao` (substitui placeholder) e
  `/app/gestao/positivacao/$sellerId`
- Widget `<PositivationWidget />` plugado em `ManagerDashboardPage`
  (PRD-014) ao lado do `GoalsWidget`

### Changed

- Sidebar: item "Positivação" agora visível para Owner, Gestor,
  Vendedor e Financeiro (antes só Owner)
- `app.gestao.positivacao.tsx` substitui o `PlaceholderPage` pela
  página real, com guard de roles ampliado

### Notes

- Botão "Contatar" é placeholder do MVP — navega para `/app/atendimento`
  com nome do cliente pré-filtrado via search params. Criação de
  nova conversa direta com cliente fica para PRD-100 / Fase 2
- Filtro "Positivado este mês" / "Não positivado este mês" em
  `/app/clientes` (PRD-015 RF-021) fica para próxima iteração —
  exige refactor da paginação server-side para suportar
  post-filtering consistente
- Engine `usePositivationMetrics` está pronto para ser plugado no
  Cockpit (PRD-040) e na engine de metas (PRD-042) para substituir
  os stubs atuais — feito em PR posterior para isolar risco

---

## [0.27.0] — Cockpit · 2026-05-26

Encerramento provisório do Bloco 4 (Gestão e BI — Onda 2) com a
**Visão Executiva (PRD-040)** — o cockpit estratégico do Owner.
A rota `/app/gestao`, antes placeholder, vira o "mapa em uma
tela" da empresa: 12 KPIs de alto nível com sparklines e tendência
vs período anterior (ou ano anterior), 4 gráficos macro,
comparativo lado a lado e banner de alertas executivos calculados
em runtime.

**Cockpit (PRD-040).** A página `ExecutiveCockpitPage` agrega
métricas de PRDs 041 (vendas), 042 (metas), 032 (pedidos), 031
(orçamentos) e 015 (clientes) através do hook `useCockpitMetrics`.
PRDs 044 (positivação), 045 (ABC), 046 (carteira), 047 (comissões)
e 049 (rentabilidade) entram como stubs computados a partir dos
dados já disponíveis — positivação derivada de pedidos/clientes
ativos, ABC reconstruída em runtime via Pareto 80/95, comissões
estimadas em 3,5% do faturamento, margem média via `marginValue`
real dos pedidos com fallback para 32%. Quando os PRDs analíticos
forem implementados, basta plugar os hooks reais — o contrato do
agregador não muda.

Os 12 KPIs cobrem: faturamento, ticket médio, total de pedidos,
margem estimada, clientes ativos, positivação, churn do período,
novos clientes, pipeline aberto (orçamentos enviados+aceitos
não convertidos), conversão orçamento→pedido, comissões a pagar
e NPS (card "em breve"). Cada card renderiza tendência colorida
(verde = melhorou, vermelho = piorou), sparkline de 12 meses
quando relevante, badge `Estimativa` para os que dependem de PRDs
pendentes, e drill-down clicável para a página detalhada
correspondente.

**Gráficos macro.** ComposedChart de 12 meses combina área de
faturamento (eixo esquerdo, em BRL) e linha de pedidos (eixo
direito, contagem). Donut compacto da saúde da carteira (ativo /
dormente / recuperação / perdido) com cores semânticas das
submarcas GALLO. Bar horizontal dos top 5 vendedores por
faturamento. Mini gráfico de barras da curva ABC mostrando
participação de receita por classe + contagem de clientes. Todos
clicáveis para a página detalhada correspondente quando ela
existe (vendas, clientes, ABC) ou navegação para placeholder.

**Comparativo lado a lado.** Card no fim da página com 3 linhas
(faturamento, pedidos, ticket médio) mostrando valor atual,
anterior e Δ% colorido por direção e por melhora/piora. Funciona
para ambos os modos de comparação — período anterior ou mesmo
mês no ano anterior — controlado pelo dropdown no header.

**Alertas executivos.** Hook `useCockpitAlerts` calcula 4 tipos
de alerta a partir das métricas + metas ativas: churn subiu
≥ 20% vs período anterior (vermelho), 3+ metas críticas com
< 50% atingido e ≤ 7 dias restantes (amarelo), faturamento médio
< 70% da meta agregada (vermelho), conversão de orçamentos < 15%
(amarelo). Cada alerta é dispensável (estado em memória, perdido
no reload) e tem CTA para a página correspondente.

**Filtros URL-sincronizados.** Período (mês/trimestre/YTD/
personalizado), loja (Owner livre, Gestor travado na própria loja)
e base de comparação (período anterior ou ano anterior). O escopo
da loja viaja para todos os 7 queries TanStack via chave de cache,
garantindo invalidação correta ao trocar.

**Permissões.** Rota guardada por `requireAuth` aceitando Owner,
Gestor e Financeiro. Vendedor é bloqueado e redirecionado para
`/sem-permissao` no nível da rota; mesmo se acessar via URL
direta, o `EmptyState` interno na página oferece fallback gracioso.
Navegação atualizada: "Visão executiva" no menu lateral agora
aparece para Owner, Gestor e Financeiro.

**Performance.** 7 queries em paralelo (orders current/previous/
12m, quotes current/previous, customers, sellers) com `staleTime`
de 30s. Cards memoizados; séries derivadas via `useMemo` com
dependências granulares. Tooltips dos KPIs explicam a base
comparativa.

### Added

- `src/features/executive-cockpit/` — feature completa (page,
  3 hooks, 4 charts, 4 componentes auxiliares, i18n PT-BR e
  barrel `index.ts`)
- Rota `/app/gestao` agora renderiza `ExecutiveCockpitPage` com
  `validateCockpitSearch` para filtros via URL
- Hook `useCockpitMetrics` — agregador de 11 KPIs + séries de
  12 meses + saúde da carteira + top vendedores + ABC compacta,
  com stubs para PRDs 044/045/046/047/049 ainda pendentes
- Hook `useCockpitFilters` — período (mês/trim/YTD/custom),
  loja e base de comparação (período anterior ou YoY), tudo
  URL-sincronizado
- Hook `useCockpitAlerts` — 4 categorias de alerta executivo
  com dispensa em memória
- Componente `<ExecutiveKpiCard>` — variante do KpiCard com
  sparkline Recharts, tag opcional ("Estimativa"/"Em breve") e
  drill-down clicável
- Componentes `<RevenueOrdersComposedChart>`,
  `<PortfolioMiniDonut>`, `<TopSellersBar>`, `<ABCMiniChart>` —
  4 gráficos macro do cockpit

### Changed

- Sidebar: item "Visão executiva" agora visível para Owner,
  Gestor e Financeiro (antes só Owner)
- `app.gestao.index.tsx` substitui o `PlaceholderPage` pela página
  real do cockpit, com guard de roles ampliado

### Notes

- PRDs 044/045/046/047/049 ainda não implementados. Os valores
  exibidos no cockpit para esses domínios são derivados em runtime
  pelo próprio hook — quando os PRDs reais entrarem, basta trocar
  o cálculo interno pelo hook canônico sem mudar a API do agregador
- NPS exibido como card "Em breve" (placeholder de Fase 2)
- Personalização de widgets via botão no header é placeholder
  com tooltip "Disponível na Fase 2"

---

## [0.26.0] — Pulse · 2026-05-26

Continuação do Bloco 4 (Gestão e BI — Onda 2). Após a análise de
vendas (PRD-041), a plataforma ganha o sistema de gestão de metas
comerciais (PRD-042) — o cérebro que conecta o que está vendendo
à expectativa do mês, individual e da loja, com tracking em tempo
real. Resolve três dores: vendedor não sabia onde estava no meio
do mês, gestor descobria atrasos só no dia 28, e PRDs futuros
(comissões, gamificação) não tinham base mensurável.

**Metas (PRD-042).** A rota `/app/gestao/metas`, antes placeholder
Owner-only, vira uma página dual-mode: Vendedor vê apenas os cards
das próprias metas com barra de progresso e dias restantes;
Gestor/Owner/Financeiro vêm o dashboard agregado com 4 KPIs (metas
ativas, % média, heroes ≥ 100%, atenção < 70%), filtros URL-
sincronizados (tipo, escopo, status, vendedor, loja, período),
tabela completa com barra inline, gráfico de barras por vendedor
e abas Ativas / Histórico. Suporta 5 métricas no MVP (revenue,
ticket_medio, tickets, positivacao, novos_clientes) + 3 dormentes
(margin, recovery, conversion).

A página `/app/gestao/metas/nova` traz formulário de 4 seções
(configuração, escopo, valor, recompensa) com sugestão inteligente
de target baseada no histórico ("período anterior R$ X, alcançou
Y% → sugestão R$ X×1.05"). A página `/app/gestao/metas/:id`
oferece header com ações (editar/cancelar restritos a Owner/Gestor),
resumo de progresso com projeção linear, gráfico evolutivo com
linha realizada vs esperada (proporcional ao período), composição
clicável (pedidos contribuintes para metas de revenue/tickets;
clientes positivados para positivacao; clientes novos para
novos_clientes; estatísticas min/median/max/std para ticket_medio)
e histórico de mudanças via audit log.

Mudança de target em meta ativa exige checkbox de confirmação
explícito sobre impacto em comissões (PRD-047). Cancelamento exige
motivo. Hook `useGoalAutoStatusUpdate` roda uma vez por sessão
(throttled a 24h via localStorage) transicionando metas vencidas
para `concluida` ou `arquivada` conforme atingimento. Hook
`useGoalMilestoneToast` dispara toast quando o vendedor cruza
50/80/100% (guardado em localStorage para não repetir). Widget
"Metas do mês" injetado no Painel Gestor (PRD-014) lista as 5
metas com menor progresso primeiro — as que mais precisam de
atenção.

O tipo `IGoal` em `src/shared/types/bi.ts` foi estendido com os
campos do PRD-042 (`name?`, `status?`, `sellerId?`,
`rewardDescription?`, `createdBy?`, `cancelReason?`) mantendo
back-compat. `GoalMetric` foi ampliado com `ticket_medio` e
`novos_clientes`. Gerador de mocks reescrito para popular os novos
campos e gerar ~25 metas (5 meses de histórico + período corrente

- 1 cancelada).

### Added

- **Feature `goals`** (`src/features/goals/`):
  - `pages/GoalsPage.tsx`: entry com renderização condicional por
    role.
  - `pages/NewGoalPage.tsx`: 4 seções de formulário com sugestão
    inteligente e validações.
  - `pages/GoalDetailPage.tsx`: header + resumo + chart + composição
    - histórico.
  - `engine/calculate.ts`: função pura `calculateGoalProgress` para
    5 métricas + fallback ao snapshot para `recovery`/`conversion`.
  - `engine/projection.ts`: `describePeriodWindow` e
    `computeProjection` (linear, cap 200%).
  - `engine/suggestion.ts`: `suggestTarget` (mês anterior × 1.05
    com fallback metric-default).
  - `hooks/useGoalsWithProgress.ts`: agregador `useQueries` único
    que evita N+1.
  - `hooks/useGoalProgress.ts`: progress de uma meta única.
  - `hooks/useSellerGoals.ts`, `useStoreGoals.ts`,
    `useGoalsStatistics.ts`: wrappers para consumo externo (PRDs
    043/047 futuros).
  - `hooks/useGoalsFilters.ts`: URL sync com 7 filtros
    (tab + 6 dimensões) + `validateGoalsSearch`.
  - `hooks/useGoalAutoStatusUpdate.ts`: transição automática
    throttled a 24h por sessão.
  - `hooks/useGoalMilestoneToast.ts`: toasts em 50/80/100%
    guardados em `localStorage`.
  - `components/`: `GoalCard`, `GoalProgressBar`,
    `GoalStatusBadge` (modes progress|lifecycle), `GoalTypeBadge`,
    `IndividualGoalsDashboard`, `AggregatedGoalsDashboard`,
    `GoalKpiRow`, `GoalsFiltersBar`, `GoalsTable`,
    `SellerProgressBarChart` (Recharts com cores semáforo),
    `EditGoalModal` (com checkbox de confirmação em mudança de
    target), `CancelGoalDialog` (motivo obrigatório).
  - `components/detail/`: `GoalDetailHeader`,
    `GoalProgressSummary`, `GoalEvolutionChart` (LineChart
    realizado vs esperado), `GoalCompositionSection`
    (renderização condicional por métrica),
    `GoalHistorySection`.
  - `components/widget/GoalsWidget.tsx`: card compacto para o
    Painel Gestor.
  - `utils/`: `labels.ts` (metric/level/status icons + labels),
    `formatGoalValue.ts` (currency/count/percent), `validation.ts`
    (form rules + `defaultPeriodRange`), `composition.ts`
    (`buildEvolutionSeries`, `getContributingOrders`,
    `getPositivatedCustomers`, `getAcquiredCustomers`,
    `getTicketStats`).
  - `i18n/pt-BR.ts`: strings UI completas.

- **Tipos goals** (`src/shared/types/goals.ts`): `IGoalProgress`,
  `GoalProgressStatus` (no_caminho|atencao|atrasada|concluida),
  `GoalProgressTrend` (subindo|estavel|caindo).

- **Rotas**:
  - `src/routes/app.gestao.metas.nova.tsx` (Owner/Gestor only).
  - `src/routes/app.gestao.metas.$id.tsx` (Owner/Gestor/Vendedor/
    Financeiro com guard por scope).

### Changed

- **Tipo `IGoal`** (`src/shared/types/bi.ts`): novos campos
  opcionais (`name`, `status`, `sellerId`, `rewardDescription`,
  `createdBy`, `cancelReason`) — back-compat com mocks existentes.
  Novo tipo de status `GoalStatus` exportado.
- **Tipo `GoalMetric`**: amplia com `ticket_medio` e
  `novos_clientes`.
- **Gerador `src/mocks/generators/goal.ts`**: gera ~25 metas com
  mix de status (ativa/concluida/arquivada/cancelada) + 5 meses
  de histórico + cancelada com motivo.
- **Rota `/app/gestao/metas`** (`src/routes/app.gestao.metas.tsx`):
  troca `PlaceholderPage` por `<GoalsPage />`, amplia roles para
  Owner/Gestor/Vendedor/Financeiro, instala
  `validateSearch: validateGoalsSearch`.
- **Painel Gestor** (`src/features/manager-dashboard/pages/
ManagerDashboardPage.tsx`): injeta `<GoalsWidget />` entre o
  heatmap e a saúde da carteira.
- **Navigation** (`src/features/shell/config/navigation.ts`):
  amplia roles dos itens "Vendas" e "Metas" para os 4 perfis com
  acesso a indicadores.

## [0.25.0] — Insight · 2026-05-26

Abertura do Bloco 4 (Plataforma de Gestão e BI — Onda 2) com a
análise detalhada de vendas (PRD-041). A rota `/app/gestao/vendas`,
que era placeholder restrita ao Owner, vira um dashboard analítico
multidimensional liberado para Owner, Gestor, Vendedor e Financeiro
— cada perfil enxerga o escopo permitido sem precisar mudar a UI.
A página entrega o cérebro analítico que o João Gallo pedia: o que
está vendendo, qual categoria cresce, qual marca de veículo puxa
receita, quais clientes geram valor e onde o funil leak.

**Vendas — Análise Detalhada (PRD-041).** Página única em
`/app/gestao/vendas` com header de filtros globais (período preset
ou custom, loja, vendedor, categoria de peça, marca de veículo e
canal) sincronizados com a URL e 4 abas: Visão Geral, Produtos,
Clientes e Funil. KPIs (faturamento, pedidos pagos, ticket médio,
margem média) reaproveitam o `KpiCard` do painel-gestor com trend
badge versus período anterior. Quatro gráficos macro na Visão Geral
(linha temporal 12 meses, distribuição por categoria, barras por
marca de veículo, pizza por canal) com tooltips ricos e click-to-
filter quando aplicável. Card de sazonalidade dispara quando a
variação year-over-year do mês corrente passa de 25%. Aba Produtos
traz top 20 vendidos com tendência vs período anterior e seção
dedicada para produtos em queda > 30%. Aba Clientes top 20 com
classe ABC heurística (placeholder até PRD-045), ticket médio e
indicador novos vs recorrentes em barras paralelas. Aba Funil é um
funil custom (Recharts limita) com 5 etapas (leads → qualificados
→ orçamentos enviados → aceitos → pedidos pagos), conversão por
etapa e destaque automático do gargalo (queda < 70%). Drill-downs
universais: produto navega para a ficha do catálogo, cliente para
a ficha do cliente, etapas do funil para as listas correspondentes.
Permissões resolvidas no escopo das queries: Owner vê cross-store,
Gestor trava no `currentStore`, Vendedor enxerga apenas pedidos do
próprio `sellerId` (campos travados no header).

### Added

- **Feature `sales-analytics`** (`src/features/sales-analytics/`):
  - `pages/SalesAnalyticsPage.tsx`: entry com guardas de role,
    resolução de escopo (storeId / sellerId) e composição das 4
    abas.
  - `hooks/useSalesFilters.ts`: filtros URL-sincronizados, com
    `resolveSalesWindow()` (current vs previous) cobrindo 7 presets
    (today / yesterday / 7d / 30d / 90d / ytd / custom) e travas
    para Gestor (store) e Vendedor (seller).
  - `hooks/useSalesAnalytics.ts`: agregador principal — carrega
    orders (current + previous + 12 meses), customers, parts e
    sellers em paralelo via `useQuery`, calcula KPIs com tendência,
    série mensal, breakdowns (categoria, marca de veículo, canal),
    top 20 produtos com trend, top 20 clientes com ABC heurístico,
    produtos em queda, novos vs recorrentes e snapshot de
    sazonalidade YoY.
  - `hooks/useFunnelMetrics.ts`: funil lead → qualificado →
    orçamento enviado → aceito → pedido pago com taxa de conversão
    por etapa e detecção automática de gargalo.
  - `components/SalesHeader.tsx`: header com 6 dropdowns de filtros
    (período, loja, vendedor, categoria, marca, canal) + badge de
    contagem ativa e botão de reset.
  - `components/SalesKpiRow.tsx`: 4 KPIs reaproveitando `KpiCard`
    do painel-gestor.
  - `components/SeasonalityCard.tsx`: card destaque ano-versus-ano.
  - `components/ProductsInDeclineCard.tsx`: lista de produtos com
    queda > 30%.
  - `components/NewVsRecurringCard.tsx`: barras paralelas de share.
  - `components/charts/`: `RevenueOverTimeChart` (linha 12 meses),
    `CategoryBarChart` (barras horizontais com filter onClick),
    `VehicleBrandBarChart`, `ChannelPieChart` (donut + legenda),
    `FunnelChart` (custom 5 etapas com bottleneck).
  - `components/tables/`: `TopProductsTable` e `TopCustomersTable`
    com navegação para fichas existentes.
  - `components/tabs/`: `SalesOverviewTab`, `SalesProductsTab`,
    `SalesCustomersTab`, `SalesFunnelTab`.
  - `utils/aggregations.ts`: `groupBy`, `sumBy`, `trendPct`,
    `percentOfTotal`, `topN`, `bucketByMonth`, `last12MonthKeys`.
  - `utils/seasonality.ts`: `computeSeasonalitySignal` (YoY
    threshold 25%) + `formatMonthKey`.
  - `i18n/pt-BR.ts`: strings UI.

### Changed

- **Rota `/app/gestao/vendas`** (`src/routes/app.gestao.vendas.tsx`):
  substitui o `PlaceholderPage` por `<SalesAnalyticsPage />`,
  amplia `requireAuth` para Owner / Gestor / Vendedor / Financeiro
  e instala `validateSearch: validateSalesSearch` para preservar
  filtros copiados/colados.

## [0.24.0] — Logistics · 2026-05-26

Fechamento do Bloco 3 (Comercial Operacional) com duas entregas
encadeadas: Pedido (PRD-032) materializa o ciclo pós-orçamento e
Frete (PRD-033) centraliza o cálculo de envio que vinha duplicado
em três features.

**Pedido (PRD-032).** Lista paginada em `/app/pedidos` com filtros
de status (pagamento e fulfillment), origem, vendedor, cliente,
período e faixa de valor, mais URL sync e indicadores visuais
contextuais. Ficha em `/app/pedidos/:id` com seções de cliente,
items (snapshots imutáveis), pagamento, entrega, histórico e
referência cruzada ao orçamento de origem. Conversão automática
quando um orçamento `aceito` vira `IOrder`, preservando `quoteId`
para auditoria. Integração com `IVehicle`: items aplicados em
veículos registram o serviço no histórico (PRD-016) e atualizam
quilometragem. Geradores produzem pedidos com mix realista de
status de pagamento e fulfillment.

**Frete (PRD-033).** Função pura `calculateShipping()` em
`src/features/shipping/api/` substitui `calculateShippingPlaceholder`
do PRD-022 e os stubs implícitos nos PRDs 031 e 032. Três estratégias
configuráveis (`fixed_by_region` default, `to_negotiate_default`,
`preliminary_by_weight`) com match por especificidade
(cidade → estado → múltiplos estados → nacional) e fallback
configurável quando nenhuma regra casa. Painel admin
`/app/configuracoes/frete` (Owner edita, Gestor visualiza) com
quatro seções: seleção de estratégia, CRUD de regras em tabela
editável com modal, simulador interativo para validar antes de
salvar e card placeholder informando sobre a integração com
transportadoras na Fase 2. Configurações centralizadas em
`IPlatformSettings.shipping` substituem `sdrShippingPlaceholder`,
o card "Frete placeholder" da página de SDR foi trocado por um
link para a nova rota e o `NewQuotePage` ganhou o botão "Calcular"
que usa o endereço do cliente para pré-preencher o campo de frete.

### Added

- **Feature `shipping`** (`src/features/shipping/`):
  - `api/calculate.ts`: função pura `calculateShipping(input)` com
    match por especificidade, sobretaxa por peso opcional e três
    razões de fallback (`missing_address`, `no_active_rules`,
    `no_match_negotiate`/`fixed`).
  - `config/defaults.ts`: `DEFAULT_SHIPPING_CONFIG` com 3 regras
    iniciais (Frederico Westphalen R$ 50 / RS R$ 80 / SC + PR R$ 120)
    e fallback "a combinar".
  - `pages/ShippingConfigPage.tsx`: painel admin completo com 4
    seções (estratégia, regras, simulador, placeholder Fase 2),
    modal de edição/criação de regra, validações no save (nome
    único, valor não-negativo, escopo coerente) e audit log
    `settings.shipping.update`.
- **Tipos shipping** (`src/shared/types/shipping.ts`):
  `IShippingConfig`, `IShippingRate`, `IShippingResult`,
  `ShippingStrategy`, `ShippingScope`, `ShippingDefaultAction`,
  `ShippingResultReason`.
- **Rota** `/app/configuracoes/frete` protegida por
  `requireAuth(["Owner","Gestor"], settings:view)` — Vendedor/SDR
  caem no `Forbidden`.
- **Item "Frete"** no grupo Operação do `SettingsLayout` com ícone
  `mdi:truck-fast-outline`.
- **Botão "Calcular"** no campo de frete do `NewQuotePage` que chama
  `calculateShipping` com endereço do cliente e exibe toast com a
  regra aplicada (ou "a combinar" quando não há match).
- **Feature `orders`** (`src/features/orders/` — PRD-032): páginas
  `OrdersListPage`, `OrderDetailPage`, rotas dedicadas, transições
  de status controladas, conversão a partir de orçamento aceito,
  integração com veículos (histórico de serviço + atualização de
  quilometragem) e gerador de pedidos com mix realista.

### Changed

- `IPlatformSettings.sdrShippingPlaceholder` foi substituído por
  `IPlatformSettings.shipping: IShippingConfig`. A nova estrutura
  é mais rica (estratégia + regras + fallback) e única para todos
  os consumidores.
- `generateSdrQuote` (PRD-022) agora chama `calculateShipping` em
  vez do antigo `calculateShippingPlaceholder`, mantendo a mesma
  semântica de "a combinar" no template.
- `SdrQuoteSettingsPage`: card "Frete placeholder" substituído por
  link "Abrir configurações de frete" apontando para o painel
  centralizado.
- Templates do SDR (`render.ts`) passam a consumir `IShippingResult`
  diretamente — `value` e `isToNegotiate` são os campos usados.
- `seedStore` carrega `shipping: DEFAULT_SHIPPING_CONFIG` no lugar
  do antigo `sdrShippingPlaceholder` hardcoded.

### Removed

- Tipos descontinuados: `ISdrShippingPlaceholderSettings`,
  `ISdrShippingResult`, `SdrOtherStatesAction` (substituídos pelos
  tipos `IShippingConfig` / `IShippingRate` / `IShippingResult`).
- `src/features/sdr-quote/engine/shipping.ts` (placeholder que tinha
  a função `calculateShippingPlaceholder`).
- Exports removidos do barrel `@/features/sdr-quote`:
  `calculateShippingPlaceholder`, `calculateShippingPlaceholderFor`.

## [0.23.0] — Quote · 2026-05-26

Orçamento (PRD-031) — coração do ciclo comercial. Rota `/app/orcamentos`
substitui o placeholder e entrega listagem paginada (50/pg) com 8
filtros (status, origem, vendedor, cliente, período de criação,
faixa de valor, validade, loja) + busca textual em número/cliente/OEM

- URL sync completo, distinção visual de quatro origens (SDR/Manual/
  Portal/E-commerce) e indicador de validade tricolor. Criação manual
  em `/app/orcamentos/novo` com 5 seções estruturadas: cliente
  (autocomplete restrito à carteira para Vendedor), items (modal de
  busca no catálogo com pré-filtro por veículo do cliente + edição
  inline de quantidade/preço/desconto), desconto e frete (com
  justificativa obrigatória quando passa o limite), condições de
  pagamento (método estruturado + prazo + validade) e notas internas.
  Ficha `/app/orcamentos/:id` em 6 seções com header rico (badges,
  ações contextuais por status, banner SDR e banner de aprovação),
  cliente com link para a ficha, items com snapshots imutáveis,
  valores com % de desconto explícito, condições e histórico
  cronológico via audit log filtrado.

Lifecycle completo de 6 estados (rascunho → enviado → aceito/recusado
→ convertido; expirado em qualquer ponto) com transições controladas,
aprovação de desconto >5% por Gestor/Owner (gating do envio até
aprovação, com workflow aprovar/rejeitar + motivo), expiração
automática horária via hook montado no `AppLayout`, conversão em
pedido (`IOrder` real criado preservando referência via `quoteId`),
duplicação que zera aprovação/conversão e renova validade, e envio
WhatsApp placeholder via copy-to-clipboard com texto formatado.
Componente `<CustomerQuotesList>` exportado para futuro consumo, com
a tab "Orçamentos" da ficha do cliente (PRD-012) já atualizada para
usar `quote.number` em vez do id-derivado. Geradores produzem 80
orçamentos com distribuição realista (30% sdr, 50% vendedor,
6% portal, 6% e-commerce) e mix de status calibrado.

### Added

- **Feature `quotes`** (`src/features/quotes/`): páginas
  `QuotesListPage`, `NewQuotePage`, `QuoteDetailPage` + 3 rotas
  (`/app/orcamentos`, `/novo`, `/:id`).
- **Listagem**: `QuotesHeader`, `QuotesFiltersBar` (8 filtros
  multi-select + faixa de valor + período custom), `QuotesTable` com
  ordenação por total/criado/validade, `QuotesPagination`.
- **Criação manual**: `AddItemModal` reusando
  `searchPartsByText`/`searchPartsByApplication` do PRD-030 +
  pré-filtro pelo veículo do cliente, `CustomerAutocomplete`
  restrito à carteira do Vendedor, 5 seções renderizadas com
  numerador visual.
- **Detalhe**: 6 seções (header, cliente, items, valores, condições,
  histórico) com botões contextuais por status (enviar, aceitar,
  recusar, cancelar, converter, duplicar, WhatsApp) e diálogos de
  confirmação via `<AlertDialog>`.
- **Componentes compartilhados**: `QuoteStatusBadge`,
  `QuoteOriginBadge` (4 variantes coloridas com ícones MDI),
  `ValidityIndicator` tricolor (verde/laranja/vermelho conforme
  proximidade da expiração) e `CustomerQuotesList` para a ficha do
  cliente.
- **Hooks**: `useQuotesUrlState` (URL sync de filtros/sort/page),
  `useQuotesList` (filtragem provider-side + client-side composta),
  `useQuote` (drill-down), `useQuoteExpirationTimer` (timer 1h
  global montado no `AppLayout`).
- **Utils**: `recalculateQuote`, `requiresDiscountApproval`,
  `daysUntil`, `validityBucket`, `generateQuoteNumber`
  (sequencial `OR-YYYY-NNNN` por loja/ano), `composePaymentCondition`.

### Changed

- **Modelo `IQuote`** (`src/shared/types/commercial.ts`) recebe
  campos `number`, `conversationId`, `paymentMethod`, `paymentTerms`,
  `deliveryAddress`, `discountReason`, `requiresApproval`,
  `approvedBy`, `approvedAt`, `rejectedReason`, `convertedAt`.
  Tipo `QuotePaymentMethod` exportado no barrel.
- **`IPlatformSettings`** ganha `discountApprovalThresholdPct`
  (default 5%) e `quoteDefaultValidityDays` (default 7).
- **Contrato `IQuotesProvider`** e `quotesApi` aceitam multi-select
  de status/origin, intervalo de criação, faixa de total,
  `conversationId`, busca textual e ordenação configurável.
- **Geradores de quote** (`src/mocks/generators/quote.ts`) reescritos
  para produzir 80 orçamentos com nova distribuição
  (status 10/30/25/15/10/10, origin 30/40/5/5), aprovação
  pré-resolvida quando aplicável e número sequencial.
- **`generateSdrQuote`** (PRD-022) preenche o novo campo `number`
  com prefixo `OR-{YYYY}-S{...}` para distinguir do manual.
- **`QuotesTab`** (PRD-012) usa `quote.number` em vez do id-derivado.
- **`AppLayout`** monta `useQuoteExpirationTimer` para Owner/Gestor.

## [0.22.0] — Catalog · 2026-05-26

Catálogo interno de peças (PRD-030) — núcleo do negócio agora
materializado. Rota `/app/catalogo` substitui o placeholder e entrega
listagem paginada (50/pg) com 8 filtros combinados (categoria,
subcategoria dependente, fabricante, original/equivalente, veículo
compatível marca+modelo+ano, faixa de preço, estoque, status, loja),
busca textual com debounce 300ms e URL sync completo. Ficha
`/app/catalogo/:id` em 5 seções: header com badges (categoria,
original/equivalente), aplicações agrupadas por marca com mini-filtro
de compatibilidade ao vivo, equivalências com % de economia e
navegação cruzada, comercial com histórico de preço expansível
(audit log filtrado) e estoque com indicador visual (verde/amarelo/
vermelho). Criação/edição com editor multi-row de aplicações,
autocomplete de equivalências com **bidirecionalidade automática**
(adicionar B em A.equivalents propaga A em B.equivalents e vice-versa),
validação de OEM duplicado e audit log especial em mudança de preço.
Funções de busca exportadas em `@/features/catalog/api/search`
(`searchPartsByApplication`, `findByOemCode`, `findByAlternativeCode`,
`getEquivalents`, `searchPartsByText`) prontas para serem consumidas
pelos PRD-021 (identificação SDR), PRD-016 (peças compatíveis com
veículo), PRD-031 (orçamento) e Bloco 5 (e-commerce).

### Added

- **Feature `catalog`** (`src/features/catalog/`): páginas
  `CatalogListPage`, `PartDetailPage`, `PartNewPage`, `PartEditPage`.
- **Listagem com filtros**: `CatalogHeader`, `CatalogFiltersBar`
  (8 filtros multi-select via Popover/Select + chip "N filtros ativos"),
  `CatalogTable` com ordenação por nome/preço/estoque, `CatalogPagination`
  com PAGE_SIZES configurável (25/50/100).
- **Ficha de produto**: `PartDetailHeader`, `ApplicationsSection`
  (grouped by brand + mini-filtro inline para verificar compatibilidade),
  `EquivalentsSection` (cards com % economia e navegação cruzada),
  `CommercialSection` (expansível com histórico de preço via audit),
  `StockSection` com `StockBadge` colorido.
- **Criação/edição**: `PartForm` reutilizado por `PartNewPage` e
  `PartEditPage`, `ApplicationsEditor` multi-row e `EquivalentsEditor`
  com autocomplete; preço gated por permissão de Owner (Gestor vê
  read-only com tooltip).
- **API de busca** (`api/search.ts`): funções puras consumidas
  cross-feature — `searchPartsByApplication`, `findByOemCode`,
  `findByAlternativeCode`, `getEquivalents`, `searchPartsByText`.
- **Hooks**: `useCatalogList` com filtragem client-side para critérios
  não suportados pelo provider (categorias, aplicações, origem, faixa
  de preço, buckets de estoque, multi-store); `useCatalogUrlState`
  com 17 search params validados; `useEquivalentsBidirectional` para
  reconciliação atômica de equivalências.
- **Componentes reutilizáveis**: `<PartImage>` (placeholder por
  categoria com cor temática, fallback automático quando `imageUrl`
  ausente), `<StockBadge>` (variant default/compact, 3 cores).
- **Utilitários**: `PART_CATEGORY_DESCRIPTORS` com 10 categorias
  - ícones Iconify + tons + subcategorias; `activeFilterCount`,
    `toListParams`, `EMPTY_FILTERS`.
- **i18n**: `pt-BR.ts` cobrindo lista, filtros, ficha, form e toasts
  com português correto e acentos UTF-8.

### Changed

- **Tipo `IPart`** (`src/shared/types/catalog.ts`): novos campos
  opcionais `category`, `subcategory`, `isOriginal`, `imageUrl`,
  `storeId` — compatíveis com schema futuro do DINTEC.
- **Gerador `generatePart`** (`src/mocks/generators/part.ts`):
  popula `category` (mapeado para canonical via
  `CATALOG_CATEGORY_TO_CANONICAL`), `subcategory` (do pool por
  família), `isOriginal` (heurística por brand/supplier "OEM"),
  `storeId` (matriz no MVP); distribuição de estoque ajustada para
  70% normal / 20% baixo / 10% zerado conforme RF-005.
- **Permissões** (`src/features/rbac/permissions/matrix.ts`):
  Gestor ganhou `create` + `edit` em `part` (mantém `delete` apenas
  para Owner — desativação Owner-only).
- **Rota `/app/catalogo`** virou layout (Outlet) e ramifica em
  `/`, `/:id`, `/novo`, `/:id/editar` com `beforeLoad` guards via
  `hasPermission`.

### Audit log

Adicionadas 6 actions: `part_create`, `part_update`, `part_price_change`
(disparada apenas quando `unitPrice` mudou — destaque em CommercialSection),
`part_application_update` (pendente; coberto por part_update), `part_equivalent_update`
(disparada em ambos os lados pela reconciliação bidirecional),
`part_activate` / `part_deactivate`.

## [0.21.0] — Cockpit · 2026-05-26

Painel completo do agente SDR (PRD-024) — hub centralizado em
`/app/sdr` com 5 abas (Visão Geral, Histórico, Métricas, Templates,
Configurações) que reúne todo o ciclo de vida do SDR num só lugar.
Owners ganham KPIs comparativos com período anterior, drill-down em
sessões individuais com timeline reconstituída (saudação → coleta →
identificação → orçamento → escalação → finalização), gráficos
detalhados (heatmap volume 7×24, FAQ resolvido vs escalado, pie de
motivos de escalação, TTFR por modo), editor centralizado de todos
os templates (core PRD-020 + orçamento PRD-022 + handoff PRD-023)
com syntax highlight de variáveis e preview ao vivo, e configurações
consolidadas com confirmação ao desligar o SDR globalmente. Banner
de alertas proativos no topo (taxa subindo, intent unknown, templates
default) sinaliza quando Owner precisa agir.

### Added

- **Feature `sdr-dashboard`** (`src/features/sdr-dashboard/`):
  página principal `SdrDashboardPage`, 5 tabs em components/tabs/,
  hooks `useSdrDashboardFilters`, `useSdrDashboardData` (agregador
  reativo a `ESCALATION_QUEUE_EVENT`), `useSdrAlerts`,
  `useSdrSessionContext`, `useSdrHistoryFilters`.
- **Visão Geral**: 4 KPIs (sessões, taxa de escalação, taxa de
  aceite de orçamento, TTFR médio) com tendência vs período anterior,
  gráfico de linha Recharts para volume diário, pizza para
  distribuição de `finishReason`, banner de alertas no topo.
- **Histórico**: tabela paginada (30/página) com 4 filtros
  (estado final multi-select, motivo da escalação, vendedor
  escalado, com/sem orçamento), URL sync, modal
  `SdrSessionDetailModal` com timeline cronológica de eventos
  (saudação, qualificação, identificação PRD-021, orçamento
  PRD-022, escalação PRD-023, finalização), trace JSON expansível
  e navegação direta para a conversa.
- **Métricas detalhadas**: heatmap SVG nativo 7×24 com click
  direcionando para a aba Histórico, BarChart FAQ resolvido vs
  escalado por categoria (horário/entrega/pagamento/garantia),
  pie chart distribuição de motivos de escalação, BarChart TTFR
  por modo (urgent/normal/standard).
- **Editor de templates centralizado**: accordions agrupando os
  20+ templates do SDR (saudação, qualificação, FAQ, escalação
  core do PRD-020 + 4 slots de orçamento do PRD-022 + handoff
  do PRD-023). Cada editor com syntax highlight para `{{var}}`,
  preview ao vivo com variáveis exemplo preenchidas, glossário
  contextual de variáveis, validação de variáveis desconhecidas
  e botão restaurar padrão. Audit log em cada save.
- **Configurações consolidadas**: toggle SDR ativo (com
  confirmação forte ao desligar via AlertDialog), sliders para
  validade do orçamento (1-30 dias), desconto autorizado (0-10%),
  timeout urgent/normal e delay de broadcast. Salvar atômico
  agrupa todas as mudanças num único audit log com sumário das
  alterações.
- **Hook `useSdrAlerts`** calcula 3 tipos de alerta proativos:
  taxa de escalação subindo > 20%, 5+ sessões com intenção
  indefinida na última hora, templates ainda em valores padrão.
- **Volume de mocks**: dataset cresceu de 20 para 100 sessões
  SDR históricas para que o painel renderize ~4 páginas de
  backlog crível.

### Changed

- **Rota `/app/sdr`** substitui o placeholder que mostrava apenas
  o card de métricas de escalação — agora carrega
  `SdrDashboardPage` completo com 5 abas. Guard aceita
  `Owner` e `Gestor`; Gestor vê tudo em modo leitura
  (banner explícito + inputs disabled).
- **`validateSearch`** da rota foi tipado para aceitar os
  parâmetros de filtro de período, loja, estado final, motivo,
  vendedor, quote e página.

### Marco

Com PRD-024, **Bloco 2 (SDR) está completo**. Os 5 PRDs do
agente IA (020 simulação, 021 identificação, 022 orçamento,
023 escalação, 024 painel) entregam um SDR funcional 24/7,
auditável e configurável fim a fim.

## [0.20.0] — Handoff · 2026-05-26

Handoff estruturado SDR → vendedor humano (PRD-023) — quando o SDR
detecta que precisa transferir (cliente pediu humano, negociação,
falha repetida), o sistema compõe um resumo de contexto rico,
escolhe o melhor vendedor disponível (carteira → especialidade →
disponibilidade), envia uma mensagem de despedida ao cliente,
persiste um bubble system com todo o histórico relevante e atribui
a conversa. Modo `urgent` faz broadcast aos vendedores online se
o titular não responder em 30s; modo `normal` segue cascata padrão;
modo `standard` aguarda a fila com timeout configurável (5min
urgent / 30min normal). Métricas TTFR/abandono/conversão alimentam
o painel SDR (PRD-024).

### Added

- **Tipos novos** em `src/shared/types/sdr-escalation.ts`:
  `ISdrEscalation` (registro persistente), `ISdrContextSummary`
  (snapshot estruturado), `ISdrEscalationVehicle`,
  `ISdrEscalationPart`, `ISdrEscalationQuote`,
  `ISdrEscalationTraceStep`, `SdrEscalationReason`,
  `SdrEscalationMode` e `SdrEscalationStatus`.
- **`IPlatformSettings`** ganha 4 campos (PRD-023 RF-002):
  `escalationQueueTimeoutMinutesUrgent` (5min),
  `escalationQueueTimeoutMinutesNormal` (30min),
  `escalationCustomerHandoffTemplate` (template editável) e
  `escalationUrgentBroadcastDelaySeconds` (30s).
- **Engine `escalateToHuman()`** (`features/sdr-escalation/engine/escalate.ts`)
  — função pura que detecta modo (`urgent`/`normal`/`standard`) a
  partir do motivo, chama `chooseHumanSeller()` e devolve o registro
  - seleção sem side effects.
- **Engine `chooseHumanSeller()`** — reusa a lógica do PRD-013 com
  3 adaptações: carteira sempre vence (mesmo offline em modo
  normal/standard), especialidade casa contra a marca identificada
  pelo PRD-021, modo `urgent` força preferência por `online`
  (substitui titular offline).
- **`buildContextSummary()`** — compõe `ISdrContextSummary` agregando
  sessão SDR + cliente + veículo + peça (PRD-021) + orçamento
  (PRD-022) com tempo no SDR, número de mensagens e trace de estados.
- **`renderEscalationBubble()` + `renderCustomerHandoff()`** —
  templates de renderização. O bubble system carrega cabeçalho
  destacado "🤖 ESCALADO PELO SDR — \<modo\>", seções condicionais
  (cliente, veículo, peça, orçamento) e separadores visuais. A
  mensagem ao cliente usa placeholders `{{saudacao_nome}}` e
  `{{resumo_curto}}`.
- **Hook `useSdrEscalation()`** — orquestra o handoff: monta
  contextSummary, roda o engine, envia handoff message + bubble,
  patcha conversation (`assignedSellerId`, `isSdrActive=false`),
  finaliza session (`finishReason='escalated'`), persiste registro
  e grava audit log atômico.
- **Hook `useEscalationToasts()`** — escuta novas escalações e dispara
  toast prominente para o vendedor recém-atribuído com botão
  "Atender agora". Modo urgent usa `toast.error` com cor + duração
  reforçadas.
- **Hook `useUrgentBroadcastTimer()`** — Owner/Gestor mantém o timer
  rodando; após 30s sem resposta do escolhido, marca
  `urgentBroadcastAt`, emite `sdr_escalate_broadcast`, dispara o
  evento de fila e gera toast de alerta.
- **Hook `useEscalationQueueTimeoutMonitor()`** — monitora
  escalações `pending` cujo tempo em fila ultrapassou
  `escalationQueueTimeoutMinutes*` e notifica o Owner; também
  marca como `abandoned` após 1h sem resposta humana (RF-020).
- **Hook `useEscalationMetrics()`** — devolve TTFR médio, taxa de
  abandono, taxa de resposta, acerto de especialidade e contagem
  por modo (PRD-023 RF-021). Recalcula via `window` event.
- **Hook `useUrgentBroadcastQueue()`** — gerencia a fila de
  broadcasts urgentes ativos, expõe `claim()` para o primeiro
  vendedor assumir.
- **Hook `useEscalationsByConversation()` + `useConversationEscalation()`** —
  lookups reativos consumidos pela inbox e pela conversa.
- **Componentes** `EscalationBadge` (compact + banner) e
  `UrgentBroadcastClaim` (painel flutuante de claim para urgentes).
- **Inbox (PRD-010)** — item de conversa escalada ganha badge
  "🤖 Escalado · \<modo\>"; borda esquerda em `--brand-parts`
  durante os 60s após a escalação (RF-016); filtro "Escaladas pelo
  SDR" no chip bar.
- **Conversa (PRD-011)** — header ganha banner prominente
  "🤖 Esta conversa foi escalada pelo SDR — \<modo\>" abaixo do
  título (RF-017). Modo urgente pulsa.
- **`UrgentBroadcastClaim`** fixo no `AppLayout` (canto inferior
  direito) — primeiro a clicar "Atender agora" assume.
- **Página `/app/sdr`** ganha `EscalationMetricsCard` para Owner
  visualizar TTFR, abandono, taxa de resposta, acerto de
  especialidade e volume por modo. PRD-024 vai expandir.
- **Provider novo** `sdrEscalations` (`ISdrEscalationsProvider`)
  com mock + stub Supabase. Hook `useSdrEscalationsProvider()`.
- **Mocks** — 30 escalações históricas (`generateSdrEscalation`)
  com mix de status (answered 55% / assigned 25% / pending 10% /
  abandoned 10%) e modos ponderados pela razão.
- **Audit log** — eventos `sdr_escalate`, `sdr_escalate_assign`,
  `sdr_escalate_broadcast`, `sdr_escalate_broadcast_claim`,
  `sdr_escalate_queue_timeout` e `sdr_escalate_abandoned`.

### Changed

- **`useSdrResponder()`** aceita `onEscalate?: (info) => void`
  opcional — quando o engine emite `escalate_to_human`, o callback
  recebe a sessão atualizada + motivo. Permite ligar o handoff
  estruturado a partir do simulador / inbox sem quebrar consumidores
  existentes.
- **`ConversationHeader`** e **`ConversationListItem`** aceitam a
  prop opcional `escalation` para renderizar os badges/banner.
- **`InboxFilters`** ganha toggle "Escaladas pelo SDR" e
  `useInboxFilters` persiste `escalated` no URL search.

### Notes

- **`PRD-023`** marcado como `_DONE` após esta release.
- **Provider Supabase** segue stub; tabela `sdr_escalations` chega
  na Fase 2 junto com `sdr_sessions`.
- Toast prominente reaproveita `sonner` — modo urgent usa
  `toast.error` para diferencial visual sem mudar a infra.

## [0.19.0] — Quotemaster · 2026-05-26

Geração automática de orçamento via SDR (PRD-022) — quando o cliente
confirma a peça identificada (PRD-021), o SDR compõe um `IQuote`
estruturado (origin='sdr') com precificação base, frete preliminar
por região, validade configurável e envia mensagem rica formatada
para o WhatsApp com 3 opções (aceitar/recusar/falar com vendedor).
Pipeline puro (`generateSdrQuote` → `renderQuoteMessage` →
`parseQuoteResponse`) preparado para troca por serviço backend na
Fase 2 sem refatorar consumidores.

### Added

- **Tipos novos** em `src/shared/types/sdr-quote.ts`:
  `ISdrQuoteTemplates` (4 slots), `ISdrShippingPlaceholderSettings`,
  `ISdrShippingResult`, `ISdrPendingQuote`, `IQuoteResponseMatch`,
  `QuoteResponseIntent` e `SdrOtherStatesAction`.
- **`IPlatformSettings`** ganha 4 campos novos (PRD-022 RF-002):
  `sdrQuoteValidityDays` (default 7), `sdrAutoDiscountPct`
  (default 0), `sdrQuoteTemplates` (4 templates editáveis) e
  `sdrShippingPlaceholder` (mesma cidade R$ 50, mesmo estado R$ 80,
  outros estados "a combinar").
- **`SdrSessionState`** ganha `aguardando_resposta_orcamento` e
  `aguardando_dados_pedido` — `ISdrCollectedData` ganha
  `pendingQuote`, `paymentMethod`, `deliveryPreference` e
  `pendingOrderId`.
- **Engine `generateSdrQuote()`** (`features/sdr-quote/engine/generate.ts`)
  — função pura que recebe `IPartIdentification` confirmada, busca
  preço em `IPart`, aplica desconto (se autorizado), calcula frete
  via placeholder, monta `IQuote` com `origin='sdr'`,
  `status='enviado'`, `validUntil = now + sdrQuoteValidityDays`.
- **Engine `calculateShippingPlaceholder()`** (RF-008) — decisão por
  região: mesma cidade / mesmo estado / outros estados (com modo
  `to_negotiate` ou `fixed_value`). Trace de motivo (`same_city`,
  `other_state_negotiate`, `missing_address`) consumido pelo
  inspetor.
- **`renderQuoteMessage()`** + 3 renderizadores específicos
  (`renderAcceptMessage`, `renderRejectMessage`,
  `renderEscalateMessage`) com substituição de variáveis
  (`{{peca_nome}}`, `{{valor_unitario}}`, `{{total}}`,
  `{{frete_formatado}}`, `{{validade}}`, `{{cliente_nome}}`, etc.).
  Auxiliar `{{cliente_nome_separador}}` colapsa vírgula quando não
  há nome.
- **`parseQuoteResponse()`** classifica resposta do cliente em 5
  intents (`accept`, `reject`, `escalate`, `negotiate`, `unknown`)
  via regex priorizado. "tá caro" / "tem por menos" / "desconto"
  caem em `negotiate` e escalam automaticamente para humano.
- **4 templates default** (`DEFAULT_SDR_QUOTE_TEMPLATES`):
  generation (mensagem rica com emoji), accept (pergunta pagamento +
  prazo), reject (oferece alternativas), escalate (passa pra
  vendedor).
- **Integração com SDR (PRD-020)** —
  `sdrRespond()` agora detecta sequência completa em 3 níveis:
  - Quando `pendingPartIdentification` resolve confirmada e há
    `context.parts + context.customer`, gera quote inline,
    transiciona para `aguardando_resposta_orcamento` e emite
    `quote_generated`.
  - Quando `pendingQuote` existe, roteia a resposta via
    `parseQuoteResponse`: aceite vai para `aguardando_dados_pedido`,
    recusa volta para `roteamento`, escalate/negotiate finalizam
    com `escalate_to_human`, unknown re-pergunta.
  - Quando state é `aguardando_dados_pedido`, captura método de
    pagamento (PIX/Boleto/Cartão/Dinheiro detectados por regex) e
    prazo de entrega, salva em `collectedData` e finaliza.
  - Suporta orçamento expirado (RF-025): detecta `now > validUntil`
    e responde "Esse orçamento já passou da validade. Vou gerar um
    novo."
- **`useSdrResponder()`** persiste quote via
  `useQuotesProvider().create()` em resposta a `quote_generated`;
  no aceite, atualiza status para `aceito` e cria `IOrder`
  placeholder via `useOrdersProvider().create()` (stub PRD-032 com
  margin estimada 30%) — retorna `persistedQuote` e `orderStubId` no
  resultado do turno. 7 novos audit actions: `sdr_quote_create`,
  `sdr_quote_accepted`, `sdr_quote_rejected`,
  `sdr_quote_negotiate_detected`, `sdr_quote_escalate`,
  `sdr_quote_unknown_reply` e `sdr_order_stub_created`.
- **Hook `useSdrQuoteMetrics()`** calcula totalQuotes, acceptedRate,
  rejectedRate, pendingCount, movedRevenue e averageTicket sobre
  quotes com `origin='sdr'` — alimenta painel SDR (PRD-024) e a
  página admin de configurações.
- **Página `/app/configuracoes/sdr/orcamento`** (Owner-only) — 4
  blocos: 4 cards de métrica no topo (total/aceite/recusa/valor
  movido), card de regras gerais (slider de validade 1-30 dias,
  slider de desconto 0-10%), card de frete placeholder (4 campos
  numéricos + select `to_negotiate | fixed_value` + cidade/UF da
  loja), card de templates com `Textarea` por slot e botão
  "Restaurar padrão". Sticky footer com salvar/descartar e
  `UnsavedChangesDialog` no exit.
- **Item de menu "Orçamento automático"** adicionado em "Agente
  SDR" do `SettingsLayout`.
- **Simulador SDR** passa stub `SIM_CUSTOMER` (Frederico Westphalen,
  para que o cálculo de frete caia em `sameCityValue`) e exibe
  mensagens `system` quando `quote_generated` ou `quote_response`
  são emitidos pela engine, mostrando intent detectada e keywords.

### Changed

- `ISdrAction` ganha 4 variantes novas: `quote_generated`,
  `quote_response`, `order_stub_created`, e `create_quote` agora
  carrega `identificationId?: ID`.
- `ISdrTrace` ganha `pendingQuote` e `quoteResponseIntent`;
  `templateUsed` aceita 7 triggers novos (`quote_generation`,
  `quote_accept`, `quote_reject`, `quote_escalate`, `quote_unknown`,
  `quote_expired`, `order_captured`).
- `seedStore.ts` injeta as 4 configurações novas com defaults
  conservadores (frete same-city R$ 50, sem desconto automático,
  validade 7 dias).

### Notes (Fase 2)

- Cálculo de frete real via integração transportadora substitui
  `calculateShippingPlaceholder` quando PRD-033 entregar.
- Persistência do quote via `useQuotesProvider` é stub mock —
  `useOrdersProvider().create()` para pedido aceito também é
  placeholder até PRD-032 (checkout completo com pagamento).
- Geração de PDF do orçamento, expiração automática com lembrete
  e múltiplos itens por quote ficam para Fase 2.
- Edição de templates pelo Owner é texto livre — Fase 2 ganha
  preview lado-a-lado e validação de placeholders.

## [0.18.0] — Scout · 2026-05-26

Engine de identificação de peças (PRD-021) — o SDR passa a entender
"preciso de filtro de óleo Volvo FH 460 2020 motor D13K460" extraindo
marca, modelo, ano, motor, categoria e subtipo da peça em uma única
mensagem, busca no catálogo via pesos por aplicação, classifica a
confiança em verde/amarelo/vermelho e propõe top 3 candidatos
(originais + equivalentes) com mensagem pronta para o WhatsApp. A
arquitetura é toda função pura (`extractAttributes`, `searchCatalog`,
`scoreCandidate`, `decideAction`, `formatConfirmationMessage`,
`identifyPart`), preparada para troca por LLM na Fase 2 sem refatorar
consumidores.

### Added

- **Tipos novos** em `src/shared/types/part-identification.ts`:
  `IPartIdentification`, `IPartCandidate`,
  `IPartIdentificationDecision`, `IExtractedAttributes`,
  `AttributeConfidence`, `PartIdentificationStatus`,
  `PartIdentificationActionKind` e `PartCategory` (10 famílias —
  filtro, freio, correia, motor, embreagem, elétrica, transmissão,
  suspensão, arrefecimento, lubrificante).
- **Lookup tables** em `src/features/part-identification/data/`:
  - `brands.ts` — 5 marcas (Volvo, Scania, Mercedes-Benz, Ford Cargo,
    Iveco) com aliases ("mercedes-benz", "mb", "cargo"…).
  - `models.ts` — 18 modelos por marca, cada um com aliases sem espaço
    ("R450" ≡ "r 450").
  - `engines.ts` — 18 motores por marca (D13K460, DC13, OM 457 LA,
    Cursor 13…).
  - `partCategories.ts` — 10 categorias + 40+ subtipos (óleo, ar,
    combustível, cabine; pastilha, lona, tambor; etc.).
- **Engine de extração** (`engine/extract.ts`) — parsers individuais
  com confidence por atributo (`extractBrand`, `extractModel`,
  `extractYear`, `extractEngine`, `extractPartCategory`,
  `extractPartSubtype`, `extractOemCode`); orquestrador
  `extractAttributes(text, context)` que reaproveita
  `context.vehicles[0]` quando o cliente tem 1 veículo cadastrado e
  marca/modelo não vieram na mensagem; flag
  `multipleVehiclesAmbiguous` quando a frota tem 2+ caminhões.
- **Engine de busca** (`engine/search.ts`) — `searchCatalog(attrs,
parts)` recebe um snapshot de `IPart[]` (sem acoplamento com
  provider); short-circuit por código OEM exato; `scoreCandidate()`
  com pesos `SCORE_WEIGHTS` mandatórios pelo PRD (marca 0.35, modelo
  0.30, ano 0.15, motor 0.10, categoria 0.10, equivalente -0.05);
  inclui equivalentes (`IPart.equivalentPartIds`) do top candidato;
  `searchCatalogWithFallback()` emite 3 candidatos estilizados quando
  o catálogo está vazio.
- **Engine de decisão** (`engine/decide.ts`) — `decideAction()` com 3
  estratégias: `confirm_auto` (1 candidato score > 0.9), `ask_user`
  (2+ com score >= 0.6), `request_more_info` (top score < 0.6 ou
  poucos candidatos); calcula lista de atributos faltantes para
  perguntas específicas.
- **Engine de formatação** (`engine/format.ts`) —
  `formatConfirmationMessage()` com 3 templates por kind de decisão;
  destaca economia em equivalentes (>= 5% vs original);
  `parseCustomerChoice()` aceita "1", "2", "3", "primeiro", "segundo",
  "terceiro"; constantes `PHOTO_PLACEHOLDER_MESSAGE` (RF-020) e
  `OEM_NOT_FOUND_MESSAGE` (RF-019).
- **Orquestrador `identifyPart()`** (`engine/identify.ts`) — função
  pura que encadeia extract → search → decide e devolve
  `IPartIdentification` completa; `applyCustomerChoice()` para
  resolver para `confirmed` / `rejected` / `failed`.
- **Integração com SDR (PRD-020)** —
  - `sdrRespond()` ganha 4º argumento opcional
    `context: { parts?, customer?, vehicles? }`; quando presente, na
    intent `identificar_peca` chama `identifyPart()` inline e usa o
    texto formatado como `send_message` (em vez de uma pergunta
    genérica).
  - Curto-circuito de foto: qualquer `IMessage` com
    `mediaType="image"` recebe `PHOTO_PLACEHOLDER_MESSAGE` antes do
    pipeline normal.
  - Resolução automática de identificação pendente: quando a sessão
    tem `pendingPartIdentification` e a próxima mensagem casa com
    "1/2/3/primeiro/segundo/terceiro", o engine resolve para
    `confirmed`, marca `collectedData.identifiedPart` e emite
    `create_quote` (stub do PRD-022).
  - `ISdrCollectedData` ganha `pendingPartIdentification` e
    `partIdentificationHistory`; `ISdrAction` ganha
    `part_identification_resolved`; `ISdrTrace` ganha
    `partIdentification`, `partIdentificationUsedFallback` e
    `partIdentificationResolved`.
- **`useSdrResponder()`** repassa `parts/customer/vehicles` para a
  engine; novos audit logs `sdr_identify_part_requested` (com decisão
  - confidence + nº de candidatos), `sdr_identify_part_resolved` e
    `sdr_photo_received` (OCR pendente Fase 2).
- **Simulador `/app/configuracoes/sdr/simulador`** carrega catálogo
  via `usePartsProvider().list({ pageSize: 60 })` e injeta na engine.
  Inspetor à direita ganha 3 seções novas:
  - **Identificação de peça** — atributos extraídos em chips
    coloridos (verde >= 85%, amarelo 60-84%, vermelho < 60%),
    decisão, lista de candidatos com score, marca, preço, tag
    "equiv." e atributos casados, mais legenda dos pesos.
  - **Histórico de identificações** — últimas 20 com status colorido,
    nome do top candidato e trecho do raw input.
  - **Botão de foto** ao lado do input — envia `IMessage` com
    `mediaType='image'` para testar o placeholder OCR.

### Changed

- `ISdrCollectedData` adiciona `pendingPartIdentification?` e
  `partIdentificationHistory?` — `applyResponseToSession()` mantém o
  histórico (últimos 20) e limpa o slot pending quando o engine
  retorna `undefined` explicitamente.
- `sdrRespond()` mantém assinatura backward compatible — o 4º
  argumento é opcional e default `{}`; chamadas existentes continuam
  funcionando com o template `pergunta_necessidade` como fallback.

### Notes (Fase 2)

- OCR real (Tesseract.js ou Google Vision) substitui o placeholder
  quando o cliente envia foto da peça.
- Substituir parsers por LLM mantém `extractAttributes()` /
  `searchCatalog()` / `decideAction()` com a mesma assinatura — os
  consumidores não mudam.
- Edição de lookup tables (marcas, modelos, motores) ganha
  sub-rota `/app/configuracoes/sdr/dicionarios` (placeholder no MVP).
- Histórico de identificações ganha aba dedicada no painel do SDR
  (PRD-024) com filtros por status e período.

## [0.17.0] — Concierge · 2026-05-26

Agente SDR simulado (PRD-020) — o assistente IA do GALLO BASE DIESEL
ganha um engine puro, máquina de estados de 7 transições, 8 templates
editáveis com substituição de variáveis (`{{nome}}`, `{{empresa}}`),
classificador de intenção por keywords em 6 categorias e um painel de
simulação interativo. A arquitetura está preparada para troca por
LangChain/OpenAI na Fase 2 sem refatorar consumidores.

### Added

- **Engine puro `sdrRespond()`** (`src/features/sdr/engine/respond.ts`)
  — função determinística que recebe `IMessage` + `ISdrSession` +
  `IPlatformSettings` e devolve `ISdrResponse` com `nextState`,
  `actions[]`, `updatedCollectedData`, `trace` e `finishReason`. Sem
  side effects: hooks externos é que mutam o mock store.
- **Classificador de intenção `detectIntent()`** com 6 categorias
  (`escalar_humano`, `gerar_orcamento`, `identificar_peca`,
  `faq_horario`, `faq_entrega`, `texto_livre`). Pattern matching simples
  por keyword, lowercase + includes, com prioridade declarativa.
- **Sistema de templates** — `renderTemplate()` faz substituição de
  variáveis `{{nome}}`, `{{empresa}}` com fallback (`"amigo"`) quando
  ausente. 8 templates default seedados no `IPlatformSettings.sdrTemplates`.
- **Tipos novos** em `src/shared/types/sdr.ts`: `ISdrSession`,
  `ISdrTemplate`, `ISdrCollectedData`, `ISdrIntentMatch`, `ISdrAction`,
  `ISdrTrace`, `ISdrResponse`, `SdrSessionState`, `SdrFinishReason`,
  `SdrTemplateTrigger`, `SdrIntent`. `IPlatformSettings` ganha
  `sdrEnabled: boolean` e `sdrTemplates: ISdrTemplate[]`.
- **20 sessões SDR mockadas** geradas no bootstrap com mix de
  `finishReason` (escalated 30%, completed 35%, abandoned 20%,
  paused_by_human 15%) — alimentam métricas e simulador.
- **API mock `sdrSessionsApi`** + contract `ISdrSessionsProvider` +
  hook `useSdrSessionsProvider()`. Stub Supabase preparado para Fase 2.
- **Hooks** — `useSdrResponder()` orquestra um turno (carrega/cria
  sessão, chama engine, persiste mensagens `out` com `authorType='sdr'`,
  audit log de transições); `useSdrPauseOnHumanIntervention()` pausa
  sessão quando vendedor envia mensagem `out` em conversa com SDR ativo;
  `useSdrReactivate()` reativa via menu ⋮; `useSdrMetrics()` calcula 7
  métricas (total, taxa de escalação/completion/abandono, duração média,
  resolução de FAQ, volume fora do horário) — alimentam PRD-024.
- **Página `/app/configuracoes/sdr/simulador`** — interface 2 colunas:
  conversa simulada à esquerda (bubbles cliente/SDR/system, input para
  enviar como cliente, indicador "digitando") e inspetor à direita
  (estado da sessão, dados coletados, último turno com intent/template/
  variáveis, lista de templates ativos). Botões Reiniciar e Salvar caso
  (persiste no localStorage). Acesso restrito a Owner/Gestor.
- **Página `/app/configuracoes/sdr/templates`** — editor visual dos 8
  templates default. Detecta variáveis usadas no texto, valida contra
  vocabulário conhecido (`nome`, `empresa`), permite restaurar para o
  padrão. Toggle global "Agente SDR ativo" no topo controla
  `sdrEnabled`. Acesso restrito a Owner.
- **Nova categoria "Agente SDR" na sidebar de Configurações** com 2
  itens (Simulador + Templates de mensagem), filtrados por papel.
- **Sincronia automática SDR session ↔ flag `isSdrActive`** no menu ⋮
  da conversa — quando Owner/Gestor pausa o SDR pelo menu, a sessão
  associada também transita para `state='pausado'` com
  `finishReason='paused_by_human'`. Reativação restaura o estado anterior
  via `pausedFromState`.
- **Audit log padronizado** para todas as ações SDR: `sdr_session_start`,
  `sdr_state_transition`, `sdr_escalate`, `sdr_identify_part_requested`,
  `sdr_quote_requested`, `sdr_paused_by_human`, `sdr_reactivated`.

### Changed

- `IBootstrappedDataset` ganha `sdrSessions: ISdrSession[]`; mutations
  e seletores aceitam a nova coleção.
- `SEED_STORE.settings` agora seedaa `sdrEnabled: true` e os 8 templates
  default — bootstrap atualiza automaticamente.

## [0.16.0] — Cockpit · 2026-05-26

Configurações Administrativas (PRD-019) — o hub `/app/configuracoes`
deixa de ser placeholder e ganha **cinco categorias** (Pessoal,
Administração, Operação, Integrações, Avançado) com 16 sub-rotas,
edição funcional para o subconjunto especificado no MVP e placeholders
informativos coerentes para as áreas que serão expandidas na Fase 2.
A sidebar filtra itens por papel e permissão RBAC, garantindo que
Vendedores só vejam Perfil/Aparência, Gestores vejam o operacional e
Owners vejam o hub completo.

### Added

- **Hub renovado em `/app/configuracoes`** — substitui o
  `PlaceholderPage` por um `SettingsLayout` agrupado em 5 categorias
  (Pessoal / Administração / Operação / Integrações / Avançado).
  Filtra itens visíveis por papel/permissão (PRD-019 RF-003), suporta
  navegação por teclado e tem versão mobile via `Sheet` drawer.
  `GET /app/configuracoes` redireciona para `/app/configuracoes/perfil`
  (PRD-019 RF-004).
- **`/app/configuracoes/perfil`** — qualquer usuário autenticado pode
  editar nome, email, telefone e (para vendedores externos) região do
  próprio cadastro. Valida email, exibe iniciais como avatar e dispara
  audit log via `useSellersProvider().update()`. Modal de
  confirmação avisa antes de descartar mudanças não salvas.
- **`/app/configuracoes/atendimento/motivos-perda`** — CRUD simples
  da `IPlatformSettings.lossReasons` usada pelo modal "Marcar como
  perdido" (PRD-017). Suporta adicionar, remover e ativar/desativar
  motivos com toast de confirmação e audit log automático.
- **`/app/configuracoes/atendimento/lifecycle`** — dois sliders
  configuram `dormantDays` (30–180) e `lostDays` (180–720). Pré-visualiza
  o impacto em tempo real: mostra quantos clientes seriam considerados
  dormentes/perdidos com o novo limiar e a variação vs. atual. Valida
  que `lostDays > dormantDays`.
- **`/app/configuracoes/atendimento/horario-comercial`** — embed do
  `BusinessHoursSection` do PRD-013, mas servido fora do painel de
  distribuição para deixar a configuração descobrível.
- **`/app/configuracoes/atendimento/pipeline`** — visualização
  read-only dos estágios atuais com cor, ordem e badge "Edição
  disponível na Fase 2". Botão "Sugerir mudança" desabilitado com
  tooltip explicativo.
- **`/app/configuracoes/atendimento/tags`** — listagem em duas seções:
  catálogo oficial (`IPlatformSettings.tagSuggestions`) e tags livres
  detectadas em uso por clientes mas fora do catálogo. Owner e Gestor
  podem promover uma tag livre ao catálogo, criar tags oficiais novas e
  remover tags do catálogo (com alerta quando há clientes ainda usando).
- **`/app/configuracoes/veiculos/cadastro-mode`** — radio cards com 3
  opções (`auto_aprovado` / `aprovacao_obrigatoria` / `manual_apenas_gestor`),
  descrição inline de cada modo e aviso sobre override por vendedor que
  virá na Fase 2.
- **Placeholders coerentes** em `/usuarios`, `/whatsapp`,
  `/portal-cliente`, `/gamificacao` e `/divisoes` — cada um lista o
  que será configurável na Fase 2, traz contexto real (equipe seedada,
  contas WhatsApp do mock, regras de gamificação vigentes) e cita os
  PRDs que vão entregar a feature. `/divisoes` mostra cards das três
  submarcas (PARTS em verde habilitada, SERVICE em vermelho e INDUSTRIAL
  em amarelo desabilitadas).
- **Hook `useUnsavedChanges`** — usa `useBlocker` do TanStack Router
  para interceptar navegação enquanto há mudanças não salvas, exibindo
  `UnsavedChangesDialog` com opções "Cancelar" e "Descartar e sair".
  Também guarda `beforeunload` do navegador para reloads/fechamento de
  aba (PRD-019 RF-038).
- **Hook `usePlatformSettings`** — wrapper compartilhado de leitura e
  escrita do `IPlatformSettings` completo, capturando before/after por
  campo patched e gerando audit log via `auditLog()` em cada save.
- **Componentes compartilhados** `SectionHeader`, `PlaceholderSection`,
  `UnsavedChangesDialog` em `src/features/admin-settings/components/`.

### Changed

- **`ISellersProvider`** ganha método `update(id, patch)` para suportar
  edição de perfil. Implementado em `mockSellersProvider`/`sellersApi`;
  `supabaseSellersProvider` segue como stub até PRD-105+.
- **`SettingsLayout`** reescrito para suportar agrupamento por
  categoria, drawer mobile via `Sheet` e badge "Em breve" para
  placeholders. Mantém a API anterior (recebe `children`) — todas as
  rotas existentes continuam funcionando sem alteração.

### Notas

- O escopo MVP do PRD-019 inclui: hub navegável + edição funcional do
  subconjunto especificado + placeholders informativos. CRUD de
  usuários e lojas, conexão real com WhatsApp, gateway de pagamento,
  configuração de IA do SDR, editor visual do pipeline e edição da
  matriz RBAC ficam para Fase 2.
- Toda edição dispara audit log (PRD-006) e exibe toast "Configuração
  salva" com ícone de check.
- **Marco** — com este PRD, o **Bloco 1 (Central de Atendimento e
  CRM)** está completo.

---

## [0.15.0] — Wallet · 2026-05-26

Gestão de Carteira e Transferências (PRD-018) — `/app/carteira` deixa
de ser placeholder e passa a entregar o **sistema completo de
transferências entre vendedores**, com três sabores (temporária com
reversão automática, permanente individual e permanente em lote),
painel administrativo em 3 abas (Ativas, Histórico, Auditoria),
notificações por toast, audit log imutável e integração com a ficha
do cliente (PRD-012) e a lista de clientes (PRD-015).

### Added

- **Rota `/app/carteira`** substitui o placeholder por `CarteiraPage`
  em `src/features/carteira/`. Protegida por `requireAuth` com
  `transfer:view` — apenas Owner e Gestor têm acesso; Vendedor é
  redirecionado para `/sem-permissao`.
- **Painel em 3 abas:** **Ativas** (cards detalhados com tipo, rota
  vendedor → vendedor, contador de clientes, período de cobertura,
  tempo restante até a reversão automática e ação "Reverter agora"),
  **Histórico** (tabela paginada com filtros por tipo, vendedor de
  origem/destino, status final e período) e **Auditoria** (lista de
  eventos `transfer.create`, `transfer.revert` e `transfer.expire`
  com detalhes expansíveis before/after).
- **Header com contadores em tempo real** — "X ativas · Y temporárias
  em vigência" — e dropdown "+ Nova transferência" com 3 atalhos
  (Temporária, Permanente individual, Permanente em lote). Os dois
  últimos abrem orientação direcionando ao fluxo correto (ficha do
  cliente para individual, lista com multi-select para batch).
- **`<NewTemporaryTransferModal>`** — workflow completo: dropdowns De
  / Para com sellers da loja, range de datas (start ≥ hoje, end >
  start), motivo categórico (Férias, Licença médica, Treinamento,
  Outro) + detalhes opcionais, cobertura "Todos os clientes do
  titular" (default) ou "Selecionar específicos" via multi-select com
  checkboxes. Inclui detecção de **conflito de cobertura** (alerta
  amarelo quando já existe temporária ativa para o mesmo titular) e
  **preview** antes de confirmar.
- **`<NewPermanentIndividualTransferModal>`** — chamado pela ficha do
  cliente (PRD-012 → menu ⋮ → "Transferir carteira"). Substitui o
  redirect anterior para `/app/carteiras`. Cliente e vendedor atual
  ficam lockados; motivo obrigatório como textarea; confirmação
  destacada antes de submeter.
- **`<NewPermanentBatchTransferModal>`** — chamado pela ação em lote
  da Lista de Clientes (PRD-015). Substitui o `TransferSellerModal`
  anterior por uma versão polida: lista expansível dos clientes
  selecionados, validação de motivo obrigatório, agrupamento
  automático por `fromSellerId` quando a seleção atravessa
  vendedores diferentes (cria 1 `ICarteiraTransfer` `permanent_batch`
  por grupo, não N individuais), e confirmação enfatizando o caráter
  permanente da ação.
- **`<RevertTransferModal>`** — confirmação contextual (texto
  diferente para temporary vs permanent) ao clicar "Reverter agora";
  toast de sucesso/erro e invalidação de queries.
- **Reversão automática (`useAutoRevertTimer`)** — hook montado uma
  vez no `AppLayout`, ativo para Owner/Gestor enquanto o app está
  aberto. A cada 60 segundos varre transferências temporárias com
  `autoRevertAt <= now` e `status='active'`, chama
  `transfersProvider.expire(id)` em cada uma, atualiza
  `customer.sellerId` para o titular original, grava audit log
  `transfer.expire` e dispara toast "Transferência temporária
  revertida automaticamente". Caminho Fase 2 (Edge Function com
  `pg_cron`) documentado em `docs/carteira.md`.
- **Banner discreto na ficha (`<CoverageBanner>`)** — exibido no
  `ProfileHeader` (PRD-012) quando há cobertura temporária ativa
  cobrindo o cliente. Lê transferências `temporary`/`active` que
  contêm `customer.id` e mostra o titular original e a data de
  retorno: _"Este cliente está sob cobertura temporária. Volta para
  [titular] em [data]."_
- **Tipos de filtros novos no provider de transferências** —
  `IListTransfersParams` agora aceita `statuses`, `types`, `since` e
  `until`, permitindo o histórico filtrado e a varredura otimizada do
  timer de auto-revert.
- **Métodos `revert(id)` e `expire(id)` no provider** —
  `ITransfersProvider` ganha duas mutações. Ambas validam que a
  transferência está em `active`, reescrevem `customer.sellerId`
  para o titular original e gravam audit log com `before` (status
  anterior) e `after` (snapshot com sellers e contagem de clientes).
- **`docs/carteira.md`** documenta tipos, modelo, reversão
  automática (MVP e Fase 2), audit log, permissões e a árvore de
  arquivos.

### Changed

- **Provider `transfersProvider.create`** agora reescreve
  `customer.sellerId` para o titular destino também em transferências
  `temporary` (antes era exclusivo de `permanent_*`). Necessário para
  refletir corretamente quem atende o cliente durante a vigência da
  cobertura; a reversão automática restaura o `sellerId` original.
- **Audit log de transferências** padronizado em `resource='transfer'`
  com ações `transfer.create`, `transfer.revert`, `transfer.expire`.
  A aba Auditoria do painel embebe uma view filtrada por essas três
  ações. O tipo `action` do `logMockMutation` foi alargado para
  aceitar strings semânticas (`transfer.*`) além dos verbos CRUD.
- **Ficha do cliente (PRD-012):** o item "Transferir carteira" no
  menu ⋮ deixa de redirecionar para `/app/carteiras?customerId=…` e
  passa a abrir o novo modal `<NewPermanentIndividualTransferModal>`
  inline.
- **Lista de Clientes (PRD-015):** a ação em lote "Transferir
  vendedor" troca o `TransferSellerModal` antigo pelo
  `<NewPermanentBatchTransferModal>` da feature de carteira, ficando
  alinhada ao audit log central e ao novo design system.
- **Barrel `@/providers/data`** exporta agora `ICreateTransferInput`
  para consumo pelos hooks de mutação (`useCreateTransfer`,
  `useRevertTransfer`, `useExpireTransfer`).

### Security

- **Audit log imutável de transferências** — toda criação, reversão
  manual ou expiração automática registra ator, alvo, snapshot
  before/after e storeId. Base de evidências para o módulo de
  Comissões (PRD-047, Onda 2) resolver disputas do tipo "esse
  cliente fechou comigo".
- **Validação cross-store no front** — modais filtram a lista de
  sellers pelo storeId do cliente; transferência entre lojas exige
  permissão de Owner (preparado para validação no backend na Fase 2).

## [0.14.0] — Pipeline · 2026-05-26

Pipeline de Leads (PRD-017) — `/app/leads` deixa de ser placeholder e passa
a entregar um **funil leve com 5 estágios, Kanban e Lista alternáveis,
conversão preservando memória organizacional e métricas integradas**. O
vendedor enxerga onde cada lead trava, o gestor encontra gargalos no
Kanban e a ficha do cliente convertido mantém o histórico pré-conversão
acessível.

### Added

- **Rota `/app/leads`** substitui o placeholder por `LeadsPage` em
  `src/features/leads/`. Toggle Kanban/Lista persistido em URL
  (`?view=kanban|list`); Kanban é o default.
- **Kanban com 5 colunas** vindas de `IPlatformSettings.pipelineStages`
  (defaults via `SEED_PIPELINE_STAGES`). Cada coluna mostra contagem,
  tempo médio no estágio (proxy via `updatedAt`) e empty state.
- **Drag-and-drop nativo (HTML5)** entre estágios com audit log
  `lead.stage_changed` e toast de confirmação. Drop na coluna final
  abre `<CloseDecisionModal>` perguntando "Convertido ou Perdido?".
- **`<LeadCard>`** com avatar/iniciais, nome, telefone, badge de
  temperatura (🔵/🟡/🔴), valor estimado compacto, próxima ação
  colorida por urgência (verde/amarelo/vermelho), origem (WhatsApp /
  E-commerce / Indicação / Google / Outro) e mini-avatar do vendedor.
- **Lista alternativa** (`<LeadsList>`) com 10 colunas e ordenação por
  nome, temperatura, valor estimado, próxima ação, dias no estágio e
  data de criação. Clique em linha navega para o detalhe.
- **Filtros completos com URL sync** — estágio (lista), temperatura,
  origem, vendedor (multi-select), próxima ação (atrasadas / hoje /
  esta semana / futuras), período de criação (24h / 7d / 30d), faixa
  de valor estimado, loja (Owner only), busca textual em nome/telefone,
  toggles "Incluir perdidos" e "Incluir convertidos".
- **Métricas no header do Kanban** — taxa de conversão (30d), tempo
  médio total (ciclo `createdAt → updatedAt` dos convertidos) e valor
  médio convertido, calculados em `computeGlobalMetrics()` e
  memoizados.
- **`/app/leads/:id`** — `LeadDetailPage` com header (avatar, badges,
  ações), card "Dados do lead" com edição inline de valor estimado,
  próxima ação e temperatura, e três tabs: **Conversas** (consome
  `conversationsProvider.list({ leadId })`), **Notas** (placeholder) e
  **Histórico** (consome `auditsProvider.list` filtrando por
  `resource: "lead"` e renderiza linha do tempo com timestamps).
- **`<NewLeadModal>`** — criação manual com nome, telefone (validação
  10–11 dígitos), e-mail opcional, origem, valor estimado,
  temperatura, estágio inicial (default "Novo"), vendedor responsável
  (locked para Vendedor, dropdown para Gestor/Owner) e próxima ação.
  Audit log `lead.created` e navegação automática para o detalhe.
- **`<ConvertLeadModal>`** — discriminated B2B/B2C, pré-preenche
  dados do lead, valida CNPJ (14 dígitos) / CPF (11 dígitos), cria
  `ICustomer` com `convertedFromLeadId`, `convertedFromLeadAt` e
  `convertedBySellerId`, atualiza `lead.convertedToCustomerId` e
  `lead.stage = "Convertido"`, emite dois audit logs (`lead.converted`
  - `customer.created`) e navega para a ficha do cliente.
- **`<MarkAsLostModal>`** — dropdown obrigatório de motivo da perda
  alimentado por `IPlatformSettings.lossReasons` (defaults via
  `SEED_LOSS_REASONS`), notas opcionais, audit log `lead.lost`.
- **Próxima ação visual** — badge colorido no card e na lista (verde
  para futura/amanhã, amarelo para hoje, vermelho para atrasada com
  contagem de dias) calculado em `getNextActionInfo()`.
- **Permissões respeitadas** — Vendedor vê apenas leads atribuídos
  (`sellerScopeIds` aplicado em `useLeadsList`); Gestor/Owner veem
  loja/cross-store conforme RBAC já vigente.

### Changed

- **Rotas de leads** reestruturadas — `app.leads.tsx` vira layout
  (`<Outlet>`), `app.leads.index.tsx` carrega `LeadsPage` com
  `validateLeadsSearch`, e `app.leads.$id.tsx` carrega
  `LeadDetailPage`.

### Tech notes

- **Drag-and-drop sem dependência adicional** — implementação via
  HTML5 Drag-and-Drop API nativo (`onDragStart` / `onDrop`) para
  evitar a 24h supply-chain guard do `@dnd-kit/sortable`. Mobile
  (< 768px) deve preferir a Lista; a alternativa de teclado fica
  garantida pelo `onKeyDown` do card que abre o detalhe.
- **Stage configurável via Settings** — `usePipelineSettings(storeId)`
  lê `IPlatformSettings.pipelineStages` e `lossReasons`; fallback
  estável para os seeds quando o store ainda não materializou
  settings.
- **Métricas memoizadas** — `computeStageMetrics` e
  `computeGlobalMetrics` são chamadas em `useMemo` no Kanban e na
  barra superior para satisfazer RNF-005.

## [0.13.0] — Fleet · 2026-05-26

Veículos do Cliente (PRD-016) — veículo passa a ser **entidade de primeira
classe** com listagem geral, página de detalhe, histórico de manutenção
estruturado, recomendações proativas baseadas em km e cadastro
configurável em 3 modos (auto / aprovação / apenas gestor). **Marco: o
vendedor para de perguntar "qual o caminhão?" toda vez — toda peça vendida
pode ser amarrada a um veículo e o sistema avisa quando a próxima
manutenção está chegando.**

### Added

- **Rota `/app/veiculos`** substitui o placeholder por `VehiclesListPage`
  em `src/features/vehicles/pages/`. Tabela paginada com 9 colunas (marca,
  ano, motor, placa, cliente, vendedor, km, última manutenção, status),
  ordenação por 5 colunas e paginação configurável (25/50/100/200).
- **Rota `/app/veiculos/:id`** — `VehicleDetailPage` com 6 seções:
  cabeçalho com badge de cadastroStatus, dados técnicos, proprietário,
  histórico de manutenção (timeline reversa), recomendações de manutenção
  e peças compatíveis (placeholder até PRD-030).
- **Filtros combináveis com URL sync** — marca (multi-select), modelo
  (texto livre), faixa de ano, motor (texto livre), status de cadastro,
  vendedor (Gestor/Owner) e loja (Owner). Atalho "Pendentes" filtra
  cadastros pendentes em um clique.
- **Busca textual** — placa, VIN, modelo ou nome do cliente.
- **`<NewVehicleModal>`** — autocomplete de cliente proprietário escopado
  à carteira do vendedor, dropdown de marca (5 fabricantes + "Outro"),
  validação de ano (1990 a ano atual + 1), placa brasileira
  (7 caracteres), VIN (17 caracteres) e anti-duplicata de placa por
  cliente.
- **3 modos de cadastro** (`IPlatformSettings.vehicleCadastroMode`):
  `auto_aprovado` cria como aprovado; `aprovacao_obrigatoria` deixa
  pendente até revisão do gestor; `manual_apenas_gestor` esconde o botão
  "+ Veículo" do vendedor.
- **Override por vendedor** — `ISeller.vehicleCadastroMode` permite
  exceções por usuário (resolvido em `useCadastroMode`).
- **Edição inline de km** com confirmação obrigatória para mudanças
  acima de 50.000 km — proteção contra erros de digitação que invalidam
  o histórico.
- **Histórico de manutenção estruturado** — `IVehicleServiceEntry` em
  timeline cronológica reversa com data, km, peças trocadas (badges) e
  referência ao pedido derivado quando aplicável.
- **`<AddServiceEntryModal>`** — registro manual com date picker, km,
  tags de peças (adicionar com Enter), observações e toggle para
  associar a um pedido do mesmo cliente.
- **Recomendações proativas** — heurística de 4 regras (filtros, correia,
  freios, revisão) com intervalos fixos: card amarelo a 5.000 km da
  próxima troca (10.000 km na revisão completa) e card vermelho quando
  atrasado. CTA "Criar orçamento" reservado para PRD-031.
- **Aprovação/rejeição** — individual via página de detalhe e em lote via
  multi-select na listagem. Rejeição abre AlertDialog pedindo motivo
  (opcional) e gera audit log.
- **`<CustomerVehiclesList>`** consumido pela tab Veículos da ficha do
  cliente (PRD-012) — substitui o componente embutido anterior por uma
  visão unificada com até 5 cards e link "Ver todos os N veículos".

### Changed

- **`VehicleCadastroMode` ganha terceiro modo** — `manual_apenas_gestor`
  somado aos dois existentes (`auto_aprovado`, `aprovacao_obrigatoria`).
  Tipo exportado via `@/shared/types`.
- **`IVehiclesProvider.list`** estendido com `customerIds`, `brands`,
  `model`, `engine`, `yearMin`, `yearMax`, `cadastroStatuses`, `storeIds`,
  `sellerIds`, `search`, `orderBy` e `orderDir`. Mock cruza com customers
  para resolver filtros por loja e vendedor.
- **`IVehiclesProvider.addServiceEntry`** — novo método para registrar
  manutenções; atualiza `currentKm` quando o entry tem km maior que o
  atual.
- **`VehiclesTab`** da ficha do cliente reduzido a wrapper de
  `<CustomerVehiclesList>` (DRY com a listagem geral).

### Tech notes

- 60 veículos seeded vinculados a 25 clientes B2B suportam o PRD; mocks
  ganharam helpers para resolver customer-name e seller-id no cruzamento
  de filtros.
- Stub Supabase atualizado para o novo método `addServiceEntry`
  (`NotImplementedError` até PRD-110+).

## [0.12.0] — Ledger · 2026-05-26

Lista Geral de Clientes (PRD-015) — visão macro da base que complementa a
ficha individual (PRD-012). Tabela paginada com 4 colunas obrigatórias + 9
opcionais configuráveis, 10 filtros combináveis com URL sync, busca textual
em nome/CNPJ/CPF/telefone/email/notas, segmentações salvas private/shared
com CRUD próprio, multi-select com 5 ações em lote e drill-down via layout
3:2 para a ficha existente. **Marco: gestor e vendedor passam a operar a
base como um conjunto — uma campanha de recuperação que antes exigia 30
cliques agora vira filtro + 3 cliques + um toast "23 clientes atualizados".**

### Added

- **Rota `/app/clientes`** substitui o placeholder por `CustomersListPage`
  em `src/features/customers/pages/`. Layout 3:2 em desktop (≥ 1024px) com
  tabela à esquerda e `<CustomerProfile>` (PRD-012) à direita; mobile
  navega para `/app/clientes/:id` em tela cheia.
- **Provider estendido** — `IListCustomersParams` ganha `statuses[]`,
  `abcClasses[]`, `tags[]`, `sellerIds[]`, `recencyBuckets[]`,
  `recencyCustom`, `ticketRange`, `ltvRange`, `vehicleBrands[]`,
  `storeIds[]` e novas chaves de `orderBy` (`ticketMedio`, `ltv`,
  `recency`, `abcClass`, `status`). Filtros anteriores (`status`, `tag`,
  `sellerId`) preservados para back-compat. Mock implementa cruzamento com
  vehicles para o filtro de marca.
- **Segmentações CRUD** — `ISegmentsProvider` ganha `create`, `update`,
  `delete` (mock + audit). `useSegments()` agrupa em `privateOnes` /
  `shared`, com mutations tipadas e invalidação automática do cache.
- **Transferências em lote** — `ITransfersProvider` ganha `create`. Mock
  agora aceita `permanent_batch` com re-atribuição imediata do `sellerId`
  nos clientes afetados e registro do `ICarteiraTransfer` correspondente.
- **`<CustomersTable>`** com colunas obrigatórias (checkbox, nome+avatar,
  tipo, ABC, status) + opcionais (CNPJ/CPF, vendedor com avatar, ticket
  médio, recência colorida, LTV, tags com truncate, cidade, última conversa,
  cadastro). Ordenação clicável (5 colunas sortáveis), navegação por
  setas ↑↓ entre linhas mantendo a ficha aberta, highlight amarelo do
  termo de busca.
- **`<CustomersFiltersBar>`** com 10 controles: Status (multi), Tipo
  (toggle Ambos/B2B/B2C), ABC (multi com "Sem classificação"), Tags (multi
  searchable), Vendedor (multi searchable — locked em si para Vendedor),
  Recência (multi com 4 faixas), Ticket médio (presets + custom min/max),
  LTV (presets + custom), Veículo marca (Volvo/Scania/Mercedes/Ford/Iveco
  - "Qualquer"), Loja (Owner only quando há ≥ 2 lojas acessíveis). Combina
    via AND, indicador "N filtros ativos" + botão "Limpar tudo".
- **Busca textual** com URL sync, pesquisa em nome (razão social / nome
  fantasia / fullName), CNPJ / CPF (digits-only normalizado), telefone
  normalizado, email e conteúdo de notas. Highlight visual onde encontrado.
- **Segmentações salvas** — `<SegmentsDropdown>` lista private (do user)
  - shared (da loja) com badge "ativa". `<SaveSegmentModal>` cria
    segmentação a partir dos filtros atuais (nome ≤ 50 chars + escopo
    Privada/Compartilhada — Vendedor não pode criar shared).
    `<ManageSegmentsModal>` permite renomear, mudar escopo e excluir.
    Comportamento "Modificado" quando filtros divergem da segmentação ativa
    — Owner/Gestor pode "Salvar alterações" ou "Salvar como nova".
- **Multi-select + ações em lote** — checkbox por linha + "Selecionar
  todos da página" (com tri-state indeterminate). Quando há seleção parcial
  e existem mais itens filtrados, botão "Selecionar todos os N filtrados"
  recarrega o conjunto inteiro (até 500). Barra `<BulkActionsBar>` oferece:
  Adicionar tag (autocomplete + tags livres), Remover tag (lista apenas as
  tags presentes nos selecionados), Transferir vendedor (Owner/Gestor, gera
  `ICarteiraTransfer` `permanent_batch` agrupando por vendedor de origem),
  Marcar dormente (com confirm), Exportar CSV / LGPD (placeholders com
  tooltip "Disponível na Fase 2"). Cada ação registra audit log com
  `action: "bulk_*"` + sumário.
- **`<ColumnsConfigModal>`** persiste em localStorage
  (`gallo-customers-columns`) o conjunto de colunas opcionais visíveis.
  Botão "Restaurar padrão" disponível.
- **`<NewCustomerModal>`** — criação rápida B2B/B2C com validação de
  CNPJ/CPF (length + dígitos repetidos), telefone (10–11 digits), email
  opcional, vendedor responsável locked em si para Vendedor / livre para
  Owner/Gestor. Após criar, abre a ficha do novo cliente automaticamente.
- **URL sync completa** — `validateCustomersSearch` valida e normaliza
  filtros, ordenação, paginação, busca, segmentação ativa e cliente
  selecionado em query params. URLs ficam compartilháveis e refresh
  preserva todo o estado.
- **Empty states contextuais** — sem filtros (CTA "+ Cliente"), com
  filtros ("Limpar filtros"), busca sem resultados (mostra o termo) e
  estado de erro com "Tentar novamente". Skeleton de tabela durante fetch
  inicial.
- **Permissões aplicadas** — Vendedor só vê sua carteira (filtro
  `sellerIds` é forçado em si mesmo, dropdown de Vendedor não aparece);
  Gestor vê toda a loja com ações em lote completas; Owner vê cross-store
  com filtro de Loja habilitado.

### Changed

- `IListCustomersParams` (contrato) recebe os novos campos opcionais sem
  remover os antigos — código existente que usa `status`, `tag` ou
  `sellerId` continua válido.
- `ISegmentsProvider` deixa de ser read-only no MVP — `create`, `update`
  e `delete` agora fazem parte do contrato.
- `ITransfersProvider` ganha `create`, habilitando o fluxo de
  transferência em lote a partir desta página.

### Notes

- Export CSV e LGPD por cliente individual seguem como placeholders Fase 2,
  conforme escopo do PRD-015.
- Edição inline na tabela fora do MVP — clientes são editados via ficha
  (PRD-012) acessada por drill-down.
- Versão bump 0.11.0 → 0.12.0 (MINOR) — nova feature substantiva.
- `package.json` → `0.12.0`.

## [0.11.0] — Cockpit · 2026-05-26

Painel do Gestor (PRD-014) — visão operacional em tempo real para Owner e
Gestor. Sete widgets que respondem "como vai o atendimento agora?" em três
linhas: KPIs (TMA, TMR, Taxa de Resolução, Backlog) com indicador de tendência
versus período anterior; carga por vendedor com barras coloridas por saúde;
heatmap de volume 7×24 em SVG nativo; saúde da carteira como donut clicável;
e lista de alertas ativos com dispensa por 24h. Drill-down em todo widget,
filtros sincronizados na URL e configuração de limiares (Owner) com audit log.
**Marco: gestor passa a operar com visão proativa — alertas e tendências em
vez de feeling, com modal de configuração dos limites por loja.**

### Added

- **Rota `/app/inicio`** substitui o placeholder por `ManagerDashboardPage`
  para Owner / Gestor. Vendedor enxerga EmptyState explicativo com CTA para
  a Central de Atendimento — sem dado vazando.
- **Aggregate provider** `IManagerDashboardProvider.snapshot(params)` em
  `src/providers/data/contracts/managerDashboard.ts` — payload único com
  `openConversations`, `sellers`, `customers`, `conversationsInPeriod`,
  `messagesInPeriod` e os equivalentes do período anterior para tendência.
  Implementação mock em `src/mocks/api/managerDashboard.ts` + stub Supabase
  para Fase 2 (materialized view / RPC).
- **Header com filtros globais** sincronizados na URL via `useDashboardFilters`
  (`?periodo=…&vendedor=…&loja=…&canal=…`) — Período (Hoje default, Ontem,
  7d, 30d), Vendedor, Loja (locked em Gestor), Canal. Limites do período
  resolvidos como janelas atual + anterior na mesma chamada.
- **KPIs (linha 1)** — `<KpiCard>` reutilizável com badge de tendência
  adaptativa (verde quando melhora, vermelho quando piora; lógica invertida
  entre "menor é melhor" — TMA/TMR/Backlog — e "maior é melhor" — Taxa de
  Resolução). Cálculos em `src/features/manager-dashboard/utils/kpiMath.ts`:
  - **TMA**: média do span entre primeira mensagem do cliente e `lastMessageAt`
    em conversas resolvidas no período.
  - **TMR**: média entre cada `direction: "in"` do cliente e o primeiro
    `direction: "out"` `authorType: "seller"` que responder.
  - **Taxa de Resolução**: resolvidas / abertas × 100 sobre o período.
  - **Backlog**: contagem absoluta de `status === "aguardando"` agora.
- **Carga e Heatmap (linha 2)**:
  - `<SellerLoadList>` ordena vendedores por carga atual decrescente, com
    avatar + iniciais, dot de availability, barra colorida em 3 bandas
    (normal ≤ 67% do limite, warning, critical acima do `sellerOverloadThreshold`).
  - `<VolumeHeatmap>` em SVG nativo 7×24 com 6 níveis de intensidade
    derivados da cor de acento do tema. Hover mostra tooltip "Seg 14h: 23
    mensagens" com `aria-live` para leitores de tela.
- **Carteira e Alertas (linha 3)**:
  - `<CarteiraHealthDonut>` em Recharts mostra distribuição dos clientes por
    `CustomerStatus`. Centro do donut traz o total absoluto; legenda lateral
    é clicável e leva a `/app/clientes?status=…`.
  - `<ActiveAlertsList>` agrega três tipos com `useActiveAlerts`:
    - **Cliente A dormente**: clientes com `abcClass === "A"` e
      `status === "dormente"`, mensagem traz o número de dias sem compra.
    - **Vendedor sobrecarregado**: carga acima do limiar configurado.
    - **Conversa sem resposta**: agregação de conversas `aguardando` há mais
      do que `conversationWaitingHoursThreshold` horas.
  - Severidade dita ícone, cor e ordenação (critical → high → medium).
    Botão "Dispensar" persiste hash + timestamp em `localStorage` por 24h
    (chave `gallo-alert-dismissed-{hash}`). Recálculo automático a cada
    `alertPollingSeconds`.
- **Drill-down em todo widget**: KPIs e Backlog navegam à inbox filtrada;
  carga leva ao filtro `assignment=<sellerId>`; donut leva à lista de clientes
  por status; alerta de cliente abre a ficha (`/app/clientes/$id`); alerta de
  vendedor leva à inbox filtrada por aquele vendedor.
- **Configuração de alertas** — `<AlertSettingsModal>` Owner-only abre via
  botão ⚙ no header. Sliders + inputs numéricos sincronizados para limite
  de conversa sem resposta (1-24h) e sobrecarga (5-50 conversas), toggles
  individuais por tipo de alerta, select de frequência (15s / 30s / 60s / 5min).
  Save chama `settingsProvider.update({ managerDashboard })` e emite
  `auditLog({ action: "manager_dashboard_settings.update" })`.
- **Modelos novos**:
  - `IManagerDashboardSettings` em `src/shared/types/platform.ts` com
    thresholds, toggles e polling, integrado a `IPlatformSettings`.
  - `IManagerDashboardSnapshotParams` / `IManagerDashboardSnapshot` em
    `src/providers/data/contracts/managerDashboard.ts`.
- **Defaults da matriz** em `src/mocks/data/seedManagerDashboard.ts` — limites
  4h de espera, 15 conversas de sobrecarga, todos os alertas habilitados,
  polling de 30s. Reexportados pelo barrel `src/mocks/data/index.ts`.
- **Mock user Gestor** — perfil `mock-gestor` (Marina Cardoso) adicionado a
  `MOCK_USERS`. Vincula ao seller existente `seller-marina-cardoso` para que
  os filtros e o lock de loja exercitem o caminho não-Owner.
- **Real-time** — o painel reaproveita `useRealtimeConversations` (PRD-010)
  como heartbeat: cada nova mensagem simulada bumpa o `refreshKey` do snapshot
  hook (`useDashboardSnapshot`), que refaz a chamada em background sem
  esqueletos. Toggle no header acende/apaga o pulse e pausa as atualizações.

### Changed

- **Role guard de `/app`** agora aceita `Gestor` (era `["Owner", "Vendedor"]`)
  para permitir que o novo perfil veja o painel sem ficar preso em
  `/sem-permissao`.
- **`IPlatformSettings`** carrega o novo campo obrigatório `managerDashboard`.
  Mock seed da matriz traz os defaults; código que cria settings precisa
  preencher (não há migração porque ainda estamos em Fase 1 com mocks).
- **`IDataProviders`** ganha a chave `managerDashboard`. Factory mock e stub
  Supabase devolvem ambas as implementações.

### Notes

- Cálculos derivam timestamps das mensagens — na Fase 2 a TMA real virá do
  audit log de mudança de status (`conversation.resolve`), encerrando a
  aproximação atual baseada em `lastMessageAt`.
- O drill-down de célula do heatmap leva à inbox dos últimos 30 dias com uma
  pista textual no campo de busca; a filtragem por janela horária exata fica
  para um refinamento futuro da inbox.
- Alertas de "Vendedor sobrecarregado" usam o mesmo `sellerOverloadThreshold`
  do banding visual da carga, garantindo coerência entre o visual e a
  geração do alerta — mudou o limite, recolore E reemite alertas.

## [0.10.0] — Switchboard · 2026-05-26

Regras de distribuição e roteamento (PRD-013) — toda conversa nova passa por
um engine puro de 5 critérios em cascata, configurável pelo Owner, com
auditoria completa. A loteria do "quem viu primeiro responde" acaba aqui:
carteira é sagrada, especialista atende quem é da sua marca, restante via
round-robin balanceado, fallback inteligente para SDR ou fila quando ninguém
disponível. **Marco: gestor passa a controlar a operação de atendimento com
regras explícitas e simulador para testar cenários antes de aplicar.**

### Added

- **Engine puro** em `src/features/distribution/engine/` — função
  `distributeConversation(input, context): IDistributionResult` sem side
  effects, determinística (round-robin via cursor persistente, não aleatório).
  Cinco critérios encapsulados em `tryCarteira`, `tryEspecialidade`,
  `tryRoundRobin`, `tryCarga`, `tryFallback` mais utilitários
  `isWithinBusinessHours`, `getOnlineSellers`, `selectByLoad`,
  `selectByRoundRobin`, `findSpecialtyMatches`. Função pronta para ser invocada
  tanto pelo mock provider quanto, na Fase 2, por uma Edge Function do Supabase
- **Modelos novos** em `src/shared/types/distribution.ts`:
  - `IDistributionSettings` aninhado em `IPlatformSettings.distribution` com
    `mode`, `criteriaEnabled`, `criteriaOrder`, `businessHours`,
    `offHoursMessage`, `queueTimeoutMinutes`, `lastAssignedSellerId`,
    `specialtyKeywords`
  - `IDistributionTrace` com `selectedSellerId`, `criterionMatched` (carteira /
    especialidade / round_robin / carga / fallback_sdr / fallback_fila),
    `candidatesEvaluated[]` (todos os vendedores avaliados, mesmo descartados,
    com motivo), `mode` na hora da decisão — base do histórico auditado
  - `IBusinessHoursWindow` para janelas semanais
- **Defaults da matriz** em `src/mocks/data/seedDistribution.ts` — modo
  `hybrid`, todos os critérios ativos, horário seg-sex 8h-18h + sáb 8h-12h,
  fila com timeout de 30 min, 11 keywords de especialidade (volvo, scania,
  mercedes, ford, iveco, freio, motor, embreagem, filtro, turbo, injetor)
- **Integração com o mock provider** — `IConversationsProvider.create(input)`
  novo no contrato; `mockConversationsProvider.create` chama o engine, persiste
  a conversa + primeira mensagem (do cliente) + bubble `system` quando há
  mensagem fora do expediente, registra o `IDistributionTrace` e emite
  `auditLog` (`conversation.create`). Round-robin avança o cursor
  `lastAssignedSellerId` em settings após cada vitória
- **`distributionTracesApi` + provider novo** — `list/get/create` com filtros
  por `storeId`, `selectedSellerId`, `criterionMatched`, janela temporal.
  `mockDistributionTracesProvider` na Fase 1; stub Supabase em
  `supabaseDistributionTracesProvider` lançando `NotImplementedError` até
  Fase 2. Hook `useDistributionTracesProvider()` exposto pelo barrel
- **Gerador de traces históricos** — `generateDistributionTrace` no bootstrap
  produz ~40 traces sintéticos cobrindo todos os critérios para popular o
  histórico no primeiro carregamento
- **Página `/app/configuracoes/distribuicao`** (Owner only via
  `requireAuth(..., ["Owner"], { resource: "settings", action: "edit" })`) com
  7 seções:
  - **`ModeSection`** — 4 cards radio (Automático / Híbrido recomendado /
    SDR-first / Manual) com modal de confirmação antes de salvar
  - **`CriteriaSection`** — reordenação via ↑↓, toggle on/off por critério,
    fallback bloqueado para sempre ficar ativo, aviso visual quando só o
    fallback restar habilitado, draft + botão "Salvar critérios"
  - **`BusinessHoursSection`** — grade semanal com switch por dia + inputs
    `time` para abertura/fechamento
  - **`OffHoursMessageSection`** — textarea com 600 caracteres + preview da
    bolha do SDR ao lado
  - **`QueuePolicySection`** — input numérico de minutos de timeout da fila
  - **`DistributionSimulator`** — escolhe cliente/lead, canal e mensagem;
    roda engine puro localmente (sem persistir) e renderiza trace visual com
    candidatos avaliados e vencedor destacado
  - **`TriggerInboundSection`** — dispara `conversationsProvider.create()`
    de verdade, exercitando engine + trace + audit log + toast em tempo real
  - **`DistributionHistory`** — tabela paginada (10/pg) com filtros por
    critério e vendedor, cada linha expandível mostra trace completo
- **`AvailabilityToggle`** embutido no avatar dropdown do `TopBar` — 4 opções
  (Online verde, Ausente amarelo, Ocupado laranja, Offline cinza) consumindo
  `sellersProvider.setAvailability` com audit log e toast
- **Badge "Em fila"** no `ConversationListItem` para conversas órfãs
  (`assignedSellerId: null && status === "aguardando" && !isSdrActive`)
- **Filtro "Em fila"** no `AssignmentFilter` da inbox — adiciona
  `unassigned + isSdrActive=false + status=aguardando` aos params
- **`useDistributionToasts`** montado em `AppLayout` — polla traces filtrados
  por `selectedSellerId === currentUser.sellerId` a cada ~9s; cada trace novo
  dispara toast "Nova conversa atribuída a você" com botão "Ver" navegando
  para `/app/atendimento/$id`. Bootstrap inicial só seeda o set de
  já-vistos sem disparar alertas
- **`useDistributionSettings(storeId)`** — hook de leitura/escrita aninhado
  em `IPlatformSettings.distribution`, com audit log automático em cada save
- **Mapeamento `IMockUserProfile.sellerId`** opcional (mock-owner →
  seller-joao-gallo, mock-vendedor → seller-carlos-santos) para que o
  AvailabilityToggle consiga consultar/atualizar o seller real
- **Doc `docs/distribuicao.md`** com arquitetura do engine, semântica dos
  critérios, traces, contratos para Fase 2, matriz de permissões e defaults

### Changed

- **`IPlatformSettings`** ganha campo obrigatório `distribution:
IDistributionSettings`; seed da matriz preenche com defaults
- **`IConversationsProvider`** ganha método `create(input)` retornando
  `{ conversation, messages, trace }`; supabase stub lança `NotImplementedError`
- **`IBootstrappedDataset`** ganha coleção `distributionTraces`
- **`mutations.ts`** e **`selectors.ts`** estendidos para `distributionTraces`
- **`SettingsLayout`** ganha entrada "Distribuição" gated por permissão de
  edição de settings — visível só para Owner
- **`InboxFilters` / `useInboxFilters`** — novo valor `queue` no
  `AssignmentFilter` + tradução em `INBOX_STRINGS.assignmentOptions.queue`;
  conserta uso de `s.displayName` (que não existe em `ISeller`) para `s.fullName`

### Notes

- **Engine pronto para Fase 2** — função pura sem dependência de provider;
  a Edge Function do Supabase consumirá o mesmo `distributeConversation`
  passando o contexto via parâmetros
- **Watchdog da fila** (alerta quando `queueTimeoutMinutes` for excedido)
  fica para quando a inbox passar a operar com WhatsApp real em Fase 2 —
  no MVP a métrica é configurável mas o efeito é descritivo
- **Transferência manual** (Owner/Gestor mover conversa entre vendedores)
  já existia via `conversationsProvider.assignSeller`; este PRD não altera
  esse fluxo

## [0.9.0] — Compass · 2026-05-25

Ficha unificada do cliente (PRD-012) — o "cérebro do CRM" entra em órbita.
O vendedor agora vê todo o contexto comercial e relacional do cliente sem
sair da conversa: métricas, dados cadastrais, carteira, frota, histórico
de pedidos e orçamentos, conversas anteriores, notas internas e
recomendações ativas — tudo em uma coluna lateral de 360px à direita do
`ConversationLayout`. **Marco: cada resposta do vendedor passa a ter
contexto completo na ponta dos dedos; o "espera aí, deixa eu buscar no
sistema" acaba aqui.**

### Added

- **`<CustomerProfile>`** em `src/features/customers/components/` consumido
  em duas superfícies — coluna lateral do `ConversationLayout` (drawer no
  tablet, navegação para tela cheia no mobile) e página dedicada
  `/app/clientes/:id` (substitui o placeholder do PRD-003) — com a mesma
  experiência adaptada via prop `variant: "column" | "page"`
- **`<ProfileHeader>`** com avatar (hash de cor por id reutilizando o
  helper compartilhado), nome, badges de tipo (B2B/B2C), classe ABC
  (ouro/prata/neutro), ciclo de vida (4 cores semânticas) e o badge
  **"Histórico pré-conversão"** com Popover que mostra origem do cliente
  (data de criação como lead, dias até conversão, vendedor/SDR que
  converteu) — preservando memória organizacional na transição lead→cliente
- **7 tabs** com lazy load (cada tab busca dados apenas quando ativada):
  - **Visão geral** com 5 cards: `<MetricsCard>` (ticket médio, LTV,
    recência, frequência, classe ABC + share), `<CadastraisCard>`
    (discriminated union B2B/B2C — CNPJ/razão social/contato vs CPF/nome,
    endereço completo), `<StatusWalletCard>` (ciclo de vida, vendedor com
    avatar, `<StoreBadge>` do PRD-007, primeira/última compra),
    `<TagsCard>` (mecânica completa com autocomplete do catálogo
    promovido + tags livres em cinza com flag "rascunho" + botão
    **"Sugerir promoção"** que registra intenção pendente),
    `<PortalCard>` (7 toggles read-only do `IPortalSettings` — edição
    sinalizada como PRD-019)
  - **Pedidos** — lista paginada (10/pg) com filtros de período
    (30d/90d/12m/tudo), badges combinados de `paymentStatus` +
    `fulfillmentStatus`, item-síntese e click navega para detalhe
  - **Orçamentos** — lista paginada com badge de status + origin
    (SDR/vendedor/portal/e-commerce) + desconto aplicado
  - **Veículos** — cards da frota (marca/modelo/ano/motor/placa/km) com
    histórico de manutenção (últimos 3 serviços) + dialog **"Adicionar
    veículo"** que respeita `IPlatformSettings.vehicleCadastroMode`
    (auto-aprovado salva direto, aprovação obrigatória marca como pendente)
  - **Conversas** — histórico de todas as conversas com o cliente,
    conversa atual destacada com badge "Atual" no topo, vendedor de cada
    atendimento com avatar mini
  - **Notas** — timeline imutável (sem editar/deletar — audit trail) com
    autor + tempo relativo, textarea com atalho **Cmd/Ctrl + Enter**
  - **Recomendações** — só os 3 tipos do MVP (`recovery`,
    `vehicle_maintenance`, `follow_up`) com prioridade colorida e botão
    **"Dispensar"** que resolve via provider + audit log
- **`<ProfileMenu>`** (kebab) com 7 ações contextuais filtradas por RBAC
  (PRD-006): Editar dados, Marcar como dormente, Transferir carteira,
  Bloquear cliente (gated por `<AlertDialog>` que muda status para
  "perdido"), Adicionar veículo, **Ver no Pipeline** (condicional —
  aparece quando `convertedFromLeadId` existe e navega para o lead),
  Exportar dados LGPD (placeholder Fase 2, Owner only)
- **`<CustomerProfileFiche>`** + `useFicheLayout()` — wrapper responsivo
  que escolhe entre 3 modos:
  - `column` (≥ 1280px) — sidebar fixo de 360px que colapsa para 0
    quando `fiche.open` é false, mantendo o cache React Query quente
  - `drawer` (768–1279) — `<Sheet>` que desliza pela direita
  - `route` (< 768) — botão "Ficha" navega para `/app/clientes/:id` em
    tela cheia em vez de toggle
- **`useFicheButtonHandler`** decide entre toggle e navegação conforme
  breakpoint, integrado ao botão "Ficha" do `<ConversationHeader>`
- **Cache de 2 minutos** via React Query `staleTime` em
  `useCustomerProfile` (RNF-003) — reabrir a mesma ficha em < 50ms
- **Audit log** em todas as mutações sensíveis: mudança de status
  (markedDormant, blocked), tag adicionada/removida/promovida, nota
  adicionada, recomendação dispensada, veículo criado

### Changed

- **`ICustomer` estendido** com snapshot de campos surfados pela ficha:
  `purchaseStats` (ticketMedio / LTV / orderCount12m), `abcClass` +
  `abcShare`, `convertedFromLeadId` + `convertedFromLeadAt` +
  `convertedBySellerId` (back-pointer da conversão lead→cliente),
  `portal` (embed de `IPortalSettings`), `address` (`ICustomerAddress` —
  novo type). Mock generator popula todos esses campos durante o
  bootstrap em um passo de enriquecimento pós-orders/ABC
- **`IRecommendationsProvider.list`** ganha `subjectId?` e aceita array
  de `type` — necessário para filtrar recomendações de um cliente
  específico nos 3 tipos do MVP
- **`/app/clientes`** virou rota de layout (passthrough `<Outlet>`) com
  `app.clientes.index.tsx` segurando o placeholder PRD-015 e
  `app.clientes.$id.tsx` rendering a ficha de página inteira
- **`useConversationsProvider.list`** ganha ordenação por `orderBy:
"lastMessageAt" | "abcClass"` (não era exposto antes)

### Fixed

- **`InboxFilters`** — `setSellers(res.data)` quebrava quando o usuário
  era Owner/Gestor (provider de sellers retorna array, não paginado);
  trocado para `setSellers(res)`. `s.displayName` corrigido para
  `s.fullName` (ISeller não tem displayName)
- **`<Tooltip>` sem provider** quebrava o `ConversationHeader` quando a
  página era acessada por deep link (Owner indo direto para
  `/app/atendimento/:id`); `TooltipProvider` agora envolve a página
- Generator de endereço duplicava o prefixo (`Rua Rua Nogueira`) porque
  `faker.location.street()` já retorna nome completo em pt-BR
- `conversationDisplay` agora reusa `hashHue` + `initialsFrom` extraídos
  para `@/shared/utils/avatar` (eliminando duplicação com a ficha)

### Notes

- Helpers de formatação compartilhados em `@/shared/utils/format.ts`:
  `formatBRL`, `formatBRLCompact`, `formatCPF`, `formatCNPJ`,
  `formatPhone`, `formatPercent`, `formatDateBR`, `formatDateTimeBR`,
  `formatRelativeTimeBR`, `daysSince`
- Lazy load por tab + skeletons individuais por tab atende RNF-001
  (< 400ms para a Visão Geral default) e RNF-002 (tab inativa não busca)
- Navegação por teclado entre tabs (←/→) nativa via Radix Tabs satisfaz
  RNF-005 (WCAG AA)

---

## [0.8.0] — Pilot · 2026-05-25

Conversa multicanal (PRD-011) — a coluna central do `ConversationLayout`
ganha vida. O vendedor agora atende dentro da plataforma com histórico
rico, envio com optimistic UI, indicador da janela de 24h do WhatsApp Meta
e ações contextuais auditadas. **Marco: a inbox (PRD-010) deixa de ser
um placeholder no centro — todas as conversas ficam realmente operáveis,
sem necessidade de fugir para WhatsApp Web.**

### Added

- **`ConversationPage`** em `/app/atendimento/:id` substitui o
  placeholder do PRD-001; consome `<ConversationLayout>` via `<Outlet>`
  com header, histórico, indicador de janela 24h e input de mensagem
- **`<ConversationHeader>`** com avatar (iniciais coloridas por hash do
  participante), nome, canal + número (subtítulo), pill de status com cor
  semântica (4 estados: aguardando / em_andamento / aguardando_cliente /
  resolvida / arquivada), badge "SDR ativo" quando aplicável, botões
  **Criar orçamento** (navega para `/app/orcamentos?customerId=...`),
  **Ficha** (toggle persistido em `localStorage`) e menu **⋮**
- **6 tipos de bubble tipados** em `components/bubbles/`:
  `<TextBubble>` (whitespace preservado), `<ImageBubble>` (thumbnail
  clicável que abre modal + skeleton de loading + caption opcional),
  `<AudioBubble>` (player com play/pause real, waveform SVG determinística
  por id, duração formatada `mm:ss`, placeholder de transcrição),
  `<DocumentBubble>` (ícone por extensão — PDF/XLSX/DOCX/ZIP — nome,
  tamanho determinístico, botão download), `<SystemBubble>`
  (centralizado, itálico, sem balão), `<TemplateBubble>` (selo "Template"
  - parser de variáveis + linha de quick-replies)
- **`<MessageBubble>`** discriminador polimórfico — escolhe o bubble certo
  via `mediaType` / `authorType` / prefixo `[template]`
- **Direção e autoria visual**: bubbles `in` à esquerda em surface neutra;
  `out` do vendedor à direita em `--primary/10`; **bubbles do SDR à
  direita em `--brand-parts/10` com borda esquerda sólida + badge "🤖 SDR"
  no canto + tooltip "Mensagem enviada pelo agente SDR"**
- **Status visual de envio (out only)** com tooltip explicativo:
  - `sent` ✓ cinza
  - `delivered` ✓✓ cinza
  - `read` ✓✓ azul
  - `failed` ⚠ vermelho com botão "Tentar novamente"
- **`<MessageList>`** com paginação por scroll-up (`IntersectionObserver`
  - sentinela no topo carrega mais antigas preservando posição via
    delta de `scrollHeight`), auto-scroll inteligente (somente quando o
    usuário já estava no fim — não interrompe leitura), `role="log"` +
    `aria-live="polite"` para acessibilidade
- **Marcadores temporais automáticos** entre grupos de mensagens via
  `groupMessagesWithDaySeparators`: "Hoje", "Ontem", dia da semana por
  extenso (últimos 7 dias) ou "12 de maio" (mais antigas; inclui ano
  quando diferente do atual)
- **`<MessageInput>`** com textarea de auto-resize (1-5 linhas, scroll
  interno após excesso), botões de **anexo** (dropdown imagem/documento/
  áudio — placeholders com toast "em breve"), **emoji** (popover com
  16 emojis e inserção na posição do cursor), **templates** (apenas
  visível como habilitado quando provider é Meta), **enviar** (Enter
  envia, Shift+Enter quebra), e linha de **sugestões IA** estáticas
  baseadas em palavras-chave da última mensagem do cliente ("preço",
  "estoque", "prazo", "boleto") com botões clicáveis que preenchem o
  textarea
- **Optimistic UI no envio** via `useMessageSend`:
  1. mensagem aparece imediatamente como `sent` (✓ cinza)
  2. após 200-500ms transita para `delivered` (✓✓ cinza)
  3. após 1-3s extras, com 80% de probabilidade vira `read` (✓✓ azul)
  4. em 5% das tentativas vira `failed` com retry inline
     Taxas configuráveis em `utils/sendSimulation.ts`
- **`<MetaWindowIndicator>`** com 4 estados visuais:
  - 🟢 Verde (> 12h): "Janela aberta — Xh restantes"
  - 🟡 Amarelo (1-12h): mesma copy + sugestão "Considere usar template"
  - 🔴 Vermelho (< 1h): "Janela fechando — X min restantes"
  - ⚪ Cinza (= 0): "Janela fechada — apenas templates HSM"
    Re-cálculo a cada 30s via `setInterval`; aparece **apenas** para Meta
    provider com `whatsappAccount.provider === "meta"` e conversa não-
    arquivada
- **`useMetaWindow`** computa tempo restante a partir do
  `lastInboundMessageAt` derivado das mensagens no contexto, expondo
  `canSendFreeText` que o input consome para desabilitar texto quando
  a janela fecha
- **`<TemplateDialog>`** modal com seletor de templates HSM mockados
  (4 templates: follow-up de orçamento, cobrança gentil, confirmação de
  entrega, saudação inicial), inputs para variáveis (`{{nome}}`,
  `{{produto}}`, etc.), pré-visualização com substituição em tempo real
  e botão "Enviar template" — habilita apenas quando todas as variáveis
  estão preenchidas
- **`<ConversationMenu>`** (kebab no header) com permissões dinâmicas via
  `usePermission`:
  - Marcar resolvida / Reabrir (qualquer com `edit` em `own`)
  - Marcar não-lida (reseta `gallo-conversation-last-view-...` para
    forçar badge na inbox)
  - Transferir (Owner/Gestor — abre `<TransferDialog>` com dropdown de
    vendedores da loja)
  - Escalar para gestor (Vendedor, quando SDR ativo — encontra primeiro
    gestor disponível via `accessibleStoreIds.length > 1`)
  - Pausar/Retomar SDR (Owner/Gestor, quando aplicável)
  - Arquivar/Desarquivar (Owner/Gestor)
  - Adicionar nota (qualquer com `edit` em customer — abre
    `<NoteDialog>` que chama `customersProvider.addNote`)
- **Toast com botão "Desfazer" (5s)** para ações reversíveis: resolver,
  arquivar, retomar, e cada uma grava `recordAuditLog` em ambas as
  direções (a ação original e o desfazer)
- **Auditoria via PRD-006** em toda mutation sensível
  (`conversation.resolve`, `conversation.transfer`,
  `conversation.archive`, `conversation.toggle_sdr`) com `before`/`after`
- **`<TypingIndicator>`** "Cliente está digitando…" com 3 pontos
  animados; aparece probabilisticamente (30% a cada 20-40s) em
  conversas `em_andamento` / `aguardando_cliente`, dura 3-8s
- **`useConversationDetail`** carrega conversa + customer/lead +
  whatsappAccount de uma vez, expondo `notFound` para o empty state e
  `refresh` para invalidação manual após mutações
- **`useMessages`** com paginação descendente (50/página) traduzida para
  ordem ascendente de display; cache local com `appendOptimistic`,
  `commit`, `fail`, `update` e `retry` para o ciclo de envio
- **`ConversationContext`** compartilha o estado de mensagens entre
  `<MessageList>` e `<MessageInput>` para que a janela 24h e as sugestões
  IA consigam ler a última mensagem inbound sem prop drilling
- **`IWhatsAppAccountsProvider`** novo contrato + impl mock + stub
  Supabase + hook `useWhatsAppAccountsProvider`, expondo `list` e `get`
  para alimentar capabilities e número do header
- **Catálogo de templates HSM mockados** em `utils/hsmTemplates.ts` com
  4 templates representativos, `renderTemplate` para substituição de
  variáveis e `templateReady` para validação inline
- **`CONVERSATION_STRINGS`** namespace em `i18n/pt-BR.ts` cobrindo
  header, empty states, separadores temporais, bubbles, status,
  indicador 24h, input, menu e diálogos
- **Empty states** para conversa não encontrada (com botão "Voltar à
  inbox") e conversa nova sem mensagens
- **Read-only mode** no input quando vendedor não é o atribuído ou a
  conversa está arquivada — copy explícita no rodapé

### Changed

- **`/app/atendimento/:id`** — rota deixa de ser `PlaceholderPage` e
  passa a renderizar `<ConversationPage>` real
- **Barrel `@/features/conversations`** expõe `ConversationPage` ao lado
  do `InboxPage` e `InboxCenterPlaceholder`
- **`IDataProviders`** ganha campo `whatsappAccounts` na agregação
  retornada pela factory; ambas as implementações (mock + Supabase stub)
  registradas no `getDataProviders()`

### Notes

- **`@tanstack/react-virtual` ficou de fora** — o gerador de mocks produz
  no máximo 25 mensagens por conversa e o histórico renderiza
  fluidamente sem virtualização. Quando o dataset crescer na Fase 2,
  basta envolver o `.map` do `<MessageList>` no `useVirtualizer` sem
  tocar nos bubbles. Comentário de planejamento mantido no componente.
- **Emoji picker dedicado ficou de fora** — usamos um popover do
  `shadcn` com 16 emojis representativos do dia-a-dia comercial
  (caminhão, peças, dinheiro, etc.) para evitar nova dependência sob o
  supply-chain guard de 24h do `bunfig.toml`
- **Anexos reais ficaram de fora** — os botões abrem dropdown com 3
  opções (imagem/documento/áudio) e disparam `toast.info("em breve")`
  porque o MVP não tem storage; o fluxo de mídia já está modelado nos
  bubbles e nos tipos para a entrada de Fase 2
- **IA real ficou de fora** — sugestões são heurísticas estáticas
  baseadas em palavras-chave (palavra "preço" sugere "Vou te passar o
  valor…"). LangChain/OpenAI virá no PRD-101+
- **Codinome Pilot** marca o momento em que o vendedor pilota a
  plataforma de ponta a ponta: lê histórico, envia mensagem, recebe
  template HSM dentro da janela de 24h e executa ações contextuais sem
  precisar abrir outra ferramenta. O CRM deixa de ser passivo

## [0.7.0] — Hub · 2026-05-25

Inbox unificado (PRD-010) — primeira tela do Bloco 1 (CRM e Central de
Atendimento). A coluna esquerda do `ConversationLayout` ganha vida: lista
paginada de 80+ conversas mockadas, 6 filtros combinados sincronizados na
URL, 3 modos de ordenação (recência, tempo de espera, prioridade ABC),
busca textual com destaque, atualização em tempo real simulada,
ações rápidas no hover (atribuir-me, transferir, arquivar), e estados
contextuais para vazio/erro. **Marco: porta de entrada do CRM ativa —
PRD-011 (Conversa) e PRD-012 (Ficha) podem ser implementados agora.**

### Added

- **`src/features/conversations/`** em 5 subpastas (`pages`, `components`,
  `hooks`, `utils`, `i18n`) + barrel `@/features/conversations` como
  superfície pública
- **`InboxPage`** em `/app/atendimento` consumindo `<ConversationLayout>`
  via slot esquerdo, com `app.atendimento.tsx` convertido para layout
  route que orquestra lista + `<Outlet>` para a coluna central
- **`app.atendimento.index.tsx`** com `<InboxCenterPlaceholder>` para o
  estado "selecione uma conversa"
- **`<ConversationListItem>`** densamente informativo: avatar com
  iniciais coloridas por hash, nome, timestamp relativo auto-atualizado a
  cada minuto, preview da última mensagem (com handling de mídia),
  contador de não-lidas (limite 9+), badges de canal/SDR/temperatura/Novo,
  borda esquerda colorida por status, destaque de busca via `<mark>`
- **6 filtros combinados** via dropdowns shadcn: Status, Canal, Atribuição
  (contextual ao papel — Vendedor só vê "Atribuídas a mim"; Owner/Gestor
  ganha "Todas", "Sem atribuição" e sub-lista por vendedor), Tags
  multi-select, Período (24h/7d/30d), busca textual debounced 300ms
- **3 modos de ordenação**: Mais recentes (default), Tempo de espera
  (filtra `aguardando` + ordena asc), Prioridade ABC (join com
  `IABCClassification` + tiebreak por recência)
- **`useInboxFilters`** sincroniza filtros com query params da URL via
  TanStack Router `useSearch`/`useNavigate`; defaults são omitidos do
  URL para mantê-lo enxuto; `validateSearch` rejeita valores inválidos
  silenciosamente
- **`useConversationsList`** com paginação cursor-style (30/página) e
  scroll infinito via `IntersectionObserver`; suporta `refreshKey` para
  refetch em camadas (real-time refaz páginas 1..N preservando posição)
- **`useRealtimeConversations`** dispara mensagens simuladas a cada
  8-15s (jittered) chamando `messagesProvider.simulateIncoming`; bumpa
  `tick` para o `useConversationsList` refrescar; toggle persistido em
  `localStorage` chave `gallo-realtime-enabled`
- **`<RealtimeToggle>`** no header da lista (ícone `mdi:radio-tower` /
  `mdi:radio-tower-off`) com tooltip e estado "Atualização pausada"
- **`<QuickActions>`** no hover/foco do item: Atribuir-me (qualquer user
  quando conversa está sem dono), Transferir (Owner/Gestor — dropdown
  de vendedores via `useSellersProvider`), Arquivar (Owner/Gestor) —
  cada ação grava `recordAuditLog` com `before`/`after` e mostra toast
  via sonner com botão "Desfazer" (rollback de 5s)
- **`<InboxEmptyState>`** contextual: copy varia entre "sem conversas",
  "filtros vazios" e "busca sem resultados"; botão "Limpar tudo" inline
- **`useUnreadTracking`** persiste timestamp de última visualização por
  usuário+conversa (`gallo-conversation-last-view-{userId}-{convId}`)
  para bold/unbold após mark read; sync cross-tab via `storage` event
- **`useLastSelectedConversation`** lembra a última conversa aberta
  (`gallo-last-conversation-id`) e reabre automaticamente ao voltar à
  inbox sem id na URL
- **Atalhos de teclado**: `↑↓` navega entre conversas, `/` foca a busca,
  `Enter` abre (intrínseco ao Link)
- **Mobile**: `<ConversationLayout>` ganha prop `mobileShow: 'list' |
'conversation'` para alternar entre lista cheia (sem seleção) e
  conversa cheia (com seleção) em viewports < 768px
- **Real-time + SDR**: badge prominente "🤖 SDR" com tooltip explicativo
  quando `isSdrActive: true`; badge "Novo!" verde por 60s após
  `lastMessageAt`

### Changed

- **`IConversationsProvider.list`** aceita novos params: `tags?: string[]`,
  `search?: string`, `fromDate?/toDate?: string`, `unassigned?: boolean`,
  `orderBy?: 'lastMessageAt' | 'abcClass'`, `orderDir?: 'asc' | 'desc'`;
  e `status` agora aceita array (`ConversationStatus[]`)
- **`IMessagesProvider`** ganha método `simulateIncoming(conversationId,
text?)` que cria mensagem `direction: 'in'` no mock (no-op no
  Supabase stub até PRD-100+)
- **Mock `conversationsApi.list`** implementa busca textual em
  `customer.name`/`phone`/últimas 20 mensagens, filtro de tags
  (intersecta com `customer.tags`/`lead.tags`), ordenação ABC com
  tiebreak por recência
- **Mock `conversationsApi.archive`** agora seta `status: 'arquivada'`
  em vez de remover do dataset (alinhado com o status enumerado)
- **`_storeScope.ts`** ganha helper `withOwnSellerScope` que injeta
  `assignedSellerId = currentUser.id` quando o usuário tem scope `own`
  (não `store`/`all`) — Vendedor agora vê apenas conversas próprias
  sem precisar de filtragem manual no componente
- **`<ConversationLayout>`** ganha prop `mobileShow` (default
  `'conversation'`, retrocompatível) para suportar lista em tela cheia
  no mobile

### Notes

- **Sem novas dependências de runtime** — `date-fns` (timestamps),
  `sonner` (toasts) e `@tanstack/react-router` já presentes; supply-chain
  guard preservado (`bunfig.toml` intocado)
- **Virtual scroll** ficou de fora do MVP — 80 conversas mockadas
  renderizam fluidamente com scroll comum + `IntersectionObserver`;
  pode-se adicionar `@tanstack/react-virtual` em iteração futura quando
  o dataset crescer (Fase 2)
- **Codinome Hub** marca a abertura do CRM como hub central do operador:
  inbox unificada que concentra toda a comunicação multicanal num só
  lugar antes da expansão pela conversa (PRD-011), ficha (PRD-012),
  distribuição (PRD-013) e métricas gerenciais (PRD-014)

## [0.6.0] — Compass · 2026-05-25

Multi-loja (PRD-007) — fundação completa de operação cross-store. Toda
entidade comercial passa a carregar `storeId` de forma obrigatória, as
listagens dos providers ganham filtro implícito por loja ativa via
`withStoreScope`, o `<StoreSwitcher>` substitui o placeholder do TopBar e
uma página read-only em `/app/configuracoes/lojas` consolida a visão. No
MVP só existe a matriz; a infraestrutura está pronta para receber filiais
e parceiras na Fase 2 sem refatoração arquitetural. **Marco: Bloco 0
(Fundação) está completo.**

### Added

- **`src/features/multistore/` em 5 subpastas** (`hooks`, `utils`,
  `components`, `pages`, `store`) + barrel `@/features/multistore` como
  única superfície pública da camada multi-loja
- **`MultistoreProvider`** entre `<AuthProvider>` e a árvore de rotas;
  carrega o roster de lojas via `useStoresProvider()`, resolve a loja
  ativa em quatro etapas (localStorage → loja primária → primeira
  acessível → null), e persiste a escolha na chave `gallo-current-store-id`
- **Hooks reativos** `useCurrentStore()`, `useAccessibleStores()` e
  `useStoreById()` consumindo o context
- **Helper `withStoreScope(params, ctx)`** com tipagem genérica
  preservando o tipo de entrada — três comportamentos: usuário anônimo →
  `storeId='__no_user__'`; scope `all` → cross-store; demais →
  `storeId=currentStoreId`
- **Helpers `getCurrentContext()`** (acesso síncrono fora de React),
  **`getStoreForUser()`** e **`isStoreAccessible()`**
- **Holder externo `multistoreStore`** com pub/sub pequeno para o
  contexto sincronizar com chamadas fora de React (mock providers em
  selectors)
- **Helpers internos do mock layer** (`_storeScope.ts`):
  `scopedListParams`, `withCreateStoreId`, `assertImmutableStoreId`
- **`<StoreSwitcher>`** integrado ao `<TopBar>` substituindo o placeholder
  estático — sempre visível, abre dropdown mesmo com 1 loja com nota
  "Filiais e parceiras serão habilitadas na Fase 2"; `setCurrentStore`
  com fallback de toast em erro
- **`<StoreBadge store>`** pill compacta por tipo (matriz/filial/parceira)
  pronta para listas cross-store na Fase 2
- **`StoresPage`** em `/app/configuracoes/lojas` (read-only), com card
  por loja acessível mostrando CNPJ, endereço, divisões ativas, número
  de vendedores e clientes vinculados; entrada no `SettingsLayout`
  gated por `permission: { resource: 'store', action: 'view' }`
- **Auditoria de troca de loja** via `auditLog({ action: 'switch_store' })`
  reusando o pipeline do PRD-006 — visível em `/app/configuracoes/auditoria`
  quando exercitada na Fase 2
- **Campo `accessibleStoreIds?: ID[]`** em `ISeller` (extensão pontual do
  PRD-002) habilitando a Fase 2 a atribuir vendedores a múltiplas lojas
- **Campo `storeId: ID`** em `IMockUserProfile` + `accessibleStoreIds?`
  como input para o provider resolver a loja ativa por perfil mockado
- **Campo `storeId: ID`** em `ICommission` (era a única entidade
  transacional faltando o campo); generator e `commissionsApi` atualizados
- **Filtros `storeId` adicionados** em `commissionsApi`, `recommendationsApi`,
  `auditsApi` e suas contratuais correspondentes
- **`docs/multistore.md`** com filosofia, helpers, fluxos de erro,
  esqueleto de policies Supabase RLS e roteiro passo a passo para
  ativar uma filial na Fase 2
- **Glossário** ganha entradas para "Loja ativa (current store)",
  "Matriz", "Filial" e "Parceira"

### Changed

- **Todos os 11 mock providers com entidades scoped por loja** passam a
  consumir `scopedListParams(params, resource)` em `list()` —
  `customers`, `orders`, `quotes`, `leads`, `conversations`,
  `commissions`, `goals`, `transfers`, `recommendations`, `sellers`,
  `audits`
- **Mutations `create`** de `customers`, `orders`, `quotes` e `leads`
  preenchem `storeId` automaticamente quando o caller omite — via
  `withCreateStoreId`
- **Mutations `update`** das mesmas entidades bloqueiam alteração de
  `storeId` (`MockValidationError` com mensagem clara — imutabilidade
  no MVP, transferência fica para Fase 2)
- `auditLog()` e `logMockMutation()` resolvem `storeId` via
  `getCurrentContext()` (com fallback ao seed `store-matriz`), abandonando
  o hardcode anterior
- `<TopBar>` substitui o placeholder "GALLO Matriz" pelo `<StoreSwitcher>`
  reativo
- `SettingsLayout` ganha entrada "Lojas" gated por permissão
- `IListAuditsParams`, `IListCommissionsParams`, `IListRecommendationsParams`
  passam a aceitar `storeId?`

## [0.5.0] — Pilot · 2026-05-25

RBAC visual (PRD-006) — matriz canônica de permissões para os 7 papéis, com
helpers/hooks/componentes reativos, integração com o route guard do PRD-003,
auditoria visual e logging de runtime acoplado aos providers. Tudo é
disciplina de UX/UI; a segurança real entra na Fase 2 com Supabase RLS.

### Added

- **`src/features/rbac/` em 5 subpastas** (`permissions`, `utils`, `hooks`,
  `components`, `pages`) + barrel `@/features/rbac` como única superfície
  pública
- **Matriz de permissões** para 7 papéis (`Owner`, `Gestor`, `Vendedor`,
  `SDR`, `Cliente`, `VendedorExterno`, `Financeiro`) × 18 recursos × 5
  ações × 4 scopes em `permissions/matrix.ts`, com índice pré-computado
  `EFFECTIVE_PERMISSIONS_INDEX` para lookup O(1)
- **Constantes tipadas** `RESOURCES`, `ACTIONS`, `SCOPE_ORDER` com union
  literal — `ResourceName` e `PermissionAction` ganham checagem em compile-time
- **Helpers síncronos** `hasPermission()`, `compareScopes()`,
  `scopeSatisfies()`, `getEffectivePermissions()`, `getCurrentUserScope()`
- **Hooks reativos** `usePermission(resource, action, scope?)` e
  `useCurrentRole()` que consomem o `AuthProvider` do PRD-003 e
  re-renderizam ao trocar perfil
- **Componentes declarativos** `<Can resource action scope? fallback?>` e
  `<Forbidden message?>` (reusa o `EmptyState` do PRD-001)
- **Extensão de `requireAuth(pathname, roles?, permission?)`** mantendo
  retrocompatibilidade — todas as rotas existentes continuam funcionando
- **Tela `/app/configuracoes/papeis`** (read-only) com tabs para os 7
  papéis e tabela de recursos × ações × scope; badge "Edição na Fase 2"
- **Tela `/app/configuracoes/auditoria`** com lista paginada, filtros
  laterais (ator, ação, recurso, faixa de data) sincronizados com a URL,
  expansão de cada item mostrando `before`/`after` em JSON
- **Botão "Exportar CSV"** placeholder com tooltip "Disponível na Fase 2"
- **Audit log runtime**: novo `IAuditsProvider` no barrel
  `@/providers/data` com `mock` + `supabase` stub; `recordAuditLog()`
  fire-and-forget exposto publicamente; helper `auditLog()` em
  `@/features/rbac` para uso por features
- **Mock providers de `customer`, `order`, `quote`, `commission`** passam
  a registrar audit log automaticamente em `create`/`update`/`delete`
  (e `approve` em commission)
- **`AuthProvider`** registra `auth.signin` e `auth.signout` em todo
  evento de troca de perfil
- **`SettingsLayout`** ganha filtragem por permissão fina (não só por
  papel) e exibe entradas "Papéis" e "Auditoria" para quem tem `view` em
  `role` / `audit_log`
- **`docs/rbac.md`** com matriz completa, exemplos de uso e esqueleto das
  policies Supabase RLS previstas para a Fase 2

### Changed

- `requireAuth(pathname, roles?, permission?)` agora aceita um terceiro
  parâmetro opcional `permission` que aciona a checagem RBAC fina; a
  assinatura antiga `requireAuth(path, [...roles])` continua válida
- `auditsApi` (mocks/api/audits.ts) ganha `create`, suporte a filtros
  multi-valor (`actorIds`, `actions`, `resources`) e por faixa de data
  (`since`, `until`); `mutations.ts` expõe `audits` como collection
  mutável
- `package.json` → `0.5.0`

## [0.4.0] — Hub · 2026-05-25

Provider Pattern (PRD-005) — a "fundação invisível" que protege todo o app
de retrabalho na Fase 2. Features passam a consumir dados exclusivamente
através de hooks tipados; a escolha entre mock e Supabase vira uma variável
de ambiente.

### Added

- **`src/providers/data/` em 4 subpastas** (`contracts`, `impl/mock`,
  `impl/supabase`, `hooks`) + `factory.ts`, `context.tsx`, `errors.ts` e
  barrel `@/providers/data` como única superfície pública
- **16 contratos TypeScript** (`ICustomersProvider`, `IVehiclesProvider`,
  `ILeadsProvider`, `IConversationsProvider`, `IMessagesProvider`,
  `IPartsProvider`, `IQuotesProvider`, `IOrdersProvider`,
  `ICommissionsProvider`, `IGoalsProvider`, `IRecommendationsProvider`,
  `ITransfersProvider`, `ISegmentsProvider`, `ISellersProvider`,
  `IStoresProvider`, `ISettingsProvider`) espelhando 1:1 as APIs do
  PRD-004, com tipo agregador `IDataProviders`
- **16 implementações `mockXxxProvider`** delegando para `@/mocks` — pura
  delegação, sem lógica adicional
- **16 esqueletos `supabaseXxxProvider`** lançando `NotImplementedError`
  tipado com referência ao PRD futuro de implementação
- **`getDataProviders()`** lê `import.meta.env.VITE_DATA_SOURCE`
  (`mock` default | `supabase`) com fallback `mock` + `console.warn` em
  dev quando valor é inválido; instâncias são singletons para referência
  estável no React Context
- **`<DataProvidersProvider>`** inserido entre `<ThemeProvider>` e
  `<AuthProvider>` no `__root.tsx`; expõe os providers via Context
- **16 hooks** (`useCustomersProvider`, `useOrdersProvider`, etc.) com
  helper interno `useDataProviderSlice` que lança erro claro quando usado
  fora do Provider
- **`NotImplementedError`** com `instanceof Error` e mensagem completa
  (provider + método + PRD futuro)
- **`.env.example`** documentando `VITE_DATA_SOURCE`
- **`src/vite-env.d.ts`** tipando `import.meta.env.VITE_DATA_SOURCE` como
  `'mock' | 'supabase' | undefined`
- **Regras ESLint `no-restricted-imports`** bloqueando: features
  importarem `@/mocks` ou `@/mocks/api/*` (apenas `impl/mock/**` pode);
  qualquer arquivo fora de `src/providers/data/` importar `impl/*`,
  `contracts/*` ou `factory`; com exceção dev-only para
  `src/routes/design-system.tsx` (acessa `useResetMocks`)
- **`docs/provider-pattern.md`** com filosofia, diagrama de camadas,
  passo a passo de adição de novo agregado, regras de isolamento e
  aplicação futura em outras integrações (WhatsApp, pagamento, frete)

### Changed

- **`src/routes/__root.tsx`** — árvore de providers passa a ser
  `QueryClientProvider > ThemeProvider > DataProvidersProvider >
AuthProvider > <Outlet/>`

## [0.3.0] — Genesis · 2026-05-25

Camada de mocks completa (PRD-004) — a "fundação invisível" sobre a qual todo
o app vai operar até a Fase 2 (Supabase).

### Added

- **`src/mocks/` em 5 subpastas** (`config`, `data`, `generators`, `store`,
  `api`, `hooks`) com barrel raiz `@/mocks` como única superfície pública
- **Geradores determinísticos** para ~32 entidades do modelo conceitual
  (PRD-002): clientes B2B/B2C, veículos, leads, conversas, mensagens, peças,
  orçamentos, pedidos, comissões, metas, recomendações, transferências de
  carteira, segmentos, papéis, auditoria, contas WhatsApp, badges, ranking,
  positivação e curva ABC
- **Determinismo via `seedrandom`** + `@faker-js/faker` (locale `pt_BR`),
  reseedados por contexto: a mesma seed produz exatamente o mesmo dataset em
  qualquer máquina
- **Volumes realistas**: ~2200 itens no dataset default (70 clientes,
  200 peças, 80 conversas, ~600 mensagens, 120 pedidos espalhados em
  12 meses, 80 leads, 30 orçamentos, 8 metas, 25 recomendações)
- **Integridade referencial**: validador em dev percorre todas as FKs no fim
  do bootstrap e loga inconsistências sem quebrar a UI
- **Store Zustand interno** (`mockStore`) com `selectors` e `mutations`
  tipados — bootstrap automático no primeiro acesso à store
- **APIs públicas** seguindo contrato CRUD + queries específicas por agregado
  (`customersApi`, `vehiclesApi`, `leadsApi`, `conversationsApi`,
  `messagesApi`, `partsApi`, `quotesApi`, `ordersApi`, `commissionsApi`,
  `goalsApi`, `recommendationsApi`, `transfersApi`, `segmentsApi`,
  `sellersApi`, `storesApi`, `settingsApi`, `auditsApi`, `badgesApi`,
  `rankingsApi`, `positivationsApi`, `abcsApi`, `whatsappAccountsApi`,
  `rolesApi`) — assinatura idêntica à do `SupabaseProvider` da Fase 2
- **Paginação genérica** (`IPaginatedResult<T>` + `paginate()` helper)
  uniforme em todas as operações `list`
- **Simulação de latência** (80–180ms default) e **erro tipado** (`ERROR_RATE`
  default 0,5% em dev) em toda chamada de API via wrapper `runApi`
- **Erros tipados**: `MockError` base + `MockNotFoundError`,
  `MockValidationError`, `MockNetworkError`, `MockUnauthorizedError` —
  consumidores narrowing via `instanceof`
- **Logs compactos** no console em dev (`MOCK_LOGS_ENABLED`) para debug, com
  cor por status
- **Hook `useResetMocks`** + seção **"Mocks (dev only)"** em `/design-system`
  permitindo reset com seed customizada ou nova seed automática
- **Regra ESLint** `no-restricted-imports` bloqueando imports de
  `@/mocks/store/*`, `@/mocks/generators/*` e `@/mocks/data/*` fora da pasta
  `src/mocks/` — força uso do barrel público

### Changed

- `package.json` adiciona `zustand`, `@faker-js/faker`, `seedrandom` e
  `@types/seedrandom` como dependências

## [0.2.0] — Genesis · 2026-05-25

Esqueleto navegável da plataforma. PRD-003 implementado.

### Added

- **Roteamento end-to-end**: 3 árvores de rota (`/app/*` interno, `/loja/*`
  vitrine, `/auth/*` login) + rotas de erro (`/sem-permissao`, `/erro`).
  Todas as 30+ rotas funcionais com placeholders referenciando os PRDs futuros
- **Auth mockada** com 3 perfis (Owner "João Gallo", Vendedor "Carlos Santos",
  Cliente "Transportadora Aurora") em `/auth/login`, persistência em
  `localStorage` chave `gallo-mock-user`
- **AuthProvider + useAuth** hook com `signIn`, `signOut`, `hasRole`
- **Guards de role** via `beforeLoad` em rotas TanStack — `/app/*` exige
  Owner ou Vendedor; rotas de Gestão e Carteira exigem Owner
- **8 layouts reutilizáveis**: AppLayout, AuthLayout, EmptyLayout, LojaLayout,
  ConversationLayout (3 colunas), DetailLayout (2 colunas), DashboardLayout,
  SettingsLayout (sub-sidebar)
- **Sidebar** contextualizada por papel (Owner vê todos os agrupamentos;
  Vendedor vê subconjunto), expandida/colapsada com persistência em
  `localStorage` (`gallo-sidebar-collapsed`)
- **TopBar** com logo, seletor de loja (mock "GALLO Matriz"), busca global
  placeholder, notificações com badge + dropdown mockado, ThemeSwitcher,
  avatar com dropdown (Perfil, Configurações, Trocar perfil, Sair)
- **BottomNav** mobile (`<768px`) com 4 itens prioritários + Sheet "Mais"
- **LojaHeader** e **LojaFooter** para vitrine pública
- **PlaceholderPage / EmptyState** componentes reutilizáveis
- **RouteSkeleton** para `<Suspense>` fallback (lazy loading já ativo via
  `tanstackRouter({ autoCodeSplitting: true })`)
- Rota raiz `/` redireciona inteligentemente baseado em auth e papel
- Página `/app/configuracoes/aparencia` minimamente funcional (ThemeSwitcher
  integrado)

### Changed

- `__root.tsx` agora envolve a árvore em `<AuthProvider>`
- Home (`/`) deixou de ser página estática — agora é redirect via
  `beforeLoad`
- README implícito: estrutura `src/features/shell/` e `src/features/auth/`
  introduzidas

### Notes

- **Adaptação ao stack**: PRD-003 especifica React Router v6; mantivemos
  TanStack Router (já configurado e funcional). Conceitos equivalentes
  (rotas aninhadas, lazy loading, guards via `beforeLoad`, layout routes).
- Auth mockada é **UX, não segurança** — qualquer um pode editar
  localStorage. Proteção real virá na Fase 2 (Supabase Auth + RLS).
- Conteúdo funcional das 30+ telas internas será preenchido pelos PRDs
  específicos dos Blocos 1-6.

## [0.1.1] — Genesis · 2026-05-25

Modelo conceitual de domínio completo. PRD-002 implementado.

### Added

- Modelo conceitual GALLO consolidado em `src/shared/types/` (10 arquivos)
  cobrindo ~40 entidades: plataforma, pessoas, cliente, lead, conversa,
  catálogo, comercial e BI
- Tipos utilitários comuns: `ID`, `ISO8601`, `Money`, `Division`,
  `ThemeName`, `ThemeMode` em `common.ts`
- Barrel export em `src/shared/types/index.ts` — import único via
  `@/shared/types`
- `docs/glossario.md` — definições operacionais oficiais do domínio
  (termos técnicos do mercado de peças pesadas, comerciais, operacionais
  e arquiteturais)
- JSDoc com `@see` glossário nas interfaces principais
  (`ICustomer`, `IPart`, `IConversation`, `ICarteiraTransfer`,
  `IPositivation`, `IRecommendation` etc.)
- Discriminated union B2B/B2C em `ICustomer` (CNPJ vs CPF)
- Suporte modelado de 4 tipos de transferência de carteira
  (`CarteiraTransferType`)
- Capability matrix de WhatsApp (`IWhatsAppCapabilities`) preparando UI
  adaptativa por provider

### Changed

- `tsconfig.json` reforçado com `noImplicitAny`, `strictNullChecks` e
  `noUncheckedIndexedAccess`
- `src/config/themes.ts` agora re-exporta `ThemeName` e `ThemeMode` de
  `@/shared/types` (fonte única)
- `src/lib/contrast.ts` ajustado para o novo `noUncheckedIndexedAccess`
- `src/components/ui/input-otp.tsx` ajustado para acesso seguro a slots

### Notes

- `exactOptionalPropertyTypes` permanece **desativado** — incompatível
  com boilerplate atual do shadcn/ui em vários componentes
  (`context-menu`, `dropdown-menu`, `menubar`, `Icon`). Registrado como
  tech-debt; reavaliar em PRD futuro de hardening.
- Equipes (`ITeam`) modeladas mas **dormentes** no MVP.
- SERVICE e INDUSTRIAL modeladas via `Division` mas dormentes no MVP
  (todas as entidades comerciais nascem com `division: 'parts'`).

## [0.1.0] — Genesis · 2026-05-25

Fundação visual da plataforma. PRD-001 implementado.

### Added

- Identidade visual GALLO BASE DIESEL aplicada à UI
- Arquitetura de tokens em 3 camadas: primitivos → semânticos → tema
- Sistema de **4 temas × 2 modos** (8 combinações):
  Diesel (Black Gold), Parts (Forest), Service (Crimson), Industrial (Amber);
  light/dark/auto
- `ThemeProvider`, hook `useTheme()`, `ThemeSwitcher` com codinomes UI
- Persistência em `localStorage` (`gallo-theme`, `gallo-mode`) com fallback
  silencioso quando indisponível
- Script anti-FOUC inline no `<head>` aplicando tema/modo antes do primeiro paint
- Tipografia oficial: **Saira Condensed** (display), **Inter** (UI),
  **JetBrains Mono** (códigos OEM) via Google Fonts com `font-display: swap`
- Logo GALLO em variantes (`horizontal`, `vertical`, `mark`) — placeholders
  tipográficas que adaptam cor ao modo
- Favicon SVG com signo GALLO
- Wrapper `<Icon>` sobre Iconify (`@iconify/react`) com fallback gracioso
  e carregamento sob demanda
- Layout primitives: `Stack`, `Inline`, `Grid`, `Container`
- Galeria shadcn/ui customizada consumindo apenas tokens semânticos
- Rota `/design-system` (dev-only, redireciona em produção) com:
  tokens primitivos, tokens semânticos resolvidos, tipografia, espaçamento,
  raios, sombras, ícones recomendados, galeria de componentes,
  validador de contraste WCAG 2.1 em tempo real
- Respeito a `prefers-reduced-motion`

### Notes

- Logos atuais são **placeholders tipográficas**; substituir pelos SVGs
  oficiais em `public/` quando disponíveis.
- Cores funcionais (`success`/`warning`/`danger`/`info`) são propositalmente
  distintas das submarcas para evitar confusão semântica.
