# Spec — Notificações sonoras + indicador visual da Inbox

**Data:** 2026-07-01
**Status:** Design aprovado (aguardando revisão do spec)
**Feature:** `src/features/inbox-alerts/`
**Tipo:** UX de atendimento (client-side) — não é fronteira de segurança/negócio

---

## 1. Objetivo

Alertar o atendente, em **qualquer tela do app** (`/app/*`, não só na Inbox
aberta), quando:

1. Chega **mensagem nova numa conversa já em atendimento atribuída a ele** — beep
   curto e discreto.
2. **Um cliente novo entra na fila** (conversa sem atendente, aguardando
   distribuição) — beep diferente, mais chamativo (implica SLA de atendimento).

Complementarmente, um **ícone dedicado no TopBar** mostra um indicador visual
(ponto vermelho, sem número) sempre que há algo pendente de uma dessas duas
categorias — cobrindo o caso do atendente que está numa outra tela e só percebe
o beep, mas quer confirmar visualmente antes de ir até a Inbox.

Caso de uso: vendedor/SDR trabalhando em outra tela do CRM (ex.: Clientes,
Catálogo) precisa perceber, sem manter a Inbox aberta o tempo todo, que um
cliente respondeu ou que chegou gente nova esperando atendimento.

---

## 2. Decisões tomadas (brainstorming)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Escopo do beep | **App inteiro** (`/app/*`, via `AppLayout`) — não só com a Inbox aberta |
| 2 | Alvo do beep "mensagem em atendimento" | **Só as minhas conversas** (`assignedSellerId === sellerId do usuário logado`) |
| 3 | Alvo do beep "cliente na fila" | **Todo mundo com acesso àquela loja/instância** — o próprio RLS já escopa quem recebe o evento; nenhum filtro de papel adicional |
| 4 | Escopo por loja ativa | **Assumido:** ambos os beeps e o indicador visual só disparam para conversas da **loja atualmente selecionada** (`useCurrentStore()`), para não confundir um Owner navegando entre lojas |
| 5 | Persistência da preferência (liga/desliga, volume) | **`localStorage`** por navegador — mesmo padrão do toggle "Realtime" já existente na Inbox. Não sincroniza entre dispositivos |
| 6 | Sons | **Sem arquivo de áudio** — gerados via Web Audio (oscillator), motor **novo e independente** do `session-timeout` (não altera código já validado em produção) |
| 7 | Disparo do beep de fila | Só na **criação** da conversa (INSERT com `assignedSellerId=null`/`status="aguardando"`). "Devolvida à fila" depois de atribuída fica **fora de escopo** (exigiria `REPLICA IDENTITY FULL`) |
| 8 | Proteção contra rajada | Ignora eventos com timestamp **> 60s no passado** (guarda contra import/backfill de histórico) + intervalo mínimo entre beeps do mesmo tipo |
| 9 | Ícone de não lidas (novo, adicionado depois do desenho inicial) | **Um ícone só**, combinando as duas categorias (OR) — ponto vermelho **sem número**, não dois indicadores separados |
| 10 | Ação de clique no ícone de não lidas | **Navega direto** para `/app/atendimento` — sem dropdown de prévia |
| 11 | Onde o ícone de não lidas mora | **TopBar global**, ao lado do indicador de conexão WhatsApp (não sobrepõe o ícone do WhatsApp — a cor dele já tem significado próprio de conexão) |

Itens 4, 5, 9, 10, 11 foram decididos por mim (sem resposta do usuário às
perguntas de confirmação) — **revisar com atenção antes de aprovar o spec**.

---

## 3. Achado técnico importante: confiabilidade do canal `messages`

`src/features/conversations/hooks/useRealtimeMessages.ts` documenta (comentário
extenso, linhas 87-105) que o canal Realtime de `public.messages` **pode
perder INSERTs** em produção — a avaliação de RLS por linha via
`can_access_conversation` no autorizador do Realtime não compartilha a mesma
otimização do RPC `SECURITY DEFINER` usado no SELECT comum (modelo "2 portões",
v0.110.0). Por isso esse hook já combina dois canais: `messages` (rápido, mas
pode falhar) + `conversations` (confiável — todo INSERT/UPDATE de mensagem
toca `last_message_at`) como fallback.

