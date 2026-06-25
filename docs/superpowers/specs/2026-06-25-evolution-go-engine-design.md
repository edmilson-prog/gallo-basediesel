# Design — Engine WhatsApp `evolution-go` (whatsmeow)

> Data: 2026-06-25 · Status: aprovado para planejamento · Autor: AILA / Claude
> Origem: brainstorming `/superpowers:brainstorming`
> Servidor de destino: `https://evogo.ailainteligente.com.br`
> Doc da API: https://docs.evolutionfoundation.com.br/evolution-go (+ OpenAPI / `llms.txt`)

## 1. Objetivo

Adicionar um novo engine de WhatsApp — **Evolution Go** (implementação em Go sobre
`whatsmeow`) — à camada de provedores existente, **coexistindo** com os engines
atuais (`meta`, `evolution` v2/Baileys, `mock`). A motivação é migrar da Evolution
API v2.3.7 (hoje em fase de testes) para a Evolution Go, mais moderna e performática,
mantendo o v2 operante durante a transição.

Princípio transversal pedido pelo dono: **"tudo por parâmetro"** — `baseUrl`, chave
global do servidor, `instanceId` e token de instância são todos configuráveis (Vault +
`provider_config`), nada hardcoded no código.

## 2. Decisões (brainstorming)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Estratégia | **Novo engine `evolution-go`, coexistindo** com meta / evolution-v2 / mock |
| 2 | Onde ficam os parâmetros | **Vault** (segredos) + **`provider_config`** (não-segredos), editável pela tela |
| 3 | Escopo | **Núcleo + paridade total + failover** |
| 4 | Edge Functions | **Ramificar as edges existentes** por `provider` (reuso máximo) |
| 5 | Valor de `provider` | **`evolution-go` de 1ª classe** em `whatsapp_accounts.provider` e `messages.provider` (migration aditiva nas check constraints) |
| 6 | Criação de instância na UI | **Novas instâncias = Go** (v2 segue só nas instâncias já pareadas) |
| 7 | Autenticação do webhook | **Validar `instanceToken`** do payload contra o token no Vault (não há HMAC na Go) |

## 3. Diferenças Evolution v2 (Baileys) → Evolution Go (whatsmeow)

São diferenças de contrato, não cosméticas — por isso a Go é tratada como engine novo,
não como ajuste do `evolution` atual.

| Aspecto | v2 (atual) | Go (alvo) |
|---|---|---|
| Identificação da instância | no **path** (`/message/sendText/{inst}`) | por **header `instanceId`** + paths fixos (`/send/text`) |
| Autenticação | header `apikey` (por instância) | `apikey` **global** + header `instanceId` + `token` por instância |
| Criar instância | `{instanceName, integration:"WHATSAPP-BAILEYS"}` | `POST /instance/create` `{name, token?}` → `{data:{id, token, connected}}` |
| QR | `GET /instance/connect/{inst}` → `base64` | `GET /instance/qr` → `data.Qrcode` (data URI) + `data.Code` |
| Config de webhook | `POST /webhook/set/{inst}` | dentro de `POST /instance/connect` (`{webhookUrl, subscribe:["ALL"], immediate}`) |
| Status da conexão | `GET /instance/connectionState/{inst}` | `GET /instance/status` (a confirmar) |
| Enviar texto (resposta) | `{ key: { id } }` | `{ success, messageId, data:{ Info:{ ID } } }` |
| Formato de webhook | `messages.upsert` / `messages.update` (lowercase, Baileys) | `Message` / `Receipt` / `Connection` (PascalCase, whatsmeow) |
| Payload inbound | `data.{key, message, pushName, status}` | `data.Info.{Chat, Sender, IsFromMe, PushName, Type}` + `data.Message.*` |
| Status de entrega | `messages.update` `data.status` (SERVER_ACK/DELIVERY_ACK/READ) | `event:"Receipt"` `state:"Delivered\|Read"` `data.MessageIDs[]` |
| Auth do webhook | HMAC opcional + IP allowlist | **sem HMAC**; `instanceId` + `instanceToken` no payload |

> A interface `IWhatsAppProvider` absorve todas essas diferenças — os consumidores
> (Inbox, conversa, send pipeline, copiloto) **não mudam**.

## 4. Arquitetura

### 4.1 Camada do engine

Nova pasta `src/providers/whatsapp/evolution-go/`, espelhada automaticamente em
`supabase/functions/_shared/whatsapp/evolution-go/` por
`scripts/sync-whatsapp-shared.ts`. **Runtime-agnostic** (só Web APIs + imports
relativos), como os engines atuais.

