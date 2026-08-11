# PWA de Atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em `/atendimento` um app mobile instalável, só de troca de mensagens, com dados reais, a partir do kit `ui_kits/pwa-atendimento/`.

**Architecture:** Árvore de rotas própria (`atendimento.*`) com shell que fixa o modo escuro e troca o manifest; feature folder `src/features/pwa-atendimento/` com regras puras em `engine/` testadas no Vitest; todo dado vem dos hooks que a Inbox de desktop já usa (Provider Pattern), nunca de `src/mocks/`. Push web num caminho próprio e estreito: tabela + Edge Function + trigger `pg_net`, com dois handlers aditivos no service worker existente.

**Tech Stack:** React 19, TanStack Router (file-based), TanStack Query, Tailwind v4 + shadcn/ui, Vitest, Supabase (Postgres + RLS + Edge Functions Deno), Web Push (VAPID).

**Spec:** `docs/superpowers/specs/2026-08-11-pwa-atendimento-design.md`

## Global Constraints

- **Nunca** importar `@/mocks` nem `@/providers/data/impl/*` — só o barrel `@/providers/data`.
- Componentes consomem **apenas** tokens semânticos (`bg-background`, `text-foreground`, `border-border`, `text-/bg-/border-severity-{info|success|warning|critical}`). Nenhum `--gallo-*`, nenhum hex do kit.
- Modo claro/escuro é `data-mode` + classe `.dark` no `<html>`; `data-theme` é submarca, não modo.
- Código em inglês (`camelCase`/`PascalCase`/`kebab-case` em arquivos); texto de tela em português do Brasil com acentuação correta.
- TypeScript `strict`. Interfaces de domínio prefixadas com `I`. Evitar `any`.
- `routeTree.gen.ts` é gerado — nunca editar à mão.
- Gate de CI: `bun run build` + `bun run test`. `bunx tsc --noEmit` tem baseline de ~315 erros pré-existentes: avaliar só o delta dos arquivos novos.
- Toda migration aplicada via MCP tem que ser exportada para `supabase/migrations/` no mesmo PR. **Mergear o PR não aplica a migration** — aplicação e deploy de Edge Function exigem OK explícito do dono.
- Ícones via `@/components/Icon` (Iconify, família `mdi:`).
- Alvo de toque mínimo 44×44 (o kit já respeita).

---

### Task 1: Engine — regras puras da espera, dos filtros e do opt-in

**Files:**
- Create: `src/features/pwa-atendimento/engine/queueOrder.ts`
- Create: `src/features/pwa-atendimento/engine/queueOrder.test.ts`
- Create: `src/features/pwa-atendimento/engine/pwaFilters.ts`
- Create: `src/features/pwa-atendimento/engine/pwaFilters.test.ts`
- Create: `src/features/pwa-atendimento/engine/pushOptIn.ts`
- Create: `src/features/pwa-atendimento/engine/pushOptIn.test.ts`

**Interfaces:**
- Consumes: `waitSeverity`, `formatWaitTime`, `WAIT_WARNING_MS`, `WAIT_CRITICAL_MS` de `@/features/conversations/engine/waitTime`; `IConversation` de `@/shared/types`.
- Produces:
  - `interface IQueueEntry { conversation: IConversation; waitMs: number }`
  - `sortQueue(entries: IQueueEntry[]): IQueueEntry[]` — decrescente por `waitMs`
  - `interface IQueueCounters { critical: number; warning: number; total: number }`
  - `countQueue(entries: IQueueEntry[]): IQueueCounters`
  - `isQueueEligible(c: IConversation): boolean` — fora quando `resolvida`/`arquivada`
  - `interface IPwaFilters { q: string; status: ConversationStatus | "all"; channel: ConversationChannel | "all"; assign: "all" | "me" | "queue" }`
  - `EMPTY_PWA_FILTERS: IPwaFilters`
  - `activeFilterCount(f: IPwaFilters): number`
  - `matchesPwaFilters(c: IConversation, f: IPwaFilters, ctx: { name: string; phone: string; sellerId: string | null }): boolean` — **quando `f.q` não é vazio, os demais filtros são ignorados** (mesma regra da Inbox)
  - `shouldOfferPush(state: { permission: NotificationPermission; declinedAt: string | null; now: Date }): boolean` — cooldown de 14 dias
  - `PUSH_DECLINE_COOLDOWN_DAYS = 14`