**Este novo feature precisa do mesmo padrão**, ou herda a mesma falha
silenciosa:

- **Canal rápido:** `messages` INSERT com `direction === "in"` → se a
  conversa está no cache local como "minha", beepa.
- **Canal de fallback (confiável):** `conversations` UPDATE (o "touch" que
  toda mensagem nova provoca) → quando `assigned_seller_id === meuSellerId`,
  debounce (250ms, mesma janela do `useRealtimeMessages`) e chama
  `messagesProvider.getLastInboundAt(conversationId)` (método **já existente**,
  contrato `IMessagesProvider`, RPC `last_inbound_at`) para confirmar se há uma
  mensagem inbound mais nova que a última já alertada. Beepa só se sim.

Um cache `Map<conversationId, ISO8601>` guarda "última mensagem inbound já
alertada" por conversa — qualquer um dos dois caminhos que classificar
primeiro marca a entrada, o outro vê já coberto e não repete o beep.

O beep de **fila** não sofre desse problema: ele só depende de `conversations`
INSERT, que é confiável (mesma tabela do fallback acima).

---

## 4. Engine puro (`src/features/inbox-alerts/engine/`) — TDD

Funções puras, sem React, sem timers, sem Web APIs. Cobertas por Vitest.

### 4.1 `isQueuedConversation.ts`

```ts
isQueuedConversation(row: {
  assignedSellerId?: string | null;
  status: string;
  isSdrActive: boolean;
}): boolean
```

Extrai a regra hoje inline em `ConversationListItem.tsx` (linhas 276-278):
`!assignedSellerId && !isSdrActive && status === "aguardando"`.
`ConversationListItem` passa a **importar e usar esta função** (pequena
melhoria dirigida — evita a regra do badge "Em fila" e a regra do beep
divergirem no futuro).

**Testes:** todas as combinações booleanas relevantes; `assignedSellerId`
vazio (`""`) tratado como ausente.

### 4.2 `isRecentEvent.ts`

```ts
isRecentEvent(eventIso: string, nowIso: string, maxAgeMs: number): boolean
```

`new Date(nowIso).getTime() - new Date(eventIso).getTime() <= maxAgeMs`.
Guarda contra beep de dados importados/backfill (timestamp antigo).

**Testes:** exatamente no limite; timestamp no futuro (clock skew, trata como
recente); string inválida → `false` (não beepar por segurança).

### 4.3 `isFreshInboundTimestamp.ts`

```ts
isFreshInboundTimestamp(
  candidateIso: string,
  lastAlertedIso: string | null,
  nowIso: string,
  maxAgeMs: number,
): boolean
```

`true` quando `candidateIso` é mais novo que `lastAlertedIso` (ou
`lastAlertedIso` é `null`) **e** passa em `isRecentEvent`. Base de dedupe entre
o canal rápido e o de fallback (§3).

**Testes:** sem alerta anterior; candidato mais antigo que o já alertado;
candidato igual (não repete); candidato novo e recente.

### 4.4 `shouldThrottle.ts`

```ts
shouldThrottle(lastBeepAtMs: number | null, nowMs: number, minIntervalMs: number): boolean
```

Throttle simples por tipo de beep (evita rajada sonora quando várias
mensagens/conversas chegam em sequência rápida).

**Testes:** primeiro beep nunca é bloqueado; dentro do intervalo → bloqueia;
fora do intervalo → libera.

### Constantes (`engine/constants.ts`)

```ts
export const MAX_EVENT_AGE_MS = 60_000; // ignora eventos "antigos" (backfill/import)
export const MIN_BEEP_INTERVAL_MS = 1_500; // por tipo de beep
export const CONVERSATION_TOUCH_DEBOUNCE_MS = 250; // espelha useRealtimeMessages
```

---

## 5. Runtime

