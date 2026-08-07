# Aviso sonoro + toast para mensagens em conversa não ativa

**Data:** 2026-08-07
**Status:** aprovado no brainstorm, pendente implementação
**Branch:** `worktree-feat-inbound-toast-alerts`

## Problema

Quando um atendente está em outra conversa ou em outra tela da plataforma, uma
mensagem nova que chega em uma conversa dele passa despercebida: hoje só existe
o som `inboxAssignedMine` (sem indicação de *qual* conversa) e o ponto no ícone
do Inbox na TopBar. Não há caminho de um clique até a conversa que chamou.

Pior: o som toca **mesmo quando a conversa está aberta na frente do atendente**,
o que treina o ouvido a ignorá-lo.

## O que já existe (fundação reaproveitada)

| Peça | Onde | Papel nesta feature |
|---|---|---|
| Monitor global de atividade | `src/features/inbox-alerts/hooks/useInboxActivityMonitor.ts` | Único gatilho de "chegou inbound numa conversa minha" — dedupe por timestamp, throttle de 1,5 s e fallback confiável via `last_message_at` |
| Central de Sons | `src/features/sound-settings/` | Evento `inboxAssignedMine` (som/volume/liga-desliga por loja) |
| `Toaster` (sonner) | `src/routes/__root.tsx:108` | `position="bottom-right" duration={5000} closeButton` |
| `listContacts(ids)` | `IConversationsProvider` | Nome/telefone/avatar por RPC `conversation_contacts` gated-once |
| Rota da conversa | `src/routes/app.atendimento.$id.tsx` | Param é `id` (não `conversationId`) |
| Ponto de montagem | `src/features/shell/layouts/AppLayout.tsx:80` | `<InboxActivityGuard />` |

## Decisões (travadas no brainstorm)

1. **Escopo:** só conversas atribuídas ao usuário logado. Fila sem dono e
   conversas em que ele é apenas colaborador ficam de fora.
2. **"Conversa ativa" = rota aberta nela E aba visível.** Com a aba em segundo
   plano (atendente no ERP, janela minimizada), o aviso volta a disparar mesmo
   na conversa aberta — ele não está vendo a tela.
3. **Conteúdo:** nome do contato + prévia da mensagem; mídia vira rótulo.
4. **Rajada:** um toast por conversa, atualizado no lugar, com contador
   ("3 novas mensagens") a partir da segunda. Conversas distintas empilham.
5. **O som passa a ser suprimido na conversa ativa** — mudança de comportamento
   deliberada sobre o que existe hoje.
6. **O toast é independente do liga/desliga de som.** O toggle da Central de
   Sons rege apenas o áudio; desligar o som não remove o aviso visual.

## Arquitetura

O monitor **publica o fato**; um host separado decide como avisar. Som e toast
saem do mesmo gatilho já validado, então não podem divergir.

```
Realtime messages INSERT (direction=in, conversa minha)
        │
        ▼
  maybeBeepMine()                    ← já existe: dedupe + throttle
        │
        ├── isConversationActive(pathname, id, visibility) === true
        │        └── sai: nem som, nem toast
        │
        └── play("inboxAssignedMine")        ← como hoje
            emitInboundOnMine({ conversationId, text, mediaType })
                    │
                    ▼
            InboundToastHost  (novo, montado no AppLayout)
                    ├── listContacts([id])  → cache local por conversa
                    ├── toast(..., { id: conversationId })
                    └── clique → navigate('/app/atendimento/$id') + dismiss
```

### Por que não as alternativas

- **Toast dentro do monitor:** o monitor passaria a conhecer sonner, o router e
  o provider de contatos — um arquivo fazendo tudo.
- **Hook novo com assinatura própria de realtime:** duplicaria a lógica de
  dedupe/throttle/fallback que custou muitas iterações para acertar, e som e
  toast passariam a decidir "isso é novo?" em dois lugares.

## Arquivos

### Novos — `src/features/inbox-alerts/`

| Arquivo | Conteúdo |
|---|---|
| `engine/isConversationActive.ts` | `(pathname: string, conversationId: string, visibility: DocumentVisibilityState) => boolean`. Puro. Casa `/app/atendimento/<id>` tolerando barra final e query string; `false` se `visibility !== "visible"`. |
| `engine/inboundPreview.ts` | `(text: string, mediaType?: MessageMediaType) => string`. Trunca em 90 caracteres com reticências; mídia sem texto vira rótulo (Foto, Áudio, Vídeo, Documento, Figurinha, Localização, Contato); nada disponível → `"Nova mensagem"`. |
| `engine/inboundToastAccumulator.ts` | Acumulação por conversa: registra chegada, devolve `{ preview, count }`, zera ao dispensar/abrir. Puro, sem timers. |
| `events/inboundOnMine.ts` | Emitter mínimo (`emitInboundOnMine` / `subscribeInboundOnMine`) — sem dependência de React, para o monitor não importar UI. |
| `components/InboundToastHost.tsx` | Consome o emitter, resolve contato, renderiza e navega. Sem UI própria fora do toast. |
| Testes `*.test.ts` | Co-localizados, um por engine. |

