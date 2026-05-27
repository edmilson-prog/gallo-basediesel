# PRD-043: Ranking de Vendedores e Gamificação

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                       |
| **Repositório**       | gallo-basediesel                                                                                                                                                                                                                                               |
| **Objetivo**          | Adicionar camada de gamificação sobre as metas (PRD-042) e métricas comerciais — sistema de pontos, badges automáticos, ranking periódico e widgets de "top performers" — para engajar a equipe de vendas e tornar a performance comercial visível e celebrada |
| **Tipo**              | Feature                                                                                                                                                                                                                                                        |
| **Complexidade**      | Média                                                                                                                                                                                                                                                          |
| **Total de Fases**    | 4                                                                                                                                                                                                                                                              |
| **Prioridade**        | Média                                                                                                                                                                                                                                                          |
| **Épico**             | Bloco 4b — Gestão B (Onda 2)                                                                                                                                                                                                                                   |
| **PRDs Relacionados** | PRD-014 (Painel Gestor — widget), PRD-019 (sub-rota config), PRD-032 (Pedido — alimenta score), PRD-040 (Cockpit — widget), PRD-042 (Metas — fonte primária), PRD-044 (Positivação), PRD-047 (Comissões)                                                       |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                             |
| **Padrão de código**  | Feature-based; código em `src/features/gamification/`                                                                                                                                                                                                          |

### Critérios de Complexidade

> **Justificativa de Média:** sistema derivado — pontuação e badges são funções puras sobre `IGoal`, `IOrder`, `ICustomer`. Não há mutations próprias de transação (apenas atribuição de badges automática). Complexidade está em: catálogo de ~10 badges com regras heterogêneas, score periódico (mensal/trim./anual) com tie-breaking, drill-down do ranking, integração com 3 superfícies (Painel Gestor, Cockpit, ficha do vendedor placeholder), e configuração de pesos pelo Owner. Sem cálculos pesados — tudo em runtime sobre dados já carregados.

---

## Contexto do Problema

Vendas é trabalho competitivo por natureza, mas hoje a GALLO BASE DIESEL não materializa a competição. Três problemas concretos:

**Performance invisível.** Quem é o top vendedor do mês? Quem está bombando? Quem precisa de ajuda? Sem ranking público (intra-loja) ninguém sabe — perde-se a energia natural do "quero estar no topo".

**Conquistas não são celebradas.** Vendedor que reativou 5 clientes dormentes, ou bateu a maior venda do trimestre, faz isso e segue — não há reconhecimento estruturado, e o esforço esvai.

**Metas batidas não viram momentum.** PRD-042 entregou metas, mas após o gestor abrir o painel e ver "meta atingida ✓" a história acaba. Sem gamificação, a meta é um interruptor binário; com gamificação, é um marco que destrava conquistas, pontos e posição no ranking.

Este PRD entrega: sistema de pontos derivado, catálogo inicial de badges, página de ranking, widgets para painel gestor e cockpit, e configuração de regras pelo Owner.

---

## Conceito da Solução

### Pontuação (Score)

Score é número agregado calculado em runtime para cada vendedor num período. Regras default:

| Evento                                            | Pontos  | Origem                     |
| ------------------------------------------------- | ------- | -------------------------- |
| Meta mensal atingida (`IGoal.status='concluida'`) | +100    | PRD-042                    |
| Meta superada em >120% do target                  | +50     | PRD-042 (bônus sobre +100) |
| Novo cliente atribuído ao vendedor                | +10     | PRD-015/PRD-032 (sellerId) |
| Cliente positivado no mês                         | +5      | PRD-044                    |
| Cliente recuperado (dormente → ativo)             | +25     | PRD-046                    |
| Pedido pago de valor ≥ thresholdHighTicket        | +15     | PRD-032                    |
| Badge conquistado (one-shot, ver rarity)          | +50–500 | catálogo abaixo            |