- [ ] **Step 1: Escrever os testes que falham**

Casos obrigatórios em `queueOrder.test.ts`: ordena decrescente por espera; conta `critical` a partir de 30 min inclusive e `warning` a partir de 10 min inclusive sem dupla contagem (um item de 40 min conta 1 em `critical` e não aparece em `warning`); `total` é o número de elegíveis; `isQueueEligible` rejeita `resolvida` e `arquivada`.

Em `pwaFilters.test.ts`: busca casa nome; busca casa telefone só por dígitos (`5599164` casa `(55) 99164-0300`); **com busca preenchida, um item que falharia no filtro de status ainda passa**; sem busca, status/canal/atribuição filtram; `assign: "me"` compara `assignedSellerId` com `ctx.sellerId`; `assign: "queue"` exige `assignedSellerId` ausente; `activeFilterCount` ignora `q`.

Em `pushOptIn.test.ts`: oferece quando `permission === "default"` e nunca recusou; não oferece quando `granted`; não oferece quando `denied`; não oferece dentro de 14 dias da recusa; volta a oferecer no 15º dia.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `bun run test src/features/pwa-atendimento/engine`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar o mínimo**

`matchesPwaFilters` normaliza o telefone com `onlyDigits` antes de comparar, reaproveitando `@/features/conversations/engine/phoneBR` se ele já expuser o helper; caso contrário, um `stripNonDigits` local.

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `bun run test src/features/pwa-atendimento/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/pwa-atendimento/engine
git commit -m "feat(pwa-atendimento): add queue, filter and push opt-in engines"
```

---

### Task 2: Shell da rota, modo escuro e manifest próprio

**Files:**
- Create: `src/routes/atendimento.tsx`, `src/routes/atendimento.index.tsx`
- Create: `src/features/pwa-atendimento/components/PwaShell.tsx`
- Create: `src/features/pwa-atendimento/hooks/useForcedDarkMode.ts`
- Create: `src/features/pwa-atendimento/hooks/usePwaManifest.ts`
- Create: `src/features/pwa-atendimento/i18n/pt-BR.ts`
- Create: `src/features/pwa-atendimento/index.ts`
- Create: `public/atendimento.webmanifest`

**Interfaces:**
- Produces: `PwaShell` (layout com `<Outlet/>`, safe-area, altura fixa `100dvh`, sem scroll do body); `useForcedDarkMode()`; `usePwaManifest()`; `PWA_ATENDIMENTO_STRINGS`.

`public/atendimento.webmanifest`:

```json
{
  "name": "GALLO Atendimento",
  "short_name": "Atendimento",
  "description": "Conversas do atendimento GALLO BASE DIESEL no celular.",
  "start_url": "/atendimento",
  "scope": "/atendimento",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#141011",
  "theme_color": "#141011",
  "icons": [
    { "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

> O hex aqui é do manifest do sistema operacional, não de componente — é o único lugar onde cor literal é legítima.

- [ ] **Step 1:** `useForcedDarkMode` guarda `data-mode` e a classe `.dark` atuais no mount, força escuro e restaura no unmount.
- [ ] **Step 2:** `usePwaManifest` troca o `href` do `<link rel="manifest">` para `/atendimento.webmanifest` e restaura no unmount; também ajusta `<meta name="theme-color">`.
- [ ] **Step 3:** `atendimento.tsx` monta `PwaShell` com os dois hooks e um `<Outlet/>`; `atendimento.index.tsx` redireciona conforme sessão.
- [ ] **Step 4:** Rodar `bun run build` e conferir que a rota entrou no `routeTree.gen.ts`.
- [ ] **Step 5: Commit**

```bash
git add src/routes/atendimento.tsx src/routes/atendimento.index.tsx src/features/pwa-atendimento public/atendimento.webmanifest src/routeTree.gen.ts
git commit -m "feat(pwa-atendimento): add route shell, forced dark mode and own manifest"
```

---

### Task 3: Primitivas do kit em tokens semânticos

**Files:**
- Create em `src/features/pwa-atendimento/components/ui/`: `PwaButton.tsx`, `PwaAvatar.tsx`, `PwaStatusDot.tsx`, `PwaStatusPill.tsx`, `PwaWaitChip.tsx`, `PwaField.tsx`, `PwaSwitch.tsx`, `PwaSheet.tsx`, `PwaTopBar.tsx`, `PwaTabBar.tsx`, `PwaOfflineBar.tsx`
- Create: `src/features/pwa-atendimento/components/ui/statusMeta.ts`

**Interfaces:**
- Produces: `PWA_STATUS_META: Record<ConversationStatus, { label: string; tone: "primary" | "foreground" | "info" | "success"; dot: "filled" | "outline" | "check"; icon: string }>` e `PWA_STATUS_ORDER: ConversationStatus[]` (sem `arquivada` no seletor).

Traduções obrigatórias do kit:
- ouro → `bg-primary text-primary-foreground`; régua da bolha de saída → `border-primary`
- `em_andamento` fica **branco** (`text-foreground`), não ouro — divergência deliberada do kit
- semáforo: `text-severity-warning` (≥10 min), `text-severity-critical` (≥30 min)
- `resolvida` → `text-severity-success`
- `PwaSheet` usa `Sheet` do shadcn (`side="bottom"`) para herdar foco, Escape e overlay

- [ ] **Step 1:** Implementar as primitivas, todas com alvo de toque ≥44px.
- [ ] **Step 2:** `bun run lint` e `bun run build`.
- [ ] **Step 3: Commit**

```bash
git add src/features/pwa-atendimento/components/ui
git commit -m "feat(pwa-atendimento): add kit primitives on semantic tokens"
```

---

### Task 4: Splash e tela de instalação

**Files:**
- Create: `src/routes/atendimento.instalar.tsx`
- Create: `src/features/pwa-atendimento/components/PwaSplash.tsx`
- Create: `src/features/pwa-atendimento/pages/InstallPage.tsx`
- Create: `src/features/pwa-atendimento/hooks/useInstallPrompt.ts`
- Modify: `src/features/pwa-atendimento/components/PwaShell.tsx`

**Interfaces:**
- Produces: `useInstallPrompt(): { canPrompt: boolean; isInstalled: boolean; prompt: () => Promise<void> }` — escuta `beforeinstallprompt` e `display-mode: standalone`.

O splash aparece uma vez por sessão (`sessionStorage`), some em ~1,9 s e nunca bloqueia rota. A tela de instalação usa o logo de `public/logos` (verificar o nome real do arquivo antes de referenciar) e some quando `isInstalled`.

- [ ] **Step 1:** `useInstallPrompt`. **Step 2:** `PwaSplash` + `InstallPage`. **Step 3:** rota. **Step 4:** `bun run build`. **Step 5:** commit `feat(pwa-atendimento): add splash and install screen`.

---

### Task 5: Login real com desafio TOTP

**Files:**
- Create: `src/routes/atendimento.entrar.tsx`
- Create: `src/features/pwa-atendimento/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `useAuth()` → `signInWithPassword(email, password): Promise<IAuthResult>`, `completeMfaChallenge(code)`, `cancelMfaChallenge()`, `mfaPending`, `isAuthenticated`, `isHydrating`; `MfaChallengeStep` de `@/features/auth/MfaChallengeStep`; `rememberEmail` de `@/features/auth/rememberEmail`.

