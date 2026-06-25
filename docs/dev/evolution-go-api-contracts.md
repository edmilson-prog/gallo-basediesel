# Evolution Go — Contratos de API (Spike de referência)

> **Fonte autoritativa:** `docs/integracoes/evo-go/doc.json` — OpenAPI (Swagger 2.0), *Evolution GO - whatsmeow*, versão 1.0, 77 endpoints.
> **Documentação pública:** https://docs.evolutionfoundation.com.br/evolution-go
> **Swagger local:** https://evogo.ailainteligente.com.br/swagger/index.html
>
> Este documento destila os contratos de request/response para uso nas Tasks 4–9 do épico Evolution Go Engine.
> Respostas marcadas como **[não documentado no swagger]** foram obtidas da documentação pública ou estão sob incerteza — ver seção "A validar".

---

## Autenticação

### Header global obrigatório

```
apikey: <GLOBAL_API_KEY>
```

- O swagger **não define** `securityDefinitions` nem `security` por operação — a auth é extra-swagger.
- A documentação pública (instalação) confirma o header `apikey` com o valor da variável de ambiente `GLOBAL_API_KEY`.
- Referência de instalação: `curl -X POST http://localhost:8080/instance/create -H "apikey: sua-chave-segura-aqui"`.
- O `token` gerado em `POST /instance/create` é armazenado na instância e pode ser usado como `apikey` alternativo para chamadas scoped àquela instância (a confirmar — ver seção "A validar").

### Identificação da instância

- Operações sem `{instanceId}` no path (ex.: `/instance/qr`, `/instance/status`, `/send/*`, `/message/*`, `/user/*`) **não carregam campo de instância no body**. A instância alvo é presumivelmente identificada pelo `apikey`/`token` passado no header (se cada instância tem seu token próprio) **ou** por um header adicional não documentado no swagger.
- Operações com `{instanceId}` no path (ex.: `/instance/get/{instanceId}`, `/instance/delete/{instanceId}`, `/instance/forcereconnect/{instanceId}`) endereçam a instância via path parameter (string — pode ser o `name` ou o `id` UUID, a confirmar).
- ⚠️ **Esta é a maior incerteza de integração** — ver "A validar".

---

## Endpoints de Instância

### `POST /instance/create`

**Corpo da requisição** (`CreateStruct`):

```json
{
  "name": "string",
  "instanceId": "string (opcional — UUID; se omitido, servidor gera)",
  "token": "string (opcional — se omitido, servidor gera)",
  "proxy": {
    "host": "string",
    "port": "string",
    "username": "string",
    "password": "string"
  },
  "advancedSettings": {
    "alwaysOnline": false,
    "ignoreGroups": false,
    "ignoreStatus": false,
    "msgRejectCall": "string",
    "readMessages": false,
    "rejectCall": false
  }
}
```

**Resposta 200** (shape confirmada via docs públicos):

```json
{
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "test",
    "token": "f0e1d2c3-b4a5-6789-0abc-def123456789",
    "webhook": "",
    "connected": false,
    "createdAt": "2026-01-15T10:30:00.000000-03:00",
    "alwaysOnline": false,
    "rejectCall": false,
    "readMessages": false
  },
  "message": "success"
}
```

> **Nota:** A resposta completa de `/instance/all` inclui mais campos (`rabbitmqEnable`, `websocketEnable`, `natsEnable`, `jid`, `qrcode`, `expiration`, `disconnect_reason`, `events`, `os_name`, `proxy`, `client_name`, `ignoreGroups`, `ignoreStatus`, `msgRejectCall`). O `/instance/create` pode retornar subconjunto.

---

### `POST /instance/connect`

**Corpo da requisição** (`ConnectStruct`):

```json
{
  "immediate": true,
  "webhookUrl": "https://seu-servidor.com/webhook",
  "subscribe": ["MESSAGE", "SEND_MESSAGE", "READ_RECEIPT", "PRESENCE", "HISTORY_SYNC", "CHAT_PRESENCE", "CALL", "CONNECTION", "LABEL", "CONTACT", "GROUP", "NEWSLETTER", "QRCODE"],
  "phone": "string (opcional — número E.164 para pareamento por código)",
  "natsEnable": "string (opcional)",
  "rabbitmqEnable": "string (opcional)",
  "websocketEnable": "string (opcional)"
}
```