Todas as constantes ficam em `IPlatformSettings.gamificationSettings` e podem ser ajustadas pelo Owner.

### Badges (Conquistas)

10 badges no MVP, organizados por categoria e raridade. Atribuição **automática** (não há outorga manual no MVP).

| Slug               | Nome                    | Categoria   | Rarity    | Critério                                                      | Bônus pts |
| ------------------ | ----------------------- | ----------- | --------- | ------------------------------------------------------------- | --------- |
| `meta-batida`      | Bate-meta               | metas       | common    | Bateu pelo menos 1 meta no mês                                | 50        |
| `hat-trick`        | Hat-trick               | metas       | rare      | 3 metas atingidas no mesmo mês                                | 150       |
| `veterano`         | Veterano                | metas       | epic      | 12 metas consecutivas (uma por mês)                           | 300       |
| `recordista-tri`   | Recordista do Trimestre | volume      | rare      | Maior pedido pago do trimestre na loja                        | 200       |
| `maratona`         | Maratona                | volume      | rare      | 10+ pedidos pagos em 24h                                      | 150       |
| `cobertura`        | Cobertura               | carteira    | common    | Positivou ≥80% da carteira no mês                             | 100       |
| `resgatador`       | Resgatador              | carteira    | rare      | Recuperou ≥3 clientes dormentes (>90d sem comprar) no mês     | 150       |
| `conquistador`     | Conquistador            | crescimento | common    | 10 novos clientes atribuídos no mês                           | 100       |
| `big-ticket`       | Big Ticket              | volume      | epic      | Ticket médio do mês > `thresholdBigTicket` (default R$ 5.000) | 300       |
| `estrela-ascensao` | Estrela em Ascensão     | ranking     | legendary | Subiu ≥3 posições no ranking mensal de um mês para o seguinte | 500       |

Categorias e raridades são tipadas — Owner pode adicionar bônus customizado em Fase 2; no MVP só edita pontuação e ativa/desativa.

### Modelo (delta sobre PRD-002)

```typescript
type BadgeCategory = 'metas' | 'volume' | 'carteira' | 'crescimento' | 'ranking';
type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

IBadge {
  id: ID;                          // mesma string do slug
  slug: string;                    // 'meta-batida', etc.
  name: string;                    // "Bate-meta"
  description: string;             // texto do critério
  category: BadgeCategory;
  rarity: BadgeRarity;
  icon: string;                    // Iconify name (ex: 'mdi:trophy')
  bonusPoints: number;             // pontos quando conquistado
  active: boolean;                 // Owner pode desativar sem deletar
}

ISellerBadge {
  id: ID;
  sellerId: ID;
  badgeId: ID;                     // FK -> IBadge
  earnedAt: ISO8601;
  period: { start: ISO8601; end: ISO8601 }; // janela em que critério bateu
  contextSnapshot?: {              // o que disparou (auditoria leve)
    relatedOrderId?: ID;
    relatedGoalId?: ID;
    metricValue?: number;
  };
}

ISellerScore {
  sellerId: ID;
  storeId: ID;
  period: { start: ISO8601; end: ISO8601; type: 'mensal' | 'trimestral' | 'anual' };
  // Breakdown
  pointsFromGoals: number;
  pointsFromCustomers: number;     // novos + positivação + recovery
  pointsFromOrders: number;        // high-ticket
  pointsFromBadges: number;        // soma dos bônus de badges conquistados no período
  total: number;                   // soma final
  // Ranking
  rank: number;                    // posição no período/escopo
  rankPrevious?: number;           // posição no período anterior (para "estrela-ascensao")
  rankDelta?: number;              // rank - rankPrevious (positivo = subiu)
  // Apoio
  badgesEarned: ISellerBadge[];    // badges ganhos no período
  calculatedAt: ISO8601;
}
```

### Página `/app/gestao/ranking`

Substitui o placeholder atual de `src/routes/app.gestao.ranking.tsx`.

