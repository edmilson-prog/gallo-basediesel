# Spec — Tempo de sessão por inatividade (Session Timeout)

**Data:** 2026-06-21
**Status:** Design aprovado (aguardando revisão do spec)
**Feature:** `src/features/session-timeout/`
**Tipo:** Segurança/política de sessão (client-side) — **não é fronteira de segurança**

---

## 1. Objetivo

Encerrar automaticamente a sessão de um usuário logado após um período de
**inatividade** (sem mouse/teclado/scroll/touch), avisando antes com um **modal
de contagem regressiva acompanhado de beeps** que escalam conforme o tempo se
esgota. O tempo é **parametrizável** globalmente pelo Owner, com **override por
usuário**.

Caso de uso: estações compartilhadas no balcão/loja onde um vendedor sai e deixa
a sessão aberta. O timeout reduz o risco de uso indevido e força re-login.

---

## 2. Decisões tomadas (brainstorming)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Gatilho | **Inatividade (idle)** — qualquer interação reseta o relógio |
| 2 | Parâmetro | **Default global** (`stores.settings` jsonb) **+ override por usuário** |
| 3 | Cobertura | **Todos os usuários internos logados** (app `/app/*`); override pode isentar |
| 4 | Aviso | **Modal central com contagem regressiva** + beeps escalando + "Continuar conectado"; qualquer atividade cancela |
| 5 | Controles do Owner | Liga/desliga, minutos de inatividade, duração do aviso, toggle de som, intensidade dos beeps |
| 6 | Multi-aba | **Atividade sincronizada entre abas**; só encerra quando ocioso em **todas** |
| 7 | Arquitetura | **Feature dedicada** `src/features/session-timeout/` (espelha `access`) |
| 8 | Default | **Ligado com padrões** (recurso nasce ativo) |
| 9 | Override DB | **Coluna dedicada** `sellers.session_timeout_override jsonb null` |
| 10 | Escopo do override | **Override completo por usuário** (snapshot da config inteira) |

---

## 3. Modelo de dados

### 3.1 Tipo compartilhado (`src/shared/types/platform.ts`)

```ts
/** Configuração de encerramento de sessão por inatividade. */
export interface ISessionTimeoutSettings {
  /** Master switch — quando false, nenhum rastreamento ocorre. */
  enabled: boolean;
  /** Minutos de inatividade até encerrar (a janela de aviso está incluída neste total). */
  idleMinutes: number;
  /** Segundos do modal de contagem antes do logout. Deve ser < idleMinutes·60. */
  warningSeconds: number;
  /** Emite beeps audíveis durante o aviso. */
  soundEnabled: boolean;
  /** Intensidade do beep, 0..1 (ganho do oscilador). */
  soundVolume: number;
}

/** Default aplicado quando `IPlatformSettings.sessionTimeout` está ausente. */
export const DEFAULT_SESSION_TIMEOUT: ISessionTimeoutSettings = {
  enabled: true,
  idleMinutes: 30,
  warningSeconds: 60,
  soundEnabled: true,
  soundVolume: 0.5,
};
```

`IPlatformSettings` ganha o campo opcional:

```ts
/** Política de encerramento de sessão por inatividade. Ausente ⇒ DEFAULT_SESSION_TIMEOUT. */
sessionTimeout?: ISessionTimeoutSettings;
```

> Persistido no `stores.settings` jsonb existente — **sem migration** para a config global.

### 3.2 Override por usuário (`src/shared/types/people.ts`)

```ts
/** Override completo da política de sessão para este usuário.
 *  null/undefined ⇒ herda o global. Quando presente, é autoritativo
 *  (pode inclusive ligar o recurso mesmo com o global desligado).
 *  É um snapshot: não acompanha mudanças posteriores do global. */
sessionTimeoutOverride?: ISessionTimeoutSettings | null;
```

Persistido em **nova coluna** `sellers.session_timeout_override jsonb null`
(migration — ver §7).

---

## 4. Engine puro (`src/features/session-timeout/engine/`) — TDD

Lógica pura, sem React, sem timers, sem Web APIs. Coberta por Vitest.

### 4.1 `resolveSessionTimeout.ts`

```ts
resolveSessionTimeout(
  global: ISessionTimeoutSettings | undefined,
  override: ISessionTimeoutSettings | null | undefined,
): { enabled: boolean; idleMs: number; warningMs: number }
```

