# Encerramento de sessão por inatividade (Session Timeout)

**Spec de referência:** `docs/superpowers/specs/2026-06-21-session-timeout-design.md`
**Feature dir:** `src/features/session-timeout/`
**Versão que entregou:** pendente (MINOR + codinome a definir com o dono)
**Status migration:** arquivo versionado (`supabase/migrations/20260621120000_seller_session_timeout_override.sql`) — **ainda não aplicado em produção** (passo owner-gated).

---

## Objetivo

Encerrar automaticamente a sessão de um usuário logado após um período de **inatividade** (sem mouse, teclado, scroll ou toque), exibindo um modal de contagem regressiva acompanhado de beeps que escalam conforme o tempo se esgota. O tempo é parametrizável globalmente pelo Owner, com possibilidade de override por usuário.

Caso de uso principal: estações compartilhadas no balcão onde um vendedor sai e deixa a sessão aberta — o timeout reduz o risco de uso indevido e força re-login.

---

## Arquitetura

### Engines puras (`engine/`) — TDD Vitest

Lógica de negócio sem React, sem timers e sem Web APIs. Coberta por Vitest.

| Arquivo | Responsabilidade |
|---|---|
| `resolveSessionTimeout.ts` | Resolve a config efetiva: precedência override por usuário → global → `DEFAULT_SESSION_TIMEOUT`; clamp para garantir `warningMs < idleMs`. |
| `idlePhases.ts` | Computa a fase atual (`active` / `warning` / `expired`) e os restantes em ms para alimentar a contagem regressiva, a partir de `lastActivityAt` e `now`. |
| `beepSchedule.ts` | Decide se deve beepar em cada tick e qual `urgency` (0–1) — cadência decrescente (intervalos menores conforme `remainingMs → 0`). |

### Runtime (hooks + áudio)

| Arquivo | Responsabilidade |
|---|---|
| `lib/beep.ts` | Wrapper `Web Audio API` com `unlock()` (contorna autoplay policy no 1º gesto do usuário) e `beep(volume, urgency)`. **Degradação graciosa:** todo o módulo é `try/catch`; se `AudioContext` não existir ou estiver bloqueado, vira no-op. O aviso visual **nunca** depende do som. |
| `hooks/useActivityTracker.ts` | Listeners passivos e throttled (~1 s) em `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`, `wheel`. Chama `beeper.unlock()` no 1º gesto. Qualquer atividade reseta o relógio em todas as fases, inclusive durante o aviso. |
| `hooks/useCrossTabActivity.ts` | Sincroniza `lastActivityAt` entre abas via `BroadcastChannel('gallo-session-activity')` (fallback: evento `storage` do `localStorage`). O timestamp efetivo é o **máximo** entre o local e o de outras abas — logout só dispara quando **todas** as abas estão ociosas. |
| `hooks/useSessionTimeout.ts` | Orquestrador: lê settings globais (`useSettingsProvider`) e override do seller logado (`useAuth` + `useSellersProvider`), resolve com `resolveSessionTimeout`, mantém um `setInterval(1_000)` que computa `computeIdlePhase`, abre o modal em `warning`, beeepa conforme `shouldBeepAtTick`, navega para `/auth/logout` em `expired`. Recomputa imediatamente em `visibilitychange` (mitiga throttling de `setInterval` em abas de fundo). |

### Componentes UI

| Arquivo | Responsabilidade |
|---|---|
| `components/SessionTimeoutModal.tsx` | `AlertDialog` (shadcn) **não** dispensável por clique-fora nem Esc. Exibe countdown `mm:ss`, barra de progresso, botão "Continuar conectado" (primário) e "Sair agora". Cor escala `severity-warning → severity-critical`. `aria-live="assertive"` no countdown. |
| `components/SessionTimeoutGuard.tsx` | Usa `useSessionTimeout` e renderiza o modal. Montado uma única vez no `AppLayout`. |

---

## Parâmetros

```ts
// src/shared/types/platform.ts
export interface ISessionTimeoutSettings {
  enabled: boolean;       // master switch
  idleMinutes: number;    // inatividade total até logout
  warningSeconds: number; // duração do modal antes do logout (incluído no total acima)
  soundEnabled: boolean;  // habilita beeps
  soundVolume: number;    // 0..1
}

export const DEFAULT_SESSION_TIMEOUT: ISessionTimeoutSettings = {
  enabled: true,
  idleMinutes: 30,
  warningSeconds: 60,
  soundEnabled: true,
  soundVolume: 0.5,
};
```