Fluxo: `ok` → `/atendimento/conversas`; `mfaRequired` → `MfaChallengeStep`; `blocked` → aviso de horário/suspensão com o texto que o SaaS já usa; erro → mensagem do `IAuthResult.error`.

- [ ] **Step 1:** Página com os campos do kit (e-mail, senha com mostrar/ocultar, lembrar e-mail). **Step 2:** ligar TOTP. **Step 3:** rota + guard no shell. **Step 4:** `bun run build`. **Step 5:** commit `feat(pwa-atendimento): add login with real auth and TOTP challenge`.

---

### Task 6: Lista de conversas

**Files:**
- Create: `src/routes/atendimento.conversas.tsx`
- Create: `src/features/pwa-atendimento/pages/ConversasPage.tsx`
- Create: `src/features/pwa-atendimento/components/PwaConversationRow.tsx`
- Create: `src/features/pwa-atendimento/components/PwaFilterPanel.tsx`
- Create: `src/features/pwa-atendimento/hooks/usePwaConversations.ts`
- Create: `src/features/pwa-atendimento/hooks/useOnlineStatus.ts`

**Interfaces:**
- Consumes: `useConversationsList(params, opts)` → `{ items, total, isLoading, isLoadingMore, hasMore, loadMore, refetch, markItemRead }`; `useRelatedEntities(items)` → `{ contacts: Map<ID, IConversationContact>, lastMessages: Map<ID, IMessage> }`; `useRealtimeConversations`; `useCurrentStore`; `useAuth`.
- Produces: `interface IPwaConversationVM { id: ID; name: string; short: string; initials: string; phone: string; channel: ConversationChannel; status: ConversationStatus; assigneeName: string | null; isMine: boolean; unread: number; when: string; preview: string; previewKind: "image" | "audio" | "document" | null; waitMs: number }` e `usePwaConversations(): { items: IPwaConversationVM[]; ... }`.

A view-model concentra a tradução entre o domínio (que não guarda nome/prévia na conversa) e o desenho do kit. Nenhum componente lê `contacts`/`lastMessages` direto.

- [ ] **Step 1:** `useOnlineStatus` (`navigator.onLine` + eventos). **Step 2:** `usePwaConversations` montando a VM. **Step 3:** linha + painel de filtros. **Step 4:** página com header, busca (com limpar), filtros e scroll infinito; vazio com o texto do kit. **Step 5:** `bun run build` + `bun run test`. **Step 6:** commit `feat(pwa-atendimento): add conversation list with filters and realtime`.

---

### Task 7: Fila de espera

**Files:**
- Create: `src/routes/atendimento.espera.tsx`
- Create: `src/features/pwa-atendimento/pages/EsperaPage.tsx`
- Create: `src/features/pwa-atendimento/components/PwaQueueCounters.tsx`

**Interfaces:**
- Consumes: `sortQueue`, `countQueue`, `isQueueEligible` (Task 1); `useTimeTick` de `@/features/conversations/hooks/useTimeTick`; `usePwaConversations` (Task 6).

`waitMs` sai de `now - queuedAt`; conversa sem `queuedAt` não entra na fila.

- [ ] **Step 1:** contadores. **Step 2:** página. **Step 3:** `bun run build`. **Step 4:** commit `feat(pwa-atendimento): add waiting queue screen`.

---

### Task 8: Conversa — thread e bolhas

**Files:**
- Create: `src/routes/atendimento.conversa.$id.tsx`
- Create: `src/features/pwa-atendimento/pages/ConversaPage.tsx`
- Create em `src/features/pwa-atendimento/components/thread/`: `PwaThreadHeader.tsx`, `PwaMessageList.tsx`, `PwaBubble.tsx`, `PwaTicks.tsx`, `PwaAudioBubble.tsx`, `PwaImageBubble.tsx`, `PwaSystemBubble.tsx`
- Create: `src/features/pwa-atendimento/hooks/usePwaThread.ts`