Regras:
- `effective = override ?? (global ?? DEFAULT_SESSION_TIMEOUT)`.
- Se `!effective.enabled` ⇒ `{ enabled: false, idleMs: 0, warningMs: 0 }`.
- `idleMs = idleMinutes · 60_000`; `warningMs = warningSeconds · 1_000`.
- **Clamp:** garante `warningMs < idleMs` (se `warningMs >= idleMs`, reduz
  `warningMs` para `idleMs - 1_000`, mínimo `1_000`).
- Sanitiza valores não-positivos/NaN para o default antes de calcular.

**Testes:** global on/off; override presente vence global (inclusive liga com
global off); override null herda global; ausência total cai no default;
clamp quando aviso ≥ inatividade.

### 4.2 `idlePhases.ts`

```ts
computeIdlePhase(
  lastActivityAt: number, // epoch ms
  now: number,            // epoch ms
  idleMs: number,
  warningMs: number,
): { phase: 'active' | 'warning' | 'expired'; msUntilWarning: number; msUntilLogout: number }
```

- `elapsed = now - lastActivityAt`.
- `phase = elapsed >= idleMs ? 'expired' : elapsed >= (idleMs - warningMs) ? 'warning' : 'active'`.
- Retorna os restantes não-negativos para alimentar o countdown.

**Testes:** fronteiras exatas active↔warning↔expired; restantes corretos;
`lastActivityAt` no futuro (clock skew) tratado como `active`.

### 4.3 `beepSchedule.ts`

```ts
shouldBeepAtTick(remainingMs: number, warningMs: number, lastBeepAtMs: number | null):
  { beep: boolean; urgency: number /* 0..1 */ }
```

- Cadência **decrescente**: intervalo entre beeps encolhe conforme `remainingMs → 0`
  (ex.: ~10s no início da janela, ~1s nos últimos segundos).
- `urgency` cresce de 0→1 conforme `remainingMs/warningMs → 0` (modula frequência/volume do beep).
- Não emite fora da fase `warning`.

**Testes:** não beepa fora da janela; intervalo encolhe no fim; urgência monotônica.

---

## 5. Runtime (hooks + áudio)

### 5.1 `lib/beep.ts` — wrapper Web Audio

`createBeeper()` encapsula um `AudioContext` único (lazy):
- `unlock()` — chama `audioContext.resume()`; idempotente. Disparado no 1º gesto
  do usuário (contorna a *autoplay policy* dos navegadores).
- `beep(volume: number, urgency: number)` — toca um `OscillatorNode` + `GainNode`
  curto (~120–180 ms). Frequência base ~660 Hz, subindo com `urgency`. Envelope
  com ataque/decay curtos para evitar clique.
- **Degradação graciosa:** todo o módulo é `try/catch`; se Web Audio não existir
  ou estiver bloqueado, vira no-op. O aviso **visual** nunca depende do som.

### 5.2 `hooks/useActivityTracker.ts`

- Registra listeners *passivos* e *throttled* (~1 s) em
  `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`, `wheel`.
- Atualiza um `lastActivityAt` compartilhado (ref) e publica para outras abas.
- Na 1ª interação, chama `beeper.unlock()`.
- **Qualquer atividade real reseta o relógio em todas as fases** (inclusive durante
  o aviso), conforme a decisão #4. O botão "Continuar conectado" é apenas um atalho
  explícito equivalente a "houve atividade".

### 5.3 `hooks/useCrossTabActivity.ts`

- `BroadcastChannel('gallo-session-activity')` para publicar/ouvir o timestamp de
  atividade entre abas. Fallback: escrever em `localStorage` e ouvir o evento
  `storage` (navegadores sem BroadcastChannel).
- Publicações *throttled* (~1 s) para não saturar o canal.
- O `lastActivityAt` efetivo é o **máximo** entre o local e o recebido de outras abas.
  Logout só dispara quando **todas** as abas estão ociosas (consequência natural de
  compartilhar o maior timestamp).

### 5.4 `hooks/useSessionTimeout.ts` — orquestrador

- Lê `settings` (`useSettingsProvider`) e o seller logado (`useAuth` +
  `useSellersProvider`) para o override; resolve a config via
  `resolveSessionTimeout`.
