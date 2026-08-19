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
    "reaction": { "text": "🙏", "messageId": "true_79111111@c.us_1111111111111111111" }
  }
}
```

- `reaction.messageId` é o `provider_message_id` da mensagem reagida. O
  exemplo oficial acima já mostra o formato composto (`fromMe_chatId_serial`)
  — o mesmo formato que `parseWahaMessageEvent` grava em
  `provider_message_id` para toda mensagem WAHA —, então a busca por
  igualdade (`.eq("provider_message_id", reaction.targetProviderMessageId)`)
  é correta por construção, não uma aposta. Ainda assim, o 1º smoke em
  produção deve confirmar ponta a ponta: reagir a uma mensagem real e
  conferir `outcome: "processed"` em `webhook_deliveries` — um
  `outcome: "ignored"` com motivo `reaction-target-missing` indicaria que o
  formato divergiu na prática.
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
`supabase/migrations/20260723180846_message_reactions.sql`):

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
suportado. Endurecido numa revisão xhigh (23/07, commit `271772dc`) contra
falhas silenciosas, corridas de escrita concorrente e resubscribe cego —
detalhado abaixo.

1. `parseWahaReactionEvent` — lançou (sem `reaction` ou sem `messageId`) ⇒
   `outcome: "ignored"` com o motivo, mesmo contrato de descarte auditável já
   usado para envelopes sem conteúdo.
2. Localiza a mensagem por `provider_message_id`.
   - **Erro no SELECT** (ex.: timeout transitório) ⇒ **503**,
     `outcome: "error"`, **sem** `markProcessed()`. Tratar erro de lookup
     como "alvo ausente" marcaria o evento como processado e a reação seria
     perdida para sempre — a reentrega do WAHA bateria no guard de
     `processed_events` e seria descartada como duplicata antes de a escrita
     ser tentada de novo.
   - **Não encontrada** (sem erro) ⇒ `ignored` + `markProcessed()` (reação a
     uma mensagem anterior à importação — esperado e benigno, não é erro).
3. **Patch otimista** (`patchReactionTarget`): a `UPDATE messages SET
   reactions = <resultado de applyReaction>, webhook_event_ids = [...,
   eventKey]` é condicionada à snapshot exata de `reactions` lida nesta
   chamada (`.eq("reactions", JSON.stringify(snapshot))` ou
   `.is("reactions", null)`). Duas reações concorrentes no mesmo segundo
   (cliente e loja reagindo quase ao mesmo tempo) fariam um simples
   SELECT-então-UPDATE perder um dos dois lados; aqui a segunda escrita casa
   0 linhas em vez de sobrescrever o slot da primeira. Um match de 0 linhas
   sem erro dispara **uma única retentativa**: reconsulta a linha por `id` e
   repete o patch com a snapshot já atualizada (`applyReaction` funde os dois
   lados corretamente). Também é aqui que `eventKey` passa a entrar em
   `webhook_event_ids`, fechando a trilha forense
   mensagem → `webhook_event_ids` → `processed_events`/`webhook_deliveries`
   que `applyWahaAckToMessage` já usa.
   - Qualquer falha real (erro no UPDATE, ou a retentativa também perdendo a
     corrida) ⇒ **503**, `outcome: "error"`, **sem** `markProcessed()` — é o
     não-2xx que faz o WAHA reentregar; um 200 aqui (o bug original) nunca
     seria reprocessado, porque WAHA só reenvia em resposta não-2xx.
4. **Toque da conversa — só para reação genuína do cliente, e best-effort.**
   Quando `fromMe === false` **e** `reaction.emoji` não é vazio (reação real,
   não remoção): chama a RPC atômica `waha_reaction_touch(p_conversation_id,
   p_ts)` (migration `20260723180907_waha_reaction_touch.sql`), que soma 1 a
   `unread_count` e avança `last_message_at` com `greatest(...)` numa única
   `UPDATE` — substitui o antigo SELECT-então-UPDATE em JS, que podia
   sobrescrever um `markRead` concorrente ou regredir `last_message_at` numa
   reentrega. **A RPC não toca conversa fechada** (`resolvida`/`arquivada`) —
   ver "Conversa fechada não é tocada" abaixo. Falha na RPC é só um
   `console.warn`: **não** vira 503 nem impede `markProcessed()` — a reação
   já está gravada na mensagem (passo 3), e um 503 aqui reprocessaria o
   patch inteiro e duplicaria `eventKey` em `webhook_event_ids` numa
   reentrega.
5. Idempotência: o evento passa pelo mesmo guard de `processed_events` que
   todos os outros — uma reentrega do WAHA não soma `unread_count` duas
   vezes (reforçado pela RPC atômica do passo 4).

Reação da própria loja e remoção de reação **gravam o emoji/estado** (passo
3), mas **não** disparam a RPC do passo 4 — não tocam a conversa nem mexem em
`unread_count`.

### Conversa fechada não é tocada

**Decisão do dono, 2026-07-24.** Uma reação numa conversa `resolvida` ou
`arquivada` grava o chip normalmente na mensagem (passo 3 acima), mas **não**
sobe a conversa na lista, **não** marca não lida e **não** mexe em
`last_message_at` — a `WHERE status NOT IN ('resolvida', 'arquivada')` da RPC
`waha_reaction_touch` garante isso no próprio SQL, não numa checagem em JS
que alguém poderia esquecer de replicar.

O raciocínio: um 👍 num atendimento já encerrado é agradecimento, não uma
nova demanda — uma mensagem de texto real ainda reabre a conversa
normalmente (é o trigger de `messages`, não este código, que decide isso).
Tratar a reação como se fosse a mesma coisa teria dois efeitos colaterais
indesejados:

- **KPIs do Painel de Atendimento** que calculam a média de
  `last_message_at - first_in` sobre conversas resolvidas ficariam distorcidos
  por um evento que não é uma nova interação de atendimento.
- **Contador de não lido fantasma**: a conversa reapareceria como "não lida"
  numa lista que a Inbox já filtra como resolvida/arquivada — não lida em algo
  que ninguém vai abrir de novo.

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

### Realtime — o chip chega ao vivo por dois canais

> Esta seção descrevia originalmente por que **não** era preciso tocar no
> cache/realtime congelado do Atendimento. Uma revisão xhigh (23/07) encontrou
> dois defeitos reais nesse mesmo cache, e o dono **autorizou explicitamente**
> (24/07) duas edições cirúrgicas — commit `7fa6936d` — para corrigi-los. Nada
> mais no cache congelado (`useRealtimeMessages`, query keys, pipeline de
> signing) foi tocado; o texto abaixo substitui a versão anterior.

**Achado #1 — o mapper do canal rápido não carregava `reactions`.**
`IMessageRealtimeRow`/`rowToMessage` (`useRealtimeMessages.ts`) não incluíam a
coluna `reactions`: uma reação chegando pelo canal rápido de `messages`
(INSERT/UPDATE) se perdia no mapeamento antes mesmo de tocar o cache, e o chip
nunca aparecia (nem sumia, numa remoção) por esse caminho. Correção: `reactions`
agora é lido direto da linha (`payload.new` sempre carrega a linha completa),
nunca um `undefined` fixo — então o chip passa a chegar ao vivo pelo canal
rápido, **inclusive a reação da própria loja**, que não tem nenhum outro
caminho ao vivo (ver adiante).

**Achado #2 — um UPDATE fora das páginas carregadas virava INSERT.**
`applyRealtimeRow` (`useMessages.ts`) tratava qualquer UPDATE de uma linha
ausente do cache local como se fosse mensagem nova. O branch de reação do
`waha-webhook` é o primeiro *writer* que dá UPDATE numa linha de `messages` de
**qualquer idade** — reagir a uma mensagem de meses atrás injetava esse balão
antigo no topo do thread aberto (fora de contexto) e o duplicava na paginação
seguinte. Correção: `useRealtimeMessages` agora repassa
`payload.eventType === "UPDATE"` como segunda flag para `apply`, e
`applyRealtimeRow` **pula a inserção** quando a flag está ligada e a linha não
está no cache — a mensagem antiga simplesmente não é injetada, em vez de
aparecer no lugar errado e duplicar depois. `syncLatest` (o fallback abaixo)
continua chamando `apply` sem essa flag, então seu próprio caminho de
recuperação de linhas fora de ordem não muda.

**Como os dois canais coexistem agora:**

- **Canal rápido (`messages`, INSERT/UPDATE da conversa aberta)** — com o
  Achado #1 corrigido, já carrega o chip diretamente. Continua best-effort: a
  avaliação por-linha de `can_access_conversation` no autorizador do Realtime
  é o mesmo custo que motivou a otimização de leitura por RPC (ver
  `docs/dev/conversation-access-model.md`) — o canal pode perder o evento.
- **Canal de fallback (`conversations`, touch de `last_message_at`)** — só
  dispara quando a RPC `waha_reaction_touch` toca a conversa, ou seja, só para
  reação **genuína de cliente** numa conversa **aberta**. Ao detectar o touch,
  `syncLatest()` (debounce 250 ms) remescla a última página pelo provider
  normal, que já lê `reactions` inteira via `COLUMNS` — cobre a reação de
  cliente mesmo quando o canal rápido perde o evento.

**Consequência que permanece:** a reação da própria loja e qualquer remoção
não disparam a RPC (passo 4 do webhook), então dependem **só** do canal
rápido, sem a rede de segurança do touch. Com o Achado #1 corrigido elas
chegam ao vivo na maioria dos casos — mas se o canal rápido especificamente
perder esse evento, o chip só aparece ao reabrir a conversa (ou quando outro
evento tocar a conversa por outro motivo), diferente da reação de cliente, que
sempre tem o segundo canal como rede de segurança.

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
**criadas depois** desta mudança **e depois do redeploy da Edge Function que
as cria**. Sessões já pareadas foram configuradas com a lista anterior de
eventos e continuam sem reações até serem reconfiguradas — mesma mecânica de
quando `message.ack` foi adicionado (ver
`scripts/waha-resubscribe-message-ack.ts`, o modelo espelhado aqui).

⚠️ `WAHA_DEFAULT_EVENTS` está compilada no bundle de **duas** Edge Functions,
não só do `waha-webhook`: é `waha-connect` quem chama
`createWahaSession`/`buildWahaConfig` ao parear uma instância nova. Sem
redeployar o `waha-connect` também, toda instância pareada **depois** deste
PR nasce assinando a lista velha de eventos e nunca recebe reações — ver o
passo 2 de "Ordem de rollout" abaixo.

## Ordem de rollout

A ordem importa e não é intercambiável:

1. **Migrations — agora são DUAS, ambas antes do merge do PR** (a Vercel
   auto-deploya o frontend no merge para `main`, e o webhook chama a RPC do
   passo 4 incondicionalmente no branch de reação genuína — nenhuma das duas
   pode ficar pra trás):
   - `supabase/migrations/20260723180846_message_reactions.sql` — a coluna
     `messages.reactions jsonb` (ver "O modelo de dois slots" acima).
   - `supabase/migrations/20260723180907_waha_reaction_touch.sql` — a RPC
     `waha_reaction_touch(p_conversation_id, p_ts)`: soma 1 a `unread_count`
     e avança `last_message_at` com `greatest(...)` numa única `UPDATE`
     atômica (substitui o antigo SELECT-então-UPDATE do webhook), e **não
     toca conversa fechada** (`resolvida`/`arquivada`) — ver "Conversa
     fechada não é tocada" acima.

   `messages.reactions` entrou em `COLUMNS`
   (`src/providers/data/impl/supabase/messages.ts`) — mas o thread do
   Atendimento **não** depende dela: `list()` (~linha 121) lê a página pela
   RPC `conversation_messages`, que não usa `COLUMNS`. Com a coluna ainda
   inexistente no banco, o thread continua abrindo normalmente, só sem as
   reações. O que quebra de verdade são os caminhos que fazem
   `.select(COLUMNS)`/`SELECT` direto na tabela: `listConversationMedia`
   (~linha 333, aba "Mídias" da conversa), `listCustomerMedia` (~linha 351,
   aba "Mídias" da ficha do cliente), `listForAnalytics` (~linha 221,
   leituras analíticas de mensagens) e `send`/`markStatus` (~linhas 161/172
   — caminho de simulação/mock que reconsulta a linha com `COLUMNS` após o
   insert/update; não é o envio real, que passa por `waha-send`). Esses
   caminhos falham com "column does not exist" até a migration rodar — é o
   mesmo padrão do incidente do PR #218 (coluna nova referenciada em
   `COLUMNS` antes da migration em produção), só que contido às
   leitura/escritas que passam por `COLUMNS`, não ao `SELECT` do thread.
   Aplicar as duas migrations requer OK explícito do dono antes do
   `apply_migration` — a ordem entre elas não importa tecnicamente (a RPC só
   depende de `conversations`, já existente), mas ambas precisam estar em
   produção antes do deploy da Edge Function (passo 2).

2. **Deploy manual das Edge Functions — o workflow do GitHub é no-op — e são
   DUAS funções, não uma.**
   "Edge Functions deploy" no GitHub Actions fica **verde sem deployar nada**
   (secrets de deploy ausentes no repositório). O deploy real é manual:

   ```bash
   npx supabase functions deploy waha-webhook --project-ref njizaasajkdqptlxddqn
   npx supabase functions deploy waha-connect --project-ref njizaasajkdqptlxddqn
   ```

   Sem o `waha-webhook`, o branch `message.reaction` simplesmente não existe
   em produção — o evento continuaria caindo no guard de "evento não
   suportado" mesmo depois da migration. Sem o `waha-connect`: a constante
   `WAHA_DEFAULT_EVENTS` (que agora inclui `message.reaction`) também está
   compilada no bundle do `waha-connect` — é ele quem chama
   `createWahaSession`/`buildWahaConfig` ao parear uma instância nova. Sem
   redeployá-lo também, **toda instância pareada depois deste PR** (não só as
   antigas, cobertas pelo passo 3) nasce assinando a lista velha de eventos e
   nunca recebe reações.

3. **Re-inscrição das sessões já pareadas — reinicia TODAS as sessões
   conectadas, não é um script benigno.**

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
   bun run scripts/waha-resubscribe-reactions.ts
   ```

   Sem rodar isso, as instâncias que já estavam conectadas antes desta
   mudança continuam sem enviar `message.reaction` ao webhook — só sessões
   pareadas **depois** da mudança pegam o evento automaticamente (e só se o
   `waha-connect` também foi redeployado, passo 2). O script é sequencial e
   best-effort: uma falha numa conta é logada e não interrompe as demais.

   **Atenção ao que o `PUT` por baixo do capô realmente faz:**
   `updateWahaSessionConfig` (`src/providers/whatsapp/waha/session.ts`,
   ~linhas 82-87) chama `PUT /api/sessions/{name}` da WAHA, que exige a
   config **completa** e, quando a sessão não está `STOPPED`, **para e
   reinicia a sessão** com a nova config (pareamento preservado, sem QR
   novo). O script roda isso **sequencialmente em todas as contas
   conectadas** — na prática é uma janela de reinício de toda a operação
   de WhatsApp, não um ajuste de configuração silencioso. Por isso:
   - rode numa **janela de baixo tráfego** e acompanhe cada sessão voltar a
     `WORKING` antes de considerar o rollout concluído;
   - o script agora consulta **todas** as contas `provider = 'waha'` (sem
     filtro de status na query) e particiona em JS: `connectable` (status
     `connected`, entra no loop de re-inscrição) e `skipped` (qualquer outro
     status). Cada conta pulada é **impressa nominalmente** —
     `SKIPPED: <label> (<id>) status=<status> — re-run this script after the
     instance reconnects` — em vez de simplesmente desaparecer do resumo como
     na primeira versão do script;
   - o resumo final mudou para `Done. ${ok} ok, ${failed} failed, ${skipped}
     skipped.` e o script agora **sai com código 1** sempre que
     `failed + skipped > 0` — uma instância pulada continua na lista antiga
     de eventos até uma nova execução do script contra ela, e o processo de
     rollout falha visivelmente em vez de reportar sucesso incompleto quando
     alguma conta ficou de fora.

4. **Smoke.**
   - Reagir a uma mensagem pelo celular (conta já re-inscrita) com a conversa
     aberta na plataforma e conferir que o emoji aparece **ao vivo** no
     thread — e, em `webhook_deliveries`, que o evento fechou com
     `outcome: "processed"` (um `outcome: "ignored"` com motivo
     `reaction-target-missing` sinalizaria que o formato de `messageId`
     divergiu do documentado — ver "O contrato do evento" acima).
   - Reagir a uma mensagem numa conversa já **resolvida/arquivada** e
     conferir que ela **não** sobe na lista nem fica marcada como não lida —
     o chip ainda deve aparecer ao abrir a conversa manualmente.
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