### 5.1 `lib/tonePlayer.ts` — motor de tom (Web Audio)

`createTonePlayer()`, independente do `session-timeout/lib/beep.ts`:

```ts
export interface ITonePlayer {
  unlock(): void; // AudioContext.resume(), idempotente
  play(kind: "assigned-mine" | "new-in-queue", volume: number): void;
}
```

- "assigned-mine": 1 tom curto (~520 Hz, ~140 ms) — discreto.
- "new-in-queue": 2 tons ascendentes (~660 Hz → ~880 Hz, ~110 ms cada) — mais
  chamativo, reflete a urgência de um cliente esperando.
- Mesma técnica do `session-timeout` (OscillatorNode + GainNode com
  ataque/decay curtos), mas implementação própria — **não** importa nem altera
  `session-timeout/lib/beep.ts`.
- Degrada graciosamente (try/catch; no-op se Web Audio indisponível).
- Desbloqueio no 1º gesto do usuário via o hook genérico já existente
  `useAudioUnlock` (`session-timeout/hooks/useAudioUnlock.ts` — recebe
  qualquer `unlock: () => void`, importado diretamente; não é duplicado).

### 5.2 `store/inboxActivityStore.ts` — Zustand

```ts
interface IInboxActivityState {
  hasUnreadMine: boolean;
  hasQueueWaiting: boolean;
  setHasUnreadMine(v: boolean): void;
  setHasQueueWaiting(v: boolean): void;
}
```

Estado leve em memória (padrão Zustand já usado no projeto) compartilhado
entre o hook que escreve (`useInboxActivityMonitor`, montado uma vez no
`AppLayout`) e o componente que lê (`InboxUnreadBadgeIcon`, no `TopBar`) —
sem precisar encaixar um novo Context Provider na árvore do `AppLayout`.

### 5.3 `hooks/useSoundAlertPreferences.ts`

- `localStorage` keys: `gallo-sound-alerts-enabled` (bool, default `true`),
  `gallo-sound-alerts-volume` (0–1, default `0.5`).
- Espelha exatamente o padrão de `gallo-realtime-enabled`
  (`useRealtimeConversations.ts`): leitura/escrita + sincronização entre abas
  via evento `storage`.

### 5.4 `hooks/useInboxActivityMonitor.ts` — orquestrador (montado 1x)

- No-op se `getActiveDataSource() !== "supabase"` (mock não tem Realtime —
  mesmo gate de `useRealtimeMessages`).
- Lê `currentUser?.sellerId` (`useAuth`) e `currentStoreId`
  (`useCurrentStore`). Se não houver `sellerId`, pula a detecção "minha
  conversa" (só fila continua ativa).
- **Seed inicial** (ao montar, antes do primeiro evento Realtime):
  - `conversations.list({ assignmentAny: { queue: true }, storeId, pageSize: 1 })`
    → `hasQueueWaiting = total > 0`.
  - `conversations.list({ assignmentAny: { sellerIds: [sellerId] }, storeId })`
    → popula o cache local `conversationId → assignedSellerId` e calcula
    `hasUnreadMine` reaproveitando a mesma lógica de `isUnread` (via
    `useUnreadTracking`) sobre os itens retornados.
- Assina (via `subscribeToTable`, canal compartilhado, sem custo de conexão
  extra):
  - **`conversations`** (INSERT + UPDATE): atualiza o cache "minha"
    (adiciona/remove `conversationId` conforme `assigned_seller_id`); mantém
    um `Set` de "conversas em fila" via `isQueuedConversation` (adiciona no
    INSERT/UPDATE que casa, remove quando deixa de casar) → deriva
    `hasQueueWaiting`. Em INSERT que casa a fila e passa em `isRecentEvent` +
    `shouldThrottle` → toca `"new-in-queue"`. Filtra por `store_id ===
    currentStoreId`.
  - **`messages`** (canal rápido, §3): INSERT com `direction === "in"` e
    `conversation_id` presente no cache "minha" → checa
    `isFreshInboundTimestamp` + `shouldThrottle` → toca `"assigned-mine"` e
    marca `hasUnreadMine = true`. Sem checagem de `storeId` aqui — o cache
    "minha" só contém conversas já filtradas pela loja ativa (seed +
    eventos de `conversations`), então uma conversa de outra loja nunca
    entra nele.
  - **`conversations`** (fallback, §3): UPDATE de touch numa conversa "minha"
    → debounce 250 ms → `getLastInboundAt(id)` → mesma checagem de
    frescor/throttle → mesmo efeito (beep + `hasUnreadMine = true`) se o canal
    rápido não tiver coberto.