**Header**: filtros (período: mês atual / trim. atual / ano / personalizado; escopo: loja atual ou todas — Owner; categoria de pontos para drill).

**Pódio top-3**: cards laterais com 1º (🥇 ouro), 2º (🥈 prata) e 3º (🥉 bronze) destacados — avatar, nome, score total, breakdown em pílulas (Metas X / Carteira Y / Pedidos Z), badges conquistados como ícones.

**Tabela do ranking** (4º em diante): posição, avatar+nome, loja, score total, delta vs período anterior (↑5 verde / ↓2 vermelho / = cinza), badges (até 3 ícones + "+N"), última atividade pontuável.

**Quando o usuário é Vendedor**, sua linha fica destacada (sticky) com a posição própria, mesmo que esteja fora do topo visível.

**Card "Badges em destaque do período"** lateral: top 5 badges mais raros conquistados no mês com avatar do vendedor que ganhou.

### Drill-down `/app/gestao/ranking/$sellerId`

Detalhe do vendedor:

- Header: avatar + nome + posição atual + score total + qualitativo ("Top 10%", "Top 25%", etc.)
- Breakdown visual (donut): % do score vindo de cada categoria
- Timeline de badges conquistados (mais recentes no topo) com data e contexto
- Histórico de scores nos últimos 6 períodos (gráfico de linha)
- Comparativo com média da loja (linha de referência)

### Widget no Painel Gestor (PRD-014)

`<TopPerformersWidget />` no painel — top 3 do mês (mini-pódio horizontal compacto) + link "Ver ranking completo".

### Widget no Cockpit Executivo (PRD-040)

`<RankingHighlightWidget />` no cockpit — pódio top 3 cross-store quando Owner, top 3 da loja quando Gestor. Substitui o stub `useGamificationStatistics` que PRD-040 já reservou.

### Indicador no PRD-012 (placeholder de evolução)

A ficha do cliente não muda. Quando o app ganhar **ficha do vendedor** (futuro), o componente `<SellerBadgesGrid sellerId>` exportado por este PRD será reaproveitado lá. No MVP, só o drill-down do ranking exibe badges.

### Configuração `/app/configuracoes/gamificacao`

Substitui placeholder existente em `src/routes/app.configuracoes.gamificacao.tsx`. Owner only.

- **Toggle global**: gamificação ativa? (default `true`) — se desativada, esconde widgets e ranking de todos os roles
- **Tabela de regras de pontuação** (editáveis): pontos por meta atingida, por novo cliente, por positivação, por recovery, por pedido high-ticket, threshold high-ticket (R$)
- **Tabela de badges**: lista das 10 badges com toggle ativo/inativo e edição do `bonusPoints`. Critério é fixo (não editável no MVP)
- **Botão "Recalcular agora"** → dispara `recalculateScores()` imediato (útil para Owner ver efeito)
- **Banner "Modo demonstração"**: avisa que regras de pontuação são placeholder; a fórmula real será calibrada com o cliente após uso

### Permissões (delta sobre PRD-006)

| Permissão             | Roles                   | Notas                                      |
| --------------------- | ----------------------- | ------------------------------------------ |
| `gamification.view`   | Owner, Gestor, Vendedor | Vendedor vê ranking da própria loja apenas |
| `gamification.config` | Owner only              | Edição de regras                           |

**Vendedor BLOQUEADO** de ver ranking cross-store; sempre escopo da própria loja.

### Recálculo

- Função pura `calculateSellerScore(sellerId, period, context)` → `ISellerScore`
- Função pura `evaluateBadgesForSeller(sellerId, period, context)` → `ISellerBadge[]` (idempotente — só atribui badges ainda não conquistados naquele período)
- Hook `useGamificationRecalculationTimer()` roda **diariamente** no MVP (timer no front; Fase 2 = Edge Function)
- Botão de força bruta na config dispara recálculo imediato
- Quando uma `IGoal` muda para status `concluida` (PRD-042), recálculo é disparado para aquele vendedor

