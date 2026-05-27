# Checkpoint — PRD-043 Gamification "Podium" — 2026-05-27 10:38

> **Branch:** `main` · **Último commit:** `787625e feat(gamification): implement PRD-043 — Ranking & Gamification and bump to v0.31.0 Podium`
> **Sessão anterior:** Claude Opus 4.7 (1M context) · **Gerado em:** 2026-05-27T10:38

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-05-27-1038-prd-043-gamification-podium.md`
na íntegra e confirme em uma frase que entendeu: 1) o objetivo da sessão,
2) o estado atual do código, 3) qual é a próxima tarefa.
Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial para distribuidora de peças pesadas em Frederico Westphalen/RS. Stack: Vite + TanStack Router (file-based) + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Iconify + TanStack Query + Zustand + Recharts. Bun como package manager. Fase 1 (Frontend First) — mockup navegável com dados fictícios via Provider Pattern (Mock/Supabase planejado para Fase 2). Submarca PARTS já ativa; SERVICE/INDUSTRIAL dormentes. Multi-loja modelado desde o início.

A sessão atual fechou o **PRD-043 (Ranking & Gamificação)**, abrindo o Bloco 4b da Onda 2 (Gestão e BI). Saneamento adicional do INDEX-PRDs feito no início da sessão.

## 🎯 Objetivo da sessão

1. Auditar PRDs implementados vs INDEX (estava desincronizado: dizia 26, mas eram 31 com `_DONE.md` no disco).
2. Sincronizar `INDEX-PRDs-Gallo-Base-Diesel.md` com o estado real.
3. Redigir o único PRD do MVP ainda não documentado: **PRD-043 Ranking/Gamificação**.
4. Implementar PRD-043 do zero — engine puro, hooks, página principal, drill-down, configuração admin, e widgets para Painel Gestor (PRD-014) e Cockpit Executivo (PRD-040).
5. Bumpar versão para v0.31.0 codinome **Podium** + CHANGELOG.

Por quê agora: encerrar o Bloco 4a foi feito no commit anterior (v0.30.0 Vitals). PRD-043 era a única lacuna documental do MVP, e tinha que ser fechada antes de seguir para PRD-047 (Comissões) — que tem dependências indiretas em gamificação via PRD-040.

## ✅ Progresso (o que foi feito)

- [x] **Análise e auditoria** — cruzou INDEX × `_DONE.md` × `CHANGELOG.md` × código (`src/features/*` e `src/routes/*`). Detectou desincronização (26 documentados como done vs 31 reais) e lacuna do PRD-043 (não redigido).
- [x] **INDEX-PRDs sincronizado**, commit `787625e` — marcou ✅ os 14 PRDs faltantes (017–019, 020–023, 030–033, 040, 044, 045); adicionou links para PRDs 047–071 redigidos; corrigiu títulos errados (050/051/052); bumpou índice de v1.6 para v1.8.
- [x] **PRD-043 redigido** (`docs/prds/PRD-043-ranking-gamificacao_DONE.md`, ~345 linhas) — 5 categorias × 4 raridades, catálogo de 10 badges, sistema de pontos parametrizável, 37 RFs, 8 cenários Gherkin.
- [x] **DELTAS-PRDs atualizado** para v1.1 com entrada enriquecida do PRD-043.
- [x] **Implementação completa** em `src/features/gamification/`:
  - Engine puro: `calculateSellerScore`, `calculateRanking`, `evaluateBadgesForSeller`
  - Catálogo seed: `DEFAULT_BADGE_CATALOG` com 10 badges (slugs estáveis)
  - Hooks: `useRanking`, `useBadges`, `useRankingFilters` (URL-sync), `useSellerHistory`
  - Componentes: `BadgeChip`, `RarityBadge`, `SellerAvatar`, `RankingHeader`, `RankingPodium`, `RankingTable`, `RecentBadgesCard`, `BreakdownDonut`, `ScoreHistoryChart`, `SellerBadgesGrid`, `TopPerformersWidget`, `RankingHighlightWidget`
  - Páginas: `RankingPage`, `SellerRankingDetailPage`, `GamificationConfigPage`
  - i18n pt-BR
- [x] **Tipos estendidos** retro-compatíveis em `src/shared/types/` — `IBadgeDefinition`, `BadgeCategory`, `BadgeRarity` novos; campos opcionais em `IGamificationBadge` (category/rarity/bonusPoints snapshot) e `IRankingEntry` (breakdown/positionPrevious/positionDelta/badgeSlugs); 8 campos novos + `badges[]` em `IGamificationRules`.
- [x] **Mock seedStore.ts** adota catálogo canônico + defaults das novas chaves de regras.
- [x] **Mock generator de badges** atualizado para usar slugs do catálogo e popular category/rarity/bonusPoints.
- [x] **Reestruturação de rotas TanStack** — `app.gestao.ranking.tsx` virou layout-only com `<Outlet />`; criados `app.gestao.ranking.index.tsx` (RankingPage) e `app.gestao.ranking.$sellerId.tsx` (drill-down). Bug arquitetural detectado em `app.gestao.abc.$class.tsx` e `app.gestao.carteira-analitica.$sellerId.tsx` — não corrigido (escopo).
- [x] **Integrações cross-feature** — Painel Gestor (PRD-014) ganhou widget Top Performers (grade `lg:grid-cols-3` → `lg:grid-cols-4`); Cockpit Executivo (PRD-040) ganhou widget Highlights do Ranking.
- [x] **Configuração admin** — substituiu `GamificationPlaceholderPage` por `GamificationConfigPage` (Owner only, audit log via `usePlatformSettings.update`).
- [x] **Validação visual em navegador** — login como João Gallo (Owner) e testou as 5 superfícies:
  - `/app/gestao/ranking` → pódio + tabela + sidecar OK
  - `/app/gestao/ranking/seller-marina-cardoso` → drill com 3 KPIs + donut + linha + 7 badges OK
  - `/app/configuracoes/gamificacao` → toggle + regras + tabela de badges OK
  - `/app/inicio` (Painel Gestor) → widget Top Performers integrado OK
  - `/app/gestao` (Cockpit) → widget Highlights integrado OK
- [x] **Build limpa** — `bun run build` passou após cada fase, zero erros TS, zero erros de console.
- [x] **PRD-043 marcado IMPLEMENTADO** (renomeado para `_DONE.md`, status atualizado, histórico v1.1 adicionado).
- [x] **CHANGELOG entry "Podium"** com ~150 linhas detalhando engine, settings, hooks, páginas, widgets, fix de rotas e nota da dívida técnica.
- [x] **`package.json`** bumpado para `0.31.0`.

## 🔧 Estado do código

- **Branch:** `main` (sincronizado com origin)
- **Último commit:** `787625e` — "feat(gamification): implement PRD-043 — Ranking & Gamification and bump to v0.31.0 Podium"
- **Working tree:** limpo após commit do checkpoint (passo 7 abaixo).
- **Build/testes:** `bun run build` ✅ PASS (último run no fim da Fase 4). Sem suite de testes configurada no projeto (`tsc --noEmit` é o type-check via build).
- **PRs abertos relacionados:** nenhum (commit direto em main, padrão do projeto).
- **Arquivos modificados nesta linha de trabalho (54 arquivos, 8888 ins / 266 del):**
  - `CHANGELOG.md` (M) — entrada v0.31.0 Podium (~150 linhas)
  - `package.json` (M) — versão `0.30.0` → `0.31.0`
  - `docs/prds/INDEX-PRDs-Gallo-Base-Diesel.md` (M) — sincronização completa + bump v1.8
  - `docs/prds/DELTAS-PRDs-Gallo-Base-Diesel.md` (A, untracked → committed) — v1.1
  - `docs/prds/PRD-043-ranking-gamificacao_DONE.md` (A) — PRD redigido + marcado done
  - `src/shared/types/bi.ts` (M) — `IBadgeDefinition`, `BadgeCategory`, `BadgeRarity`, snapshot fields em `IGamificationBadge`, breakdown em `IRankingEntry`
  - `src/shared/types/platform.ts` (M) — `IGamificationRules` expandido com 8 campos novos + `badges[]`
  - `src/shared/types/index.ts` (M) — barrel exports
  - `src/mocks/data/seedStore.ts` (M) — adota `DEFAULT_BADGE_CATALOG`
  - `src/mocks/generators/badge.ts` (M) — usa slugs canônicos + snapshots
  - `src/features/gamification/**` (A) — feature completa (16 arquivos)
  - `src/features/manager-dashboard/pages/ManagerDashboardPage.tsx` (M) — `<TopPerformersWidget>` adicionado
  - `src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx` (M) — `<RankingHighlightWidget>` adicionado
  - `src/routes/app.gestao.ranking.tsx` (M) — agora é layout-only com `<Outlet />`
  - `src/routes/app.gestao.ranking.index.tsx` (A) — RankingPage com guard
  - `src/routes/app.gestao.ranking.$sellerId.tsx` (A) — SellerRankingDetailPage com guard
  - `src/routes/app.configuracoes.gamificacao.tsx` (M) — aponta para `GamificationConfigPage`
  - `src/routeTree.gen.ts` (M) — autogerado pelo plugin TanStack Router
  - **Órfãos da sessão anterior incluídos no bundle:** PRD-060/061/062 edits, PRD-063/064/065/066/067/070/071 untracked, `docs/prds/ROADMAP-FASE2-Gallo-Base-Diesel.md` untracked. O usuário pediu para incluir tudo.

## ⏳ Pendências (próximos passos, em ordem)

### 1. **Implementar PRD-047 Comissões** (próximo na fila — alta prioridade)

- **Por que agora:** substitui o stub `commissionPreview` em `src/shared/types/commercial.ts` (campo em `IOrder`) e remove dependência derivada. Destrava PRD-048 DRE e PRD-049 Rentabilidade na sequência.
- **Arquivos a tocar:**
  - Novo: `src/features/commissions/` (engine, hooks, components, pages, i18n)
  - Modificar: `src/shared/types/people.ts` (já tem `ICommissionRule`; estender com `ICommission`, `ICommissionSplitDetails` conforme DELTAS § 3.13)
  - Modificar: `src/shared/types/commercial.ts` — remover `commissionPreview` de `IOrder`, substituir por relação 1:N com `ICommission`
  - Modificar: `src/providers/data/contracts/commissions.ts` — provider já existe stub, expandir contrato
  - Modificar: `src/providers/data/hooks/useCommissionsProvider.ts` — wire up
  - Modificar: `src/features/orders/components/*` — substituir "preview" por "comissão calculada" quando paymentStatus='pago'
  - Substituir placeholder em `src/routes/app.configuracoes.comissoes.tsx` (procurar — pode estar em outro lugar)
  - Atualizar audit log com `commission.config`, `commission.approve`, `commission.close_period`, `commission.dispute`
- **Critério de "feito":** página `/app/gestao/comissoes` (já tem rota como placeholder) funcional com lista de comissões, fechamento de período, drill por vendedor; banner "Modo demonstração" enquanto cálculo real não está calibrado com cliente; audit log em mudanças de regra; tipos `ICommissionRule` corretamente atualizados em `IPlatformSettings`.
- **Dependências:** PRDs 041 (vendas), 042 (metas), 032 (pedido) — todos ✅ DONE.

### 2. **Corrigir bug arquitetural de rotas em ABC e Carteira Analítica** (dívida técnica catalogada)

- **Sintoma:** `/app/gestao/abc/A` e `/app/gestao/carteira-analitica/seller-X` renderizam a página parent ao invés do drill-down filho.
- **Causa:** parent route `app.gestao.<feature>.tsx` é uma página completa sem `<Outlet />`. TanStack file-based routing exige que o parent só renderize o outlet quando há rotas filhas.
- **Fix:** mesmo padrão aplicado em Ranking nesta sessão — converter parent em layout-only com `<Outlet />`, mover página principal para `.index.tsx`, manter `.$param.tsx` para drill.
- **Arquivos a tocar:**
  - `src/routes/app.gestao.abc.tsx` → layout
  - `src/routes/app.gestao.abc.index.tsx` (criar com `ABCCurvePage`)
  - `src/routes/app.gestao.abc.$class.tsx` (mantém)
  - `src/routes/app.gestao.carteira-analitica.tsx` → layout
  - `src/routes/app.gestao.carteira-analitica.index.tsx` (criar com `PortfolioAnalyticsPage`)
  - `src/routes/app.gestao.carteira-analitica.$sellerId.tsx` (mantém)
  - Ajustar `useABCFilters` e `usePortfolioFilters` para `useSearch({ strict: false })` se usados em ambos os contextos (parent + child)
- **Critério de "feito":** `/app/gestao/abc/A` exibe `ABCClassPage` (heading "Clientes Classe A"); `/app/gestao/carteira-analitica/seller-marina-cardoso` exibe `SellerPortfolioPage`.
- **Pode entrar como bugfix em release patch (v0.31.1) ou junto com próxima feature.**

### 3. **PRD-048 DRE Gerencial** (depois de 047)

- Conforme DELTAS § 3.11: adicionar `unitCost?: number` em `IPart` (PRD-030) — editável apenas por Owner/Gestor/Financeiro. Mock 70% das peças preenchido. Formulário de edição ganha campo invisível ao Vendedor.

### 4-8. PRD-049, 050, 051, 052, 053

Conforme sequência do INDEX (seção "Próximos passos"). Fechar Onda 2 antes de abrir Bloco 5 (e-commerce, PRDs 060–067).

## ❓ Decisões pendentes

- **Notificação toast quando vendedor ganha badge.** Hoje `gamificationRules.notifyOnBadgeEarned` está modelado e default `false`. Implementação real está pendente — não wireei a chamada de `evaluateBadgesForSeller` num evento reativo que dispare `toast.success("🏆 Conquista desbloqueada")`. Quando avançar, decidir: (A) hook reativo que escuta mudanças em `IGoal.status='concluida'`; (B) verificação no momento em que o vendedor abre a tela de ranking. **Inclinação atual:** (B), mais simples e suficiente no MVP mockado.
- **Recálculo agendado.** Hoje é botão manual "Recalcular agora" no admin → invalida cache TanStack. Diário automático (decorator `useGamificationRecalculationTimer`) está modelado no PRD mas não foi implementado. Não-bloqueador para validação com cliente. Decidir se entra em v0.31.x ou fica para Fase 2 com Edge Function.

## 🚧 Bloqueios / Riscos

- **Build chunk grande (1.25MB main bundle, warning > 500KB).** Não é específico desta sessão — vem se acumulando. Solução: code-splitting via `manualChunks` no Vite. Fora do escopo agora.
- **Dado mock para gamificação é pequeno** — só 3 vendedores ativos (Marina, Carlos, Rafael) + 6 badges aleatórios distribuídos em 3 períodos. Visualmente convincente, mas se cliente pedir "vamos ver um ranking de 20 vendedores", precisamos expandir o seed (PRD-004).
- **Bug latente em ABC/Carteira (já catalogado)** — usuário pode reportar "drill não funciona em ABC" se testar. Resposta: dívida técnica conhecida, fix planejado.

## ⚠️ Avisos do usuário (regras desta sessão)

- **Trabalhar em `português do Brasil`** com acentos corretos em todo conteúdo de usuário (CLAUDE.md global enforça isso). Código em inglês.
- **Commits em main são aceitáveis** — padrão estabelecido do projeto; o usuário confirmou explicitamente na pergunta de checkpoint.
- **Branch `main` é tanto a de desenvolvimento quanto a de release** — não há strategy de feature branches no MVP.
- **Conventional Commits em inglês** (`feat:`, `fix:`, `chore:`, etc.) é a norma.
- **`bun` é o package manager** — não usar `npm` ou `yarn`.
- **bunfig.toml impõe 24h supply-chain guard.** Antes de adicionar qualquer pacote a `minimumReleaseAgeExcludes`, **confirmar com o usuário**.
- **Não rodar testes** — não existe suite. Type-check é via `bun run build`.
- **Não rodar lint sem ser pedido** — `bun run lint` existe mas usuário não pediu rodar nesta sessão.
- **`docs/prds/` é a fonte da verdade** — INDEX, briefing v1.1, DELTAS-PRDs são vivos. Atualizar quando relevante.
- **Layout `DetailLayout` é list+detail (Carteira/Clientes)** — para páginas single use `DashboardLayout`.

## 🛡️ Não regredir (features que devem continuar funcionando)

Tudo do **Bloco 0** (fundação, PRDs 001-007), **Bloco 1** (CRM completo), **Bloco 2** (SDR completo), **Bloco 3** (Comercial completo) e **Bloco 4a** (Visão Executiva/Vendas/Metas/Positivação/Curva ABC/Carteira Analítica).

Pontos críticos:
- Login mockado com 4 perfis (Owner, Gestor, Vendedor, Cliente) — `localStorage` chave `gallo-current-user`
- Sistema de temas (4 temas × 2 modes) com anti-FOUC no `index.html`
- Multi-loja com `IStore` em entidades comerciais
- Provider Pattern Mock/Supabase via switch (`VITE_DATA_SOURCE`)
- Audit log via `auditLog()` em mudanças de settings, transferências, status de pedido, descontos aprovados
- RLS visual (PRD-006) — Vendedor não vê ABC de cliente alheio, Owner-only em DRE/Comissões/Rentabilidade (Vendedor BLOQUEADO conforme DELTAS § 7.4)
- SDR mockado responde 24/7 nas rotas `/app/sdr` e `/app/atendimento/$id` simulado
- Painel Gestor com 7 widgets (incluindo o `TopPerformersWidget` novo desta sessão — não quebrar grid `lg:grid-cols-4`)
- Cockpit executivo com 12+ KPIs e drill-downs

**Específico desta sessão:** o widget `<TopPerformersWidget>` está mostrando dados a partir de `useRanking`. Se `gamificationRules.active` for desligado via config, o widget some — comportamento esperado, não regressão.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `CLAUDE.md` — convenções globais (camelCase, kebab-case, pt-BR diacríticos)
- `docs/prds/briefing-execucao-prds.md` v1.1 — modelo conceitual + decisões transversais
- `docs/prds/INDEX-PRDs-Gallo-Base-Diesel.md` v1.8 — status real atualizado
- `docs/prds/DELTAS-PRDs-Gallo-Base-Diesel.md` v1.1 — deltas retroativos PRDs 002/005/006/012/014/015/016/019/021/022/030/031/032/040
- `docs/prds/PRD-047-comissoes.md` — próxima feature a implementar (já redigida)
- `src/features/gamification/index.ts` — exports da feature recém-criada
- `src/features/gamification/engine/calculateSellerScore.ts` — padrão de engine puro a replicar em PRD-047
- `src/features/abc-curve/hooks/useABCClassification.ts` — referência canônica de hook agregador com TanStack Query
- `src/providers/data/contracts/commissions.ts` — contrato stub que será expandido pelo PRD-047
- `src/shared/types/people.ts` — onde mora `ICommissionRule` (será estendido)
- `src/shared/types/commercial.ts` — onde mora `commissionPreview` em `IOrder` (será substituído)

## 🧠 Memórias relacionadas

Não há memórias persistentes em `C:\Users\Edmilson Souza\.claude\projects\D--claude-gallo-basediesel\memory\` ainda — o índice `MEMORY.md` está vazio.

Candidatas a memorizar nesta sessão (mas não foram criadas):
- **feedback:** "Vou pelo padrão do projeto (commit em main) ao invés de PR para cada feature — confirma explicitamente toda vez que faço checkpoint"
- **project:** "Bloco 4a fechado v0.30.0 Vitals; Bloco 4b aberto em v0.31.0 Podium; restam 8 PRDs (043 done, 047-053 a implementar) para fechar Onda 2"
- **reference:** "Padrão de feature de BI/Analytics: `src/features/<feature>/` com `engine/` puro + `hooks/` agregadores TanStack + `pages/` + `components/` + `i18n/pt-BR.ts` + `index.ts` barrel"

Decidir na próxima sessão se vale persistir.

## 📊 Atividade recente (telemetria)

Telemetria não está ativada neste projeto (`.claude-metrics/` não existe). Se desejar, rodar `/telemetria-bootstrap` na próxima sessão para começar a registrar entregas, decisões e releases.

## 📚 Referências

- Spec do PRD-043: `docs/prds/PRD-043-ranking-gamificacao_DONE.md` (esta sessão)
- CHANGELOG entry: `CHANGELOG.md` seção `[0.31.0] — Podium · 2026-05-27`
- Commit principal: `787625e`
- Padrão de hook agregador a copiar: `src/features/abc-curve/hooks/useABCClassification.ts`
- Padrão de página config a copiar: `src/features/admin-settings/pages/LifecycleSettingsPage.tsx`
- Padrão de rotas com drill: `src/routes/app.veiculos.{tsx,index.tsx,$id.tsx}`
