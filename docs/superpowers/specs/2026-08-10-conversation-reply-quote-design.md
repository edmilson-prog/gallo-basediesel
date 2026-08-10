# Responder (citar) mensagem na conversa — Design

> **Data:** 2026-08-10
> **Branch:** `feat/conversation-reply-quote`
> **Estado:** spec aprovada pendente de revisão do dono
> **Área:** `src/features/conversations/`, `src/providers/whatsapp/waha/`, `supabase/functions/waha-*`

---

## 1. Problema

O WhatsApp permite responder uma mensagem específica, citando-a. O CRM não tem isso — em
nenhuma das duas direções:

- **O atendente não consegue citar.** Numa conversa em que o cliente mandou seis códigos de
  peça, a resposta "esse tem em estoque" é ambígua. O atendente contorna copiando o trecho
  na mão ou repetindo o código.
- **A citação que o cliente faz é invisível.** Quando o cliente responde citando uma
  mensagem nossa, o CRM mostra só "sim, esse mesmo" — sem o que ele citou. O contexto se
  perde exatamente onde ele mais importa.

Isso não é hipotético: **2.827 eventos com citação chegaram nos últimos 27 dias**
(`webhook_deliveries`, ~3% das mensagens WAHA), e parte deles com `fromMe: true` — ou seja,
**os vendedores já respondem citando pelo celular**, e essa citação chega ao CRM e é
descartada.

## 2. Decisões do dono (2026-08-10)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Direção | **Nos dois sentidos** — o atendente cita ao responder **e** a conversa mostra a citação feita pelo cliente |
| D-2 | Gesto | **Hover na bolha → menu** com "Responder" e "Copiar texto" |
| D-3 | Clique na citação | **Pula para a mensagem original quando ela já estiver carregada**; sem ela, o clique não faz nada (silencioso) |
| D-4 | Histórico | **Só daqui pra frente** — sem backfill dos eventos já recebidos |

## 3. Achados da investigação (fatos verificados, não suposições)

Cinco fatos apurados antes do design; cada um muda uma decisão de implementação.

### 3.1 O tráfego real é 100% WAHA

| Conta | Engine | Mensagens/30d |
|---|---|---|
| Vendas — WAHA | `waha` | 87.564 |
| GALLO Site — WAHA | `waha` | 10.590 |
| VendasExterna — WAHA | `waha` | 6.402 |
| GALLO Matriz (Oficial) | `meta` | 0 |
| Comercial Lucas | `evolution` | 0 (desconectada) |

Logo: o v1 é WAHA. Meta e Evolution ficam fora — a camada genérica já carrega
`replyToMessageId` (`src/providers/whatsapp/types.ts:65,82`) e os dois providers já o
traduzem (`MetaCloudProvider.ts:120`, `EvolutionProvider.ts:100`), então religar é barato se
um dia voltarem a receber tráfego.

### 3.2 A WAHA aceita `reply_to` — e espera o id serializado

`POST /api/sendText`, `/api/sendImage`, `/api/sendFile`, `/api/sendVoice` e `/api/sendVideo`
aceitam `reply_to` com o **id serializado** (`false_5555…@c.us_AAA…`) — o mesmo formato que
já persistimos em `messages.provider_message_id`. Vale para texto **e** mídia.

### 3.3 ⚠️ No inbound o id da citação vem CRU — casamento é por sufixo

O ponto mais perigoso da feature. Amostra real de `webhook_deliveries`:

| `payload.id` (o que guardamos) | `payload.replyTo.id` (o que a citação aponta) |
|---|---|
| `false_176312836698119@lid_A5458535B99785B0084742B6E0DC759C` | `A55995F4894E267BE03B5F864110C5CB` |
| `true_255224270876679@lid_3EB0CA488EE47B77A23CC4` | `3A5AC1F1D8E39EF06FF4` |

`replyTo.id` é **só o hash**, sem o prefixo `{fromMe}_{chatJid}_`. Um casamento ingênuo por
igualdade (`provider_message_id = replyTo.id`) **nunca encontraria nada** e a feature
entregaria 100% de citações órfãs — falhando silenciosamente, que é o pior modo de falhar.
O casamento correto é por **sufixo**, validado exatamente (`endsWith("_" + hash)`).

### 3.4 O parser WAHA já recebe a citação — e a descarta

