# Balões vazios no Atendimento — envelopes WAHA sem conteúdo

> Investigação e correção: 2026-07-21. Branch `worktree-fix-waha-empty-message-bubbles`.

## Sintoma

No thread de uma conversa aparecia um balão sem nada dentro — só o horário e o
ícone de status. O caso que originou a investigação (conversa
`0400c3dd-486c-4545-a534-cbf496e6baff`, VANIO BILK, 21/07 10:10) tinha o balão
vazio **entre** duas mídias enviadas pelo vendedor.

## Causa raiz

`extractContent` (`src/providers/whatsapp/waha/parser.ts`) terminava num
fallback que engolia tudo:

```ts
return { contentType: "text", text: payload.body ?? "" };
```

Qualquer envelope sem `media.url` e sem `vCards[0]` virava "mensagem de texto
vazia". E **nenhum dos 11 pontos de descarte** do `waha-webhook` olhava para o
conteúdo — bastava ter `id` e telefone resolvível para virar linha em
`messages`.

O balão do caso original era um **`albumMessage`**: o cabeçalho que o WhatsApp
envia antes das mídias de um envio múltiplo, carregando apenas a contagem
esperada.

```json
"albumMessage": { "expectedImageCount": 1, "expectedVideoCount": 1 }
```

Exatamente a foto + o vídeo que apareciam em volta dele.

## Dimensão (medida em 21/07)

| Métrica | Valor |
| --- | --- |
| Mensagens sem texto e sem mídia (`provider='waha'`) | **20.733** — 11,6% de todas as mensagens |
| Conversas afetadas | **814** — 24,3% do total |
| Criadas no HistorySync de 14/07 | 18.592 |
| Ritmo em runtime | ~5–8/dia |

O legado é **irrecuperável**: só 54 das 20.733 ainda têm payload bruto em
`webhook_deliveries` (a tabela só começou a reter em 14/07 23:43, depois do
import). Das legadas, 13.192 não têm nenhuma mídia por perto — ou seja, são
ruído de protocolo, não mídia perdida.

## Os cinco gaps

Classificação das vazias com payload retido (48h):

| Tipo whatsmeow | Qtd | Natureza |
| --- | --- | --- |
| `albumMessage` | 14 (67%) | Metadado — nunca deveria virar mensagem |
| `templateMessage` | 4 | **Perda de conteúdo real** |
| `imageMessage` c/ erro | 2 | Download falhou upstream (403 não-retentável) |
| `interactiveMessage` | 1 | Só botões de pedido/pagamento |

Mais um quinto descoberto por leitura de código e confirmado em dados:
`payload.location` **nunca era lido** pelo parser WAHA (o de Evolution lê) — 14
payloads reais, todos gravados como balão vazio.

### templateMessage — o mais sério

É texto de negócio legítimo que chegou e sumiu. O `body` do envelope vem `null`
e o texto vive **só** dentro de `_data`, em três formas distintas conforme o
broadcast foi montado:

1. `Format.InteractiveMessageTemplate.body.text`
2. `Format.HydratedFourRowTemplate.hydratedContentText`
3. `hydratedTemplate.hydratedContentText`

## Dois caminhos de escrita, não um

Descoberto na revisão, e é o ponto mais importante do diagnóstico: **o webhook
não foi o que produziu a maior parte das linhas**.

| Caminho | Linhas vazias | Como identificar |
| --- | --- | --- |
| Importador de histórico | **20.620 (99,4%)** | `webhook_event_ids` vazio |
| Webhook ao vivo | ~115 | tem `webhook_event_ids` |

`normalizeWahaHistoryRecord` (`src/providers/whatsapp/import/waha-history-core.ts`)
compartilha o `extractContent` do parser mas tinha o **próprio filtro, mais
fraco**:

```ts
if (content.contentType === "unknown" && !content.text) return null;
```

Um envelope sem conteúdo produz `{contentType: "text", text: ""}` — e
`"text" !== "unknown"`, então passava direto. Corrigir só o parser deixaria
intocado o caminho que gera ~18 mil linhas por execução, e a Edge Function
`whatsapp-import-history` continua viva (a migração WAHA ainda tem instância
pendente). Por isso a política de descarte virou **função compartilhada**
(`isDiscardableEnvelope`), usada pelos dois pontos de entrada.

## A correção (duas camadas)

### Camada 1 — parser (raiz)

`extractContent` ganhou, nesta ordem:

1. mídia com `url` (inalterado)
2. reply de status com mídia (inalterado)
3. **mídia cujo download o WAHA não conseguiu** — `hasMedia:true` com
   `mimetype` mas sem `url`. Preserva o tipo para o thread mostrar
   "indisponível" em vez de um balão branco.
4. `vCards[0]` → contato (inalterado)
5. **location** → texto canônico via `encodeLocation`
6. **templateMessage** → texto recuperado dos três caminhos
7. `body` → texto (inalterado)

