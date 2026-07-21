# Card de chave PIX e reações no Atendimento (WAHA)

> Design aprovado pelo dono em 2026-07-21. Sucessor direto do PR #349
> (`docs/dev/waha-empty-message-bubbles.md`), que fechou os balões vazios.

## Contexto

O PR #349 eliminou os balões vazios do Atendimento tratando cinco tipos de
envelope WAHA. Dois gaps ficaram conhecidos e deliberadamente adiados:

1. **`interactiveMessage`** — sobrevive hoje como "Mensagem não suportada".
   São chaves PIX que a loja envia pelo celular.
2. **Eventos não assinados** — descobertos ao auditar todos os tipos que
   chegam. `message.reaction` não está em `WAHA_DEFAULT_EVENTS`, então uma
   reação do cliente é **invisível** na plataforma.

O segundo é o mais relevante operacionalmente: no uso brasileiro é comum
responder só com 👍, e hoje o atendente conclui que ficou sem resposta.

### Auditoria que fundamenta o escopo

Todos os tipos observados em ~9.000 payloads reais (`webhook_deliveries`,
janela de 7 dias), cruzados com a linha gravada em `messages`:

| Tipo | Payloads | Estado |
| --- | --- | --- |
| `conversation`, `extendedTextMessage` | 5.610 | ✅ texto preservado |
| `audioMessage`, `imageMessage`, `videoMessage`, `documentMessage`, `documentWithCaptionMessage` | 3.301 | ✅ mídia + filename preservados |
| `contactMessage` | 47 | ✅ vCard preservado |
| `templateButtonReplyMessage` | 1 | ✅ texto preservado |
| `stickerMessage` | 37 | ⚠️ grava `image` (cosmético — ver Fora de escopo) |
| `albumMessage`, `locationMessage`, `templateMessage`, `placeholderMessage` | 65 | ✅ corrigidos no #349 |
| **`interactiveMessage`** | **4** | **Parte 1 desta spec** |

Verificação específica: `documentWithCaptionMessage` tem **0 legendas
perdidas** (nenhum dos 66 carregava caption — os documentos foram enviados
sem texto mesmo).

---

## Parte 1 — Card de chave PIX

### O que o payload realmente carrega

Confirmado nos 4 payloads reais. O conteúdo vive em
`_data.Message.interactiveMessage.InteractiveMessage.NativeFlowMessage.buttons[]`,
no botão `name === "payment_info"`, cujo `buttonParamsJSON` é uma **string
JSON aninhada**:

```json
{
  "reference_id": "4VOKY6KDIPJ",
  "payment_settings": [{
    "type": "pix_static_code",
    "pix_static_code": {
      "merchant_name": "Fernando De Mello Muniz",
      "key": "32990725000160",
      "key_type": "CNPJ"
    }
  }],
  "total_amount": { "value": 0, "offset": 1000 },
  "order": { "status": "payment_requested", "items": [{ "name": "", "quantity": 0 }] }
}
```

**`total_amount.value` é 0 em todos os casos, e `items[].name` é vazio.** Não é
uma cobrança com valor: é o compartilhamento da chave estática da empresa. O
dono confirmou que o valor é combinado por texto na conversa.

Decisão: **não ler `total_amount` nem `order.items`.** Exibir "R$ 0,00" seria
pior que omitir. Se um dia chegar um envio com valor real, o campo é aditivo.

### Codificação

Segue o padrão de `location`/`contact`: os dados vivem em `messages.text` e
`media_type` é só discriminador de render. `contentFormat.ts` — fonte única
desse formato, espelhada para as Edge Functions — ganha:

```ts
export interface IPaymentContent {
  merchant?: string;
  key?: string;
  keyType?: string;   // CNPJ | CPF | EMAIL | PHONE | EVP
}

export function encodePayment(content: IPaymentContent): string;
export function decodePayment(text: string): IPaymentContent;
```

Formato: `"<merchant>\n<keyType>:<key>"` — duas linhas, a chave sempre na
última, com o tipo prefixado. Mesma disciplina posicional de `encodeContact`.

- `merchant` passa por `oneLine` (colapsa quebras), então nunca invade a 2ª linha.
- O decode faz split no **primeiro** `:` da última linha — chaves do tipo EMAIL
  não contêm `:`, e chaves EVP são UUID; nenhum tipo real quebra a regra.
- Campos ausentes são omitidos; `encodePayment({})` retorna `""`, que o parser
  trata como "não é payment" (cai no fluxo normal).

### Parser

