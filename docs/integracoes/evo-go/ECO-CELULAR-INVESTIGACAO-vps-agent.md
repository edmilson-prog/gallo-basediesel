# Investigação: eco do celular parou de chegar na plataforma (instância "Vendas")

> **Para:** o agente com shell no VPS do Evolution GO (whatsmeow).
> **De:** plataforma GALLO. Este NÃO é um pedido de fix — é um pedido de **investigação e relatório**. Não altere nada em produção (não reinicie instâncias, não faça deploy, não edite config) sem reportar antes e receber OK.
> **Pré-requisito de contexto:** você (ou uma sessão anterior sua) já leu o código-fonte do evo-go para o bug de `docs/integracoes/evo-go/AVATAR-DEFINITIVE-FIX-vps-agent.md` e para o download de mídia (`pkg/message/handler`/`service`) — mesmo padrão de investigação vale aqui: **valide contra o código-fonte real e os logs do processo, não contra o Swagger.**

---

## 1. O sintoma (confirmado do lado da GALLO)

O vendedor da loja/instância **"Vendas"** manda mensagens **diretamente pelo celular** (não pelo app da plataforma). Essas mensagens deveriam ser espelhadas ("eco") na plataforma GALLO como uma mensagem de saída, para o time ver o histórico completo da conversa. Isso funcionava.

**Desde `2026-07-03 12:00:00 UTC`, nenhuma mensagem enviada pelo celular chegou à plataforma.** O vendedor confirmou ter mandado várias mensagens reais pelo celular nesse período que simplesmente não aparecem.

Confirmado por consulta direta ao banco da GALLO (Postgres/Supabase, tabela `messages`, filtro `direction='out' AND author_id IS NULL` = assinatura do eco): zero linhas para a instância Vendas desde aquele horário. Antes disso, o eco funcionava normalmente (múltiplas linhas por dia).

**Importante — o que NÃO quebrou, no mesmo período:**
- Mensagens **recebidas** de clientes (inbound) continuaram chegando normalmente na mesma instância.
- Confirmações de entrega/leitura (`Receipt`) continuaram chegando.
- Eventos de conexão (`Connection`) continuaram chegando.

Ou seja: **não é uma queda geral do webhook, da instância, nem da rede** — é especificamente a categoria "mensagem enviada pelo próprio número" que parou, só para esta instância.

---

## 2. O que a GALLO já investigou do próprio lado (não precisa repetir)

- Toda a pipeline de recebimento do lado GALLO (edge function `whatsapp-webhook`, parser, dedup, criação de mensagem) foi auditada e está saudável — confirmado porque a categoria `Message` (inbound) continuou fluindo perfeitamente pelo mesmo código no mesmo período.
- A GALLO assina, na conexão da instância, a lista de eventos `["MESSAGE", "SEND_MESSAGE", "READ_RECEIPT", "CONNECTION", "HISTORY_SYNC"]` (campo `subscribe` enviado no `POST /instance/connect`).
- Um redeploy da edge function da GALLO ocorreu em `2026-07-04 00:42 UTC` e a primeira reconexão da instância Vendas após o início do problema ocorreu em `2026-07-04 03:13 UTC` — **ambos são POSTERIORES ao início do sintoma** (`2026-07-03 12:00:00 UTC`). Ou seja, nenhum dos dois pode ser a causa raiz de por que o problema **começou**, ainda que possam ser relevantes para algo mais.
- Lemos o código público do `evolution-foundation/evolution-go` (branch `main`, baixado via GitHub API) e encontramos uma informação que **contradiz** um comentário no nosso próprio código (`src/providers/whatsapp/evolution-go/parser.ts`), que assumia — com base em observação empírica de payloads capturados em 2026-06-30 — que o evento `SendMessage` é emitido especificamente para mensagens enviadas pelo **celular/companion**, e que envios via API **não** emitem esse evento.

  No código público que lemos, é o **oposto**: `postMap["event"] = "SendMessage"` é setado dentro de `pkg/sendMessage/service/send_service.go` (por volta da linha 2805), no fluxo de **envio via API** (`/send/*`), logo após `SendMessage(...)` do cliente ter sucesso. O handler genérico do whatsmeow para mensagens recebidas via socket (`*events.Message`, em `pkg/whatsmeow/service/whatsmeow.go`) sempre rotula o evento como `"Message"` — nunca vimos ali uma ramificação que rotule como `"SendMessage"` com base em `Info.IsFromMe`.

  Isso pode significar: (a) o servidor rodando no VPS é uma versão/fork diferente da que está em `main` no GitHub público, com lógica própria para detectar envio pelo celular; ou (b) existe algum outro listener/mecanismo (talvez direto na lib `whatsmeow` do Go, não no wrapper evolution-go) que não conseguimos localizar só lendo o repositório público; ou (c) a suposição documentada no nosso próprio código já estava errada desde o início e o eco "funcionava" por um caminho que não entendemos completamente. **Não temos como resolver isso sem acesso ao código/binário real rodando no VPS — daí este pedido.**

  Também vimos que a lista de eventos assinados (`instance.Events`, persistida no banco do próprio servidor Go) só é **zerada** por uma chamada explícita de `Disconnect()` — uma reconexão normal (`Reconnect()`/`ReconnectClient()`) recarrega `Events` do banco corretamente. Isso enfraquece a hipótese de "a reconexão apagou a assinatura", pelo menos no código público.

---

## 3. A pergunta central que precisa da sua investigação