**Config global:** campo `sessionTimeout` no jsonb `stores.settings` (sem migration — campo opcional, ausência usa o default).

**Override por usuário:** campo `sessionTimeoutOverride` em `ISeller` (coluna `sellers.session_timeout_override jsonb null`, com migration).

Precedência: override por usuário → global → `DEFAULT_SESSION_TIMEOUT`.

Para **isentar** um usuário específico: ligar "Usar configuração própria" no cadastro e desligar o switch "Ativar" no override.

---

## Pontos de integração

### 1. `AppLayout` (`src/features/shell/layouts/AppLayout.tsx`)

`<SessionTimeoutGuard/>` é montado uma única vez neste layout, ao lado de `OutsideHoursBanner` e outros timers globais. Cobre todas as rotas `/app/*` (usuários internos logados).

**Layouts não cobertos** (intencionalmente): `portal.*`, `loja.*`, `pwa.*` — usam outros layouts; o público externo está fora do escopo desta entrega.

### 2. Tela de configuração global

**Rota:** `/app/configuracoes/sessao`
**Gate:** Owner-only
**Item no menu:** Configurações → **"Segurança da sessão"**

Form com react-hook-form + zod: switch de ativação, minutos de inatividade (1–480), segundos de aviso (10–300, validado `< idleMinutes·60`), switch de beeps, slider de volume e botão "Testar beep".

Persiste via `settings.update({ sessionTimeout })`.

### 3. Override no cadastro de usuário

**Onde:** aba **Geral** do Sheet de usuário em Configurações → Usuários (modo edição).
**Subseção:** "Tempo de sessão (override)".
**Switch "Usar configuração própria":** Off = `sessionTimeoutOverride = null` (herda global); On = revela os 5 controles pré-preenchidos com o global como ponto de partida.

Salvo pelo botão único do form (padrão da casa, igual às abas Horário e Rodízio).

---

## Migration

Arquivo: `supabase/migrations/20260621120000_seller_session_timeout_override.sql`

```sql
alter table public.sellers
  add column if not exists session_timeout_override jsonb;
```

- Sem default (null = herda). Sem mudança de RLS.
- **Status:** versionada no Git, **ainda não aplicada em produção** — aplicar é passo separado, confirmado com o dono.
- Mapper supabase: `session_timeout_override` ↔ `sessionTimeoutOverride` em `src/providers/data/impl/supabase/sellers.ts`.
- Em modo `mock` (`VITE_DATA_SOURCE=mock`) o override já funciona sem a migration.

---

## Bordas e limitações

### Não é fronteira de segurança

O timeout é **100% client-side** — exatamente como o gate de horário do PRD-212. Um usuário técnico pode contorná-lo. A segurança real continua sendo RLS + Auth no Supabase. Documentar isso é intencional: não criar falsa sensação de segurança.

### Áudio best-effort

Beeps dependem de `AudioContext` e de um gesto prévio do usuário (autoplay policy). O `unlock()` disparado no 1º gesto resolve na prática. Se o navegador bloquear mesmo assim, os beeps viram no-op silencioso — o modal visual continua funcionando normalmente.

### Multi-aba

`BroadcastChannel` (fallback `localStorage`) sincroniza atividade entre abas. O logout só ocorre quando a aba **não está ativa em nenhuma das abas abertas**. A aba visível mantém o timer preciso; a aba de fundo recebe o `lastActivityAt` sincronizado.

### Aba em segundo plano

`setInterval` é throttled pelo navegador em abas de fundo. Mitigado por (a) recompute imediato no `visibilitychange` e (b) sincronização multi-aba com o maior `lastActivityAt`.

---

## ⚠️ Nota operacional — default LIGADO

O `DEFAULT_SESSION_TIMEOUT` tem `enabled: true`. Isso significa que **ao fazer deploy, todos os usuários internos passarão imediatamente a ter um timeout de 30 minutos de inatividade**, sem configuração adicional.

**Ações recomendadas antes do rollout:**
1. Comunicar a equipe com antecedência.
2. Considerar aumentar `warningSeconds` na config global para dar mais tempo de reação na largada.
3. Aplicar a migration `20260621120000_seller_session_timeout_override.sql` em produção antes ou junto com o deploy do frontend (necessário para que o override por usuário funcione em `supabase`).

---

## Fora de escopo (YAGNI)

- Enforcement server-side / invalidação de sessão no servidor (espelha o deferido do PRD-212).
- Timeout por tempo absoluto de sessão ou amarrado ao fim do expediente.
- Auditoria do evento de logout-por-inatividade.
- Configuração por papel (resolvida por global + override por usuário).