**Interfaces:**
- Consumes: `useConversationDetail(id)` → `{ conversation, customer, lead, contact, whatsappAccount, assignedSeller, collaborators, isLoading, notFound, refresh }`; `useMessages(id)`; `useRealtimeMessages(id, applyRealtimeRow, syncLatest)`; `ConversationProvider`; `useMessageSend(conversation, whatsappAccount)` → `send(opts: ISendOptions)`; `statusVisual` de `@/features/conversations/utils/messageDisplay`; `groupByDay` de `@/features/conversations/utils/dayGroups`; `useResolvedMediaUrl`.

`ConversaPage` espelha o wiring de `ConversationPage.tsx` sem o trilho direito, sem copiloto, sem tags e sem histórico — o recorte do app.

- [ ] **Step 1:** cabeçalho com pílula de status. **Step 2:** lista com separadores de dia e auto-scroll. **Step 3:** bolhas por tipo + ticks. **Step 4:** `bun run build`. **Step 5:** commit `feat(pwa-atendimento): add conversation thread`.

---

### Task 9: Composer, nota de voz, anexos e enviar produto

**Files:**
- Create em `src/features/pwa-atendimento/components/thread/`: `PwaComposer.tsx`, `PwaVoiceBar.tsx`, `PwaAttachSheet.tsx`, `PwaProductSheet.tsx`, `PwaMoreSheet.tsx`, `PwaStatusSheet.tsx`
- Modify: `src/features/pwa-atendimento/pages/ConversaPage.tsx`

**Interfaces:**
- Consumes: `useAudioRecorder`, `useAttachmentUpload` de `@/features/conversations/hooks`; `useConversationStatusActions`; `PartLookupPanel`/`appendToDraft` de `@/features/part-lookup`; `mustAssignToReply` de `@/features/conversations/engine/assignmentGate`.

Sem conexão o composer avisa que a mensagem fica na fila e o tick nasce `queued`. Quando `mustAssignToReply` é verdadeiro (usuário sem visão de loja numa conversa do pool), o composer bloqueia com o aviso — o app não tem "assumir".

- [ ] **Step 1:** composer + envio de texto. **Step 2:** nota de voz. **Step 3:** folhas de anexo/produto/mais/status. **Step 4:** `bun run build`. **Step 5:** commit `feat(pwa-atendimento): add composer, voice note and product sheet`.

---

### Task 10: Mídias da conversa

**Files:**
- Create: `src/routes/atendimento.conversa.$id.midias.tsx`
- Create: `src/features/pwa-atendimento/pages/MidiasPage.tsx`

**Interfaces:**
- Consumes: `useConversationMessageMedia` / `useConversationMedia` de `@/features/media`.

Abas Tudo/Fotos/Áudios/Docs, grade 3×N, toque abre o lightbox que já existe.

- [ ] **Step 1:** página. **Step 2:** `bun run build`. **Step 3:** commit `feat(pwa-atendimento): add conversation media grid`.

---

### Task 11: Notificação — soft-ask, faixa no app e preferências

**Files:**
- Create: `src/features/pwa-atendimento/components/PwaPushPrompt.tsx`, `PwaHeadsUp.tsx`
- Create: `src/features/pwa-atendimento/components/sheets/PwaNotifySheet.tsx`, `PwaAccountSheet.tsx`
- Create: `src/features/pwa-atendimento/hooks/useNotificationPrefs.ts`, `useHeadsUpNotice.ts`

**Interfaces:**
- Consumes: `shouldOfferPush`, `PUSH_DECLINE_COOLDOWN_DAYS` (Task 1); `useRealtimeConversations`.
- Produces: `interface IPwaNotifyPrefs { push: boolean; waiting: boolean; inApp: boolean; sound: boolean; quiet: boolean }`, persistidas em `localStorage` na chave `gallo-atendimento-notify-prefs`.

A faixa dispara quando o realtime traz mensagem de conversa **diferente** da aberta; some sozinha em ~5 s; quando a permissão está bloqueada ou a faixa desligada, vira toast do sonner.

