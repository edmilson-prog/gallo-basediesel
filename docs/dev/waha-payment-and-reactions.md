# Card de chave PIX e reações no Atendimento (WAHA)

> Implementação: 2026-07-21. Branch `worktree-waha-payment-card-and-reactions`.
> Sucessor direto de `docs/dev/waha-empty-message-bubbles.md` (PR #349), que
> fechou os balões vazios e deixou dois gaps conhecidos: o `interactiveMessage`
> (cobrança PIX) sobrevivendo como "Mensagem não suportada" e `message.reaction`
> nunca assinado. Este documento fecha os dois.
> Spec de design: `docs/superpowers/specs/2026-07-21-waha-payment-card-and-reactions-design.md`.

## Parte 1 — Card de chave PIX

### O que o payload realmente carrega

O botão de pagamento do WhatsApp chega como um `interactiveMessage` cujo
conteúdo útil vive em
`_data.Message.interactiveMessage.InteractiveMessage.NativeFlowMessage.buttons[]`,
no botão `name === "payment_info"`. O campo `buttonParamsJSON` é uma **string
JSON aninhada**:

```json
{
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

**`total_amount.value` é 0 em todos os casos reais observados** (amostra de 4
payloads confirmados, mais a auditoria de ~9.000 envelopes que fundamentou a
spec) — não é uma cobrança com valor, é o compartilhamento da **chave estática**
da empresa. O valor é combinado por texto na própria conversa. Por isso o
parser (`extractWahaPaymentText`, `src/providers/whatsapp/waha/parser.ts`) e o
card (`PaymentBubble.tsx`) **nunca leem `total_amount` nem `order.items`** —
mostrar "R$ 0,00" seria pior do que simplesmente omitir. Se um dia chegar um
envio com valor real, é um campo aditivo, não uma correção.

### Formato canônico (`encodePayment`/`decodePayment`)

`src/providers/whatsapp/contentFormat.ts` é a fonte única do formato — mesmo
módulo que já codifica `location`/`contact`, espelhado byte-a-byte para
`supabase/functions/_shared/whatsapp/` via `scripts/sync-whatsapp-shared.ts`.
O discriminador de render é `messages.media_type = 'payment'`; os dados vivem
em `messages.text`.

```
"<merchant>\n<keyType>:<key>"
```

Duas linhas, sempre nessa ordem. A regra que exige atenção:

> **O separador `:` é emitido SEMPRE que existe uma chave — mesmo com
> `keyType` vazio**, produzindo `":<chave>"`. Nunca `"<chave>"` sozinha.

Isso não é estético: é o que torna o round-trip determinístico. `decodePayment`
localiza o **primeiro** `:` da última linha para separar tipo de chave. Se o
encode pudesse omitir o separador quando `keyType` está vazio, uma chave que
por acaso contivesse um `:` (um formato futuro adjacente a EVP, por exemplo)
seria partida no lugar errado no decode — o `:` da própria chave seria
confundido com o separador de tipo. Emitir o separador incondicionalmente
elimina essa ambiguidade: o decode sempre sabe que "tudo antes do primeiro
`:`" é o tipo, "tudo depois" é a chave, ponto final.

A chave fica na **última linha** pelo mesmo motivo de `encodeContact`: um
`merchant` que carregasse um `:` no nome não pode ser confundido com a linha
de chave. `merchant` passa por `oneLine` (colapsa quebras internas), então
nunca invade a segunda linha por acidente.

```ts
encodePayment({ merchant: "Fernando De Mello Muniz", key: "32990725000160", keyType: "CNPJ" })
// → "Fernando De Mello Muniz\nCNPJ:32990725000160"

encodePayment({ key: "32990725000160" })
// → ":32990725000160"   (sem merchant, sem keyType — separador ainda presente)

encodePayment({})
// → ""   (sem chave, não há o que mostrar — o parser trata como "não é payment")
```

Um último-linha **sem nenhum `:`** (texto que nunca passou por `encodePayment`)
é tolerado no decode e tratado como a chave inteira — degrade defensivo, não
um caminho normal.

### Parser (WAHA)

`extractContent` (`src/providers/whatsapp/waha/parser.ts`) ganha um branch
**depois** de `location` e **antes** de `templateMessage`:

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

`extractWahaPaymentText` nunca lança — é dado de terceiro (`buttonParamsJSON`
é uma string JSON dentro de um payload já solto de tipos), então cada leitura
é guardada em runtime (`isJsonObject`/`asJsonString`) e o `JSON.parse` roda
dentro de `try/catch`. Isso importa porque uma exceção aqui vazaria de
`parseWahaMessageEvent` e faria o webhook descartar a mensagem **inteira**,
não só o card de pagamento.

Como `contentType: "payment"` não é `"text"` nem `"unknown"`,
`isDiscardableEnvelope` já preserva o envelope sem precisar de nenhuma
alteração na política de descarte.

### Frontend

`MessageBubble` roteia `mediaType === "payment"` para `PaymentBubble.tsx` na
mesma posição de `location`/`contact` — **antes** das heurísticas de marcador
textual (`[template]`, `[produto]`), pelo mesmo motivo já documentado ali: um
conteúdo estruturado não pode ser sequestrado por um texto que comece com um
desses prefixos.

`PaymentBubble` mostra recebedor + chave (CNPJ/CPF formatados via
`formatCNPJ`/`formatCPF`; outros tipos — EMAIL/PHONE/EVP — exibidos crus, já
legíveis) e um botão "Copiar chave" que copia a **chave sem pontuação** (o
formato que o app do banco aceita), com toast de confirmação. Sem `merchant`,
mostra só a chave; sem chave, o branch de exibição nem é alcançado
(`decodePayment("").key` é `undefined`).

`payment` entrou nas listas que separam conteúdo estruturado de bytes (mesmo
tratamento de `location`/`contact`): `utils/mediaDownload.ts` (exclusão de
download) e `features/media/hooks/useEnsureInboundMedia.ts`
(`NON_ARCHIVABLE_MEDIA_TYPES`) — não tem `mediaUrl`, não há o que baixar nem
arquivar.

## Parte 2 — Reações

### O contrato do evento `message.reaction`

Documentação oficial do WAHA (engine GOWS/whatsmeow, a que usamos):

```json
{
  "event": "message.reaction",
  "session": "vendas-waha-6ea34d",
  "payload": {
    "fromMe": false,
    "timestamp": 1710481111.853,
    "reaction": { "text": "🙏", "messageId": "<id da mensagem reagida>" }
  }
}
```

- `reaction.messageId` é o `provider_message_id` da mensagem reagida.
- `payload.fromMe` diz quem reagiu — `false` = cliente, `true` = a loja.
- **`reaction.text` vazio (`""`) significa reação REMOVIDA**, não "reação sem
  emoji". É o WhatsApp reportando que a pessoa tocou de novo no emoji para
  tirá-lo. `parseWahaReactionEvent` (`src/providers/whatsapp/waha/reaction.ts`)
  trata qualquer `text` não-string do mesmo jeito (degrade defensivo — dado de
  terceiro).

Reações **pararam de trafegar** em `message`/`message.any` — hoje só existem
neste evento dedicado. Isso explica por que, antes desta mudança, uma reação
de cliente era simplesmente invisível na plataforma: o evento nunca estava
assinado (ver `WAHA_DEFAULT_EVENTS` em
`src/providers/whatsapp/waha/constants.ts`), não é que o parser o descartasse.
No uso brasileiro responder só com 👍 é comum — o atendente concluía que
ficou sem resposta.

### O modelo de dois slots (por que não é tabela)

Nova coluna `messages.reactions jsonb`, nullable, sem índice — nenhuma
consulta filtra por reação (migration
`supabase/migrations/20260721180000_message_reactions.sql`):

```json
{
  "customer": { "emoji": "👍", "at": "2026-07-21T13:10:00Z" },
  "seller":   { "emoji": "❤️", "at": "2026-07-21T13:11:00Z" }
}
```

Uma conversa aqui é sempre 1:1 (cliente ↔ loja) — o WhatsApp permite **uma
reação por pessoa por mensagem**, então existem no máximo **dois** reatores
possíveis em qualquer mensagem: o cliente (ou lead) do outro lado, e "a loja"
como entidade única (não importa qual atendente tocou no emoji — não há
`author_id` de reação). Com o teto travado em 2, uma tabela `message_reactions`
com FK + join no caminho de leitura só compraria complexidade sem comprar
nada: não há paginação, não há "ver todos que reagiram", não há necessidade de
consultar reações independente da mensagem. Um objeto de dois slots dentro da
própria linha resolve com um `UPDATE` e zero joins.

`applyReaction` (engine puro, `src/providers/whatsapp/waha/reaction.ts`) é a
função que decide o próximo estado:

- `fromMe: true` (loja reagiu) escreve no slot `seller`; `fromMe: false`
  escreve no slot `customer`.
- Uma nova reação do mesmo lado **substitui** a anterior — é o comportamento
  nativo do WhatsApp.
- `reaction.emoji` vazio remove o slot daquele lado.
- Objeto sem nenhum slot preenchido vira `null`, nunca `{}` — "sem reação" tem
  uma única representação na coluna.
- Pura e imutável: `current` nunca é mutado, e o lado não tocado é
  deep-copiado para o resultado — o chamador pode segurar o `current` lido do
  banco para comparação sem risco de aliasing.

### Webhook (`waha-webhook/index.ts`)

Branch para `event === "message.reaction"`, antes do guard de evento não
suportado:

1. `parseWahaReactionEvent` — lançou (sem `reaction` ou sem `messageId`) ⇒
   `outcome: "ignored"` com o motivo, mesmo contrato de descarte auditável já
   usado para envelopes sem conteúdo.
2. Localiza a mensagem por `provider_message_id`. Não encontrada ⇒ `ignored`
   (reação a uma mensagem anterior à importação — esperado e benigno, não é
   erro).
3. `UPDATE messages SET reactions = <resultado de applyReaction>`.
4. **Só quando `fromMe === false` e `reaction.emoji` não é vazio** (reação
   genuína do cliente, não remoção): toca a conversa (`last_message_at`) e
   soma 1 a `unread_count`. Uma reação do cliente conta como interação — um
   👍 não pode continuar lendo como "sem resposta".
5. Idempotência: o evento passa pelo mesmo guard de `processed_events` que
   todos os outros — uma reentrega do WAHA não soma `unread_count` duas
   vezes.

Reação da própria loja e remoção de reação **gravam o emoji/estado**, mas
**não** tocam a conversa nem mexem em `unread_count`.

### `awaiting_reply_since` — por que a reação NÃO limpa a coluna

Decisão explícita do dono, 2026-07-21 (revertendo a primeira versão da spec,
que propunha limpar a coluna numa reação do cliente).

`awaiting_reply_since` significa "desde quando o cliente está esperando POR
NÓS" — é a coluna que alimenta os alertas de conversa ociosa (v0.148.0
"Nudge"). Ela é inteiramente governada pelo trigger `sync_conversation_awaiting_reply`
em `messages`, que a limpa **apenas** num outbound genuíno (a loja
efetivamente respondeu com uma mensagem).

Reagir a uma mensagem **não é responder**. Se um cliente pergunta "vocês têm
esse filtro em estoque?" e o vendedor só reage com 👍 sem escrever nada, o
cliente ainda não tem resposta à pergunta real — ele continua esperando. Se a
reação limpasse `awaiting_reply_since`, o alerta de ociosidade seria desarmado
silenciosamente para uma pergunta que ninguém respondeu de fato, e a
conversa desapareceria da fila de acompanhamento sem que o cliente tivesse
sido atendido. Por isso o webhook deixa a coluna inteiramente para o trigger
existente — nenhum código novo nesta feature a toca.

### Por que não foi preciso tocar no realtime congelado

O cache/realtime do Atendimento (`useRealtimeMessages`, query keys, pipeline
de signing) está sob ordem expressa de não alteração — e não precisou ser
tocado.

O motivo: `useRealtimeMessages` já mantém um **fallback** por design (ver o
doc-comment do hook). A assinatura rápida em `messages` (INSERT/UPDATE) não
mapeia a coluna `reactions` em `IMessageRealtimeRow`/`rowToMessage` — ela
nunca carregou esse campo, e continua sem carregar. O que resolve é o segundo
canal: o hook também assina `conversations` e, ao detectar um *touch* na
conversa aberta (`last_message_at` mudando), roda `syncLatest()` com debounce
de 250 ms — que refaz a busca da última página pelo provider normal (que já
lê a coluna `reactions` inteira via `COLUMNS`) e mescla via `applyRealtimeRow`.

Como uma reação genuína do cliente **toca a conversa** (passo 4 do webhook,
acima), a reação chega ao thread aberto por esse caminho já existente, sem
nenhuma linha de código nova no realtime.

**Consequência aceita:** a reação da própria loja **não** toca a conversa
(passo 4 é condicionado a `fromMe === false`), então ela só aparece no thread
aberto ao reabrir a conversa (ou quando outro evento tocar a conversa por
outro motivo). É informação de baixo valor operacional — o vendedor sabe que
reagiu, o que falta comunicar é a reação *do cliente*, e essa chega ao vivo.

### Exibição

O chip de reação vive em `bubbleChrome.tsx` — a chrome compartilhada por
**todo** tipo de balão (texto, imagem, áudio, documento, location, contact,
payment) — em vez de em cada bubble individual. Um `<span>` por slot presente
(`message.reactions.customer` / `.seller`), com `title` indicando quem reagiu
(`CONVERSATION_STRINGS.reactions.fromCustomer`/`fromSeller`). Quando os dois
lados reagiram, os dois chips aparecem lado a lado.

### Assinatura do evento e rollout nas sessões existentes

`message.reaction` entra em `WAHA_DEFAULT_EVENTS`
(`src/providers/whatsapp/waha/constants.ts`) — mas isso só cobre sessões
**criadas depois** desta mudança. Sessões já pareadas foram configuradas com a
lista anterior de eventos e continuam sem reações até serem reconfiguradas —
mesma mecânica de quando `message.ack` foi adicionado (ver
`scripts/waha-resubscribe-message-ack.ts`, o modelo espelhado aqui).

## Ordem de rollout

A ordem importa e não é intercambiável:

1. **Migration primeiro, sempre antes do deploy do frontend.**
   `messages.reactions` entrou em `COLUMNS`
   (`src/providers/data/impl/supabase/messages.ts`) — com a coluna ainda
   inexistente no banco, **toda** leitura de mensagens (não só as com
   reação) quebra, porque o `SELECT` inteiro falha. Foi exatamente o
   incidente do PR #218 (coluna nova referenciada em `COLUMNS` antes da
   migration rodar em produção). Aplicar
   `supabase/migrations/20260721180000_message_reactions.sql` requer OK
   explícito do dono antes do `apply_migration`.

2. **Deploy manual da Edge Function — o workflow do GitHub é no-op.**
   "Edge Functions deploy" no GitHub Actions fica **verde sem deployar nada**
   (secrets de deploy ausentes no repositório). O deploy real é manual:

   ```bash
   npx supabase functions deploy waha-webhook --project-ref njizaasajkdqptlxddqn
   ```

   Sem isso, o branch `message.reaction` do webhook simplesmente não existe
   em produção — o evento continuaria caindo no guard de "evento não
   suportado" mesmo depois da migration.

3. **Re-inscrição das sessões já pareadas.**

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
   bun run scripts/waha-resubscribe-reactions.ts
   ```

   Sem rodar isso, as instâncias que já estavam conectadas antes desta
   mudança continuam sem enviar `message.reaction` ao webhook — só sessões
   pareadas **depois** da mudança pegam o evento automaticamente (via
   `WAHA_DEFAULT_EVENTS` no `createWahaSession`). O script é sequencial e
   best-effort: uma falha numa conta é logada e não interrompe as demais.

4. **Smoke.**
   - Reagir a uma mensagem pelo celular (conta já re-inscrita) e conferir
     que o emoji aparece no thread aberto (ou ao reabrir a conversa).
   - Enviar/receber uma cobrança de chave PIX pelo celular e conferir o card
     — recebedor + chave formatada + botão de copiar funcionando.

## Não feito (deliberado)

- **Valor e status de pagamento.** Não existem no payload — exigiriam
  integração com um PSP, fora do escopo (o WhatsApp só compartilha a chave
  estática).
- **Prévia da Inbox refletindo a reação.** A conversa sobe na lista e fica
  não lida, mas a linha continua mostrando a última mensagem, não "Reagiu 👍
  a: …". Exigiria carregar reações na lista de conversas — território
  protegido pela ordem de congelamento do cache/realtime.
- **`message.revoked` e `message.edited`.** Existem no WAHA e também não são
  assinados — cliente apaga e a mensagem permanece; cliente edita e a
  plataforma mostra a versão antiga. Decisões de produto próprias, fora
  deste escopo.
- **Reação em conversa de grupo.** O parser rejeita grupos/broadcasts antes
  de qualquer processamento de conteúdo ou reação.
- **Backfill de PIX/reações antigas.** O que já chegou antes desta mudança
  fica como estava (placeholder "Mensagem não suportada" para PIX antigos,
  invisível para reações antigas — o evento nunca foi capturado).
