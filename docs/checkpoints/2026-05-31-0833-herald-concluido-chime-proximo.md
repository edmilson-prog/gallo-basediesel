# Checkpoint — PRD-008 (Herald) concluído · Plano 009 (Chime) a iniciar — 2026-05-31T08:33

> **Branch:** `claude/trusting-hertz-bfa7df` · **Último commit:** `811bc38` chore(release): v0.52.0 Herald — notifications foundation
> **Sessão anterior:** Claude (execução subagent-driven do Plano 008, Fases 3→5 + release) · **Gerado em:** 2026-05-31T08:33 (-03)
> **Estado:** working tree limpo · 12 commits pushados · PR #16 aberto

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo docs/checkpoints/2026-05-31-0833-herald-concluido-chime-proximo.md na íntegra
e também o plano docs/superpowers/plans/2026-05-30-notificacoes-009-ui.md.
Confirme em uma frase que entendeu: 1) que o PRD-008 (Herald) está concluído, 2) o estado atual
do código, 3) qual é a próxima tarefa (Plano 009 / Chime). Não faça nenhuma ação até eu autorizar.

PR relacionado: https://github.com/edmilson-prog/gallo-basediesel/pull/16
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial (React 19 + TanStack Router file-based + Vite + Tailwind v4 + shadcn/ui + Iconify; dados via Provider Pattern com mocks, `VITE_DATA_SOURCE=mock`). Fase 1 frontend-first. Épico **"Sistema de Notificações"**: **PRD-008 (Herald, fundação invisível) ✅ → PRD-009 (Chime, UI) ⏳**, nessa ordem.

## 🎯 Objetivo da sessão anterior

Executar o **Plano 008** (fundação) tarefa por tarefa via `superpowers:subagent-driven-development`. **Concluído integralmente** (Fases 1–5 + release v0.52.0 Herald). A próxima sessão executa o **Plano 009** (UI), que é um MINOR separado (codinome **Chime**).

## ✅ Progresso — PRD-008 Herald COMPLETO (12 commits desde o checkpoint anterior)

| Commit | Entrega |
|--------|---------|
| `67e7014` | `bus.ts` — event bus pub/sub não-bloqueante |
| `1638ae3` | `events.ts` — catálogo dos 30 eventos (Anexo A) + `DERIVED_EVENTS` (6) |
| `9e73e9a` | `routing/dedupe.ts` + `routing/rules.ts` — `dedupeKey` + 30 regras (categoria/severidade/canais/destinatários fiéis ao Anexo A) |
| `41082fd` | `channels/` — contract + registry + inApp/toast (ativos) + email/whatsapp/sms/push (stubs deferidos p/ Onda 8) |
| `ad44a47` | `routing/router.ts` — fan-out por destinatário, cruzamento com preferências, locks não-silenciáveis, marca `deferred`; wired no boot do `context.tsx` |
| `5b5b7a5` | Consolidação de toasts existentes adiada p/ PRD-009 (nota em `toast.ts`; sem regressão de UX) |
| `9d79ef8` | `conditions/derivedConditions.ts` — extração da lógica dos 3 alertas do PRD-014 (re-export garante painel idêntico) |
| `ec50e5d` | `reconciler.ts` real — boot + intervalo, recipients via `customer.ownerId` + `store.managerId`, idempotente; injeta data providers via `context.tsx` |
| `aae5064` | `groupKey` estrutural no router (eventos colapsáveis) |
| `3adc024` | Harness dev-only em `/design-system` (dispara eventos, log ao vivo) |
| `f6f9aca` | Nota de migração no PRD-014 |
| `811bc38` | **Release v0.52.0 Herald** — bump, CHANGELOG, índice de PRDs (seção épico 008/009), PRD-008 → `_DONE` |

`bun run build` **verde** após cada task. Tudo pushado.

## 🔧 Estado do código

- **Versão:** `0.52.0` — codinome **Herald** (package.json + CHANGELOG.md).
- **Provider de notificações** (`src/providers/notifications/`) — COMPLETO, espelha `src/providers/data/`:
  - `bus.ts`, `events.ts` (30 eventos), `errors.ts`
  - `contracts/` (store + preferences), `impl/{mock,supabase}/` (RBAC scope não-burlável; supabase = stubs)
  - `routing/{dedupe,rules,router}.ts`, `channels/{contract,registry,inApp,toast,email,whatsapp,sms,push}.ts`
  - `preferences/defaults.ts` (matriz Anexo B + locks), `conditions/derivedConditions.ts`, `reconciler.ts` (real)
  - `hooks/{useNotifications,useUnreadCount,useNotificationPreferences}.ts`, `factory.ts`, `context.tsx`, `index.ts` (barrel público)
- **Pipeline viva:** o router e o reconciliador são **iniciados no boot** (`context.tsx`, montado dentro de `<DataProvidersProvider>`). O reconciliador cria notificações `derived` no store mock a cada ciclo (invisível até o center do PRD-009).
- **Hooks prontos para a UI:** `useNotifications`, `useUnreadCount`, `useNotificationPreferences` retornam dados reais (seeds + derivadas).
- **Mocks:** `src/mocks/generators/notification.ts` (~264 notif. event-lifecycle, com `groupKey` em clusters), `src/mocks/api/notifications.ts`.

## ⏳ Próxima tarefa — Plano 009 (Chime / UI)

> Arquivo: `docs/superpowers/plans/2026-05-30-notificacoes-009-ui.md` — executar via `superpowers:subagent-driven-development`, tarefa por tarefa, validando por `bun run build` + `npx eslint <arquivos>`.

