# Relatório — investigação "eco do celular parou" (instância Vendas) no Evolution GO

> **De:** agente com shell no VPS do Evolution GO. **Para:** plataforma GALLO BASE DIESEL.
> **Data:** 2026-07-06. **Referência:** `docs/ECO-CELULAR-INVESTIGACAO-vps-agent.md` (pedido original).
> **Veredito:** causa-raiz **não está no servidor** — evidência forte aponta para o lado da GALLO.
> Investigação 100% read-only, nenhuma ação em produção (nenhum restart/reconnect/logout/patch).

## TL;DR

O evento `SendMessage` **nunca foi emitido** por este servidor para mensagens enviadas direto do
celular vinculado — nem antes, nem durante, nem depois do incidente, em nenhuma instância
verificada (Vendas, e o controle `2c31ae8c`). Ele só existe em **um único lugar do código**
(`pkg/sendMessage/service/send_service.go:2367`), disparado exclusivamente pelo handler da API
`/send/*`, com um `IsFromMe: true` **sintético** montado na mão pelo próprio servidor. O handler
genérico do whatsmeow (`pkg/whatsmeow/service/whatsmeow.go:1030`) que recebe eventos reais do
socket (incluindo mensagens que o vendedor manda pelo celular) rotula **incondicionalmente** como
`"Message"` — não existe nenhum branch `if IsFromMe` que troque esse rótulo para `"SendMessage"`.

Ou seja: a suposição documentada no `parser.ts` da GALLO (SendMessage = eco de celular) parece
estar errada desde a origem — mensagem enviada do celular chega como `Message` comum, com
`Info.IsFromMe: true` **dentro do payload**, no mesmo canal que mensagens inbound. E esse canal
**nunca parou de fluir** para a Vendas (confirmado log a log, minuto a minuto, na janela do
incidente e depois). A entrega HTTP do webhook também nunca falhou (100% HTTP 200, sempre).

**Conclusão prática:** o servidor não tem nada para corrigir aqui — se o eco realmente sumiu do
lado da GALLO a partir de `2026-07-03T12:00 UTC`, o mais provável é uma mudança na lógica de
**consumo** da GALLO (parser/dedup/filtro que espera literalmente `event=="SendMessage"`) por
volta desse horário, não uma regressão no evolution-go.

## 1. Onde e como o servidor detecta/emite `SendMessage` (doc §4.1)

Imagem em produção: `evoapicloud/evolution-go` — rodava `0.7.1` no momento do incidente (upgrade
para `0.7.2` só ocorreu em 2026-07-06, três dias depois, irrelevante para a causa). `docker-compose.yml`
não tem `build:` — imagem stock do Docker Hub, sem fork/patch local da AILA, então diffar contra o
repositório público (`github.com/evolution-foundation/evolution-go`, tag `0.7.1`) é válido.

Grep exaustivo (51 arquivos `.go`) mostra `postMap["event"] = "SendMessage"` em **um único lugar**:

```go
// pkg/sendMessage/service/send_service.go:2367, logo após sucesso de SendMessage(...)
messageInfo := types.MessageInfo{
    MessageSource: types.MessageSource{ Chat: recipient, Sender: *s.clientPointer[instance.Id].Store.ID, IsFromMe: true, IsGroup: isGroup },
    ...
}
postMap := make(map[string]interface{})
postMap["event"] = "SendMessage"
```

Isso só roda dentro do handler da API `/send/*` — monta um `IsFromMe: true` **sintético**, não lê
evento real de socket. O handler genérico (`whatsmeow.go:1030`) é incondicional:

```go
case *events.Message:
    doWebhook = true
    postMap["event"] = "Message"
```

`IsFromMe` aparece só 5 vezes no binário inteiro: 1 gate de auto-leitura (`ReadMessages && !IsFromMe`,
linha 1122 — não afeta o nome do evento) e 4 vezes dentro dos construtores sintéticos do
`send_service.go` (as 4 variantes de `/send/*`). Nenhuma delas toca o handler do socket.