### Alternativas Consideradas

| Alternativa                                 | Por que descartada                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Sem badges, só ranking por score            | Perde a celebração de marcos não-monetários (recovery, novos clientes) |
| Badges outorgados manualmente pelo Gestor   | MVP precisa funcionar sem intervenção; Fase 2 pode ter outorga custom  |
| Score em tempo real a cada evento           | Custo computacional desproporcional para dados mockados; diário é OK   |
| Apenas top 3 visível (sem ranking completo) | Vendedor 5º precisa ver onde está pra brigar pelo pódio                |
| Pontuação não-configurável                  | Owner precisa calibrar com a realidade da loja                         |
| Ranking visível ao Cliente (público)        | Estratégico interno; nunca exposto fora da equipe                      |

---

## Escopo

### Incluído

- ✅ Modelos `IBadge`, `ISellerBadge`, `ISellerScore`, `BadgeCategory`, `BadgeRarity` em `PRD-002` (delta)
- ✅ Settings `IPlatformSettings.gamificationSettings`
- ✅ Catálogo seed de 10 badges (mock data via PRD-004)
- ✅ Engine `calculateSellerScore`, `evaluateBadgesForSeller` em `src/features/gamification/engine/`
- ✅ Provider `useBadgesProvider`, `useGamificationProvider` (delta PRD-005)
- ✅ Hooks `useRanking(filters)`, `useSellerScore(sellerId, period)`, `useSellerBadges(sellerId)`
- ✅ Página `/app/gestao/ranking` (substitui placeholder)
- ✅ Drill-down `/app/gestao/ranking/$sellerId`
- ✅ Sub-rota `/app/configuracoes/gamificacao` (substitui placeholder PRD-019)
- ✅ Widget `<TopPerformersWidget />` no Painel Gestor (PRD-014)
- ✅ Widget `<RankingHighlightWidget />` no Cockpit Executivo (PRD-040 — substitui stub)
- ✅ Componente exportável `<SellerBadgesGrid sellerId />` para reaproveitamento futuro
- ✅ Permissões `gamification.view`, `gamification.config` (delta PRD-006)
- ✅ Audit log em mudanças de configuração
- ✅ Recálculo diário + botão manual

### Excluído

- ❌ Outorga manual de badges pelo Gestor — Fase 2
- ❌ Badges customizados criados pelo Owner — Fase 2 (catálogo fixo no MVP)
- ❌ Ranking público (exposto a cliente) — não previsto
- ❌ Notificações push de conquista — Fase 2 (banner toast in-app no MVP, opcional)
- ❌ Ranking por equipe — equipes dormentes no MVP
- ❌ Score em tempo real — diário no MVP
- ❌ Integração com comissões (PRD-047 cuida disso isoladamente)
- ❌ Export PDF do ranking — Fase 2

---

## Requisitos Funcionais

### Engine

- **RF-001:** Tipos `IBadge`, `ISellerBadge`, `ISellerScore`, `BadgeCategory`, `BadgeRarity` adicionados ao registry de `PRD-002` em `src/shared/types/gamification.ts`.
- **RF-002:** `IPlatformSettings.gamificationSettings = { active: true, pointsPerGoalCompleted: 100, pointsPerGoalExceeded: 50, pointsPerNewCustomer: 10, pointsPerPositivation: 5, pointsPerRecovery: 25, pointsPerHighTicketOrder: 15, thresholdHighTicket: 1500, thresholdBigTicket: 5000, badges: IBadge[] }`.
- **RF-003:** `calculateSellerScore(sellerId, period, context)` função pura. Retorna `ISellerScore` com breakdown.
- **RF-004:** `evaluateBadgesForSeller(sellerId, period, context)` idempotente — não re-atribui badge já conquistado no mesmo período. Retorna apenas os novos.
- **RF-005:** `calculateRanking(period, scope, context)` retorna `ISellerScore[]` ordenado desc por `total`, com `rank` e `rankPrevious` populados. Tie-breaking: maior `pointsFromGoals` ganha, depois `total` do período anterior.

