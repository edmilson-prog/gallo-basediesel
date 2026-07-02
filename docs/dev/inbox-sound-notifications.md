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

### O badge é derivado de forma **autoritativa** (não de um cache/filtro)

Os dois sinais do TopBar são re-consultados da fonte de verdade a cada evento
Realtime relevante (com debounce de 250 ms), em vez de derivados de um cache
local ou da lista filtrada da Inbox:

- **`hasQueueWaiting`** = "esta loja tem *alguma* conversa na fila?" — lido da
  **contagem exata** (`count: 'exact'`) de `conversations.list({ assignmentAny:
  { queue: true }, pageSize: 1 })`. Como usa `total` e não os dados da página,
  um backlog maior que qualquer `pageSize` ainda acende o sinal (uma varredura
  de cache limitada a N linhas apagaria o ponto sob backlog).
- **`hasUnreadMine`** = "o atendente tem *alguma* conversa própria não lida?" —
  `conversations.list({ assignedSellerId, pageSize: 200 })` + `some(unreadCount
  > 0)`. Conversas não lidas têm o `last_message_at` mais recente e sobem ao
  topo dessa janela, então o atendente não fica realisticamente além do teto nas
  próprias threads não lidas. É **ligado** por mensagem inbound e **desligado**
  por `markRead` — ambos são UPDATEs em `conversations`, então o badge é fonte
  única de verdade aqui (a `InboxPage` **não** escreve nesse estado).

Uma **guarda de geração** por sinal garante que uma resposta lenta nunca
sobrescreva um valor mais novo (de uma re-consulta posterior ou de um evento ao
vivo tratado no meio). Ao **trocar de loja ativa** (runtime, sem reload), o
efeito reseta *tudo* — flags do badge, throttle de beep, cache e dedupe — e
re-consulta do zero para a loja recém-selecionada.

### Cache **mine-only** e RPC de fallback só quando há mensagem nova

O cache local guarda **apenas as conversas do próprio atendente**
(`assignedSellerId === sellerId`), usado só para o caminho rápido do `messages`
resolver "esta mensagem é de uma conversa minha?". Fica limitado à carteira do
atendente (não cresce com toda conversa da loja tocada na sessão). O fallback
confiável (`getLastInboundAt`) só é disparado quando o UPDATE de fato
**avançou** `last_message_at` numa conversa minha — `markRead`/tag/status/SDR
mexem só em `updated_at` e não geram mais RPC desperdiçado.

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
  toda mensagem nova provoca) numa conversa "minha" **cujo `last_message_at`
  avançou** — debounce de 250 ms (mesma janela do `useRealtimeMessages`) e chama
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
- **`src/features/conversations/pages/InboxPage.tsx`** — **não** escreve mais no
  `inboxActivityStore`. Continua calculando `unreadGlobal` (contagem da view
  filtrada) só para o header da própria Inbox. O badge global do TopBar é
  derivado inteiramente pelo `useInboxActivityMonitor` (ver "O badge é derivado
  de forma autoritativa" acima) — a leitura de `markRead` ao abrir a conversa
  já dispara o UPDATE em `conversations` que desliga o ponto.

## Notas de implementação

- **Um único `useEffect` de dados** (chaveado por `currentStoreId`/`sellerId` +
  os providers) faz seed inicial, assina os canais e limpa tudo no cleanup —
  não há mais um par Seed/Live separado (que abria brecha para uma resposta de
  seed sobrescrever um valor mais novo do canal ao vivo). A guarda de geração
  fecha a corrida definitivamente.
- **Debounce por conversa, não um único timer** — `touchDebounceHandles` é um
  `Map<conversationId, handle>`. Várias conversas "minhas" podem receber touch
  dentro da mesma janela de 250 ms; um único handle cancelaria o fallback
  pendente de uma conversa anterior em vez de apenas agrupar repetições da
  **mesma** conversa.
- **`unlockTonePlayer` envolvido em `useCallback`** — evita recriar a
  referência passada para `useAudioUnlock` a cada render.
- **`AudioContext` fechado no unmount** — `tonePlayer.dispose()` roda no cleanup
  do monitor e do `SoundAlertToggle`, para que ciclos de logout/login na mesma
  aba (troca de estado SPA, sem reload) não vazem contextos além do teto
  por-aba do navegador.

## Bordas conhecidas / limitações

- **Áudio depende de gesto prévio do usuário** (autoplay policy do
  navegador) — mesmo risco do `session-timeout`. `useAudioUnlock` mitiga
  desbloqueando no primeiro clique/tecla; se falhar, o ponto visual no TopBar
  continua funcionando independente do som.
- **Sem supressão entre abas** — cada aba aberta assina os canais e toca beep
  de forma independente. Fora de escopo no MVP.
- **`hasUnreadMine` é derivado por re-consulta, não um contador exato ao vivo**
  — o beep marca o ponto de forma otimista, mas o valor final vem sempre de uma
  re-consulta `assignedSellerId` + `some(unreadCount > 0)` disparada por
  inbound e por `markRead`. Se um evento Realtime for perdido, o próximo evento
  (ou a troca de loja) re-consulta e corrige. A janela de 200 conversas é
  praticamente exata porque não lidas sobem ao topo do `last_message_at`.
- **"Devolvida à fila" não re-beepa, por design** — o beep de fila só dispara
  no INSERT (criação) de uma conversa não atribuída. Uma conversa que volta
  para a fila depois de já ter sido atribuída (UPDATE) não dispara novo beep —
  comparar estado antigo/novo em UPDATE exigiria `REPLICA IDENTITY FULL` em
  `conversations`, fora de escopo (YAGNI, ver §9 do spec). O **ponto** de fila,
  no entanto, é correto mesmo nesse caso: a re-consulta autoritativa de
  `hasQueueWaiting` reflete a devolução.
- **Multi-loja** — ambos os beeps e o ícone só consideram a loja atualmente
  selecionada (`useCurrentStore()`). Trocar de loja **re-roda o `useEffect`** de
  dados para a loja nova (`currentStoreId` está nas dependências), resetando
  flags do badge, throttle de beep, cache e dedupe, e re-consultando do zero já
  escopado à loja recém-selecionada, sem depender do próximo evento Realtime.
- **Sem loja ativa selecionada** — se `currentStoreId` for `null` (ex.: um
  Owner numa visão agregada "todas as lojas", quando existir), o `useEffect`
  retorna cedo e não faz nada — nem os beeps nem o ponto no TopBar ficam ativos
  nesse modo. É consequência deliberada do escopo por loja ativa (linha 4 da
  tabela de decisões na spec de origem), não um bug — mas fica registrado aqui
  como limitação conhecida.
- **Import/backfill de histórico** não dispara beep — protegido por
  `isRecentEvent`, que ignora eventos com mais de 60s de idade **e** timestamps
  implausíveis mais de 60s no futuro (payload malformado / relógio errado),
  tolerando só um desvio de relógio modesto.
- **Sem migration** — nenhuma tabela/coluna nova; usa métodos de provider já
  existentes (`conversations.list`, `messages.getLastInboundAt`) e o canal
  Realtime já habilitado em `conversations`/`messages`.

## Testes

- **Vitest (TDD):** os quatro módulos de `engine/` — cobertura das regras de
  fila, recência, frescor de timestamp e throttle, e `lib/tonePlayer.ts`.
- **Manual (dono):** beep nas duas categorias, ponto visual, popover de som,
  navegação pelo ícone, comportamento multi-loja.
