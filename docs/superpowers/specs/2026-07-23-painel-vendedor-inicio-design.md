# Spec — Painel do Vendedor ("Início")

> **Origem:** design importado do Claude Design (`ui_kits/dashboard`, projeto "GALLO Base Diesel — Design System", `projectId 0dddcf0e-782d-4f2e-be6c-0a094c427bbe`).
> **Criado:** 2026-07-23 · **Status:** 🔄 Em design (aguardando review do dono)

## Contexto / gap

Hoje `/app/inicio` renderiza `ManagerDashboardPage` (`src/features/manager-dashboard/pages/ManagerDashboardPage.tsx`, PRD-014) para todos os papéis. Quando `userRole === "Vendedor"` (linhas 66-78), a página **não mostra nenhum dado** — retorna um `EmptyState` de bloqueio ("Vendedores acompanham o atendimento pela Central... peça acesso ao gestor da loja") com CTA para `/app/atendimento`. Não existe hoje nenhum PRD nem dashboard funcional dedicado ao vendedor interno nessa tela (PRD-014 é do Gestor; PRD-215 é sobre volume de atendimento agregado da loja).

O design importado ("Início · Painel do Atendente") propõe um painel **pessoal** — cada atendente vê só as próprias métricas — para preencher exatamente essa lacuna.

## Decisão de escopo (fechada com o dono)

Entrega em **fase única**, com 6 dos 7 blocos do protótipo com dado real e 1 bloco (recordes/curiosidades) com layout pronto porém dado de exemplo fixo, sinalizado como "em breve":

| Bloco do protótipo | Nesta entrega |
|---|---|
| Saudação + período (Hoje/7 dias/30 dias) | ✅ real |
| KPIs individuais (5 métricas) | ✅ real |
| Sua meta do mês | ✅ real |
| Gráfico de atendimentos | ✅ real |
| Sua fila agora | ✅ real |
| Ranking da loja | ✅ real |
| Recordes & curiosidades (todos os tempos) | ⏸️ layout + dado de exemplo, badge "em breve" — spec própria depois |

## Permissões — matriz de Papéis, não nome de papel

O papel **base** decide *qual home* o usuário vê (`userRole === "Vendedor"` → este painel; Owner/Gestor → `ManagerDashboardPage`). Isso é seguro para papéis customizados: `profiles.role` guarda sempre o papel base e `profiles.role_id` guarda o papel customizado, então um papel customizado com `base_role = Vendedor` continua caindo aqui (`SupabaseAuthProvider` → `mapDbRoleToRoleName`).

Mas **o que cada card mostra** é governado pela matriz editável em `Configurações → Papéis` (PRD-211), não pelo nome do papel. Cada card espelha o recurso que governa a tela cheia correspondente:

| Card | Recurso RBAC |
|---|---|
| KPIs de atendimento (atendimentos, 1ª resposta, fechamento, conversão) | `conversation:view` |
| KPI "Suas vendas" | `order:view` |
| Gráfico de atendimentos | `conversation:view` |
| Sua fila agora | `conversation:view` |
| Sua meta do mês | `goal:view` |

Hoje a matriz concede exatamente isso ao papel Vendedor (`conversation: view+edit/own`, `goal: view/own`, `order: view/own`, `commission: view/own` — verificado em produção). Se o Owner revogar um deles, o menu correspondente some **e o card também** — sem isso, a tela Metas desapareceria do menu enquanto o card da meta continuaria no início.

⚠️ O card de recordes não é gated: é placeholder estático, sem dado real.

## Onde vive (arquitetura)

- Novo componente `SellerDashboardPage` em `src/features/seller-dashboard/` (feature própria — `pages/`, `components/`, `hooks/`, `engine/`, `i18n/`, barrel `index.ts`).
- `ManagerDashboardPage.tsx` troca o bloco `EmptyState` do papel Vendedor (linhas 66-78) por `<SellerDashboardPage />`. Mesma rota `/app/inicio`, mesmo `DashboardLayout` (sidebar/topbar/banner/rodapé já existem de verdade — nada disso é recriado; o protótipo só os desenhou para dar contexto visual).
- Escopo travado ao vendedor logado (`currentUser.sellerId`, via `useAuth()`). Sem visão do Gestor sobre o painel individual de outro vendedor nesta entrega (ver "Fora de escopo").
- Período (Hoje/7 dias/30 dias) é estado local do componente (`useState`), sem persistência na URL — é uma tela de relance, não uma tela de análise profunda.

## Blocos e origem dos dados

### KPI row — Atendimentos, 1ª resposta média, tempo de fechamento, Conversão, Suas vendas

Reaproveita o engine puro `calculateCustomerServiceMetrics` (`src/features/customer-service-analytics/engine/calculateCustomerServiceMetrics.ts`, já testado, usado no PRD-051), alimentado com as conversas do vendedor no período (`conversationsProvider`, filtrado por `assignedSellerId`) — não a base inteira da loja, então perf e RLS ficam mais leves que a visão do Gestor.