- Se `!enabled` ⇒ não faz nada (sem listeners, sem timer).
- `setInterval(1_000)` recomputa `computeIdlePhase`:
  - `active` → modal fechado.
  - `warning` → abre o modal; a cada tick consulta `shouldBeepAtTick` e chama
    `beeper.beep(...)` se `soundEnabled`.
  - `expired` → `navigate({ to: '/auth/logout' })` (signOut já existente).
- `visibilitychange` → recomputa imediatamente ao voltar o foco (corrige o
  throttling de `setInterval` em abas de fundo).
- "Continuar conectado" → reseta `lastActivityAt = Date.now()`, fecha o modal,
  rearma os beeps.
- Expõe `{ phase, secondsLeft, onStayConnected, onLogoutNow }` para o modal.

### 5.5 Montagem global

Componente `components/SessionTimeoutGuard.tsx` que usa `useSessionTimeout` e
renderiza o modal. Montado no `AppLayout` (`src/features/shell/layouts/AppLayout.tsx`),
ao lado de `OutsideHoursBanner` e dos demais timers globais. Exportado pelo barrel
`src/features/session-timeout/index.ts`.

---

## 6. UI

### 6.1 `components/SessionTimeoutModal.tsx`

- `AlertDialog` (shadcn) — **não** dispensável por clique-fora nem `Esc`.
- Conteúdo: ícone de alerta; título "Sua sessão será encerrada por inatividade";
  texto curto explicando; **countdown grande `mm:ss`**; barra de progresso que
  esvazia; botões **"Continuar conectado"** (primário) e **"Sair agora"**
  (secundário → logout).
- Cor escala `severity-warning` → `severity-critical` conforme `secondsLeft`.
- Acessibilidade: `role="alertdialog"`, `aria-live="assertive"` no countdown,
  foco inicial no botão primário.
- Apenas tokens semânticos (sem `--gallo-*`/hex), conforme o sistema de temas.

### 6.2 Tela de configuração — `src/routes/app.configuracoes.sessao.tsx`

- **Owner-only** (gate de papel, espelhando outras telas de Configurações).
- Item novo no menu de Configurações: **"Segurança da sessão"**.
- Form `react-hook-form` + `zod`:
  - Switch **Ativar encerramento por inatividade**.
  - Input **Minutos de inatividade** (1–480).
  - Input **Segundos de aviso** (10–300, validado `< idleMinutes·60`).
  - Switch **Emitir beeps**.
  - Slider **Intensidade do som** (0–1).
  - Botão **"Testar beep"** (prévia via `beeper.beep`).
- Salva via `settings.update({ sessionTimeout })`.
- Segue `docs/dev/ux-guidelines.md` no que se aplica a um form (header glass etc.).

### 6.3 Override no cadastro de usuário (`UsersPage.tsx` / Sheet de usuário)

- Subseção **"Tempo de sessão (override)"** na aba **Geral** do Sheet existente:
  - Switch **"Usar configuração própria"**:
    - **Off** ⇒ `sessionTimeoutOverride = null` (herda global).
    - **On** ⇒ revela os 5 controles (iguais aos globais), pré-preenchidos com o
      valor global como ponto de partida; o objeto salvo é o override **completo**.
  - Para isentar um usuário: ligar "Usar configuração própria" e desligar o switch
    interno **Ativar**.
- Salvo pelo **botão único do form** (padrão da casa, igual a Horário/Rodízio).
- O provider de sellers (mock + supabase) passa a gravar/ler `session_timeout_override`.

---

## 7. Migration

`supabase/migrations/<timestamp>_seller_session_timeout_override.sql`:

```sql
alter table public.sellers
  add column if not exists session_timeout_override jsonb;
```

- Sem default (null = herda). Sem mudança de RLS (a coluna acompanha as policies
  existentes de `sellers`; já há edição staff/Owner do cadastro).
- **Regra do projeto:** todo `apply_migration` via MCP é espelhado em
  `supabase/migrations/` no mesmo PR. Aplicar em produção é passo **separado**,
  confirmado com o dono.
- Mapper supabase: `session_timeout_override` ⇄ `sessionTimeoutOverride` no
  `impl/supabase/sellers.ts` (camelCase ⇄ snake_case + jsonb).

