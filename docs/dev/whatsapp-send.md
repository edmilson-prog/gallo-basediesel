# whatsapp-send — pipeline de envio (PRD-115)

> Edge Function autenticada que orquestra TODO envio outbound de WhatsApp.
> Núcleo em `src/providers/whatsapp/send/core.ts` (runtime-agnostic, 10
> testes Vitest, `ISendDb` injetado), espelhado em `_shared/whatsapp/send/`.

## Contrato

`POST /functions/v1/whatsapp-send` (JWT de usuário obrigatório):

```jsonc
{
  "conversationId": "<uuid>",
  "kind": "text" | "media" | "template",
  "text": "…",                       // texto ou caption (≤4096)
  "mediaPath": "conversations/...",  // path no bucket whatsapp-media OU URL absoluta
  "mediaType": "image|audio|video|document",
  "fileName": "orçamento.pdf",       // opcional — nome real do documento p/ o destinatário
  "templateName": "...", "templateLanguage": "pt_BR", "templateParameters": ["..."],
  "replyToMessageId": "wamid..."     // opcional
}
```

Sucesso: `{ messageId, providerMessageId, dispatchStatus: 'sent', traceId }`.
Erro: `{ error, code, traceId }` — `code` permite o frontend ramificar UX:

| `code` | HTTP | UX |
| --- | --- | --- |
| `TEMPLATE_REQUIRED` | 422 | Fora da janela 24h (Meta) — abrir picker de template (PRD-116) |
| `RATE_LIMITED` | 429 | "Aguarde alguns segundos" |
| `PROVIDER_DISCONNECTED` | 503 | Reconectar Evolution via QR Code |
| `CONVERSATION_CLOSED` | 422 | Reabrir a conversa |
| `FORBIDDEN` | 403 | Sem permissão na conversa |
| `VALIDATION_ERROR` | 422 | Detalhe no `error` |

## Fluxo (núcleo)

1. **Validação de input** (shape por kind, sem dependência externa).
2. **Permissão** (defense-in-depth além da RLS): staff (owner/manager) da
   loja, vendedor designado, ou qualquer vendedor da loja quando a conversa
   está no **pool** (`assigned_seller_id` null — espelha o claim model da RLS).
3. Conversa `resolvida`/`arquivada` ⇒ `CONVERSATION_CLOSED`.
4. **Janela 24h** (Meta, `kind != template`): RPC `is_within_24h_window(uuid)`
   (migration `20260610131941`, EXECUTE só service_role) — pré-check para a
   UX não depender do erro 131047 da Meta.
5. **Persistir antes de enviar** (RNF-002): INSERT `status='queued'`,
   `direction='out'`, `author_type='seller'`.
6. **Dispatch** via `buildWhatsAppEngine` (secrets de Edge Function pelo
   prefixo `credentials_ref`; toda chamada cai em `integration_logs`).
   - `media`: path do bucket `whatsapp-media` vira **signed URL TTL 5min**;
     URLs absolutas passam direto (Meta e Evolution baixam).
7. Sucesso ⇒ `status='sent'` + `provider_message_id` + touch
   `conversations.last_message_at` (sem `unread_count` — isso é inbound).
   Falha ⇒ `status='failed'` + `failure_reason`, audit, e o erro volta ao
   caller. `delivered`/`read` chegam DEPOIS pelo webhook (PRD-114), que casa
   pelo `provider_message_id`.
8. **Audit** em 100% das tentativas (action `dispatch`, sucesso ou falha).

## Frontend

`useMessageSend` (`src/features/conversations/hooks/useMessageSend.ts`):
- fonte **mock** → comportamento da Fase 1 intacto (simulação de status);
- fonte **supabase** → optimistic bubble + `functions.invoke('whatsapp-send')`;
  commit com o `messageId` real; erro ⇒ bolha `failed` + toast pt-BR por
  `code` (mapa `SEND_ERROR_MESSAGES`). Sem simulação client-side — statuses
  reais virão do webhook (refinamento de Realtime UPDATE no PRD-118).

O banner de janela 24h (`MetaWindowIndicator`) já existia da Fase 1 (RF-093 ✓).

## Status lifecycle

`queued → sent → delivered → read` (+ `failed` com `failure_reason`).
`queued` existe só server-side entre o INSERT e o aceite do provider — a UI
nunca o renderiza (resposta da função já volta `sent`).

## Desvios do PRD (registrados)

1. Schema `public`; colunas reais do repo (`status` na própria `messages`,
   `direction='out'`, sem `dispatch_status`/`is_internal_note`).
2. **Pool**: PRD só previa designado/staff; o repo tem conversas não
   atribuídas (claim model) — vendedor da loja pode enviar nelas.
3. `MediaUploader` novo NÃO foi criado: a tela de Conversa já tem fluxo de
   mídia da Fase 1; o wiring de upload real para `whatsapp-media` acontece na
   migração de stubs (PRD-119). O backend já aceita path ou URL.
4. Envio de template pelo frontend aguarda o catálogo do PRD-116 (o edge já
   suporta `kind='template'`).
5. Telefone do cliente precisa ter DDI (`+55…`) — o pipeline normaliza
   formatação, mas não adivinha código de país.
6. E2E real **gated** (secrets/credenciais — mesmos gates dos PRDs 112–114).