> ⚠️ **Webhook configurado aqui** — não existe endpoint `/webhook/set` separado (diferente da Evolution API v2).

**Resposta 200** (shape confirmada via docs públicos):

```json
{
  "data": {
    "eventString": "MESSAGE,SEND_MESSAGE,CONNECTION",
    "jid": "5511999999999@s.whatsapp.net",
    "webhookUrl": "https://seu-servidor.com/webhook"
  },
  "message": "success"
}
```

---

### `GET /instance/qr`

Retorna o QR code para pareamento (sem body de request).

**Resposta 200** [não documentado no swagger — shape melhor-guess]:

```json
{
  "data": {
    "Qrcode": "data:image/png;base64,iVBOR...",
    "Code": "2@abc123..."
  },
  "message": "success"
}
```

> A confirmar: os campos são `Qrcode`/`Code` (PascalCase) ou `qrcode`/`code` (camelCase)?

---

### `GET /instance/status`

**Resposta 200** (shape confirmada via docs públicos):

```json
{
  "data": {
    "Connected": true,
    "LoggedIn": false,
    "Name": ""
  },
  "message": "success"
}
```

---

### `GET /instance/all`

**Resposta 200** (shape confirmada via docs públicos):

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "test",
      "token": "f0e1d2c3-b4a5-6789-0abc-def123456789",
      "webhook": "",
      "rabbitmqEnable": "",
      "websocketEnable": "",
      "natsEnable": "",
      "jid": "",
      "qrcode": "",
      "connected": false,
      "expiration": 0,
      "disconnect_reason": "",
      "events": "",
      "os_name": "Evolution GO",
      "proxy": "",
      "client_name": "evolution",
      "createdAt": "2026-01-15T10:30:00.000000-03:00",
      "alwaysOnline": false,
      "rejectCall": false,
      "msgRejectCall": "",
      "readMessages": false,
      "ignoreGroups": false,
      "ignoreStatus": false
    }
  ],
  "message": "success"
}
```

---

### `GET /instance/get/{instanceId}`

Path param: `instanceId` (string). Resposta: objeto `data` semelhante ao item de `/instance/all`.

---

### `DELETE /instance/delete/{instanceId}`

Path param: `instanceId` (string). Sem body. Resposta 200: `{"message": "success"}`.

---

### `DELETE /instance/logout`

Sem path param, sem body. Encerra a sessão WhatsApp (mantém a instância no servidor, só desloga).

---

### `POST /instance/disconnect`

Sem body. Desconecta sem logout.

---

### `POST /instance/reconnect`

Sem body. Reconecta.

---

### `POST /instance/forcereconnect/{instanceId}`

**Corpo da requisição** (`ForceReconnectStruct`):

```json
{
  "number": "string"
}
```

---

### `POST /instance/pair`

**Corpo da requisição** (`PairStruct`):

```json
{
  "phone": "string",
  "subscribe": ["string"]
}
```

Solicita código de pareamento por telefone (alternativa ao QR).

---

### `GET /instance/{instanceId}/advanced-settings`

Retorna o objeto `AdvancedSettings` para a instância.

### `PUT /instance/{instanceId}/advanced-settings`

**Corpo da requisição** (`AdvancedSettings`):

```json
{
  "alwaysOnline": false,
  "ignoreGroups": false,
  "ignoreStatus": false,
  "msgRejectCall": "string",
  "readMessages": false,
  "rejectCall": false
}
```

---

### `POST /instance/proxy/{instanceId}` / `DELETE /instance/proxy/{instanceId}`

**Corpo do POST** (`SetProxyStruct`):

```json
{
  "host": "string",
  "port": "string",
  "username": "string",
  "password": "string"
}
```

---

## Endpoints de Envio de Mensagens

### `POST /send/text`

**Corpo da requisição** (`TextStruct`) — **flat** (sem wrapper):

```json
{
  "number": "5511999999999",
  "text": "Olá!",
  "delay": 1000,
  "id": "string (opcional — ID cliente para deduplicação)",
  "quoted": {
    "messageId": "string",
    "participant": "string"
  },
  "mentionedJid": ["5511888888888@s.whatsapp.net"],
  "mentionAll": false,
  "formatJid": false
}
```

**Resposta 200** (shape confirmada via docs públicos):

```json
{
  "success": true,
  "message": "success",
  "data": {
    "Info": {
      "Chat": "5511999999999@s.whatsapp.net",
      "Sender": "5511888888888:24@s.whatsapp.net",
      "IsFromMe": true,
      "ID": "3EB0000000000000000010",
      "Type": "ExtendedTextMessage",
      "Timestamp": "2026-01-15T10:30:00.000000-03:00"
    },
    "Message": {
      "extendedTextMessage": {
        "text": "Olá!",
        "contextInfo": {}
      }
    }
  }
}
```

> **Nota sobre `Timestamp`:** A amostra da doc pública mostra formato ISO-8601 com offset (`2026-01-15T10:30:00.000000-03:00`), mas whatsmeow internamente usa Unix timestamp. **A confirmar** se o servidor serializa como ISO string ou como inteiro Unix.

---

### `POST /send/media`

**Corpo da requisição** (`MediaStruct`) — **flat** (sem wrapper de `Message`):

```json
{
  "number": "5511999999999",
  "url": "https://example.com/arquivo.jpg",
  "type": "image",
  "caption": "string (opcional)",
  "filename": "string (opcional — para documentos)",
  "delay": 1000,
  "id": "string (opcional)",
  "quoted": {
    "messageId": "string",
    "participant": "string"
  },
  "mentionedJid": [],
  "mentionAll": false,
  "formatJid": false
}
```

**Campo `type`:** valores conhecidos — `"image"`, `"video"`, `"audio"`, `"document"`, `"sticker"` (a confirmar contra o servidor).

> ⚠️ **CORREÇÃO ao brief original:** o swagger define `MediaStruct` como **flat** (campos `number`, `url`, `type`, `caption`, etc. no nível raiz), **não** como `{ message: Message }`. A task brief assumia um wrapper de `Message` whatsmeow — isso não se aplica ao `/send/media`. O `{ message: Message }` se aplica apenas ao `/message/downloadimage`.

**Resposta 200** [não documentado no swagger — shape presumida semelhante ao `/send/text`]:

```json
{
  "success": true,
  "message": "success",
  "data": {
    "Info": {
      "ID": "3EB0000000000000000020",
      "Type": "ImageMessage",
      "Timestamp": "...",
      "IsFromMe": true
    },
    "Message": { "imageMessage": { ... } }
  }
}
```

---

### `POST /send/sticker`

**Corpo da requisição** (`StickerStruct`):

```json
{
  "number": "string",
  "sticker": "string (URL ou base64)",
  "delay": 0,
  "id": "string",
  "quoted": { "messageId": "string", "participant": "string" },
  "mentionedJid": [],
  "mentionAll": false,
  "formatJid": false
}
```

---

### `POST /send/location`

**Corpo da requisição** (`LocationStruct`):

```json
{
  "number": "string",
  "latitude": 0.0,
  "longitude": 0.0,
  "name": "string",
  "address": "string",
  "delay": 0,
  "id": "string",
  "quoted": { "messageId": "string", "participant": "string" },
  "mentionedJid": [],
  "mentionAll": false,
  "formatJid": false
}
```

---

### `POST /send/contact`

**Corpo da requisição** (`ContactStruct`):

```json
{
  "number": "string",
  "vcard": { /* VCardStruct */ },
  "delay": 0,
  "id": "string",
  "quoted": { "messageId": "string", "participant": "string" },
  "mentionedJid": [],
  "mentionAll": false,
  "formatJid": false
}
```

---

### Outros endpoints de envio (parity)

| Endpoint | Body schema |
|---|---|
| `POST /send/button` | `ButtonStruct` |
| `POST /send/carousel` | `CarouselStruct` |
| `POST /send/link` | `LinkStruct` |
| `POST /send/list` | `ListStruct` |
| `POST /send/poll` | `PollStruct` |

---

## Endpoints de Mensagem

### `POST /message/downloadimage`

**⚠️ Corpo da requisição** (`DownloadMediaStruct`) — **wraps o objeto `Message` whatsmeow completo**:

```json
{
  "message": {
    "imageMessage": {
      "URL": "https://mmg.whatsapp.net/...",
      "directPath": "/v/t62.7118-24/...",
      "mimetype": "image/jpeg",
      "fileLength": 123456,
      "fileSHA256": [/* array de inteiros — bytes raw do proto */],
      "fileEncSHA256": [/* array de inteiros */],
      "mediaKey": [/* array de inteiros */],
      "mediaKeyTimestamp": 1718000000,
      "caption": "...",
      "width": 1280,
      "height": 720
    }
  }
}
```

> **Detalhe crítico:** Os campos `fileSHA256`, `fileEncSHA256` e `mediaKey` são `array of integer` no proto whatsmeow (bytes serializados como `[]int` no JSON Go). A Task 9 precisa confirmar se o servidor Evolution Go aceita esses arrays como `[]int` (serialização Go padrão) ou como base64 string (mais comum em APIs REST). **Ver "A validar".**

> **Nota:** O swagger mostra apenas `/message/downloadimage`. Não há endpoints separados para `/message/downloadaudio`, `/message/downloadvideo`, `/message/downloaddocument`. Presumivelmente o mesmo endpoint com o sub-campo correspondente (`audioMessage`, `videoMessage`, `documentMessage`) no body.

**Resposta 200** [não documentado no swagger]:

```json
{
  "success": true,
  "image": "<base64-encoded-bytes>"
}
```

> A confirmar: o campo de saída é sempre `"image"` mesmo para outros tipos de mídia?

---

### `POST /message/status`

**Corpo da requisição** (`MessageStatusStruct`):

```json
{
  "id": "3EB0000000000000000010"
}
```

**Resposta 200** [não documentado no swagger — shape a confirmar]:

```json
{
  "data": {
    "id": "3EB0000000000000000010",
    "status": "DELIVERED"
  },
  "message": "success"
}
```

---

### `POST /message/markread`

**Corpo da requisição** (`MarkReadStruct`):

```json
{
  "number": "5511999999999@s.whatsapp.net",
  "id": ["3EB0000000000000000010", "3EB0000000000000000011"]
}
```

---

### `POST /message/react`

**Corpo da requisição** (`ReactStruct`):

```json
{
  "number": "5511999999999@s.whatsapp.net",
  "id": "3EB0000000000000000010",
  "fromMe": true,
  "participant": "string (para grupos)",
  "reaction": "👍"
}
```

---

### `POST /message/edit`

**Corpo da requisição** (`EditMessageStruct`):

```json
{
  "chat": "5511999999999@s.whatsapp.net",
  "messageId": "3EB0000000000000000010",
  "message": "novo texto"
}
```

---

### `POST /message/delete`

**Corpo da requisição** (`MessageStruct`):

```json
{
  "chat": "5511999999999@s.whatsapp.net",
  "messageId": "3EB0000000000000000010"
}
```

---

### `POST /message/presence`

**Corpo da requisição** (`ChatPresenceStruct`):

```json
{
  "number": "5511999999999@s.whatsapp.net",
  "state": "composing",
  "isAudio": false
}
```

---

## Endpoints de Usuário

### `POST /user/avatar`

**Corpo da requisição** (`GetAvatarStruct`):

```json
{
  "number": "5511999999999",
  "preview": false
}
```

### `GET /user/contacts`

Sem body. Retorna lista de contatos.

### `POST /user/check`

**Corpo da requisição** (`CheckUserStruct`):

```json
{
  "number": ["5511999999999", "5511888888888"],
  "formatJid": false
}
```

### `POST /user/info`

Mesmo body que `/user/check`. Retorna informações detalhadas dos usuários.

---

## Endpoints de Chat

### `POST /chat/history-sync-request`

**Corpo da requisição** (`HistorySyncRequestStruct`):

```json
{
  "count": 50,
  "messageInfo": { /* go_mau_fi_whatsmeow_types.MessageInfo */ }
}
```

---

## Endpoints de Parity (presença confirmada no swagger — shapes não detalhadas)

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/instance/all` | Listar todas as instâncias |
| `GET` | `/instance/get/{instanceId}` | Obter instância por ID |
| `GET` | `/instance/qr` | QR code para pareamento |
| `GET` | `/instance/status` | Status da conexão |
| `DELETE` | `/instance/logout` | Logout da sessão WhatsApp |
| `POST` | `/instance/disconnect` | Desconectar (sem logout) |
| `POST` | `/instance/reconnect` | Reconectar |
| `POST` | `/instance/forcereconnect/{instanceId}` | Forçar reconexão |
| `POST` | `/instance/pair` | Solicitar código de pareamento |
| `GET/PUT` | `/instance/{instanceId}/advanced-settings` | Configurações avançadas |
| `POST/DELETE` | `/instance/proxy/{instanceId}` | Configurar/remover proxy |
| `POST` | `/user/avatar` | Avatar de contato |
| `GET` | `/user/contacts` | Lista de contatos |
| `POST` | `/user/check` | Verificar número WhatsApp |
| `POST` | `/user/info` | Info detalhada de usuários |
| `GET` | `/user/blocklist` | Lista de bloqueados |
| `POST` | `/user/block` | Bloquear contato |
| `POST` | `/user/unblock` | Desbloquear contato |
| `GET/POST` | `/user/privacy` | Configurações de privacidade |
| `POST` | `/user/profileName` | Atualizar nome do perfil |
| `POST` | `/user/profilePicture` | Atualizar foto do perfil |
| `POST` | `/user/profileStatus` | Atualizar status do perfil |
| `POST` | `/chat/history-sync-request` | Solicitar histórico |
| `POST` | `/chat/archive` | Arquivar chat |
| `POST` | `/chat/mute` | Silenciar chat |
| `POST` | `/chat/pin` | Fixar chat |
| `POST` | `/chat/unarchive` | Desarquivar |
| `POST` | `/chat/unmute` | Remover silêncio |
| `POST` | `/chat/unpin` | Desafixar |
| `POST` | `/message/markread` | Marcar como lida |
| `POST` | `/message/react` | Reagir a mensagem |
| `POST` | `/message/edit` | Editar mensagem |
| `POST` | `/message/delete` | Deletar para todos |
| `POST` | `/message/presence` | Sinalizar presença (typing) |
| `POST` | `/call/reject` | Rejeitar chamada |
| `GET` | `/group/list` | Listar grupos |
| `GET` | `/group/myall` | Meus grupos |
| `POST` | `/group/create` etc. | Gestão de grupos |
| `POST` | `/community/*` | Gestão de comunidades |
| `GET/POST` | `/newsletter/*` | Newsletters |
| `GET` | `/polls/{pollMessageId}/results` | Resultados de enquete |
| `GET` | `/label` | Labels |
| `POST` | `/label/chat` `/label/message` `/label/edit` | Gestão de labels |
| `POST` | `/unlabel/chat` `/unlabel/message` | Remover labels |