`IWahaReplyTo` (`src/providers/whatsapp/waha/parser.ts:94`) já traz `id`, `body`, `hasMedia`
e `media`. Hoje é lido **só** para o caso de comentário em Status
(`isWahaStatusReply`, linha 141) e some depois: `parseWahaMessageEvent` não o propaga para
`IInboundMessage`/`IOutboundEcho`. Ou seja, o dado já chega — falta carregar adiante.

### 3.5 A leitura de mensagens não precisa mudar

A RPC `conversation_messages` é `RETURNS SETOF messages` com `select m.*`: uma coluna nova
aparece sozinha, sem recriar a função. E o Realtime (`postgres_changes`) entrega a linha
inteira. Portanto **nada de cache, query keys, paginação ou assinatura de realtime é
tocado** — respeitando a área congelada do Atendimento. As duas únicas mudanças de leitura
são os dois mapeadores `row → IMessage`
(`src/providers/data/impl/supabase/messages.ts:73` e
`src/features/conversations/hooks/useRealtimeMessages.ts:58`).

## 4. Modelo de dados

### 4.1 Coluna

```sql
alter table public.messages add column reply_to jsonb;

comment on column public.messages.reply_to is
  'Mensagem citada por esta (reply/quote). Snapshot desnormalizado: a bolha renderiza sem
   consulta extra e sobrevive a citação de mensagem que não temos. messageId é null quando
   a original não foi encontrada no nosso histórico.';
```

Uma coluna `jsonb` nullable, sem default: `ALTER` é metadata-only, sem reescrita nem lock
longo — importante numa tabela quente com ~1M linhas. Segue o padrão já usado em
`messages.reactions` e `conversations.ad_referral`.

**Por que snapshot e não só uma FK:**

1. A bolha renderiza **sem query nenhuma** — não encosta no cache congelado do Atendimento.
2. Citação de mensagem que não temos (anterior à importação de histórico, ou de uma conversa
   que nunca sincronizamos) ainda mostra o trecho, porque o WAHA manda o `body` junto.
3. O texto citado fica **imutável**, como no WhatsApp — apagar a original não apaga a citação.

**Por que uma coluna e não quatro:** um único ponto de mapeamento em cada camada, e nenhuma
consulta jamais filtra por esses campos (só lê). Quatro colunas nullable numa tabela quente
seriam custo sem uso.

### 4.2 Forma do payload

```jsonc
{
  "messageId": "3f1c…",                       // uuid da nossa mensagem; null se não achamos
  "providerMessageId": "false_555…@lid_A55…", // id serializado quando resolvido; cru quando órfão
  "text": "Tem o filtro de óleo do Volvo FH?",// já truncado na gravação (240 chars)
  "mediaType": "image",                        // null para texto puro
  "direction": "in"                            // de quem era a mensagem citada
}
```

### 4.3 Tipo de domínio

```ts
// src/shared/types/conversation.ts (junto de IMessage)

/** Mensagem citada por outra (reply/quote). Snapshot: o conteúdo é uma cópia
 *  do momento da citação, não uma leitura viva da mensagem original. */
export interface IMessageReplyRef {
  /** Nossa mensagem citada. Ausente quando ela não existe no histórico local —
   *  a citação ainda renderiza (pelo snapshot), mas não é clicável. */
  messageId?: ID;
  /** Id do provider da mensagem citada. Serializado quando resolvemos a original;
   *  cru (só o hash, como o WAHA manda) quando não. */
  providerMessageId?: string;
  text?: string;
  mediaType?: MessageMediaType;
  direction?: "in" | "out";
}
```

`IMessage` ganha `replyTo?: IMessageReplyRef`.

## 5. Envio (outbound)

```
MessageInput ──▶ useMessageSend({ replyTo })
                      │
                      ▼
                 waha-send (Edge)
                      │
                      ▼
              wahaSendAdapter.persistAndDispatch
                  │              │
      insert messages.reply_to   └──▶ sendWahaText / sendWahaMedia
      (snapshot completo)              { …, reply_to: <provider_message_id> }
```

Detalhes:

- `ISendOptions` (`useMessageSend.ts:71`) ganha `replyTo?: IMessageReplyRef`. A mensagem
  otimista já nasce com ele — a bolha aparece citando de imediato.
- `waha-send/index.ts` aceita `replyTo` no corpo e o repassa a `dispatchWahaText` /
  `dispatchWahaMedia`.