- **`constants.ts`** — `EVOLUTION_GO_CAPABILITIES` (sem templates HSM, sem interativas;
  mídia por URL — igual ao v2), `EVOLUTION_GO_SECRET_SUFFIXES`
  (`_API_KEY`, `_INSTANCE_TOKEN`), versão-alvo.
- **`client.ts`** — `goRequest`: headers `apikey` (global) **+** `instanceId`; paths
  fixos. Mesmo ciclo do client atual (timeout 30s, log sanitizado em
  `integration_logs`, chave/token nunca logados).
- **`parser.ts`** — `parseEvolutionGoInbound(rawPayload, accountId)`: traduz eventos
  whatsmeow (`Message` / `Receipt` / `Connection`) para
  `IInboundMessage | IInboundStatus | IOutboundEcho`.
  - `Message` + `Info.IsFromMe=false` → `message` (inbound)
  - `Message` + `Info.IsFromMe=true` → `outbound-echo`
  - `Receipt` (`state` Delivered/Read) → `status`
  - jids de grupo/broadcast/newsletter/@lid → ignorados (lançam, como no v2)
- **`instance.ts`** (Go-específico, fora da interface) —
  `createInstance` (`POST /instance/create`), `connectInstance`
  (`POST /instance/connect` com `webhookUrl`+`subscribe`), `getInstanceQr`
  (`GET /instance/qr`), `getStatus`, `logout`/`deleteInstance`/`restartInstance`, e os
  de **paridade**: histórico de chat/mensagens, foto de perfil (avatar), checagem de
  número, contatos — **onde a Go expuser o endpoint**; onde não houver equivalente,
  documentar como não-suportado (sem regressão de paridade do v2).
- **`EvolutionGoProvider.ts`** — `implements IWhatsAppProvider`:
  - `sendText` (`POST /send/text` → `messageId`/`data.Info.ID`)
  - `sendMedia` (`POST /send/media` — formato a confirmar) + áudio
  - `downloadInboundMedia`
  - `healthCheck` (`GET /instance/status`)
  - `parseInboundMessage` → delega ao parser
  - `verifyWebhookSignature` → comparação constant-time do `instanceToken` (§4.5)
  - `sendTemplate` / `sendInteractive` / `uploadOutboundMedia` → `NOT_SUPPORTED`
- **Config** — `IEvolutionGoAccountConfig { accountId, baseUrl, instanceId, credentialsRef }`.

### 4.2 Modelo de dados e configuração ("tudo por parâmetro")

| Parâmetro | Onde vive | Secreto? |
|---|---|---|
| `baseUrl` (`https://evogo.ailainteligente.com.br`) | `provider_config` | não |
| `instanceId` (uuid do `create`) | `provider_config` | não |
| `name` (apelido técnico) | `provider_config` | não |
| `subscribe` (eventos do webhook, default `["ALL"]`) | `provider_config` | não |
| chave global do servidor (`apikey`) | Vault → `{credentials_ref}_API_KEY` | **sim** |
| token da instância | Vault → `{credentials_ref}_INSTANCE_TOKEN` | **sim** |

A chave global é por `credentials_ref` → várias instâncias do mesmo servidor evogo
reusam o mesmo `credentials_ref` (uma chave) e têm tokens próprios.

`whatsapp_accounts.provider` e `messages.provider` passam a aceitar **`evolution-go`**
(migration aditiva nas check constraints). O union `WhatsAppProviderEngine` e os
contratos de persistência (`"meta" | "evolution"`) ampliam para incluir `evolution-go`
— o TypeScript aponta todos os pontos.

### 4.3 Edge Functions (ramificação por `provider`)

- **`build.ts` / `factory.ts`** — `case "evolution-go"` → `new EvolutionGoProvider`;
  `getEngineCapabilities` ganha o caso.
- **`whatsapp-connect`** — hoje "exclusiva de Evolution"; passa a ramificar. Para a Go:
  1. cria a instância no servidor (define `instanceId` no `provider_config` e grava o
     `token` no Vault);
  2. aponta o webhook via `connect` (`/whatsapp-webhook/evolution-go`);
  3. gera QR; cobre `state`/`logout`/`restart`/`delete`.
  > O token pode ser **gerado pela plataforma** (uuid) e passado no `create`, e/ou
  > capturado do retorno — a definir na implementação contra o servidor real.
- **`whatsapp-webhook`** — já roteia por path: nova rota `/whatsapp-webhook/evolution-go`
  usa o parser whatsmeow, resolve a conta por **`instanceId`** (`findEvolutionGoAccount` /
  `…AnyStatus`) e trata o lifecycle via evento `Connection`.