**5 fases (UI):**
1. **Tokens de severidade** — escala dedicada `--severity-{info,success,warning,critical}` em `src/styles.css`, constante nos 4 temas (diesel/parts/service/industrial), tratamento tonal, desacoplada de `--primary`.
2. **Sino + dropdown** — substituir o sino placeholder em `src/features/shell/components/TopBar.tsx`; **Direção B** + **alternador** entre dois layouts (Painel/Lista) aprovados no design.
3. **Página + alternador** — rota da central de notificações.
4. **Matriz de preferências** — **Abordagem A** (página própria).
5. **Migração `ActiveAlertsList` (RF-029)** + **portal do cliente** (tema **PARTS**).

Decisões de design já resolvidas estão no spec: `docs/superpowers/specs/2026-05-30-notificacoes-008-009-design.md`. Mockups (gitignored, podem não persistir): `.superpowers/brainstorm/2780-1780186128/content/*.html` — decisões capturadas no spec.

## ❓ Decisões pendentes

Nenhuma de arquitetura/design (resolvidas no spec). Observações para revisar durante o 009:
- O sino atual (`TopBar.tsx`) usa placeholder estático (`MOCK_NOTIFICATIONS`, `useEcommerceNotificationStore`) — **substituir** por `useUnreadCount`/`useNotifications`.
- Sessão de cliente "viva" não existe na Fase 1 (`recipientType:'customer'` só via seed/reconciliador) — portal do cliente (Fase 5 do 009) exercita esse caminho pela primeira vez.

## 🚧 Bloqueios / Riscos

- **CRLF lint (ambiental):** `bun run lint` global reporta ~143k erros `prettier/prettier` de CRLF **pré-existentes** (Windows + autocrlf). **NÃO** usar como porta. Validar por `bun run build` (tsc, canônico) + `npx eslint <arquivos tocados>` (e `npx prettier --write <arquivos>` p/ formatação). Nunca rodar `bun run lint`/`bun run format` global.
- **`src/routeTree.gen.ts`** é regenerado pelo plugin a cada `bun run build` (só ruído de line-ending). Descartar com `git checkout -- src/routeTree.gen.ts` se aparecer no status (não editar manualmente).
- **Upstream:** branch já tem upstream `origin/claude/trusting-hertz-bfa7df`. `git push` simples funciona. **Nunca** pushar/commitar em `main` sem confirmação.

## ⚠️ Avisos do usuário (regras desta sessão)

- **Testar UI manualmente** — NÃO abrir browser/devtools/preview para "validar" (memória `feedback_manual_testing.md`). Isso é importante no 009 (UI visível). O harness em `/design-system` existe para o usuário testar.
- **Supply-chain guard:** `bunfig.toml` impõe `minimumReleaseAge=86400` (24h). Confirmar com o usuário antes de adicionar pacote a `minimumReleaseAgeExcludes`.
- **Idioma:** código/comentários em inglês; UI/conteúdo/docs em pt-BR com acentos corretos (UTF-8).
- **Git:** Conventional Commits atômicos; co-author `Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Commit/push só na branch de feature.
- **Subagentes:** o usuário aprovou execução com subagentes. Padrão: um subagente por task, validação build + eslint per-file, commit, segue.

## 🛡️ Não regredir (deve continuar funcionando)

- **Painel do Gestor (PRD-014):** `useActiveAlerts` + `<ActiveAlertsList>` exibem os 3 alertas idênticos. A Fase 5 do 009 (RF-029) migra a UI para consumir o center — **preservar o comportamento** dos alertas/dismissals até a migração estar pronta.
- **Seeds de mocks:** preservados (offset primo). **Árvore de providers** (`__root.tsx`): `Query > Theme > Data > Notification > Auth > Multistore > Outlet` — não reordenar (o reconciliador depende de Notification estar dentro de Data).
- **Build verde** a cada task. **Temas/tokens** (PRD-001): componentes consomem APENAS tokens semânticos (`bg-background`, `text-foreground`…), nunca `--gallo-*` ou hex. Os novos tokens de severidade (Fase 1 do 009) seguem esse padrão de 3 camadas.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/superpowers/plans/2026-05-30-notificacoes-009-ui.md` — **o plano a executar**.
- `docs/superpowers/specs/2026-05-30-notificacoes-008-009-design.md` — decisões + design visual aprovado.
- `docs/prds/PRD-009-notification-center-preferencias.md` — requisitos + Anexos (RF-029 = migração ActiveAlertsList).
- `src/providers/notifications/index.ts` — superfície pública (hooks `useNotifications`/`useUnreadCount`/`useNotificationPreferences`, tipos, `defaultPreferenceFor`/`isChannelLocked`/`isCategoryFullyOptional`).
- `src/features/shell/components/TopBar.tsx` — sino placeholder a substituir (Fase 2 do 009).
- `src/styles.css` — tokens em 3 camadas; adicionar `--severity-*` (Fase 1 do 009).
- `src/routes/design-system.tsx` — harness de notificações (referência de consumo dos hooks) + validador de contraste WCAG.
- `src/features/manager-dashboard/components/ActiveAlertsList.tsx` + `hooks/useActiveAlerts.ts` — alvo da migração RF-029.
- `CLAUDE.md` — convenções do projeto.

## 🧠 Memórias relacionadas

- `feedback_manual_testing.md` — usuário testa UI manualmente; não abrir preview para validar.

## 📚 Referências

- Codinomes: PRD-008 = **Herald** (✅ v0.52.0); PRD-009 = **Chime** (⏳).
- PR: https://github.com/edmilson-prog/gallo-basediesel/pull/16
- Checkpoint anterior (fundação parcial): `docs/checkpoints/2026-05-30-2322-notificacoes-008-009.md`.
