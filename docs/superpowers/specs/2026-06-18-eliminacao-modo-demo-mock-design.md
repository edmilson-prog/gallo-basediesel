# Design — Eliminação do modo Demonstração/mock

> **Data:** 2026-06-18 · **Branch:** `chore/eliminate-demo-mock-mode` (rebaseada sobre `origin/main` @ `6770707`, v0.104.0 Manifest) · **PR:** [#110](https://github.com/edmilson-prog/gallo-basediesel/pull/110) (DRAFT)
> **Origem:** decisão do dono (2026-06-17) — "não tenho o mínimo interesse em manter o modo de demonstração". Gatilho técnico: o `/code-review` xhigh do PR #109 expôs a divergência mock↔supabase no tratamento de "não encontrado".

---

## 1. Objetivo e contexto

**GALLO BASE DIESEL** roda **em produção desde 2026-06-10** sobre Supabase (dados **e** auth). O **modo Demonstração (mock)** foi a fundação da Fase 1 (Frontend First, sem backend). Hoje é legado que só gera custo: manutenção dupla (cada feature cobrindo mock **e** supabase) e uma classe inteira de bugs de divergência.

**Objetivo:** eliminar o modo Demonstração/mock da plataforma, deixando-a **supabase-only** em dados e auth — sem switch de runtime, sem UI de "Ambiente & Dados", sem camada `src/mocks`.

**Decisão de escopo (dono):** **Opção A — remoção total** (não "fixture de teste"). Justificativa validada pela auditoria: o risco que motivava a opção conservadora **não existe** — apenas 6 testes acoplam ao mock e **todos vivem dentro de `src/mocks/`/`impl/mock`**, saindo junto com o código que testam; os 97 testes de negócio são `engine/` puros e não tocam o seed.

## 2. Estado validado (auditoria 7 frentes, read-only)

Auditoria executada sobre a branch e **corrigida contra `origin/main`** (a `main` local estava 33 commits atrás; toda a integração de IA real — Cortex/Polyglot/Manifest — já está em produção). A branch foi **rebaseada sobre `origin/main`** antes deste design.

| Frente | Veredito |
|---|---|
| **Testes** | 6 testes acoplados ao mock, **todos em `src/mocks/`/`impl/mock`** (5 internos do gerador/API + `impl/mock/ai.test.ts`). 97 restantes = `engine/` puros. **Remoção não quebra a suíte.** |
| **Switch** | 3 switches: `providers/data/factory.ts`, `features/auth/authSource.ts` e `providers/notifications/factory.ts` (este **ignora o override** — bug latente). + **31 call-sites** de `getActiveDataSource` + o núcleo `shared/lib/environmentMode.ts`. |
| **Camada mock** | `src/mocks/` (114 arquivos) + `providers/data/impl/mock/` (47). Notifications mock isolável (tem impl supabase). |
| **UI demo** | Tela "Ambiente & Dados" (`routes/app.configuracoes.ambiente.tsx` + `EnvironmentModePage`), `DemoModeBanner`, `EnvironmentBadge` (TopBar), badge/aviso na tela de Saúde, flag `demoOnly` (**hoje código morto** — sem consumidor após o gate da IA ter sido removido em prod). `DataSourceBanner` **não** é do demo (preservar). |
| **IA** | ✅ **Real e viva em prod** (`supabaseAiProvider`, edge `ai-generate`, tabelas `ai_settings`/`ai_usage_events`). Só remover o **lado mock** (`impl/mock/ai.ts`, `_aiSeed.ts`, `ai.test.ts`); o provider real fica. |
| **Erro tipado** | Hoje `useConversationDetail` casa `/not found/i` (frágil): só o mock casa; supabase lança `PGRST116` opaco. Não existe `NotFoundError` na camada de contrato (só `NotImplementedError`). 2 telas afetadas (Conversa + Ficha do Cliente). |
| **ESLint/env/docs** | 6 blocos `no-restricted-imports` (3 mencionam mock); 4 env vars (`VITE_DATA_SOURCE`, `VITE_AUTH_SOURCE`, `VITE_WHATSAPP_PROVIDER`, `VITE_DINTEC_PROVIDER`); docs `environment-mode.md` + `provider-pattern.md` §8/§9. Preservar as fronteiras supabase/notifications. |

## 3. Decisões fechadas

1. **Escopo:** Opção A — remoção total do mock de **dados** + UI demo + switch de runtime. App e auth viram **supabase-only**.
2. **Área de IA:** **mantida** — está real em produção. Remove-se apenas o lado mock do provider `ai`; o `supabaseAiProvider` e a feature `ai-settings` permanecem 100% funcionais.
3. **Engines mock de WhatsApp/DINTEC:** **fora de escopo.** São abstrações de provider para integrações reais (Meta/Evolution; fundação DINTEC PRD-121 agnóstica de fonte), com mock como fallback/sandbox legítimo — **não** são o "modo Demonstração de dados". Permanecem intactos, inclusive os env satélites `VITE_WHATSAPP_PROVIDER`/`VITE_DINTEC_PROVIDER`.

## 4. Arquitetura-alvo (end state)

- `getDataProviders()` retorna **sempre** `supabaseProviders` — sem `resolveDataSource`, sem `environmentMode`, sem `mockProviders`.
- `resolveAuthSource()` removido — `AuthProvider` usa **sempre** o Supabase auth; sem `MockAuthProvider`, `mock-users.ts` nem login "pick-a-profile" (o form e-mail/senha + `useAccessGate` permanecem).
- `getNotificationStores()` retorna **sempre** as stores supabase; `reconciler` client-side (mock-only) removido.
- Os 31 call-sites de `getActiveDataSource` colapsam para o ramo supabase (deletando o ramo mock/simulador correspondente). `getActiveDataSource`/`environmentMode.ts` deixam de existir.
- `src/mocks/` e `providers/data/impl/mock/` deixam de existir; deps `@faker-js/faker`, `seedrandom`, `@types/seedrandom` saem do `package.json`.
- Fronteiras ESLint: removem-se os 3 grupos que mencionam o mock e a exceção `design-system`; **preservam-se** as fronteiras de `impl`/`contracts`/`factory` de dados e de notifications (o barrel `@/providers/data` segue valendo).

## 5. Plano por fases (cada fase = 1 PR verde: `bun run build` + `bun run test`)

> Princípio: cada fase é independentemente mergeável e deixa o app funcional. A ordem prioriza as fases **sem bloqueio** primeiro.

- **Fase 0 — Atualizar a branch.** ✅ **Concluída** — rebase sobre `origin/main` (`6770707`), preservando o `vite.config.ts` local.

- **Fase A — Remover a UI do modo demo.** Tela "Ambiente & Dados" (rota + `EnvironmentModePage` + item de sidebar), `DemoModeBanner` (+ wiring no `AppLayout`), `EnvironmentBadge` no TopBar, aviso/badge na tela de Saúde, e a flag `demoOnly` morta (tipo + filtro em `SettingsLayout`). **Não** tocar `DataSourceBanner`. Risco baixo; isolado. Após esta fase o app ainda resolve a fonte por env, mas não há mais como alternar pela UI.

- **Fase B — Colapsar o switch para supabase-only.** `factory.ts`, `authSource.ts`, `notifications/factory.ts` + os 31 call-sites + remoção de `environmentMode.ts`. Auth perde `MockAuthProvider`/`mock-users`/pick-a-profile (mantendo o form real + gate). Após esta fase o app **nunca** usa mock em runtime; `src/mocks` fica como código morto (exceto o vazamento do badges).

- **Fase C — Remover a camada mock.** `src/mocks/` + `providers/data/impl/mock/` + os 6 testes internos + deps faker/seedrandom + limpeza de ESLint/env/docs. **🔒 GATED:** depende de resolver o **badges** (ver §6) — `useBadges` é o único consumidor que quebraria.

- **Fase D — Erro tipado supabase-only.** `NotFoundError` + `isNotFoundError` (reconhece `PGRST116`) em `providers/data/errors.ts`; `.get()` supabase lança tipado; `useConversationDetail`/`useCustomerProfile` discriminam por tipo; estado de erro com "tentar novamente". **🔒 Amplitude a discutir** (ver §6): mínimo (2 telas) vs amplo (38 providers). Independente das fases A–C; fica trivial após a Fase C (sem ponte com o mock).

## 6. Questões em aberto (a discutir antes de executar as fases gated)

1. **Badges/Ranking — gateia a Fase C.** Hoje, **em produção, o Ranking exibe badges FALSOS do seed mock** (`useBadges` → `@/mocks/api/badges`; não há provider nem tabela). Remover o mock força resolver. Opções levantadas: (a) ocultar o widget interinamente + follow-up; (b) implementar provider real (sub-projeto próprio); (c) computar client-side de dados reais (a verificar se é derivável). **Status: segurar — decisão pendente do dono.**
2. **Amplitude do fix de erro tipado — Fase D.** Mínimo (Conversa + Ficha do Cliente) vs amplo (centralizar em todos os 38 providers supabase com `.single()`). **Status: discutir mais.**

## 7. Riscos e mitigações

- **`notifications/factory.ts` ignora o override** (lê `VITE_DATA_SOURCE` direto) — bug latente; some ao colapsar para supabase-only (Fase B).
- **Ramos por fonte em telas compartilhadas** (conversas: Realtime vs simulador, áudio simulado, upload; quick-send runners) viram código morto — **podar o ramo errado inverteria o comportamento**. Cada call-site exige conferência do ramo supabase correto.
- **Boot do `AuthProvider`** depende de `MockAuthProvider`/`mock-users`; trocar o login sem travar os ~100 consumidores de auth. `supabase.ts` passa a exigir `VITE_SUPABASE_*` **sempre** (hoje só quando supabase).
- **Não afrouxar** as fronteiras ESLint de supabase/notifications ao limpar as do mock — o barrel `@/providers/data` continua valendo.
- **Baseline verde obrigatório** a cada fase (`bun run build` + `bun run test`). `tsc --noEmit` tem baseline de ~316 erros pré-existentes — avaliar **por delta** de código novo. O build (esbuild) **não** faz type-check.
- **`vite.config.ts`** (fix local de dev) e **`src/routeTree.gen.ts`** (gerado; o dev server o regenera) **não** entram em commits.

## 8. Não regredir

- Produção supabase (dados + auth): login e-mail/senha, RLS per-seller, `base_role`.
- Inbox WhatsApp real (Evolution multi-instância): envio/recebimento, status, mídia.
- Área de IA real (settings/usage/playground via `ai-generate`).
- Caches `useMessages` (#107) e `useConversationDetail` (#109).
- Suíte de testes verde a cada fase.

## 9. Fora de escopo

- Engines mock de WhatsApp/DINTEC (§3.3).
- Implementação real de badges (PRD-043) — vira follow-up.
- Centralização ampla do erro tipado nos 38 providers (a menos que decidido na §6.2).
- `storefront` checkout/pagamento (gap da Fase 2, não é do switch de dados).