- **Reconciliação do `hasUnreadMine`:** este hook só liga o estado
  (otimista); quem desliga é a própria Inbox. `InboxPage.tsx` ganha um
  `useEffect` que, sempre que `unreadGlobal` (linha 319-322, já existe)
  mudar, chama `inboxActivityStore.setHasUnreadMine(unreadGlobal > 0)` —
  fonte de verdade real sempre que o usuário visita a Inbox. Entre visitas,
  o ponto fica aceso mesmo depois de lido em outro lugar (comportamento
  *best-effort*, documentado como limitação conhecida).

### 5.5 Montagem global

`components/InboxActivityGuard.tsx` (sem UI própria) chama
`useInboxActivityMonitor()`. Montado em
`src/features/shell/layouts/AppLayout.tsx`, ao lado de `SessionTimeoutGuard`.

---

## 6. UI

### 6.1 `components/SoundAlertToggle.tsx` — TopBar

- Ícone `mdi:volume-high` (ligado) / `mdi:volume-off` (desligado), estilo
  `Button variant="ghost" size="icon"` (igual aos demais botões do `TopBar`).
- `Popover` (mesmo padrão do `NotificationDropdown`): `Switch` liga/desliga,
  `Slider` de volume, dois botões "Testar som: mensagem" / "Testar som:
  fila" (chamam `tonePlayer.play(...)` diretamente — mesmo padrão do botão
  "Testar beep" em `SessionSettingsPage.tsx`).
- Renderizado no `TopBar.tsx`, entre `WhatsAppStatusButton` e
  `NotificationDropdown`.

### 6.2 `components/InboxUnreadBadgeIcon.tsx` — TopBar

- Ícone `mdi:inbox-arrow-down-outline` (a confirmar/ajustar na implementação
  — só estético). Mesmo estilo dos demais botões do `TopBar`.
- Ponto vermelho (`bg-destructive`, círculo pequeno, `absolute` no canto do
  ícone) quando `hasUnreadMine || hasQueueWaiting` (via `useInboxActivity()`,
  leitura do Zustand store). Sem número.