## 2. Logs do VPS, 2026-07-03 10:00–14:00 UTC, instância Vendas (doc §4.3)

Janela coberta pelo arquivo rotacionado `instance-2026-07-03T22-20-20.651.log.gz`
(2026-07-02T10:35 → 2026-07-03T19:20 local, TZ America/Sao_Paulo = UTC-3).

- **Zero** ocorrências de `"Event: SendMessage"` em toda a janela — e no arquivo inteiro (~33h,
  13.100+ `Event: Message`). Esse marcador nunca dispara para eco de celular, nem antes do
  incidente (quando GALLO confirma que "funcionava").
- As 21 ocorrências de `"SendMessage called for number..."` no arquivo inteiro são **todas** via
  API `/send/*`, incluindo uma **exatamente no segundo do início do sintoma**,
  `2026-07-03T09:00:00.896-03:00` (= `12:00:00.896 UTC`), com entrega bem-sucedida logo em seguida.
- Apenas 2 linhas `ERROR` na janela, ambas DNS de download de mídia (`08:44:40`, `09:24:12`),
  sem relação. Zero panic/FATAL/goroutine crash.
- Mensagens do próprio JID (`From: 555599850110@...`) aparecem 87 vezes no arquivo, mas são
  descartadas como `"Message ignored because it's a unknown protocol message"` — **padrão idêntico
  antes e depois** do incidente (07-02T22:21, 07-03T07:16 vs. 07-03T09:48, 10:13) — pré-existente,
  não é regressão causada pelo incidente.

## 3. O servidor tentou o webhook e falhou, ou nunca tentou? (doc §4.3/§5.3)

**Nunca tentou** — porque nunca detectou o evento nesse formato para o caso de eco de celular.
Das 21 tentativas reais de `SendMessage` (todas via API), **100% receberam HTTP 200** da GALLO,
sem exceção — incluindo a tentativa às `12:00:00.896 UTC` (`webhook sent successfully ... status:
200, response: {"status":"ok","outcome":"ignored","traceId":"85c59783-..."}`) e todas as
posteriores no mesmo dia e nos dias seguintes até hoje. Mecanismo de entrega confirmado: POST HTTP
direto por goroutine (`webhookProducer`), **5 tentativas / 30s cada**, sem fila intermediária para
Vendas (`rabbitmq_enable`/`web_socket_enable`/`nats_enable` vazios no banco — só o `webhook` HTTP é
usado). Um panic sem recover ali derrubaria o processo inteiro (afetaria Message/Receipt/Connection
juntos), o que não ocorreu — esses canais fluíram ininterruptos durante toda a janela.

O pipeline global de AMQP (`AMQP_GLOBAL_EVENTS`, RabbitMQ) é uma rota **separada e não relacionada**
ao webhook da GALLO — confirmado irrelevante para este caso.

## 4. Estado de `instance.Events` (assinaturas) para Vendas (doc §4.2)

Valor atual no Postgres (`evogo_users.instances`): `events = MESSAGE,SEND_MESSAGE,READ_RECEIPT,
CONNECTION,HISTORY_SYNC`, `connected = t`, `disconnect_reason` vazio. `SEND_MESSAGE` **está**
presente — valor literal na tabela, não artefato de cache. Não há tabela de auditoria/versionamento
(`track_commit_timestamp = off`), então não é possível provar o valor exato antes de
2026-07-03T12:00 — só que hoje está correto.

Achado complementar: a única reconexão real perto do incidente (`2026-07-04T03:13 UTC`,
`Disconnected` → reconecta em ~3s, sem `PairSuccess`/QR) confirma, no log imediatamente após,
`subscriptions [MESSAGE SEND_MESSAGE READ_RECEIPT CONNECTION HISTORY_SYNC]` intacto — a
reconexão **não zerou** `Events`, consistente com o código público (só `Disconnect()` explícito
zera; nunca aconteceu aqui). Checado também: `whatsmeow_event_buffer` (candidato a "smoking gun")
tem **0 linhas** para o JID da Vendas — sem eventos presos; `runtime_configs` é uma tabela
**global** (sem coluna de instância/JID) — estruturalmente incapaz de mutar uma instância
especificamente.