- `wahaSendAdapter.persistAndDispatch` grava `reply_to` no insert e passa
  `replyToProviderMessageId` para as funções de envio.
- `sendWahaText`/`sendWahaMedia` (`waha/send.ts`) ganham `replyTo?: string`, emitido como
  `reply_to` no JSON quando presente.
- **Guarda:** só é possível citar mensagem que tem `provider_message_id`. Uma mensagem
  `queued`/`failed` (que nunca saiu) não oferece "Responder" — sem falha silenciosa no envio.
- A assinatura do atendente (`applyAttendantSignature`) segue inalterada.

## 6. Recebimento (inbound e eco do celular)

### 6.1 Parser

`parseWahaMessageEvent` passa a normalizar a citação em **ambos** os retornos
(`IInboundMessage` e `IOutboundEcho`):

```ts
/** Citação que veio no payload, ainda NÃO resolvida contra o nosso histórico —
 *  `providerMessageId` aqui é o hash cru que o WAHA manda (ver §3.3). */
export interface IInboundReplyRef {
  providerMessageId: string;
  text?: string;
  hasMedia?: boolean;
}
```

Ressalva importante: um comentário em Status (`isWahaStatusReply`) **não** é citação de
mensagem da conversa — o `replyTo` ali já é consumido como mídia própria da mensagem
(`parser.ts:234`). Esse caminho continua exatamente como está, e a citação **não** é emitida
nele.

### 6.2 Resolução no webhook

Nos dois pontos de insert do `waha-webhook` (eco em `index.ts:1034`, inbound em
`index.ts:1315`), quando há citação:

1. Busca na **mesma conversa** por `provider_message_id` que termine no hash
   (`.eq("conversation_id", …).like("provider_message_id", "%" + hash)`), validando o sufixo
   exato em código (`endsWith("_" + hash)`) — o `_` do LIKE é curinga, então o SQL sozinho
   não basta como prova.
2. **Achou:** grava `messageId`, o `provider_message_id` serializado, e o texto/`media_type`/
   `direction` **da nossa linha** (fonte mais confiável que o `body` do payload).
3. **Não achou:** grava `providerMessageId` cru + o `body` do payload como texto, com
   `messageId` ausente. A citação renderiza, só não é clicável.

Custo: uma query a mais apenas nas ~3% de mensagens que citam algo, sempre filtrada por
`conversation_id` (índice existente). **Sem índice novo no v1** — se o webhook acusar
latência, um índice de expressão
(`(conversation_id, split_part(provider_message_id,'_',3))`, criado `CONCURRENTLY`) resolve
sem reescrever a tabela.

## 7. UI

### 7.1 Disparo — hover na bolha

`BubbleChrome` (`components/bubbles/bubbleChrome.tsx`) ganha um chevron discreto no canto,
visível no hover/foco, que abre um `DropdownMenu`:

```
                          ┌─ hover ────────────┐
┌─────────────────────────────┐      │ ↩  Responder      │
│ Tem o filtro de óleo do   ▾ │ ───▶ │ ⧉  Copiar texto   │
│ Volvo FH?             14:02 │      └────────────────────┘
└─────────────────────────────┘
```

- O chevron não compete com o clique da mídia (lightbox, play de áudio) — fica no canto
  superior, fora da área de conteúdo.
- Acessível por teclado: o gatilho entra na ordem de tabulação da bolha.
- A bolha ganha `data-message-id` (o pulo depende disso).
- "Copiar texto" some em mensagem sem texto (mídia sem legenda).
- "Responder" some quando a mensagem não tem `provider_message_id` (§5).

### 7.2 `QuotedPreview` — um componente, dois lugares

Renderiza a citação dentro da bolha **e** na barra de composição:

```
┌─────────────────────────────────┐
│ ▌ Você                          │   ← barra vertical + autor
│ ▌ Tem o filtro de óleo do Volv… │   ← trecho, máx. 2 linhas
│                                 │
│ Temos sim, chega quinta   14:05 │   ← a mensagem em si
└─────────────────────────────────┘
```

- Autor: **"Você"** quando `direction === "out"`; senão o nome do contato da conversa, com
  fallback para **"Cliente"** quando o contato não tem nome resolvido (conversa de lead
  anônimo, número sem `pushName`).