- **`whatsapp-send`** — agnóstico via `build.ts`; só precisa do engine + entrar no failover.
- **Auxiliares** (`import-history`, `media-backfill`, `avatar-sync`, `check-number`,
  `contacts-name-backfill`) — ramificam por `provider` para chamar a `instance.ts` da Go.

### 4.4 Webhook: resolução de conta e autenticação

A Go **não tem HMAC**; o payload traz `instanceId` + `instanceToken`. Plano:
- resolver a conta por `instanceId` (`provider_config.instanceId`);
- **validar o `instanceToken`** do payload contra o token guardado no Vault
  (comparação constant-time) — autenticação real por instância, em substituição ao HMAC
  do v2. `verifyWebhookSignature` da Go encapsula essa comparação.

### 4.5 Failover

`failover.ts` passa a aceitar `evolution-go` como par válido na matriz
meta ↔ evolution ↔ evolution-go. Como a Go não suporta templates (igual ao v2), o
tratamento `FAILOVER_INCOMPATIBLE` (template em backup não-Meta) é o mesmo já existente.

### 4.6 UI

- **AddInstanceWizard** — cria instância `evolution-go` no servidor evogo; o fluxo
  connect/create captura `instanceId`+`token` e persiste (provider_config + Vault). As
  instâncias v2 atuais continuam funcionando até re-parear.
- **WhatsAppAccountsPage** — edição staff-only de `baseUrl`/`instanceId`/eventos.
- **Chaves & API** — entrada para a chave global do servidor evogo.

## 5. Testes

TDD nos módulos puros, Vitest co-localizado:
- `parser.test.ts` — payloads whatsmeow (Message inbound/echo, Receipt, Connection,
  grupos/@lid ignorados).
- `EvolutionGoProvider.test.ts` — send (texto/mídia/áudio), download, health, casos
  `NOT_SUPPORTED`, `verifyWebhookSignature`.
- `instance.test.ts` — create/connect/qr/status + parsers defensivos.
- `errors.test.ts` — mapeamento de erros HTTP da Go.
- `failover.test.ts` — atualizar para a matriz com `evolution-go`.

Gate prático: `bun run build` + `bun run test`. Checagem de tipos por delta com
`bunx tsc --noEmit` no código novo.

## 6. Sync, deploy e migração

1. Rodar `bun run scripts/sync-whatsapp-shared.ts` (espelha a nova pasta em `_shared/`).
2. **Migration aditiva** nas check constraints (`whatsapp_accounts.provider` e
   `messages.provider`) — versionada em `supabase/migrations/` **e** aplicada
   manualmente via MCP **com confirmação do dono** (workflow de DB deploy está em no-op).
3. Deploy via CLI das edges tocadas (`whatsapp-connect`, `whatsapp-webhook`,
   `whatsapp-send` e auxiliares).
4. Configurar a chave global do servidor evogo no Vault (tela Chaves & API).

## 7. Escopo e não-escopo

**No escopo:** núcleo (conectar QR, enviar texto/mídia/áudio, receber, status, download,
healthcheck) + paridade (histórico, avatar, check de número, backfill de nomes — onde a
Go expuser) + failover + UI de criação/edição.

**Fora do escopo (YAGNI):** templates HSM e mensagens interativas (a Go não suporta);
remoção do engine v2 (coexiste); migração automática de instâncias v2 → Go (re-pareamento
manual quando o dono decidir).

## 8. Riscos / a validar contra o servidor real

Confirmar na implementação, contra `https://evogo.ailainteligente.com.br` + OpenAPI/`llms.txt`:
- esquema exato de autenticação (apenas `apikey` global + `instanceId`, ou também o
  `token` da instância como credencial de operação);
- corpo de `/send/media` (URL vs base64) e endpoint de áudio;
- download de mídia recebida (path e formato);
- presença (ou não) de status `failed` no evento `Receipt`;
- disponibilidade dos endpoints `chat/*` de paridade (histórico/avatar/contatos/check).

Onde um endpoint de paridade não existir na Go, a função correspondente é marcada
não-suportada (degradação honesta), sem regredir o v2.

## 9. Critérios de aceitação

- Criar uma instância `evolution-go` pela tela, parear por QR e ver `status=connected`.
- Enviar texto e mídia por uma conta Go e receber `status` de entrega/leitura.
- Receber mensagem inbound (incl. mídia baixada para o Storage) numa conta Go.
- Webhook rejeita payload com `instanceToken` inválido.
- Failover meta ↔ evolution-go funciona conforme a matriz.
- `bun run build` + `bun run test` verdes; v2 e meta inalterados.