---

## Formato dos Eventos de Webhook (whatsmeow)

> ⚠️ O swagger **não documenta** o payload do webhook (todas as responses são `gin.H` — mapa não tipado). Os shapes abaixo derivam da documentação pública e do modelo whatsmeow. **Validar contra o servidor real.**

O webhook é configurado via `POST /instance/connect` (campo `webhookUrl` + `subscribe`). O servidor faz `POST` no `webhookUrl` a cada evento.

### Evento: `MESSAGE` (mensagem recebida)

Shape **não confirmada** — melhor estimativa baseada em whatsmeow + padrão Evolution API:

```json
{
  "event": "MESSAGE",
  "data": {
    "Info": {
      "Chat": "5511999999999@s.whatsapp.net",
      "Sender": "5511999999999@s.whatsapp.net",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB0000000000000000010",
      "Type": "conversation",
      "PushName": "João Silva",
      "Timestamp": "2026-01-15T10:30:00.000000-03:00"
    },
    "Message": {
      "conversation": "Olá, tudo bem?"
    }
  }
}
```

**Subtipos de `Message` relevantes para parsing inbound:**

| Campo em `Message` | Tipo whatsmeow | Quando presente |
|---|---|---|
| `conversation` | `string` | Mensagem de texto simples |
| `extendedTextMessage` | `ExtendedTextMessage` | Texto com preview de link ou reply |
| `imageMessage` | `ImageMessage` | Imagem |
| `videoMessage` | `VideoMessage` | Vídeo |
| `audioMessage` | `AudioMessage` | Áudio (PTT ou arquivo) |
| `documentMessage` | `DocumentMessage` | Documento/arquivo |
| `stickerMessage` | `StickerMessage` | Figurinha |
| `reactionMessage` | `ReactionMessage` | Reação (emoji) |
| `locationMessage` | `LocationMessage` | Localização |
| `contactMessage` | `ContactMessage` | Contato vCard |
| `viewOnceMessage` | `FutureProofMessage` | View once (wrapper) |