### Página de Ranking

- **RF-006:** `RankingPage` em `src/features/gamification/pages/`, montada em `/app/gestao/ranking` (substitui placeholder atual).
- **RF-007:** Filtros: período (mês/trim./ano/personalizado, default mês), escopo (loja atual / todas — Owner only), categoria (drill opcional).
- **RF-008:** Pódio top-3 com avatar, nome, score, breakdown em pílulas e até 5 ícones de badges.
- **RF-009:** Tabela dos demais (paginada 25/página) com colunas: rank, vendedor, loja, score, delta vs anterior, badges (3 + "+N"), última atividade.
- **RF-010:** Linha do próprio vendedor (quando role=vendedor) destacada com border-accent, mesmo que fora da página visível.
- **RF-011:** Card lateral "Badges raros do período" mostrando até 5 badges rare/epic/legendary com vendedor que conquistou.

### Drill-down

- **RF-012:** `SellerRankingDetailPage` em `/app/gestao/ranking/$sellerId`.
- **RF-013:** Guard: Vendedor só acessa próprio sellerId; cruzamento → redirect `EmptyState`. Owner/Gestor acessam livres (Gestor respeita store-lock).
- **RF-014:** Header com avatar, nome, posição, score, qualitativo ("Top 10%"), 3 KPIs (badges no período, score total, delta).
- **RF-015:** Donut Recharts com breakdown por categoria (`pointsFromGoals`, `pointsFromCustomers`, `pointsFromOrders`, `pointsFromBadges`).
- **RF-016:** Timeline de badges (componente `<SellerBadgesGrid sellerId />` exportável).
- **RF-017:** Gráfico de linha com histórico dos últimos 6 períodos (mensal default).

### Configuração

- **RF-018:** `GamificationConfigPage` em `/app/configuracoes/gamificacao` (substitui placeholder PRD-019).
- **RF-019:** Toggle global `active`. Quando false, widgets e rotas redirecionam para `EmptyState` "Gamificação desativada".
- **RF-020:** Formulário com inputs numéricos para todos os campos de `gamificationSettings`.
- **RF-021:** Tabela de badges com toggle `active` e input numérico `bonusPoints` por linha.
- **RF-022:** Botão "Recalcular agora" dispara `recalculateScoresForAllSellers(currentPeriod)`.
- **RF-023:** Save com audit log (`action='gamification_config_update'`).

### Recálculo

- **RF-024:** Hook `useGamificationRecalculationTimer()` roda diariamente (no MVP, `setInterval` no front quando rota relevante montada; Fase 2 = Edge Function cron).
- **RF-025:** Quando `useGoalsProvider` muda `IGoal.status` para `concluida`, hook reativo dispara `recalculateForSeller(sellerId)` imediato.
- **RF-026:** Atribuição de badge dispara toast in-app "🏆 Conquista desbloqueada: <nome>" (opcional, feature flag `notifyOnBadgeEarned` default false).

### Integrações

- **RF-027:** PRD-014 (Painel Gestor): widget `<TopPerformersWidget />` na seção lateral. Mini-pódio horizontal compacto com top 3 do mês + link "Ver ranking completo".
- **RF-028:** PRD-040 (Cockpit): widget `<RankingHighlightWidget />` substitui o stub `useGamificationStatistics`. Mostra pódio cross-store (Owner) ou da loja (Gestor).
- **RF-029:** PRD-006 (RBAC): adicionar permissões `gamification.view` e `gamification.config` à matriz visual.
- **RF-030:** PRD-002 (Modelo): tipos adicionados via delta retroativo conforme `DELTAS-PRDs`.
- **RF-031:** PRD-005 (Providers): novos `useBadgesProvider` e `useGamificationProvider` seguindo contrato Mock/Supabase.
- **RF-032:** PRD-019 (Configurações): item "Gamificação" no menu de configurações já existe; este PRD apenas substitui o conteúdo da rota.