`extractContent` (`src/providers/whatsapp/waha/parser.ts`) ganha um branch
**antes** do fallback de texto e **depois** de vCards (mesma precedência
defensiva já adotada para mídia):

```
1. mídia com url            (inalterado)
2. reply de status          (inalterado)
3. vCards → contact         (inalterado)
4. mídia sem url            (inalterado)
5. location                 (inalterado)
6. PAGAMENTO  ← novo
7. templateMessage          (inalterado)
8. body → text              (inalterado)
```

`extractWahaPaymentText(payload)`:
- Navega até `NativeFlowMessage.buttons`, acha `name === "payment_info"`.
- `JSON.parse(buttonParamsJSON)` dentro de **try/catch** — é dado de terceiro;
  JSON malformado retorna `undefined` e o envelope segue o fluxo normal.
- Lê `payment_settings[0].pix_static_code`.
- Sem `key` utilizável, retorna `undefined`.

Interação com a política de descarte: `contentType: "payment"` não é
`"text"` nem `"unknown"`, então `isDiscardableEnvelope` já o preserva sem
alteração.

### Tipos

- `MessageMediaType` (`src/shared/types/conversation.ts`) += `"payment"`
- `MEDIA_DISCRIMINATOR_TYPES` (`src/providers/whatsapp/types.ts`) += `"payment"`

O doc-comment de `MessageMediaType` já explica que location/contact são
estruturados sem `mediaUrl`; `payment` entra na mesma frase.

### Frontend

`PaymentBubble.tsx`, espelhando a estrutura do `LocationBubble` (ícone em
quadrado 10×10, label de 11px, valor, ação):

```
┌─────────────────────────────────┐
│ ▣   Chave PIX                   │
│     Fernando De Mello Muniz     │
│     32.990.725/0001-60  [copiar]│
└─────────────────────────────────┘
```

- CNPJ/CPF formatados com `formatCNPJ`/`formatCPF` de `@/shared/utils/format`.
  Outros tipos de chave são exibidos crus.
- O botão copia a **chave sem pontuação** — é o formato que o app do banco
  aceita. Usa `navigator.clipboard` com toast de confirmação (sonner).
- Sem `merchant`, mostra só a chave; sem chave, o branch nem é alcançado.

Roteamento: `MessageBubble` trata `mediaType === "payment"` junto de
location/contact, **antes** das heurísticas de marcador textual — pelo motivo
já documentado ali (um conteúdo cujo texto comece com `[produto]` não pode
sequestrar o bubble).

Prévia da Inbox: `getMessagePreview` decodifica o recebedor, como já faz para
contact/location — `"💳 Fernando De Mello Muniz"`, com fallback
`INBOX_STRINGS.mediaPreview.payment = "💳 Chave PIX"`.

### Exclusões de mídia binária

`payment` não tem `mediaUrl`, então precisa entrar nas listas que separam
conteúdo estruturado de bytes:

| Arquivo | Mudança |
| --- | --- |
| `utils/mediaDownload.ts` | entra no `Exclude<>` e no guard de tipo |
| `features/media/hooks/useEnsureInboundMedia.ts` | entra em `NON_ARCHIVABLE_MEDIA_TYPES` |
| `engine/conversationMedia.ts` | **nada** — já retorna cedo sem `mediaUrl` |

---

## Parte 2 — Reações

### Contrato do evento

Documentação oficial do WAHA, engine **GOWS** (o que usamos) suportado:

```json
{
  "event": "message.reaction",
  "session": "vendas-waha-6ea34d",
  "payload": {
    "id": "...",
    "fromMe": false,
    "timestamp": 1710481111.853,
    "reaction": { "text": "🙏", "messageId": "<id da mensagem reagida>" }
  }
}
```

- `reaction.messageId` aponta para a mensagem reagida (nosso
  `messages.provider_message_id`).
- `reaction.text` **vazio significa reação removida**.
- `payload.fromMe` diz quem reagiu: `false` = cliente, `true` = a loja.

A doc registra que reações deixaram de trafegar em `message`/`message.any` e
hoje existem **só** no evento dedicado — o que explica termos medido zero
ocorrências: o evento nunca foi assinado.

### Assinatura

`message.reaction` entra em `WAHA_DEFAULT_EVENTS`
(`src/providers/whatsapp/waha/constants.ts`).

⚠️ Isso cobre apenas sessões **novas**. As sessões já pareadas foram criadas
com os 4 eventos anteriores e precisam de re-inscrição via a action
`updateConfig` do `waha-connect` — exatamente o que aconteceu quando
`message.ack` foi adicionado. O script
`scripts/waha-resubscribe-message-ack.ts` é o modelo a espelhar.