**Campos de mídia em `imageMessage` / `videoMessage` / `audioMessage` / `documentMessage`:**

```json
{
  "URL": "https://mmg.whatsapp.net/...",
  "directPath": "/v/t62.7118-24/...",
  "mimetype": "image/jpeg",
  "fileLength": 123456,
  "fileSHA256": [/* []int — bytes do SHA256 */],
  "fileEncSHA256": [/* []int */],
  "mediaKey": [/* []int */],
  "mediaKeyTimestamp": 1718000000,
  "caption": "legenda (imagem/vídeo/documento)"
}
```

> **`audioMessage` adicional:** `PTT` (bool — voice note), `seconds` (duração), `waveform` ([]int).
> **`documentMessage` adicional:** `fileName`, `title`, `pageCount`.

**`extendedTextMessage`:**

```json
{
  "text": "texto completo",
  "matchedText": "url matched",
  "title": "título do link preview",
  "description": "descrição"
}
```

**`reactionMessage`:**

```json
{
  "key": {
    "remoteJID": "5511999999999@s.whatsapp.net",
    "fromMe": false,
    "id": "3EB000..."
  },
  "text": "👍",
  "senderTimestampMS": 1718000000000
}
```

---

### Evento: `READ_RECEIPT` / `SEND_MESSAGE`