### Permissões

- **RF-033:** Vendedor vê ranking só da própria loja (escopo automático). Não acessa página de configuração.
- **RF-034:** Gestor vê ranking da loja (preso via `gestorLockedStoreId`).
- **RF-035:** Owner vê tudo. Único role com `gamification.config`.

### Audit

- **RF-036:** Audit em mudanças de configuração e em recálculo manual (`action='gamification_recalculate_manual'`).
- **RF-037:** Atribuição de badge não exige audit (é derivada e auditável pelo `earnedAt` + `contextSnapshot`).

---

## Requisitos Não-Funcionais

- **RNF-001:** Cálculo de score para 20 vendedores × 12 períodos retroativos < 500ms.
- **RNF-002:** Memoização agressiva via TanStack Query; cache-key inclui período + scope.
- **RNF-003:** Ícones de badge via Iconify (lib já presente). Ícones default sugeridos no catálogo seed; Owner pode trocar em Fase 2.
- **RNF-004:** WCAG 2.1 AA — cores de medalha (ouro/prata/bronze) sempre acompanhadas de texto/ícone (não dependem só de cor).
- **RNF-005:** Mobile-first — pódio top-3 colapsa em coluna em viewport < 640px.

---

## Critérios de Aceitação

```gherkin
DADO vendedor Carlos com 2 metas atingidas, 3 novos clientes e 1 pedido high-ticket no mês
QUANDO calculateSellerScore executa para Carlos no mês corrente
ENTÃO total = 100*2 + 10*3 + 15*1 = 245 pontos
  E pointsFromGoals = 200, pointsFromCustomers = 30, pointsFromOrders = 15

DADO Carlos bateu 3 metas em janeiro
QUANDO evaluateBadgesForSeller executa
ENTÃO badge 'hat-trick' é atribuído com bonusPoints=150
  E score total agora reflete 245 + 150 (bônus do hat-trick)

DADO Carlos já tem badge 'hat-trick' atribuído em janeiro
QUANDO evaluateBadgesForSeller executa de novo no mesmo período
ENTÃO badge NÃO é re-atribuído (idempotência)

DADO acesso /app/gestao/ranking como Owner
QUANDO página carrega no mês corrente, escopo "Todas lojas"
ENTÃO vejo pódio top-3 com ouro/prata/bronze
  E tabela com demais vendedores, paginada
  E card "Badges raros do período" com até 5 itens

DADO sou Vendedor logado, posição 8 no ranking
QUANDO acesso /app/gestao/ranking
ENTÃO vejo pódio top-3 da minha loja
  E minha linha (posição 8) está destacada com sticky border-accent
  E NÃO consigo selecionar escopo "Todas lojas"

DADO sou Vendedor tentando acessar /app/gestao/ranking/$outroSellerId
QUANDO rota carrega
ENTÃO sou redirecionado para EmptyState "Sem acesso"

DADO Owner desliga toggle global `gamificationSettings.active`
QUANDO qualquer role acessa /app/gestao/ranking
ENTÃO vejo EmptyState "Gamificação desativada — ative em Configurações"
  E widgets de painel e cockpit desaparecem

DADO Owner muda `pointsPerNewCustomer` de 10 para 20 e clica "Recalcular agora"
QUANDO recálculo termina
ENTÃO ranking exibido reflete novos pontos
  E entry de audit log com action='gamification_config_update' foi criada
```

---

## Fases de Implementação

| Fase | Objetivo                                                                              |
| ---- | ------------------------------------------------------------------------------------- |
| 1    | Tipos + settings + catálogo seed de 10 badges + engine puro (score, badges, ranking)  |
| 2    | Página principal de ranking com pódio + tabela + drill-down + drill-down do vendedor  |
| 3    | Widgets no Painel Gestor e Cockpit + substituição do stub `useGamificationStatistics` |
| 4    | Configuração + audit log + recálculo agendado + polish (qualitativos, sticky, mobile) |

