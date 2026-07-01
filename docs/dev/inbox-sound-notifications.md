# Notificações sonoras + indicador visual da Inbox

Feature: `src/features/inbox-alerts/`
Spec de origem: `docs/superpowers/specs/2026-07-01-notificacoes-sonoras-inbox-design.md`

## Objetivo

Alertar o atendente em **qualquer tela do app** (`/app/*`, não só com a Inbox
aberta) em dois casos:

1. Chega **mensagem nova numa conversa já atribuída a ele** — beep curto e
   discreto (`"assigned-mine"`).
2. **Um cliente novo entra na fila** (conversa sem atendente, aguardando
   distribuição) — beep diferente e mais chamativo (`"new-in-queue"`).

Complementarmente, um **ícone no TopBar** (`InboxUnreadBadgeIcon`) mostra um
ponto vermelho, sem número, sempre que há uma dessas duas pendências — para o
atendente que só ouviu o beep numa outra tela e quer confirmar visualmente
antes de ir até a Inbox. O clique navega direto para `/app/atendimento`.

Não é fronteira de segurança/negócio: é 100% cosmético/UX, client-side, sem
nenhuma leitura de dado além do que a RLS já libera pelos canais/queries
existentes.

## Arquitetura

```
src/features/inbox-alerts/
├── engine/                        # funções puras, testadas com Vitest
│   ├── isQueuedConversation.ts    # regra "está na fila?" (reusada por ConversationListItem)
│   ├── isRecentEvent.ts           # guarda contra eventos antigos (import/backfill)
│   ├── isFreshInboundTimestamp.ts # dedupe entre canal rápido e fallback
│   ├── shouldThrottle.ts          # throttle por tipo de beep
│   └── constants.ts
├── lib/tonePlayer.ts              # motor de som (Web Audio), independente
├── store/
│   ├── inboxActivityStore.ts          # Zustand: hasUnreadMine / hasQueueWaiting
│   └── soundAlertPreferencesStore.ts  # Zustand persist: enabled / volume
├── hooks/
│   ├── useInboxActivityMonitor.ts # orquestrador — assina Realtime, escreve nos stores
│   └── useInboxActivity.ts        # selector fino (hasUnreadMine || hasQueueWaiting)
├── components/
│   ├── InboxActivityGuard.tsx     # sem UI própria — monta o monitor 1x
│   ├── SoundAlertToggle.tsx       # TopBar: liga/desliga + volume + testar sons
│   └── InboxUnreadBadgeIcon.tsx   # TopBar: ponto vermelho + navegação
└── index.ts                       # barrel público
```

- **`engine/` é puro** — sem React, sem timers, sem Web APIs — coberto por
  `*.test.ts` com Vitest (TDD). `isQueuedConversation` também substituiu a
  regra que antes vivia inline em `ConversationListItem.tsx`, evitando que o
  badge "Em fila" e o beep de fila divirjam no futuro.
- **`lib/tonePlayer.ts`** é um motor Web Audio (`OscillatorNode` + `GainNode`)
  **próprio e independente** de `session-timeout/lib/beep.ts` — por decisão de
  design (não alterar código de áudio já validado em produção). Reaproveita
  apenas o hook genérico `useAudioUnlock` (de `session-timeout/hooks/`) para o
  desbloqueio no primeiro gesto do usuário.
- **Dois stores Zustand**, sem Context novo na árvore do `AppLayout`:
  - `inboxActivityStore` — estado efêmero em memória (`hasUnreadMine`,
    `hasQueueWaiting`), escrito pelo monitor e lido pelo ícone do TopBar.
  - `soundAlertPreferencesStore` — persistido via `zustand/middleware.persist`
    em `localStorage` (chave única `gallo-sound-alerts-preferences`, JSON com
    `enabled`/`volume`). Um store Zustand foi escolhido em vez de
    `localStorage` cru + evento `storage` (padrão usado em
    `gallo-realtime-enabled`) porque o evento `storage` só notifica **outras**
    abas — ligar/desligar no `SoundAlertToggle` não chegaria ao
    `useInboxActivityMonitor` rodando na mesma aba até um reload. Todo
    consumidor no Zustand lê o mesmo estado em memória, então a mudança é
    instantânea.