- `onClick` → `navigate({ to: "/app/atendimento" })`.
- `aria-label` dinâmico ("Você tem mensagens novas na Inbox" / "Sem
  mensagens novas") para acessibilidade.

---

## 7. Migration

**Nenhuma.** Sem tabelas/colunas novas — preferências em `localStorage`, e
toda a detecção usa métodos de provider já existentes
(`conversations.list`, `conversations.get`, `messages.getLastInboundAt`) e o
canal Realtime compartilhado já habilitado (`supabase_realtime` já inclui
`conversations`/`messages`, migration `20260610013840`).

---

## 8. Segurança, bordas e riscos

- **Não é fronteira de segurança.** É 100% cosmético/UX — nenhuma leitura de
  dado além do que a RLS já libera para o usuário via os canais/queries
  existentes.
- **Áudio bloqueado:** mesmo risco do `session-timeout` — sem gesto prévio
  do usuário, o navegador pode recusar tocar. `useAudioUnlock` mitiga; falha
  silenciosamente (o ícone visual nunca depende do som).
- **Canal `messages` não confiável sozinho:** mitigado pelo fallback via
  `conversations` + `getLastInboundAt` (§3) — sem isso, o beep "mensagem em
  atendimento" falharia silenciosamente em produção sob carga, replicando um
  problema já conhecido e documentado no projeto.
- **Multi-aba:** cada aba aberta assina os canais e toca beep
  independentemente — sem supressão entre abas no MVP (ver §9).
- **Multi-loja:** o filtro por `storeId` evita que um Owner navegando entre
  lojas seja alertado por conversas de uma loja que não é a ativa no
  momento — mas troca de loja não re-sincroniza o cache "minha"
  imediatamente; o próximo evento Realtime ou visita à Inbox corrige.
- **`hasUnreadMine` é best-effort**, não uma contagem exata (mesma limitação
  que `unreadCount`/`isUnread` hoje têm no restante da Inbox — o comentário
  em `InboxPage.tsx`, linhas 28-39, já documenta essa dualidade como um
  ponto a resolver na Fase 2 com `conversation_views`).
- **Import/backfill de histórico** (`contactsNameBackfill`, `mediaBackfill`,
  `import/history-core`): protegido pelo filtro de recência (`isRecentEvent`,
  60s) — inserts com timestamp antigo não disparam beep nem ligam o ponto.

---

## 9. Fora de escopo (YAGNI)

- Beep para "conversa devolvida à fila" depois de atribuída (exigiria
  `REPLICA IDENTITY FULL` em `conversations` para comparar estado
  antigo/novo em UPDATE).
- Sincronizar preferência de som entre dispositivos (fica em
  `localStorage`, por navegador).
- Supressão de beep entre múltiplas abas abertas simultaneamente.
- Mini-dropdown de prévia ao clicar no ícone de não lidas (clique = navegação
  direta).
- Indicadores visuais separados por categoria (fila vs minhas) — um ponto só,
  combinado.
- Configuração de som por papel/loja no admin (é preferência pessoal, não
  política de loja).
- Contagem exata (número) no ícone de não lidas.

---

## 10. Arquivos

**Criar:**
- `src/features/inbox-alerts/engine/isQueuedConversation.ts` (+ `.test.ts`)
- `src/features/inbox-alerts/engine/isRecentEvent.ts` (+ `.test.ts`)
- `src/features/inbox-alerts/engine/isFreshInboundTimestamp.ts` (+ `.test.ts`)
- `src/features/inbox-alerts/engine/shouldThrottle.ts` (+ `.test.ts`)
- `src/features/inbox-alerts/engine/constants.ts`
- `src/features/inbox-alerts/lib/tonePlayer.ts`
- `src/features/inbox-alerts/store/inboxActivityStore.ts`
- `src/features/inbox-alerts/hooks/useSoundAlertPreferences.ts`
- `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts`
- `src/features/inbox-alerts/hooks/useInboxActivity.ts` (selector fino do store)
- `src/features/inbox-alerts/components/SoundAlertToggle.tsx`
- `src/features/inbox-alerts/components/InboxUnreadBadgeIcon.tsx`
- `src/features/inbox-alerts/components/InboxActivityGuard.tsx`
- `src/features/inbox-alerts/index.ts` (barrel)

**Alterar:**
- `src/features/shell/layouts/AppLayout.tsx` — montar `<InboxActivityGuard />`
- `src/features/shell/components/TopBar.tsx` — montar `<SoundAlertToggle />` e
  `<InboxUnreadBadgeIcon />`
- `src/features/conversations/components/ConversationListItem.tsx` — usar
  `isQueuedConversation` no lugar da regra inline (linhas 276-278)
- `src/features/conversations/pages/InboxPage.tsx` — `useEffect` espelhando
  `unreadGlobal` no `inboxActivityStore`
- `CHANGELOG.md` / versão — no fechamento (MINOR com codinome)

---

## 11. Testes

- **Vitest (TDD):** os quatro módulos de `engine/` — cobertura das regras de
  fila, recência, frescor de timestamp e throttle.
- **Manual (dono):** beep nas duas categorias, ponto visual, popover de som,
  navegação pelo ícone, comportamento multi-loja — validação manual da UI
  conforme preferência já registrada (não abrir browser/preview para validar).
- **Gate de CI:** `bun run build` + `bun run test` verdes; código novo
  checado por delta no `tsc`.