- Mídia sem texto vira rótulo com ícone: `Foto`, `Áudio`, `Vídeo`, `<nome do arquivo>`,
  `Localização`, `Contato`. Ícones via `@/components/Icon` (`mdi:image`, `mdi:microphone`,
  `mdi:video`, `mdi:file-document`, `mdi:map-marker`, `mdi:account`) — **não** emoji
  literal, seguindo o padrão do projeto.
- Somente tokens semânticos (`bg-muted`, `border-primary`, `text-muted-foreground`) —
  nenhum `--gallo-*` nem hex, conforme `.claude/rules/temas.md`.

### 7.3 Barra de composição

Acima do campo de texto, a mesma `QuotedPreview` com um **X** para cancelar; `Escape` no
campo também cancela. `MessageInput.tsx` tem 1.209 linhas — a barra entra como componente
próprio (`ReplyComposerBar.tsx`), sem inflar o monolito.

### 7.4 Estado do rascunho

`ReplyDraftContext` **dedicado** (`hooks/useReplyDraft.tsx`), montado na `ConversationPage`
envolvendo lista + composer. Não entra no `ConversationContext` de propósito: trocar o alvo
de resposta re-renderizaria toda a thread, e quem consome o alvo é só o composer (as bolhas
consomem apenas o setter, que é estável). Trocar de conversa limpa o rascunho.

### 7.5 Pulo para a original

Clique na citação → `scrollIntoView` + flash de destaque, reusando o padrão que a
`MessageList` já tem para notas (`jumpToNote`, `MessageList.tsx:129`), agora por
`[data-message-id]`. Se a mensagem não estiver carregada, o clique não faz nada — decisão
D-3. A citação com `messageId` ausente não é sequer clicável (cursor normal, sem hover).

## 8. Lógica testável (Vitest, TDD)

`src/features/conversations/engine/replyRef.ts` — funções puras:

| Função | O que garante |
|---|---|
| `matchesProviderMessageId(serialized, rawHash)` | Casa por sufixo exato; rejeita casamento parcial e trata `@lid`/`@c.us` |
| `truncateQuotedText(text)` | Corta em 240 chars sem quebrar no meio de palavra |
| `quotedLabel(ref)` | Rótulo/ícone por tipo de mídia; texto vence quando existe |
| `canReplyTo(message)` | `false` sem `provider_message_id` (queued/failed) |

Mais testes no parser WAHA (`waha/parser.test.ts`): citação em inbound, em eco (`fromMe`),
e a **não-emissão** em comentário de Status.

## 9. Fora de escopo (v1)

- Backfill do histórico (D-4) — os 2.827 eventos guardados desde 14/07 seguem disponíveis
  em `webhook_deliveries` se você mudar de ideia.
- Meta e Evolution (§3.1).
- Encaminhar mensagem, reagir por esse menu (o menu nasce pronto para receber, mas não é
  este PR).
- Citar nota interna — notas não existem no WhatsApp, não há `reply_to` possível.
- Citação em envio agendado (`scheduled-send-worker`) e no SDR — nenhum dos dois compõe
  resposta a mensagem específica hoje.

## 10. Entrega

| Item | Gate |
|---|---|
| Migration `reply_to jsonb` (exportada para `supabase/migrations/`) | Aplicação em produção **só com OK explícito do dono** |
| `scripts/sync-whatsapp-shared.ts` após mexer em `waha/send.ts` e `waha/parser.ts` | Obrigatório antes do deploy |
| Deploy de `waha-send` e `waha-webhook` | **Só com OK explícito do dono** |
| `bun run build` + `bun run test` | Gate de CI |
| Smoke em produção | Do dono — mergear PR não aplica migration nem faz deploy |

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Casamento de id errado → 100% de citações órfãs, sem erro visível | Teste unitário do sufixo (§8) + validação exata em código; amostra real documentada em §3.3 |
| Query extra no webhook em conversa muito longa | Filtro sempre por `conversation_id`; caminho de índice de expressão pronto se preciso (§6.2) |
| Deploy do `waha-webhook` no horário comercial | Janela combinada com o dono; o webhook é idempotente por `eventKey` e a WAHA reentrega |
| Regressão na área congelada do Atendimento | Nada de cache/realtime/paginação é tocado (§3.5); só os dois mapeadores `row → IMessage` |
| Mensagem citada que o CRM não tem | Snapshot cobre o conteúdo; citação renderiza sem ser clicável |