- **Atendimentos** = `totals.totalConversations`.
- **1ª resposta média** = `totals.averageResponseTime` (TMR: primeira mensagem inbound → primeira resposta humana).
- **Tempo de fechamento** = `totals.averageHandleTime` (TMA: criação → última mensagem, só conversas resolvidas). ⚠️ O protótipo rotula esse KPI como "atribuição → fechamento", mas não existe hoje um timestamp de atribuição separado do de criação — reaproveitamos a métrica já validada (TMA) sob o mesmo rótulo do design, sem inventar rastreamento novo.
- **Conversão** = `totals.conversionRate` (conversas do vendedor que geraram pedido pago).
- **Suas vendas (R$)** = soma de `ordersProvider.list({ sellerId, paymentStatus: "pago", since, until })` — mesmo padrão de query já usado em `useRanking` (gamification).
- Deltas vs período anterior: reaproveita `previous`/`deltaPctOf` do mesmo engine (já existe) para atendimentos/conversão; vendas usa o mesmo cálculo aplicado à janela anterior.

### Sua meta do mês

Delega a `useGoalsWithProgress` (`src/features/goals`), o agregador canônico da feature de metas, com `statuses: ["ativa", "concluida"]` e `sellerId` travado. O progresso é **derivado dos pedidos pagos** por `calculateGoalProgress`; `deriveGoalPace` recebe esse valor vivo e projeta o ritmo.

⚠️ **Nunca ler `goal.currentValue` / `goal.progressPercent`** (erro da 1ª implementação, corrigido em 2026-07-24): são snapshots persistidos que só `useGoalAutoStatusUpdate` escreve — e esse hook é um no-op conhecido neste projeto. O card mostrava "R$ 0,00 · 0%" para vendedores cuja tela de Metas exibia o valor real. O próprio engine de metas documenta a regra (`calculate.ts:30`: *"Never reads `goal.currentValue` / `progressPercent`"*).

Delegar também herda de graça: `pageSize: 500` (o default de 20 do provider escondia a meta do mês corrente atrás de metas futuras, já que a lista é filtrada no cliente), o filtro de status (uma meta **cancelada** cujo período cobre hoje não pode ser apresentada como a meta do vendedor) e as query keys compartilhadas com as telas de Metas.

A fronteira do período é comparada **por dia** (`isGoalPeriodCurrent`), não por instante: o formulário persiste `period.end` como meia-noite UTC do último dia (`new Date("2026-07-31").toISOString()` = 21h BRT do dia 30), então um `now <= period.end` cru derrubava a meta ~2 dias antes do fim do mês — justamente na reta de fechamento.

### Gráfico — atendimentos por hora (Hoje) / por dia (7d, 30d)

- **7 dias / 30 dias:** reaproveita `trendDaily` do mesmo `calculateCustomerServiceMetrics` (já bucketiza por dia) — sem código novo.
- **Hoje (por hora):** não existe hoje bucket por hora em nenhum engine. Nova função pura e testada, local a `seller-dashboard/engine/` (não mexe no engine compartilhado do PRD-051, para não arriscar quem já consome), que agrupa as mesmas conversas já buscadas por hora do dia.
- Renderizado com `recharts` (biblioteca de gráficos padrão do projeto), não as barras CSS cruas do protótipo (que são um recurso do protótipo estático, sem equivalente real no app).

### Sua fila agora

Conversas abertas (`aguardando`, `em_andamento`, `aguardando_cliente`) atribuídas a esse vendedor, ordenadas por `lastMessageAt` ascendente (quem espera há mais tempo primeiro), via `conversationsProvider.list({ assignedSellerId, status, orderBy, withTotal: false })`. Nomes de contato resolvidos por `listContacts`. Cada item abre a conversa direto em `/app/atendimento/$id`.

⚠️ **Não usar `getIdleSummary()`** (tentado na 1ª implementação, corrigido em 2026-07-24): esse é o feed de **alertas de ociosidade**, duplamente filtrado — pelo toggle por loja `idleAlerts.enabled` (desligado por padrão e ainda desligado em produção) e pelo limiar de nível 1 (2 horas úteis). Ligado nele, o card afirmava "Nenhuma conversa aguardando sua resposta agora" para vendedores com backlog real.

### Ranking da loja — ❌ REMOVIDO da entrega (2026-07-24)