## 5. Causa raiz

**Não identificada com certeza no lado do VPS — e a convergência de 6 investigações independentes
aponta que ela provavelmente não está aqui.** Descartado, com evidência:

- Bug/regressão no evolution-go emitindo `SendMessage` para eco de celular — esse caminho **nunca
  existiu** nesta versão (nem antes, durante ou depois; nem na instância de controle `2c31ae8c`,
  ativa e monitorada desde 06-27, também com zero ocorrências).
- Falha de entrega/fila de webhook — 100% de sucesso HTTP 200, sempre.
- `instance.Events`/`SEND_MESSAGE` corrompido ou zerado — presente e íntegro; nenhuma reconexão
  o afetou.
- Sessão/dispositivo (relogin, troca de JID, banimento) — nenhum evento de sessão relevante na
  janela; o único ciclo de instabilidade ficou no dia anterior (07-02, resolvido às 19:45 local).
- Panic/crash do processo — descartado, outros eventos da mesma instância fluíram sem interrupção.
- `runtime_configs` como mecanismo de mute por instância — estruturalmente impossível (tabela
  global, sem coluna de instância/JID).

O canal real que carrega o "eco" (`Message` + `Info.IsFromMe:true`) nunca parou de fluir no
servidor. **A causa mais provável está na lógica de consumo da própria GALLO** — parser/dedup/
filtro que talvez espere literalmente `event=="SendMessage"` (que nunca dispara para esse caso) e
que pode ter mudado de comportamento por volta de `2026-07-03T12:00 UTC`. Isso não pode ser
confirmado por nós: exige checar o lado GALLO (deploy da edge function, filtros do `parser.ts`, ou
a tabela de mensagens da GALLO comparando com outros lojistas no mesmo horário).

## 6. Recomendações (opções para a GALLO decidir — nenhuma ação será tomada aqui sem confirmação)

- **A.** Revisar se houve mudança de deploy/config no `parser.ts` ou na edge function
  `whatsapp-webhook` em torno de `2026-07-03T12:00 UTC` (não confundir com o redeploy de
  `07-04T00:42 UTC`, que é **posterior** ao início do sintoma).
- **B.** Se confirmado que `SendMessage` nunca existiu para esse fluxo, ajustar o consumo da GALLO
  para ler o eco via `event=="Message"` com `Info.IsFromMe==true` — é o único canal onde esse dado
  de fato trafega neste servidor.
- **C.** *(requer aprovação explícita antes de executar)* Habilitar temporariamente log verbose/
  debug na instância Vendas para capturar o payload bruto de uma mensagem real enviada pelo
  celular, comparando byte-a-byte com o que a GALLO recebe — não envolve restart nem reconexão.
- **D.** Não recomendamos reiniciar/reconectar a instância Vendas: sessão e `Events` estão
  estáveis e íntegros; não há evidência de que restart mudaria algo, e há risco real a uma conta
  viva sem ganho diagnóstico.

## Apêndice — evidências por frente de investigação

Seis threads independentes cobriram cada uma seção do documento original: identidade do código
(§4.1), mineração de log (§4.3), estado no Postgres (§4.2), eventos de sessão/dispositivo (§4.4),
mecanismo de entrega do webhook (§4.5) e comparação com instância de controle (§4.6). Todas
convergem para a mesma conclusão de forma independente — inclusive a busca por `"Event:
SendMessage"` no log da instância de controle (`2c31ae8c`, ativa desde 06-27) também retorna
**zero** ocorrências, então o próprio marcador nunca existiu nesse fluxo em nenhuma instância
observada neste servidor, não é uma peculiaridade da Vendas.