Shape **não confirmada** — melhor estimativa:

```json
{
  "event": "READ_RECEIPT",
  "data": {
    "Info": {
      "Chat": "5511999999999@s.whatsapp.net",
      "Sender": "5511999999999@s.whatsapp.net",
      "Type": "read"
    },
    "MessageIDs": ["3EB0000000000000000010"]
  }
}
```

---

### Evento: `CONNECTION`

Shape **não confirmada** — melhor estimativa:

```json
{
  "event": "CONNECTION",
  "data": {
    "State": "open",
    "IsNewLogin": false
  }
}
```

Possíveis valores de `State`: `"open"`, `"close"`, `"connecting"`, `"timeout"`.

---

## ⚠️ A validar contra https://evogo.ailainteligente.com.br (smoke do dono)

> Esta seção lista as incertezas que **não puderam ser confirmadas** pela documentação pública nem pelo swagger. Cada item deve ser verificado com o servidor real durante o smoke do dono.

### 1. Esquema de autenticação por instância

**Incerteza:** O swagger não documenta auth. A documentação pública confirma o header `apikey` com a `GLOBAL_API_KEY`. Porém, para chamadas de send/receive/download que não têm `{instanceId}` no path, **como o servidor sabe qual instância usar?**

Hipóteses (mutuamente exclusivas, verificar):
- **A)** O `token` retornado em `/instance/create` é usado como `apikey` nas chamadas scoped, e o servidor resolve a instância pelo token.
- **B)** Existe um header adicional (ex.: `instanceid` ou `X-Instance-Id`) não documentado no swagger.
- **C)** O servidor tem single-instance mode (uma instância por server), então qualquer chamada com a `GLOBAL_API_KEY` vai para a única instância ativa.