---

## 8. Segurança, bordas e riscos

- **Não é fronteira de segurança.** É 100% client-side; um usuário técnico pode
  burlar (igual ao gate client-side do PRD-212). RLS e Auth seguem sendo a
  segurança real. Documentar isso de forma explícita.
- **Áudio bloqueado:** se o navegador nunca recebeu gesto, o beep pode não tocar.
  O `unlock()` no 1º gesto resolve na prática; se falhar, o modal visual continua
  funcionando (no-op no som).
- **Aba em segundo plano:** `setInterval` é *throttled* pelo navegador em abas de
  fundo. Mitigado por (a) recompute no `visibilitychange` e (b) sincronização
  multi-aba (a aba ativa mantém o timer preciso e o maior `lastActivityAt`).
- **Sessão restaurada vs login:** o timeout vale para **qualquer sessão logada**
  (roda enquanto há usuário autenticado), não só no momento do login.
- **Cobertura por layout:** o guard vive no `AppLayout` (app interno `/app/*`),
  logo cobre todos os papéis internos. Clientes do **portal B2B** (`portal.*`),
  **loja B2C** (`loja.*`) e **PWA do vendedor externo** (`pwa.*`) usam outros
  layouts e **não** são alvo nesta entrega — público externo, fora do escopo de
  segurança de estação.
- **Relógio:** usa `Date.now()` para deltas; tolera *clock skew* (futuro ⇒ active).
- ⚠️ **Risco operacional do default ligado:** ao subir, **todos** os usuários
  passam a ter timeout de 30 min imediatamente. Comunicar aos usuários antes do
  deploy; considerar `warningSeconds` generoso na largada. Decisão do dono.

---

## 9. Fora de escopo (YAGNI)

- Enforcement server-side / invalidação de sessão no servidor (espelha o
  *deferido* do PRD-212).
- Timeout por tempo absoluto de sessão ou amarrado ao fim do expediente
  (foi explicitamente preterido em favor de inatividade).
- Auditoria do evento de logout-por-inatividade (pode virar fase 2 se desejado).
- Configuração por papel (resolvida por global + override por usuário).

---

## 10. Arquivos

**Criar:**
- `src/features/session-timeout/engine/resolveSessionTimeout.ts` (+ `.test.ts`)
- `src/features/session-timeout/engine/idlePhases.ts` (+ `.test.ts`)
- `src/features/session-timeout/engine/beepSchedule.ts` (+ `.test.ts`)
- `src/features/session-timeout/lib/beep.ts`
- `src/features/session-timeout/hooks/useActivityTracker.ts`
- `src/features/session-timeout/hooks/useCrossTabActivity.ts`
- `src/features/session-timeout/hooks/useSessionTimeout.ts`
- `src/features/session-timeout/components/SessionTimeoutModal.tsx`
- `src/features/session-timeout/components/SessionTimeoutGuard.tsx`
- `src/features/session-timeout/index.ts` (barrel)
- `src/routes/app.configuracoes.sessao.tsx`
- `supabase/migrations/<timestamp>_seller_session_timeout_override.sql`

**Alterar:**
- `src/shared/types/platform.ts` — `ISessionTimeoutSettings`, `DEFAULT_SESSION_TIMEOUT`, `IPlatformSettings.sessionTimeout`
- `src/shared/types/people.ts` — `ISeller.sessionTimeoutOverride`
- `src/features/shell/layouts/AppLayout.tsx` — montar `<SessionTimeoutGuard/>`
- `src/features/admin-settings/pages/UsersPage.tsx` — subseção de override
- `src/providers/data/impl/supabase/sellers.ts` — mapper da coluna nova
- `src/providers/data/impl/mock/sellers.ts` (se aplicável) — suporte ao campo
- Menu/índice de Configurações — entrada "Segurança da sessão"
- `CHANGELOG.md` / versão — no fechamento (MINOR com codinome)

---

## 11. Testes

- **Vitest (TDD):** os três módulos de `engine/` — cobertura das regras de
  resolução, fases e cadência de beep.
- **Manual (dono):** modal, beeps, multi-aba, tela de config e override — validação
  manual da UI conforme preferência registrada.
- **Gate de CI:** `bun run build` + `bun run test` verdes; código novo checado por
  delta no `tsc`.