**O que, especificamente, faz este servidor Go detectar e encaminhar uma mensagem enviada diretamente do celular vinculado (fora da API `/send/*`), e por que isso parou de acontecer para a instância "Vendas" a partir de `2026-07-03 12:00:00 UTC`, enquanto mensagens recebidas/recibos/conexão continuaram normais na mesma instância pelo mesmo período?**

---

## 4. Itens concretos para checar (nessa ordem, se possível)

### 4.1 Identidade do código rodando
- Qual é o commit/tag/digest exato da imagem do evo-go em produção (a que atende a instância Vendas)? `git describe`, label da imagem Docker, ou o que estiver disponível.
- Esse código é idêntico ao `github.com/evolution-foundation/evolution-go` (branch `main`), ou é um fork/patch local da AILA? Se houver patch local, qual é o diff especificamente em torno de: dispatch de eventos do whatsmeow (`pkg/whatsmeow/service/whatsmeow.go`, função de callback do cliente / `CallWebhook`), e em `pkg/sendMessage/service/send_service.go`.
- Procure, no código real rodando (não só no repositório público), por qualquer lógica que diferencie "mensagem própria vinda do celular/companion" de "mensagem própria vinda da API" — pode estar em um listener separado da lib `whatsmeow` (ex.: eventos de multi-device sync, algo como `*events.Message` com algum campo de origem, ou um evento diferente que não é `*events.Message` genérico). Se existir, documente exatamente onde e como ele decide emitir `"SendMessage"`.

### 4.2 Estado persistido da instância "Vendas"
- Qual é o valor atual de `instance.Events` (lista de eventos assinados) no banco do próprio servidor Go para a instância Vendas? Confirme que `SEND_MESSAGE` está lá.
- Se houver qualquer histórico/auditoria/backup do banco do Go de antes de `2026-07-03 12:00`, confirme se `Events` já estava assim ou se mudou.
- Alguma chamada a `Disconnect()` (não `Reconnect`) foi feita para essa instância em algum momento próximo a `2026-07-03 12:00`? Isso é a única rota, no código público, que zera `Events`.

### 4.3 Logs do processo Go (não os logs do lado GALLO — os logs locais do VPS)
Puxe os logs da aplicação (stdout/journalctl/arquivo, o que for a fonte real) da instância Vendas na janela **`2026-07-03 10:00` até `2026-07-03 14:00` UTC** (2h antes/depois do início exato do sintoma) e procure por:
- Qualquer panic, erro ou stack trace relacionado a essa instância, especialmente dentro da goroutine que dispara o webhook (`go s.whatsmeowService.CallWebhook(...)` é literalmente lançado como goroutine — um panic sem recover ali derruba só aquele evento, não o processo, e pode não deixar rastro óbvio).
- Deploy, restart, ou reload de configuração do serviço Go nesse horário (mesmo que não pareça relacionado ao WhatsApp).
- Erros de conexão com o próprio banco de dados do Go, especificamente em queries relacionadas a essa instância.
- Qualquer log de tentativa de `POST` para a `webhookUrl` da GALLO especificamente com `"event":"SendMessage"` — isto é crucial: **o servidor sequer tentou mandar o webhook, ou tentou e falhou?** Se tentou e recebeu algo diferente de 200, isso muda o diagnóstico (seria falha de entrega, não de detecção).

### 4.4 Estado do dispositivo/sessão vinculada
- O celular vinculado à instância Vendas passou por algum evento de sessão nesse período — atualização do WhatsApp no aparelho, relogin, mudança na lista de dispositivos vinculados (multi-device), logout/login? O whatsmeow trata isso via eventos próprios (`*events.Disconnected`, `*events.LoggedOut`, sync de dispositivos) — verifique se algum desses apareceu no log nesse horário.

### 4.5 Fila/infra intermediária
- O código usa um `queueName` ao chamar `CallWebhook` — existe alguma fila (Redis, RabbitMQ, etc.) entre a detecção do evento e o envio HTTP do webhook? Se sim, verifique se essa fila teve algum problema (consumidor caído, fila cheia, erro de conexão) nesse horário especificamente para a instância Vendas.

### 4.6 Instância de controle (se existir)
- Existe outra instância Go, ativa nesse mesmo período, cujo dono também manda mensagens pelo celular com frequência? Se sim, o eco dela continuou funcionando no mesmo período? Isso ajuda a isolar se o problema é **específico do estado da instância Vendas** (algo no registro dela no banco, ou no objeto do cliente em memória) versus algo **sistêmico** no código/infra que só ainda não afetou outras instâncias.

---

## 5. O que trazer no relatório

1. Confirmação (com trecho de código/commit) de **onde e como** o servidor realmente detecta e emite `SendMessage` — em especial, se existe alguma via distinta da API `/send/*` para isso, e onde ela vive.
2. O que os logs do VPS mostram entre `2026-07-03 10:00` e `14:00 UTC` para a instância Vendas — mesmo que a conclusão seja "nada de anormal nos logs".
3. Se o servidor **tentou** mandar o webhook (`SendMessage`) para a GALLO nesse período e falhou, ou se **nunca tentou** (ou seja, nunca detectou o evento).
4. Estado de `instance.Events` (assinaturas) para Vendas, hoje e — se possível — no momento do incidente.
5. Se identificar a causa raiz real (não uma suposição): qual é, com evidência. Se não identificar com certeza, diga isso explicitamente e liste o que foi descartado.
6. Recomendação de correção **só depois** do diagnóstico — não implemente nada em produção sem confirmar com a GALLO antes, especialmente qualquer restart/reconexão da instância Vendas (isso é uma ação com efeito colateral em uma conta viva).

Qualquer dúvida de contexto (payloads exemplo, trechos do nosso `parser.ts`, timestamps exatos), pergunte antes de assumir.
