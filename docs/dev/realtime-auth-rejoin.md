# Realtime: join autenticado + re-join por troca de token + catch-up

> **Contexto:** fix da regressão "Inbox congelada" (card não sobe, preview stale,
> só resolve com F5) — v0.127.0, investigação de 2026-07-02.
> **Arquivos:** `src/shared/lib/realtime.ts`,
> `src/features/conversations/hooks/useRealtimeConversations.ts`.

## A causa raiz: subscription `anon` silenciosa

O `postgres_changes` do Supabase Realtime deriva as claims de autorização do
token presente **no momento do join** do canal — e **nunca as re-avalia**. O
push de `access_token` que o supabase-js envia automaticamente após cada join
atualiza a autorização de broadcast/presence, mas **não** a subscription CDC
(linha em `realtime.subscription`).

O `RealtimeChannel.subscribe()` do supabase-js (2.107) só inclui o token no
payload do join **se ele já estiver em cache no socket**
(`RealtimeChannel.js:145-147`) — ele não espera o `auth.getSession()` async.
Resultado: um join que dispara antes de o token propagar entra com a apikey
publishable → a subscription nasce com `claims_role='anon'`.

Como toda a RLS do projeto é `to authenticated` (e `can_access_conversation`
lê `app_metadata` do JWT), o autorizador do Realtime (walrus) **filtra 100%
dos eventos silenciosamente**: o canal reporta `SUBSCRIBED`, o ícone fica
verde, nenhum erro em nenhum log — e nenhum evento chega.

**Verificação empírica (2026-07-02, prod):** com uma aba logada aberta (REST
funcionando), `SELECT entity, claims_role FROM realtime.subscription` mostrou
as duas subscriptions (`conversations`, `messages`) com `claims_role='anon'`,
estáveis por 46+ min — inclusive após logout/login explícito (canais novos,
`anon` de novo). Mensagens de teste entravam no banco com touch correto de
`last_message_at` no mesmo segundo e nunca chegavam ao cliente.

### Por que piorou com o PR #215 (inbox-alerts)

O `InboxActivityGuard` (app-wide, `AppLayout`) passou a criar os canais **no
boot do app** — quando a sessão ainda está hidratando, a corrida é quase
sempre perdida — e o ref-count de `subscribeToTable` **fixa o canal anon pela
sessão inteira** (entrar no Atendimento reusa o canal morto). Antes do #215 o
primeiro canal nascia ao entrar no Atendimento (sessão pronta há muito tempo),
e a corrida geralmente era ganha — daí a intermitência histórica da saga
#204/#205.

## O fix (3 peças)

1. **Join espera o token** — `createAndJoin` faz `await realtime.setAuth()`
   (resolve o token da sessão para o socket) **antes** de `channel.subscribe()`.
2. **Re-join na troca de token** — um watcher único de `onAuthStateChange`
   compara o token atual com o `joinToken` de cada canal vivo e, quando difere
   (login, logout, **token refresh**), derruba e recria o canal preservando
   listeners e ref-counts. O re-join no refresh também importa: as claims da
   subscription carregam o `exp` do JWT do join — sem re-join, uma sessão
   longa morreria silenciosamente quando o token original expirasse (~1h).
   Tópicos carregam um sufixo monotônico (`table:<t>:<n>`) para nunca colidir
   com um canal ainda saindo (o supabase-js deduplica canal por tópico e
   devolveria a instância moribunda).
3. **Catch-up no (re)join** — `postgres_changes` não tem replay: qualquer join
   (boot, re-join de auth, reconexão de socket) pode cair depois de eventos
   nunca entregues. `createCatchUpStatusHandler` (puro, testado) dispara um
   bump único do `tick` a cada transição down→SUBSCRIBED, e o
   `useRealtimeConversations` o aplica aos **dois** canais — a lista da Inbox
   refetcha uma vez e cicatriza qualquer lacuna, em vez de congelar até o F5.

## Validação (smoke)

Com o app aberto e logado:

```sql
SELECT entity::text, claims_role::text, claims->>'sub', created_at
FROM realtime.subscription ORDER BY created_at DESC;
```

- **Antes do fix:** `claims_role='anon'`, `sub` nulo.
- **Depois do fix:** `claims_role='authenticated'` com o `sub` do usuário; uma
  mensagem de teste inbound reordena a Inbox e atualiza o preview **sem F5**.

## O que este fix NÃO cobre (follow-ups conhecidos)

- `bumpConversation` (webhook) sem guarda advance-only + mistura de domínios
  de relógio em `sent_at` (outbound = server-now em ms; inbound = provedor
  truncado a segundo) — pode eleger a última **enviada** como preview mesmo
  após F5 (persistido no DB). Server-side, PR próprio.
- Mensagem já ingerida por import de histórico → webhook ao vivo morre em
  unique violation **antes** do bump (mensagem no banco sem evento no canal) e
  o evento nunca é marcado como processado. Server-side, PR próprio.
- `fetchPage` de `useConversationsList` sem abort/versionamento (resposta
  velha pode sobrescrever a nova em rajada) — mitigado na prática pelo
  catch-up; hardening futuro.
- **Janela do re-join para consumidores sem catch-up:** o watcher recria os
  canais a cada troca de token (~50 min); `useRealtimeMessages` (thread
  aberto) e `useInboxActivityMonitor` (beeps/badges) só passam `onEvent` — um
  evento caído na janela do swap (~sub-segundo) só cura no próximo evento da
  conversa/loja. Follow-up barato num PR próprio: status listener com o mesmo
  `createCatchUpStatusHandler` chamando `syncLatest` (thread) /
  `revalidateQueue`+`revalidateMine` (monitor). Nota: a entrega do canal
  compartilhado é **at-least-once** (overlap leave/join do re-join pode
  duplicar evento) — listeners devem ser idempotentes; os atuais são.

## Referências

- Saga anterior: `docs/dev/atendimento-structured-shares-review-followups.md`
  (PR #204/#205 — fallback do thread via canal `conversations`).
- Modelo de acesso: `docs/dev/conversation-access-model.md`
  (`can_access_conversation`, custo de RLS por linha no caminho do Realtime).
- Guia do monitor de alertas: `docs/dev/inbox-sound-notifications.md` (#215).