- [ ] **Step 1:** preferências + folha de conta. **Step 2:** soft-ask com cooldown. **Step 3:** heads-up. **Step 4:** `bun run build` + `bun run test`. **Step 5:** commit `feat(pwa-atendimento): add push opt-in, in-app banner and notification preferences`.

---

### Task 12: Push web — schema, Edge Function, trigger e service worker

**Files:**
- Create: `supabase/migrations/<timestamp>_push_subscriptions.sql`
- Create: `supabase/functions/push-dispatch/index.ts`
- Create: `supabase/migrations/<timestamp>_messages_push_trigger.sql`
- Modify: `public/sw.js`
- Create: `src/features/pwa-atendimento/hooks/usePushSubscription.ts`
- Create: `docs/dev/notification-push.md`

**Interfaces:**
- Produces: `usePushSubscription(): { permission: NotificationPermission; isSubscribed: boolean; subscribe: () => Promise<boolean>; unsubscribe: () => Promise<void> }`.

Schema:

```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  recipient_type text not null check (recipient_type in ('seller','customer')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.push_subscriptions enable row level security;
```

RLS: o dono lê/insere/apaga as próprias (`recipient_id = auth.uid()`); envio pelo `service_role`. Índice em `recipient_id`.

`push-dispatch` monta o JWT VAPID e cifra o payload em AES128GCM; `410`/`404` apaga a subscription e registra auditoria; payload ≤3 KB; `notificationclick` foca a aba aberta ou abre `/atendimento/conversa/<id>`.

Trigger: `after insert on public.messages` para `direction = 'in'`, chamando `push-dispatch` via `pg_net`, no mesmo padrão de `20260717190000_conversation_rescue_cron_trigger.sql`.

⚠️ **Não aplicar a migration nem deployar a função.** O PR entrega o código; a aplicação exige OK explícito do dono, e a chave VAPID tem que estar no Vault antes.

- [ ] **Step 1:** migration do schema. **Step 2:** Edge Function. **Step 3:** trigger. **Step 4:** handlers no `sw.js` + bump do `CACHE_VERSION`. **Step 5:** `usePushSubscription` ligado à folha de notificações. **Step 6:** `docs/dev/notification-push.md` com rotação de chave e roteiro E2E manual. **Step 7:** `bun run build`. **Step 8:** commit `feat(pwa-atendimento): add web push subscriptions, dispatch and SW handlers`.

---

### Task 13: Fechamento — testes, changelog e bump

**Files:**
- Modify: `CHANGELOG.md`, `package.json`
- Modify: `docs/prds/PRD-145-push-web.md` (registrar a fatia entregue e o que continua pendente)

- [ ] **Step 1:** `bun run test` e `bun run build` limpos; `bunx tsc --noEmit` avaliado só no delta dos arquivos novos.
- [ ] **Step 2:** varrer os codinomes já usados no `CHANGELOG.md` antes de batizar a versão — colisão já aconteceu duas vezes neste projeto.
- [ ] **Step 3:** entrada no changelog em português, categorias do Keep a Changelog.
- [ ] **Step 4:** commit `chore: bump version to vX.Y.0 <Codename> and update changelog`.

---

## Self-review

**Cobertura da spec:** §3 rotas → Tasks 2,4,5,6,7,8,10. §4 feature folder → Tasks 1–12. §5 dados → Tasks 6,8,9,10. §6 tema → Tasks 2,3. §7 push → Tasks 11,12. §8 divergências do kit → Task 3 (status branco) e Task 8 (bolhas). §9 fases → mapeadas 1:1.

**Riscos conhecidos:**
- `useMessageSend` exige `IWhatsAppAccount`; conversa sem conta conectada não envia — a página precisa tratar `whatsappAccount === null` com aviso, não com crash.
- `useConversationDetail` pode devolver `notFound` para conversa de outro atendente (RLS): a tela mostra estado vazio, nunca erro cru.
- O splash não pode virar rota: viraria entrada no histórico e o botão voltar do Android ficaria preso nele.