**Ação:** Fazer `GET /instance/status` com apenas `apikey: GLOBAL_API_KEY` (sem header extra) e observar se retorna a instância correta ou erro. Em seguida testar com `apikey: <token da instância>`.

---

### 2. Campos de mídia no webhook: `[]int` vs base64 string

**Incerteza:** No proto whatsmeow (Go), `mediaKey`, `fileSHA256` e `fileEncSHA256` são `[]byte`, que o encoder JSON padrão do Go serializa como **base64 string** (não como `[]int`). Porém o swagger define esses campos como `type: array, items: {type: integer}`.

**Ação crítica:** Inspecionar um payload real de webhook com mensagem de imagem e verificar se `mediaKey` chega como:
- `"mediaKey": "abc+def==="` (base64 string — Go `encoding/json` padrão para `[]byte`)
- `"mediaKey": [72, 101, 108, 108, 111]` (array de ints — serialização proto-JSON ou customizada)

A resposta determina como o `DownloadMediaStruct` deve ser montado na Task 9.

---

### 3. Endpoint de download para áudio, vídeo e documento

**Incerteza:** O swagger mostra apenas `POST /message/downloadimage`. Não há `downloadaudio`, `downloadvideo`, `downloaddocument`.

**Ação:** Testar `POST /message/downloadimage` passando um `audioMessage` no body. Verificar se:
- O mesmo endpoint aceita qualquer tipo de mídia (detecta pelo sub-campo presente em `message`), ou
- Retorna erro para não-imagem, exigindo endpoints ainda não documentados.