### Alterados

| Arquivo | Delta |
|---|---|
| `hooks/useInboxActivityMonitor.ts` | Um `ref` de pathname (atualizado em efeito próprio), a guarda de conversa ativa dentro de `maybeBeepMine` e o `emit`. **As dependências do efeito de realtime não mudam** — nenhuma re-assinatura de canal. |
| `components/InboxActivityGuard.tsx` | Passa a renderizar `<InboundToastHost />` em vez de `null`. |
| `index.ts` | Barrel. |

Nada fora de `src/features/inbox-alerts/`. Sem migration, sem Edge Function,
sem mudança de contrato de provider.

## Detalhes que decidem a implementação

**Pathname por `ref`, nunca por dependência.** O efeito principal do monitor tem
deps `[conversationsProvider, messagesProvider, currentStoreId, sellerId]`.
Incluir a rota faria o canal de realtime ser derrubado e recriado a cada
navegação. O pathname entra por um `useEffect` separado que só escreve num
`ref` — mesmo padrão de `useSoundEventPlayer`.

**Prévia sem query extra.** O payload de `postgres_changes` traz a linha nova
inteira, incluindo `text` e `media_type` (colunas confirmadas em
`impl/supabase/messages.ts:60`). O monitor hoje tipa só três campos; a interface
`IMessageRealtimeRow` ganha os dois.

**Caminho de fallback fica sem prévia.** Quando o canal `messages` perde o
INSERT sob carga de RLS e o aviso chega pelo `last_message_at`
(`getLastInboundAt`), não há texto — o toast mostra `"Nova mensagem"`. Buscar o
texto ali custaria uma query por evento; dado o histórico de storm de
`statement_timeout`, não vale. Na prática o caminho rápido ganha quase sempre e
o dedupe impede o segundo disparo.

**`id` do toast = `conversationId`.** É o que faz sonner atualizar no lugar em
vez de empilhar. Reabrir a mesma conversa reaproveita o mesmo slot.

**Toast some ao abrir a conversa.** Efeito no host observando o pathname:
ao entrar em `/app/atendimento/<id>`, `toast.dismiss(id)` e zera o acumulador.

**Falha de `listContacts` não bloqueia o aviso.** Sem o nome, o toast aparece
com a prévia e um rótulo neutro. O cache local guarda o resultado por conversa e
deduplica chamadas em voo.

**Só no Supabase.** O monitor já é inteiro guardado por
`getActiveDataSource() === "supabase"`; o host herda isso.

## Erros e limites

| Situação | Comportamento |
|---|---|
| `listContacts` falha ou não retorna a linha | Toast sem nome, com a prévia |
| Mensagem de mídia sem texto | Rótulo do tipo ("Foto") |
| Conversa reatribuída para outro vendedor | O monitor já para de considerá-la "minha" (cache mine-only); nenhum toast novo |
| Troca de loja em runtime | O reset per-store já existente limpa também o acumulador de toasts |
| Backlog de importação / reconexão | `MAX_EVENT_AGE_MS` (60 s) já descarta eventos velhos — vale para o toast pelo mesmo gatilho |

## Testes

Vitest sobre os engines puros (nenhum precisa de DOM ou realtime):

- `isConversationActive` — rota certa, id divergente, barra final, query string,
  rota fora do atendimento, aba oculta.
- `inboundPreview` — texto curto, texto longo (truncagem), cada `mediaType`,
  mídia com legenda, texto e mídia ausentes.
- `inboundToastAccumulator` — primeira mensagem, segunda (contador 2), reset ao
  dispensar, conversas independentes não se misturam.

Gate prático: `bun run build` + `bun run test`.

## Fora de escopo

Notificação nativa do sistema operacional (Notification API), contador no título
da aba, toast para a fila sem dono, som novo na Central de Sons, e configuração
por usuário para ligar/desligar o aviso visual.

## Riscos

O monitor vizinha a área congelada do atendimento
(`feedback_atendimento_cache_do_not_touch`): query keys de mensagens, pipeline
de assinatura de mídia em lote e `useRealtimeMessages`/`useRealtimeConversations`
**não são tocados** por este trabalho. O delta no monitor é aditivo e preserva
as dependências do efeito byte a byte — mesma disciplina da Task 9 da Central de
Sons.