O plano original era reaproveitar `useRanking` (`src/features/gamification/hooks/useRanking.ts`) escopado à loja. **Isso não funciona para o público-alvo desta tela.** A revisão de código (xhigh) mostrou que `useRanking` calcula o score de cada vendedor a partir de queries store-wide de `orders` e `customers`, e a RLS por vendedor (`orders_select`/`customers_select`: `store_id = current_store_id() and (is_staff() or seller_id = current_seller_id())`, migration `20260608235552`) devolve **apenas as linhas do próprio caller** para um Vendedor — que não é `is_staff`. Resultado: todo colega pontua 0, `calculateRanking` ordena o próprio vendedor em primeiro, e o card exibiria **"#1 de 8"** para qualquer vendedor, com badge verde de "subiu N posições" igualmente falso.

Não há caminho server-side pronto: a RPC de BI `mv_sales_by_seller_month_read()` reaplica exatamente o mesmo escopo per-seller.

**Decisão:** o card saiu desta entrega. Restaurá-lo exige uma RPC `SECURITY DEFINER` nova que agregue o ranking no servidor (posição + total, sem expor as vendas dos colegas) + migration — trabalho próprio, a decidir com o dono.

⚠️ **Bug pré-existente relacionado:** a tela `/app/gestao/ranking` (`RankingPage`, PRD-043) permite o papel Vendedor e usa o **mesmo** `useRanking` sem escopo server-side — ou seja, provavelmente já mostra um ranking distorcido para vendedores hoje, independentemente desta branch. Vale investigação própria.

### Recordes & curiosidades (fora do dado real nesta entrega)

Reaproveita o layout dos 6 cards do protótipo (maior atendimento, mais rápido, sequência batendo meta, horário de pico, peça mais vendida, cliente mais frequente) com valores de exemplo fixos e uma badge "em breve" — sem nova agregação, sem nova query. Vira spec própria quando entrar em escopo (vai exigir decisões de produto, ex.: o que conta como "meta diária" para a sequência).

## Visual

- Chrome (sidebar Black Gold, top bar, banner de pendências, rodapé) **não muda** — já existe de verdade no app (`DashboardLayout`/`AppLayout`); o protótipo só os desenhou para dar contexto.
- Paleta: a paleta fixa "Black Gold" hardcoded no protótipo (`#141011`, `#E0BB4E` etc.) é **traduzida para os tokens semânticos do app** (`bg-card`, `text-foreground`, `text-muted-foreground`, `border`, chips via `text-/bg-/border-severity-*`) — o painel acompanha o tema/modo (`data-theme`/`data-mode`) que o usuário tiver escolhido, em vez de forçar uma aparência fixa. Consistente com a prática já usada ao importar outros kits desse mesmo projeto de design (ex.: `ui_kits/catalog`).

## Fora de escopo nesta entrega

- Dado real do bloco "Recordes & curiosidades" (fica mockado/placeholder).
- Visão do Gestor sobre o painel individual de um vendedor específico (esse painel é só a home do próprio vendedor logado).
- Persistência do período selecionado na URL.
- Qualquer alteração no `EmptyState`/comportamento para Owner/Gestor — a página deles não muda.

## Critérios de aceitação

```gherkin
DADO que sou Vendedor e acesso /app/inicio
ENTÃO vejo o painel pessoal (saudação, KPIs, meta, gráfico, fila, ranking, recordes)
  E NÃO vejo mais a tela de bloqueio "Painel não disponível para o seu papel"

DADO que sou Vendedor no painel
QUANDO troco o período para "7 dias" ou "30 dias"
ENTÃO os KPIs, o gráfico e os deltas recalculam para a janela escolhida
  E o gráfico troca de barras por hora (Hoje) para barras por dia (7d/30d)

DADO que sou Vendedor com conversas atribuídas aguardando resposta
ENTÃO "Sua fila agora" lista essas conversas ordenadas por tempo de espera
  E o clique em uma delas abre a conversa na Central de Atendimento

DADO que sou Owner ou Gestor e acesso /app/inicio
ENTÃO continuo vendo o `ManagerDashboardPage` de sempre, sem nenhuma mudança

DADO que sou Vendedor sem nenhuma conversa/pedido no período
ENTÃO os blocos mostram estado vazio claro (zero, não erro/quebra)
```

## Riscos e mitigação

- **Custo de query duplicado:** o painel do vendedor roda o mesmo engine que o Gestor já usa, mas escopado a 1 vendedor — buscar conversas já filtradas por `assignedSellerId` (não a base inteira da loja) mantém o custo baixo e não duplica o padrão de over-fetch que já foi corrigido em outros pontos do app.
- **Rótulo x dado real (tempo de fechamento):** decisão explícita de reaproveitar TMA (criação→última mensagem) sob o rótulo "atribuição → fechamento" do protótipo — documentado aqui para não ser lido como bug depois.
- **Vendedor novo / sem histórico:** todo bloco precisa de estado vazio (sem meta cadastrada, sem posição no ranking, sem conversas) — nenhum widget pode quebrar com dado zerado.

## Sequência de entrega

PR único — feature nova e autocontida (`seller-dashboard`), sem migração de banco (todos os dados já existem via providers/engines existentes).