---

### 4. Envio de áudio via `/send/media`

**Incerteza:** O `MediaStruct` tem campo `type: string`. Não está documentado se `"audio"` é um valor válido para `type` e qual o comportamento (PTT vs arquivo de áudio).

**Ação:** Testar `POST /send/media` com `{"type": "audio", "url": "https://...arquivo.ogg"}`. Verificar:
- Aceita e envia como áudio/PTT?
- Aceita como `"audio"` ou requer `"ptt"`?
- Existe campo separado para indicar PTT (push-to-talk) vs áudio comum?

---

### 5. Formato de `Timestamp` nos eventos

**Incerteza:** A documentação pública mostra `"Timestamp": "2026-01-15T10:30:00.000000-03:00"` (ISO-8601 com offset). Porém whatsmeow internamente representa timestamps como `time.Time` do Go, que pode ser serializado de formas diferentes dependendo da configuração do encoder.

**Ação:** Verificar no payload real do webhook se `data.Info.Timestamp` é:
- ISO-8601 string (ex.: `"2026-01-15T10:30:00.000000-03:00"`)
- Unix timestamp inteiro (ex.: `1718000000`)
- Unix timestamp com decimais (ex.: `1718000000.123`)

Isso afeta o parsing no `evolution-go` engine (Task 7).

---

### 6. Formato do campo de resposta de download

**Incerteza:** A resposta de `/message/downloadimage` não está no swagger. A hipótese é `{"success": true, "image": "<base64>"}`, mas o campo pode ter nome diferente (ex.: `"data"`, `"file"`, `"media"`) e pode variar por tipo de mídia.

**Ação:** Testar download de imagem e inspecionar a response completa.

---

### 7. Identificação da instância por path vs header

**Incerteza:** A documentação pública de instalação menciona `GET /instance/minha-instancia/qrcode` (path), mas o swagger define `GET /instance/qr` (sem path param). Pode haver divergência entre a versão documentada e a versão do swagger do servidor em `evogo.ailainteligente.com.br`.

**Ação:** Verificar o swagger em `https://evogo.ailainteligente.com.br/swagger/index.html` para confirmar se os paths do servidor real batem com o `doc.json` versionado neste repo, ou se há path params adicionais.

---

### 8. Nomes dos eventos no `subscribe`

**Incerteza:** A lista de eventos em `ConnectStruct.subscribe` foi obtida da documentação pública (string literal da página). Os valores exatos suportados pelo servidor podem diferir.

Valores observados na doc: `MESSAGE`, `SEND_MESSAGE`, `READ_RECEIPT`, `PRESENCE`, `HISTORY_SYNC`, `CHAT_PRESENCE`, `CALL`, `CONNECTION`, `LABEL`, `CONTACT`, `GROUP`, `NEWSLETTER`, `QRCODE`.

**Ação:** Conectar com todos e verificar quais eventos chegam no webhook durante teste e2e.

---

## Notas para Tasks seguintes

| Task | Dependência deste doc |
|---|---|
| Task 4 (tipos Go) | `CreateStruct`, `ConnectStruct`, `TextStruct`, `MediaStruct`, `DownloadMediaStruct`, `MessageStatusStruct` — campos e tipos exatos |
| Task 5 (cliente HTTP) | Auth header (`apikey`), path params, URL base |
| Task 6 (webhook handler) | Evento `MESSAGE` shape, campo `Info.ID`, `Info.Chat`, `Info.Sender`, `Info.Timestamp`, `Info.IsFromMe` |
| Task 7 (parsing inbound) | Sub-campos de `Message` por tipo (conversation/image/video/audio/document/sticker/reaction) |
| Task 8 (send pipeline) | `TextStruct` flat, `MediaStruct` flat (não wrapper), `QuotedStruct` |
| Task 9 (download mídia) | `DownloadMediaStruct.message` wrapping + incerteza `[]int` vs base64 — **blocker crítico** |