---

## Dependências

| PRD                                 | Status  |
| ----------------------------------- | ------- |
| PRD-002 (tipos via delta)           | ✅ DONE |
| PRD-004 (seed de badges + scores)   | ✅ DONE |
| PRD-005 (providers)                 | ✅ DONE |
| PRD-006 (permissões via delta)      | ✅ DONE |
| PRD-014 (Painel — widget consumer)  | ✅ DONE |
| PRD-019 (sub-rota configuração)     | ✅ DONE |
| PRD-040 (Cockpit — widget consumer) | ✅ DONE |
| PRD-042 (Metas — fonte primária)    | ✅ DONE |
| PRD-044 (Positivação — fonte)       | ✅ DONE |
| PRD-046 (Carteira — recovery flag)  | ✅ DONE |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1–31   | 001–046           |
| **32** | **PRD-043 ATUAL** |
| 33+    | 047, 048, 049…    |

---

## Considerações de Segurança

- Vendedor não vê ranking de outras lojas (escopo automático)
- Configuração restrita a Owner
- Audit log em toda mudança de regra
- Badge `contextSnapshot` é leve — apenas IDs e métricas, sem PII

---

## Convenções

| Elemento   | Convenção                                                                 |
| ---------- | ------------------------------------------------------------------------- |
| Página     | `RankingPage`, `SellerRankingDetailPage`, `GamificationConfigPage`        |
| Engine     | `calculateSellerScore`, `evaluateBadgesForSeller`, `calculateRanking`     |
| Pasta      | `gamification/`                                                           |
| Componente | `<TopPerformersWidget>`, `<RankingHighlightWidget>`, `<SellerBadgesGrid>` |
| Tipos      | `IBadge`, `ISellerBadge`, `ISellerScore`, `BadgeCategory`, `BadgeRarity`  |

---

## Notas para o Agente Desenvolvedor

- **Idempotência de badges é crítica.** Re-rodar `evaluateBadgesForSeller` não pode duplicar `ISellerBadge` para o mesmo `(sellerId, badgeId, period)`. Usar índice composto na verificação.
- **Catálogo seed fica em `src/mocks/seeds/badges.ts`** — 10 badges com slugs estáveis (não mudam entre sessões).
- **Pódio é o componente icônico** desta feature — usar gradient/glow sutil nas medalhas; aceitar uso de ícones `mdi:trophy`, `mdi:trophy-variant`, `mdi:medal`.
- **Notificação de conquista (toast)** é opcional no MVP — feature flag `notifyOnBadgeEarned` default `false` para não poluir UX em primeira validação com cliente.
- **PRD-040 (Cockpit) já reserva slot** para o widget de gamificação como stub. Ao implementar este PRD, substituir o stub pelo `<RankingHighlightWidget />`.
- **Reaproveitamento futuro:** o componente `<SellerBadgesGrid />` ficará pronto para a ficha do vendedor quando ela existir (provavelmente Fase 2 ou MVP+).
- **Banner "Modo demonstração"** na config: dados são mock — o cliente vai calibrar regras após uso real.

---

## Status

| Campo  | Valor                                |
| ------ | ------------------------------------ |
| Status | ✅ IMPLEMENTADO (v0.31.0 — `Podium`) |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                                         |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 27/05/2026 | v1     | Criação inicial — sistema de pontos, catálogo de 10 badges, ranking, drill-down, widgets para Painel Gestor e Cockpit                                                             |
| 27/05/2026 | v1.1   | Implementação — `src/features/gamification/` em v0.31.0 (`Podium`); inclui fix arquitetural de rota TanStack (parent `<Outlet />` + child `.index.tsx`) para destravar drill-down |

---

**AILA - Sistemas Inteligentes**