### Persistência

Nova coluna `messages.reactions jsonb` (nullable). Em conversa 1:1 existem no
máximo dois reatores, então a forma é um objeto de dois slots — sem tabela
nova, sem join no caminho quente de leitura:

```json
{
  "customer": { "emoji": "👍", "at": "2026-07-21T13:10:00Z" },
  "seller":   { "emoji": "❤️", "at": "2026-07-21T13:11:00Z" }
}
```

Tipo correspondente em `src/shared/types/conversation.ts`, exposto como
`IMessage.reactions?: IMessageReactions`:

```ts
export interface IMessageReaction {
  emoji: string;
  at: ISO8601;
}
/** Slots fixos: conversa 1:1 tem no máximo dois reatores. */
export interface IMessageReactions {
  customer?: IMessageReaction;
  seller?: IMessageReaction;
}
```

- `fromMe` decide o slot; uma nova reação do mesmo lado **substitui** a anterior
  (é o comportamento do WhatsApp: uma reação por pessoa por mensagem).
- `reaction.text` vazio **remove** o slot. Objeto sem nenhum slot vira `NULL`
  na coluna (não `{}`), para que "sem reação" tenha uma única representação.
- `"customer"` nomeia o outro lado da conversa, seja ele cliente ou lead.

### Webhook

`waha-webhook/index.ts` ganha um branch para `event === "message.reaction"`,
antes do guard de evento não suportado.

Engine puro testável em `src/providers/whatsapp/waha/reaction.ts`:

```ts
export interface IWahaReaction {
  targetProviderMessageId: string;
  emoji: string;        // "" = remoção
  fromMe: boolean;
  timestamp: string;    // ISO
}
/** Lança quando o envelope não tem `reaction.messageId` — mesmo contrato de
 *  erro que `parseWahaMessageEvent`, que o webhook já converte em
 *  `outcome: "ignored"` + `errorMessage`. */
export function parseWahaReactionEvent(rawPayload: unknown): IWahaReaction;

export function applyReaction(
  current: IMessageReactions | null,
  reaction: IWahaReaction,
): IMessageReactions | null;
```

`applyReaction` é a função pura que decide o novo estado do jsonb (aplicar,
substituir, remover, colapsar para null) — testada isoladamente.

Fluxo no webhook:
1. Parseia. Lançou ⇒ `outcome: "ignored"` com o motivo (mesmo contrato de
   descarte auditável já usado para envelopes sem conteúdo).
2. Localiza a mensagem por `provider_message_id` **dentro da conta/sessão**.
   Não encontrada ⇒ `ignored` com motivo (reação a mensagem anterior à
   importação — esperado e benigno).
3. `UPDATE messages SET reactions = <novo>`.
4. Se `fromMe === false` **e** não é remoção: toca a conversa
   (`last_message_at`) e soma 1 a `unread_count` — conta como interação do
   cliente.

   ⚠️ `awaiting_reply_since` **NÃO** é limpo. Essa coluna significa "desde
   quando o cliente espera POR NÓS" e é governada pelo trigger em `messages`,
   que só a limpa num outbound genuíno. Reagir não é a loja responder — o
   cliente segue esperando —, então limpá-la desarmaria silenciosamente os
   alertas de conversa ociosa (v0.148.0 "Nudge") para uma pergunta que ninguém
   respondeu. Decisão do dono, 2026-07-21, revertendo a versão inicial desta
   spec.

Idempotência: o evento entra no mesmo guard de `processed_events` que os
demais, então uma reentrega do WAHA não soma `unread_count` duas vezes.

Reação da própria loja (`fromMe: true`) grava o emoji mas **não** toca a
conversa nem marca não lida.

### Exibição

O chip vai no **`bubbleChrome.tsx`**, a chrome compartilhada — assim aparece
automaticamente em todo tipo de balão (texto, imagem, áudio, documento,
location, contact, payment) sem tocar em nenhum bubble individual:

```
  ┌──────────────────────────┐
  │ Bom dia, tenho esse item │
  │                   10:10 ✓✓│
  └──────────────────────────┘
       ┌────┐
       │ 👍 │
       └────┘
```

Alinhado ao lado do balão (direita para outbound, esquerda para inbound).
Dois emojis quando ambos reagiram. `title` no elemento indica quem reagiu.

### Realtime — e por que NÃO tocamos no cache congelado

