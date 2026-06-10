# EvolutionProvider — Evolution API (PRD-113)

> Engine alternativo do `IWhatsAppProvider` (PRD-111) para Evolution API
> (open-source, self-hosted, ponte Baileys). Código em
> `src/providers/whatsapp/evolution/` — runtime-agnostic como o Meta.
> Versão alvo **v2.x pinada** (`EVOLUTION_TARGET_VERSION`); bump é PR explícito.

⚠️ **TOS:** Evolution opera em zona cinzenta dos termos do WhatsApp. Cliente
ciente do risco; mensagens críticas dependem do failover Meta (PRD-120).

## Capabilities honestas (RF-004)

| Capability | Valor | Nota |
| --- | --- | --- |
| `supportsTemplates` | ❌ | HSM não existe — `sendTemplate` lança `NOT_SUPPORTED` 422. **Não simular HSM com texto livre** |
| `supportsInteractive` | ❌ | `sendInteractive` lança `NOT_SUPPORTED` 422 |
| `supportsMediaUpload` | ❌ | **Desvio do PRD** (que dizia `true`): não há passo de upload separado — mídia vai por **URL** em `sendMedia`. `uploadOutboundMedia` lança `NOT_SUPPORTED` |
| `supportsStatusReadReceipts` | ✅ | acks Baileys via `messages.update` |
| `supportsCustomWebhook` | ✅ | URL configurável por instância |
| `maxMessageLength` | 65536 | sem limite estrito |
| `maxMediaSizeBytes` | 64MiB | configurável na VPS |

Consumidores (PRDs 115/116) ramificam por `capabilities`, nunca por nome —
como Evolution **não tem janela de 24h**, o fallback de template é texto livre.

## Credenciais e configuração

| Onde | O quê |
| --- | --- |
| `provider_config` (jsonb) | `{ "baseUrl": "https://evo...", "instanceName": "gallo-matriz" }` (CHECK da migration `20260610115402`) |
| `credentials_ref` | Prefixo dos secrets: `<ref>_API_KEY` (obrigatório — header `apikey`) e `<ref>_WEBHOOK_SECRET` (**opcional**) |

Sem webhook secret, `verifyWebhookSignature` retorna `true` e a autenticação
do webhook fica por conta do **IP allowlist** do PRD-114 (RF-061). Com secret,
valida HMAC-SHA256 constant-time (aceita com ou sem prefixo `sha256=`).

## Endpoints usados (v2)

| Operação | Endpoint |
| --- | --- |
| sendText | `POST /message/sendText/{instance}` → `key.id` |
| sendMedia | `POST /message/sendMedia/{instance}` — `media` é **URL** (Storage assinado — PRD-106); nunca base64 gigante |
| healthCheck | `GET /instance/connectionState/{instance}` — `open`→healthy; `connecting`/`close`→`healthy:false` com `detail: "state: ..."` (tri-state do PRD colapsado no contrato booleano do PRD-111; PRD-120 lê o detail) |
| downloadInboundMedia | `POST /chat/getBase64FromMediaMessage/{instance}` — `mediaId` é o **key id da mensagem** (ver parser); retorna base64 decodificado |

## Instância desconectada

Sessão WhatsApp caída (telefone offline, QR expirado) ⇒ erros com
`not connected`/`session`/`connection closed` mapeiam para
**`PROVIDER_DISCONNECTED` 503** — "WhatsApp desconectado, reconectar via QR
Code". `healthCheck` reflete (`state: close`). Reação: alerta operacional /
failover (PRD-120). Reconexão é manual no Dashboard Evolution (fora de escopo,
RF excluído).

## Parser de webhook (RF-060)

Eventos suportados:

- `messages.upsert` com `key.fromMe=false` → `IInboundMessage`
  (`conversation`/`extendedTextMessage`→text; `imageMessage`→image; audio,
  video, document, location, contact; resto → `unknown`). `mediaId` = key id.
- `messages.update` com `status` → `IInboundStatus`
  (`SERVER_ACK`→sent, `DELIVERY_ACK`→delivered, `READ`/`PLAYED`→read,
  `ERROR`→failed).
- `fromMe=true` (eco da própria conta) e demais eventos (`connection.update`…)
  **lançam** — o webhook (PRD-114) trata como "ignorar", não como falha.
- `toAccountPhone` vem do `sender` top-level (jid da instância) quando
  presente; a resolução autoritativa da conta no PRD-114 é por `instance`.

## Setup da VPS (referência)

Decisão pendente do índice da Onda 5: **VPS da AILA ou da GALLO?** (custo e
responsabilidade — confirmar com Edmilson). Requisitos mínimos: Docker,
2 vCPU / 4GB, HTTPS com domínio próprio, firewall + fail2ban; monitorar via
`healthCheck` (PRD-120) — o dashboard de saúde (PRD-110) cobre só a
plataforma.

1. `docker run` da imagem `atendai/evolution-api:v2.x` (tag pinada) com
   `AUTHENTICATION_API_KEY` forte (vira `<ref>_API_KEY`).
2. Criar instância no Manager (`instanceName` = o do `provider_config`).
3. Conectar o WhatsApp via QR Code no Manager.
4. `POST /webhook/set/{instance}` apontando para a Edge Function do PRD-114
   (eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE`).

## Teste de integração (gated — Fase 4 do PRD)

Sem instância de homologação até a decisão da VPS. Quando existir: enviar
`sendText` real, conferir `key.id` + `integration_logs`
(`whatsapp_evolution`), responder do celular e validar o parse.

## Troubleshooting

| Sintoma | Causa provável |
| --- | --- |
| `UNAUTHORIZED` 401 | `apikey` errada (`<ref>_API_KEY` ≠ `AUTHENTICATION_API_KEY` da VPS) |
| `NOT_FOUND` instância | `instanceName` divergente do Manager |
| `PROVIDER_DISCONNECTED` | Sessão caiu — reconectar QR no Manager |
| `healthCheck` com `ECONNREFUSED` | VPS/container fora do ar |