### A política de descarte é estreita de propósito

`isDiscardableEnvelope` só descarta tipos **comprovadamente** de protocolo:

```ts
const PROTOCOL_ONLY_KINDS = new Set([
  "albumMessage", "placeholderMessage", "protocolMessage",
  "senderKeyDistributionMessage",
]);
```

Qualquer outro tipo que chegue vazio é **preservado** como linha content-free e
aparece no thread como "Mensagem não suportada". A primeira versão desta
correção fazia o oposto — descartava tudo que resolvesse vazio — e a revisão
mostrou o custo: os 4 `interactiveMessage` da amostra eram **cobranças PIX que a
loja enviou pelo celular**. Sem texto legível, mas o vendedor precisa ver que
uma cobrança saiu naquele momento. Sumir é pior que um placeholder.

O mesmo raciocínio protege respostas de botão (`templateButtonReplyMessage` — o
cliente tocando em "Sim, quero orçamento") e enquetes, que são conteúdo genuíno
do cliente.

Validação contra 12.965 payloads reais: os dois tipos descartados
(`albumMessage` 48, `placeholderMessage` 2) têm **zero** ocorrências com body,
mídia, vCard ou location. Nenhum descarte perde conteúdo.

Um envelope com **ad referral** (CTWA) também é isento do descarte mesmo sem
body: o referral É conteúdo — carrega a atribuição de campanha que dá origem à
conversa, e é lido depois do parser.

O motivo do descarte nomeia o tipo whatsmeow (`wahaMessageKind`), então um tipo
novo do WhatsApp aparece no log como `envelope sem conteúdo (novoTipoMessage)`.
O `waha-webhook` já trata o throw do parser como `outcome: "ignored"` +
`errorMessage`, então o descarte fica **auditável** sem escrever no banco.

> ⚠️ Coordenadas do WAHA chegam como **string** (`latitude: "-27.393307"`).
> `toCoord` rejeita a string vazia explicitamente porque `Number("")` é `0` —
> sem isso, um parse falho viraria uma coordenada no Golfo da Guiné.

### Camada 2 — frontend (rede de segurança)

O parser não conserta as ~20,7 mil linhas que já existem. `MessageBubble` passa
a rotear mensagens sem conteúdo para `UnsupportedBubble`
(`isContentFreeMessage`, engine puro testado) em vez de `TextBubble` — que
preenchia texto vazio com um espaço justamente para não colapsar a altura,
produzindo o balão branco.

O placeholder **mantém a chrome** (lado, horário, status): algo foi trocado
naquele instante, e ocultar a linha deixaria um buraco inexplicado no thread.

Uma mídia sem legenda **não** é content-free — seu balão renderiza a mídia (ou o
aviso de indisponível). Compartilhamentos estruturados (location/contact) sempre
carregam os dados codificados em `text`.

`getMessagePreview` (lista da Inbox) usa o mesmo engine: sem isso, a conversa
cuja **última** mensagem fosse content-free continuava com a prévia em branco —
o mesmo sintoma na outra superfície.

## Deploy

O parser é espelhado em `supabase/functions/_shared/whatsapp/waha/parser.ts`
(via `scripts/sync-whatsapp-shared.ts`). **Mudou `src/providers/whatsapp/` ⇒
rodar o sync e redeployar** a Edge Function:

```bash
npx supabase functions deploy waha-webhook --project-ref njizaasajkdqptlxddqn
```

Sem o deploy, só a camada 2 (frontend) tem efeito: os balões legados viram
placeholder, mas o banco continua ganhando ~5–8 linhas vazias por dia.

## Não feito (deliberado)

- **Limpeza das 20.733 linhas legadas.** A camada 2 resolve o sintoma visual sem
  tocar em produção. Um `DELETE` exigiria backup e aprovação explícita.
- **Backfill das 54 recuperáveis.** Volume irrelevante perto do total.
- ~~**Renderizar a cobrança PIX do `interactiveMessage`.**~~ Feito em
  2026-07-21 — ver `docs/dev/waha-payment-and-reactions.md` (card
  `PaymentBubble.tsx` com recebedor + chave formatada + botão "Copiar
  chave"; valor/status seguem fora de escopo, o WhatsApp só compartilha a
  chave estática).
- **Texto secundário dos templates** (`Title`, `hydratedButtons`,
  `hydratedFooterText`). Não causa balão vazio; só deixa a prévia mais pobre.

## Efeito colateral conhecido

Linhas novas marcadas com `media_download_status: 'failed'` casam com o filtro
de `listMissingMedia` (`whatsapp-media-backfill`). Para mídia que o próprio WAHA
não conseguiu baixar (403 expirado) o backfill vai tentar e marcar `'expired'` —
trabalho ocioso, não defeito. Vale saber antes de rodar o backfill.
