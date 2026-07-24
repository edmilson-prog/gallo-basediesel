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

Reaproveita o provider `goals` + o engine de projeção já existente em `src/features/goals/engine/projection.ts` (mesma lógica de ritmo/"vai bater em tal data" já usada no `GoalsWidget` do Gestor), consultando a meta `level: "individual"` do vendedor no mês corrente.

### Gráfico — atendimentos por hora (Hoje) / por dia (7d, 30d)

- **7 dias / 30 dias:** reaproveita `trendDaily` do mesmo `calculateCustomerServiceMetrics` (já bucketiza por dia) — sem código novo.
- **Hoje (por hora):** não existe hoje bucket por hora em nenhum engine. Nova função pura e testada, local a `seller-dashboard/engine/` (não mexe no engine compartilhado do PRD-051, para não arriscar quem já consome), que agrupa as mesmas conversas já buscadas por hora do dia.
- Renderizado com `recharts` (biblioteca de gráficos padrão do projeto), não as barras CSS cruas do protótipo (que são um recurso do protótipo estático, sem equivalente real no app).

### Sua fila agora

Conversas abertas atribuídas a esse vendedor, ordenadas por tempo de espera — mesma fonte de dado que já alimenta `ActiveAlertsList`/`buildConversaSemRespostaAlerts` (`src/features/manager-dashboard/hooks/useActiveAlerts.ts`, via `openConversations` do snapshot), só que filtrada para o próprio vendedor e sem a lógica de alerta/threshold (aqui é lista simples, não alerta). Cada item linka para abrir a conversa na Central (`/app/atendimento`).

### Ranking da loja

Reaproveita `useRanking` (`src/features/gamification/hooks/useRanking.ts`), escopado à loja do vendedor, para achar a posição dele no ranking mensal (`ranking.findIndex` + total de vendedores). A variação semanal ("subiu 1 posição") exige rodar `useRanking` também para o período anterior e comparar a posição — mesmo padrão que o hook já usa internamente para badges/recovery, só que aqui o consumo é o delta de posição, não o score.

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