O cache/realtime do Atendimento está sob ordem expressa de não alteração
(`useRealtimeMessages`, query keys, pipeline de signing).

**Não é preciso mexer.** O hook já mantém um fallback: ao detectar um *touch*
na conversa pelo canal de `conversations`, ele roda `syncLatest()` (debounce de
250 ms), que remescla a última página de mensagens pelo provider normal. Como a
reação do cliente toca a conversa (passo 4 acima), a reação chega ao thread
aberto por esse caminho já existente.

Consequência aceita: reação da **própria loja** não toca a conversa, logo só
aparece ao reabrir/refetch. É informação de baixo valor operacional.

O que precisa mudar são leituras, não o cache:
- `COLUMNS` do `impl/supabase/messages.ts` += `reactions`
- `rowToMessage` mapeia para `IMessage.reactions`.

**A RPC `conversation_messages` NÃO precisa ser recriada.** Ela é
`RETURNS SETOF messages` com `select m.*` — o rowtype acompanha a tabela, então
uma coluna nova passa a ser retornada automaticamente. (Verificado lendo a
definição atual da função em produção.)

### Migration

Uma migration, versionada em `supabase/migrations/` e espelhada no Git no
mesmo PR:

```sql
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reactions jsonb;
```

Nullable, sem default: `NULL` é "sem reação". Sem backfill, sem índice — não há
consulta que filtre por reação.

⚠️ **A migration vai antes do deploy do frontend.** Adicionar `reactions` a
`COLUMNS` sem a coluna existir quebra toda leitura de mensagens — foi
exatamente o incidente do PR #218.

⚠️ Após o `ALTER TABLE`, o PostgREST precisa recarregar o schema
(`NOTIFY pgrst, 'reload schema'`) para expor a coluna nova na API.

Sem mudança de RLS: a coluna herda as policies da tabela, e a RPC continua
`SECURITY DEFINER` gated-once.

---

## Testes

Engines puros com Vitest, co-localizados:

| Alvo | Casos |
| --- | --- |
| `encodePayment`/`decodePayment` | roundtrip; chave com `:`; merchant multi-linha; campos ausentes; string vazia |
| `extractWahaPaymentText` | os 4 payloads reais; `buttonParamsJSON` malformado; botão ausente; `payment_settings` vazio |
| `parseWahaReactionEvent` | payload da doc; sem `reaction`; sem `messageId` |
| `applyReaction` | aplicar; substituir do mesmo lado; os dois lados; remover um; remover o último (⇒ null) |

Sem teste de componente (o projeto não tem infra para isso em `bubbles/`); a
lógica fica nos engines e os bubbles permanecem finos.

---

## Fora de escopo

- **Valor e status de pagamento.** Não existem no payload; exigiria integração
  com PSP.
- **Prévia da Inbox refletindo a reação.** A conversa sobe e fica não lida, mas
  a linha continua mostrando a última mensagem. Fazer "Reagiu 👍 a: …" exigiria
  carregar reações na lista de conversas — território protegido pela ordem de
  congelamento. Follow-up.
- **`message.revoked` e `message.edited`.** Existem e também não são assinados
  (cliente apaga e a mensagem permanece; cliente edita e vemos a versão
  antiga). São decisões de produto próprias — projeto separado.
- **`stickerMessage` gravar `"sticker"` em vez de `"image"`.** Cosmético: o
  `ImageBubble` já trata os dois igual e o usuário vê o sticker normalmente.
- **Backfill dos 4 PIX antigos.** Payloads ainda existem em
  `webhook_deliveries`, mas são 4 registros que hoje aparecem como placeholder.
- **Reação em conversa de grupo.** O parser rejeita grupos antes de chegar aqui.

---

## Ordem de rollout

1. **Parte 1 (PIX)** — sem migration, sem evento novo. Commit próprio.
2. **Parte 2 (Reações)** — commit próprio.
3. Migration aplicada em produção **antes** do deploy (OK explícito do dono).
4. Deploy de `waha-webhook`. ⚠️ O workflow "Edge Functions deploy" do GitHub é
   **no-op** (secrets ausentes) — o deploy é manual:
   `npx supabase functions deploy waha-webhook --project-ref njizaasajkdqptlxddqn`
5. Re-inscrição das sessões WAHA existentes (`updateConfig`) — sem isso,
   reações continuam não chegando nas instâncias já pareadas.
6. Smoke: reagir a uma mensagem pelo celular e confirmar o emoji no thread.

Um PR só, commits separados: se a Parte 2 complicar na revisão, a Parte 1 já
está pronta e independente.