- **`useInboxActivityMonitor`** é montado **uma única vez** por sessão, via
  `InboxActivityGuard` dentro de `AppLayout.tsx` (ao lado de
  `SessionTimeoutGuard`) — não em cada tela que usa a Inbox. É no-op quando
  `getActiveDataSource() !== "supabase"` (modo mock/Demonstração não tem
  Realtime — mesmo gate de `useRealtimeMessages`).

## A confiabilidade do canal `messages` (por que existem dois caminhos)

`src/features/conversations/hooks/useRealtimeMessages.ts` documenta um
problema real e já conhecido em produção: o canal Realtime de
`public.messages` pode **perder INSERTs** sob carga, porque a avaliação de RLS
por linha no autorizador do Realtime não compartilha a otimização do RPC
`SECURITY DEFINER` usado no SELECT comum (modelo "2 portões", v0.110.0
`Turnstile`). Esse hook já mitiga combinando dois canais: `messages` (rápido,
mas falível) + `conversations` (o "touch" de `last_message_at`, sempre
confiável) como fallback.

Este feature herdaria a mesma falha silenciosa se dependesse só de `messages`,
então `useInboxActivityMonitor` replica o mesmo padrão:

- **Canal rápido:** INSERT em `messages` com `direction === "in"` — se a
  conversa já está no cache local como "minha" (`assignedSellerId ===
  sellerId` do usuário logado), beepa direto.
- **Canal de fallback (confiável):** UPDATE em `conversations` (o touch que
  toda mensagem nova provoca) numa conversa "minha" — debounce de 250 ms
  (mesma janela do `useRealtimeMessages`) e chama
  `messagesProvider.getLastInboundAt(conversationId)` (método já existente,
  RPC `last_inbound_at`) para confirmar se há mensagem inbound mais nova que a
  última já alertada.

Um `Map<conversationId, lastAlertedIso>` (`lastAlertedInboundRef`) deduplica: o
caminho que classificar primeiro marca a entrada; o outro vê já coberto e não
repete o beep. **Sem esse fallback, o beep "mensagem em atendimento" falharia
silenciosamente em produção sob carga** — não é uma hipótese, é o mesmo
sintoma documentado no hook de mensagens da conversa.

O beep de **fila** não sofre desse problema: depende só de INSERT em
`conversations`, que é o canal confiável.

## Pontos de integração

- **`src/features/shell/layouts/AppLayout.tsx`** — monta `<InboxActivityGuard
  />` (chama `useInboxActivityMonitor()`, sem UI própria), ao lado de
  `SessionTimeoutGuard`. É o que faz o monitor rodar em qualquer tela do app.
- **`src/features/shell/components/TopBar.tsx`** — monta `<SoundAlertToggle
  />` (popover com liga/desliga, slider de volume, botões "Testar som:
  mensagem"/"Testar som: fila") e `<InboxUnreadBadgeIcon />` (ícone
  `mdi:inbox-arrow-down-outline` com ponto vermelho condicional e navegação
  para `/app/atendimento`).
- **`src/features/conversations/components/ConversationListItem.tsx`** —
  importa `isQueuedConversation` de `@/features/inbox-alerts` no lugar da
  regra que antes estava inline, para a badge "Em fila" da lista usar
  exatamente a mesma regra do beep.
- **`src/features/conversations/pages/InboxPage.tsx`** — um `useEffect`
  espelha `unreadGlobal` (contagem real, já calculada ali) em
  `useInboxActivityStore.getState().setHasUnreadMine(unreadGlobal > 0)` toda
  vez que muda. É o mecanismo de reconciliação: ver "Bordas conhecidas"
  abaixo.

## Desvios do desenho original (implementados, revisados)

O plano de implementação (Task 7) refinou o rascunho de código do spec em 3
pontos pequenos, todos verificados em revisão — não são regressão em relação
ao desenho aprovado:

1. **Debounce por conversa, não um único timer** — `touchDebounceHandles` é um
   `Map<conversationId, handle>` em vez de uma única referência de timeout.
   Várias conversas "minhas" podem receber touch dentro da mesma janela de
   250 ms; um único handle cancelaria o fallback pendente de uma conversa
   anterior em vez de apenas agrupar repetições da **mesma** conversa.
2. **Limpeza do cache ao trocar de loja ativa** — `cache` e
   `lastAlertedInbound` são zerados no início do efeito Realtime, porque
   `currentStoreId` pode mudar em runtime (sem reload — ver
   `MultistoreProvider.setCurrentStore`) enquanto o hook permanece montado
   pela sessão inteira; sem isso, uma conversa cacheada da loja anterior
   vazaria para `recomputeQueueState()` da loja nova.
3. **`unlockTonePlayer` envolvido em `useCallback`** — evita recriar a
   referência passada para `useAudioUnlock` a cada render.

## Bordas conhecidas / limitações

- **Áudio depende de gesto prévio do usuário** (autoplay policy do
  navegador) — mesmo risco do `session-timeout`. `useAudioUnlock` mitiga
  desbloqueando no primeiro clique/tecla; se falhar, o ponto visual no TopBar
  continua funcionando independente do som.
- **Sem supressão entre abas** — cada aba aberta assina os canais e toca beep
  de forma independente. Fora de escopo no MVP.
- **`hasUnreadMine` é *best-effort*, não uma contagem exata** — o monitor só
  **liga** o estado de forma otimista a partir de eventos Realtime; quem
  **desliga** de fato é a visita à Inbox (`InboxPage` reconciliando com
  `unreadGlobal`, a fonte de verdade real). Entre visitas, o ponto pode
  continuar aceso mesmo depois de uma mensagem já ter sido lida em outro
  lugar — mesma dualidade que `unreadCount`/`isUnread` já têm hoje no resto da
  Inbox.
- **"Devolvida à fila" não re-beepa, por design** — o beep de fila só dispara
  no INSERT (criação) de uma conversa não atribuída. Uma conversa que volta
  para a fila depois de já ter sido atribuída (UPDATE) não dispara novo beep
  nem some do `hasQueueWaiting` incorretamente — comparar estado
  antigo/novo em UPDATE exigiria `REPLICA IDENTITY FULL` em `conversations`,
  fora de escopo (YAGNI, ver §9 do spec).
- **Multi-loja** — ambos os beeps e o ícone só consideram a loja atualmente
  selecionada (`useCurrentStore()`). Trocar de loja **re-roda os dois
  `useEffect`s** (Seed e Live) para a loja nova — `currentStoreId` está nas
  dependências de ambos, então o cache antigo é limpo (ver desvio #2 acima) e
  o *seed* inicial roda de novo já escopado à loja recém-selecionada, sem
  depender do próximo evento Realtime ou de uma visita à Inbox.
- **Sem loja ativa selecionada** — se `currentStoreId` for `null` (ex.: um
  Owner numa visão agregada "todas as lojas", quando existir), tanto o *Seed*
  quanto o *Live* `useEffect` retornam cedo e não fazem nada — nem os beeps
  nem o ponto no TopBar ficam ativos nesse modo. É consequência deliberada do
  escopo por loja ativa (linha 4 da tabela de decisões na spec de origem), não
  um bug — mas fica registrado aqui como limitação conhecida.
- **Import/backfill de histórico** não dispara beep — protegido por
  `isRecentEvent` (eventos com mais de 60s de idade são ignorados).
- **Sem migration** — nenhuma tabela/coluna nova; usa métodos de provider já
  existentes (`conversations.list`, `messages.getLastInboundAt`) e o canal
  Realtime já habilitado em `conversations`/`messages`.

## Testes

- **Vitest (TDD):** os quatro módulos de `engine/` — cobertura das regras de
  fila, recência, frescor de timestamp e throttle, e `lib/tonePlayer.ts`.
- **Manual (dono):** beep nas duas categorias, ponto visual, popover de som,
  navegação pelo ícone, comportamento multi-loja.
