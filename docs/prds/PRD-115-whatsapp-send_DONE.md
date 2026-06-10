# PRD-115: Envio de Mensagens WhatsApp

> ✅ **STATUS (2026-06-10): CONCLUÍDO** — Edge Function `whatsapp-send`
> deployada (v1, autenticada) com smokes 401 validados; núcleo runtime-agnostic
> `src/providers/whatsapp/send/core.ts` (10 testes Vitest): permissão
> defense-in-depth (staff/designado/**pool** — adaptação ao claim model do
> repo), pré-check da janela 24h via RPC `is_within_24h_window` (migration
> `20260610131941`, service_role only), persist-before-send
> (queued→sent|failed + `failure_reason`), signed URL 5min p/ mídia, audit em
> 100% das tentativas. Frontend: `useMessageSend` ramifica por fonte — mock
> intacto; supabase invoca a função com toasts pt-BR por `code`
> (TEMPLATE_REQUIRED/RATE_LIMITED/PROVIDER_DISCONNECTED…). Desvios em
> `docs/dev/whatsapp-send.md`: colunas reais do repo (sem `dispatch_status`),
> `MediaUploader` deferido p/ PRD-119 (tela já tem fluxo de mídia da Fase 1;
> backend aceita path/URL), template UI aguarda PRD-116 (edge já suporta),
> banner 24h já existia (`MetaWindowIndicator`), e2e real gated
> (secrets/credenciais). Bump v2.1.0-rc.5 não se aplica (SemVer 0.x próprio).

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/whatsapp-send/` + `src/features/conversations/`_ |
| **Objetivo** | Implementar o lado **outbound** do CRM: vendedor (ou Edge Function automatizada) envia mensagem WhatsApp → Edge Function `whatsapp-send` valida permissão, resolve provider, checa janela de 24h (Meta), persiste mensagem em `crm.messages` (status `queued`), dispara envio via `IWhatsAppProvider`, atualiza para `sent` + `provider_message_id`. Tratamento granular de erros (rate limit, fora janela, número inválido). Substitui mock de envio das telas de Conversa (PRD-011) |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — sem envio, CRM WhatsApp é apenas leitura |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRD-111 (interface); PRD-112 (Meta); PRD-113 (Evolution); PRD-101 (`messages`, `conversations`); PRD-102 (Edge Functions, withAuth, audit); PRD-106 (Storage para mídia outbound); PRD-114 (recebe status de entrega via webhook); PRD-011 Fase 1 (Conversa Multicanal — consumidor frontend); PRD-117 (Session 24h — usado aqui) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Edge Function `supabase/functions/whatsapp-send/index.ts` + hooks frontend em `src/features/conversations/` |

### Critérios de Complexidade

> **Justificativa de Alta:** envio combina lógica de domínio (janela 24h, templates, validações), integração externa (provider real), persistência transacional (message → provider → update), tratamento de erros nuançado (rate limit retry vs falha definitiva), upload de mídia separado, audit log. Frontend precisa de feedback de progresso (queued → sending → sent → delivered → read). Erro causa mensagem perdida ou duplicada.

---

## Contexto do Problema

PRD-114 (Webhook) deu **recepção**. Falta **envio**. O fluxo típico:

1. Vendedor abre conversa com cliente
2. Digita mensagem
3. Clica enviar
4. Sistema:
   - Valida que pode enviar (conversa válida, vendedor é dono ou owner/manager)
   - Checa janela 24h Meta (se Meta + última inbound > 24h → template HSM, vide PRD-116)
   - Persiste message com status `queued`
   - Chama provider
   - Atualiza status `sent` + `provider_message_id`
   - Em sucesso: realtime propaga para tela
5. Webhook (PRD-114) depois traz delivered/read

Sem este PRD, o frontend tem botão "Enviar" mas sem backend para servir.

---

## Conceito da Solução

### Edge Function `whatsapp-send`

```typescript
// supabase/functions/whatsapp-send/index.ts (resumo)
serve(async (req) => {
  const ctx = await withAuth(req, log)  // vendedor autenticado
  const input = await validateInput(req)
  
  // 1. Verifica permissão na conversation (RLS já cobre, mas valida explicitamente)
  const conv = await getConversation(input.conversationId, ctx)
  
  // 2. Resolve provider
  const provider = await getWhatsAppProvider(conv.whatsappAccountId)
  
  // 3. Check janela 24h (se Meta)
  if (provider.providerName === 'meta' && input.kind === 'text') {
    const within24h = await isWithin24hWindow(conv.id)
    if (!within24h) {
      throw new AppError('TEMPLATE_REQUIRED', 422,
        'Cliente sem mensagem nas últimas 24h. Use um template HSM.')
    }
  }
  
  // 4. Persiste message com status queued
  const message = await insertMessage({
    conversationId: conv.id,
    direction: 'outbound',
    contentType: input.contentType,
    content: input.text,
    mediaUrl: input.mediaPath,
    senderSellerId: ctx.sellerId,
    dispatchStatus: 'queued',
    createdAt: now(),
  })
  
  // 5. Envia via provider
  try {
    const result = await provider.sendText(/* ou sendMedia, sendTemplate */)
    await updateMessage(message.id, {
      providerMessageId: result.providerMessageId,
      dispatchStatus: 'sent',
    })
  } catch (err) {
    await updateMessage(message.id, {
      dispatchStatus: 'failed',
      failureReason: err.userMessage,
    })
    throw err  // retorna ao frontend
  }
  
  // 6. Atualiza conversation
  await updateConversation(conv.id, { lastMessageAt: message.createdAt })
  
  // 7. Audit
  await writeAuditLog(/* ... */)
  
  return { messageId: message.id, dispatchStatus: 'sent' }
})
```

### Fluxo Frontend

```typescript
// src/features/conversations/hooks/useSendMessage.ts
export function useSendMessage(conversationId: string) {
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'failed'>('idle')
  
  const send = async (text: string) => {
    setStatus('sending')
    try {
      await crmClient.functions.invoke('whatsapp-send', {
        body: { conversationId, kind: 'text', text }
      })
      setStatus('sent')
      // Realtime atualiza a mensagem em queued→sent automaticamente
    } catch (err) {
      setStatus('failed')
      // Se err.code === 'TEMPLATE_REQUIRED': UI sugere abrir picker de template
    }
  }
  
  return { send, status }
}
```

### Tratamento da Janela 24h

```sql
-- Função SQL helper consultada pela Edge Function
CREATE OR REPLACE FUNCTION crm.is_within_24h_window(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM crm.messages
    WHERE conversation_id = p_conversation_id
      AND direction = 'inbound'
      AND created_at > now() - interval '24 hours'
  );
$$;
```

Edge Function chama essa função antes de tentar envio (Meta apenas). Se fora da janela → erro `TEMPLATE_REQUIRED`. Frontend mostra picker de template (PRD-116) ao receber esse erro.

### Upload de Mídia Outbound

```
[Vendedor seleciona arquivo no frontend]
   ──▶ Frontend faz upload direto via Storage API: bucket='whatsapp-media', path='conversations/<id>/outbound/<uuid>/<filename>'
   ──▶ Recebe path
   ──▶ Chama whatsapp-send com mediaPath=<path>
   ──▶ Edge Function gera signed URL (curto TTL)
   ──▶ Passa URL para provider.sendMedia (Meta baixa; Evolution baixa)
   ──▶ Status normal
```

Alternativa: usar `provider.uploadOutboundMedia` (Meta) — mas requer base64 transferido para Edge Function. Mais lento. URL é melhor.

### Status Transitions

```
queued → sent → delivered → read
              ↓
              failed (com failureReason)
```

`sent` é set imediatamente após provider aceitar. `delivered`/`read` vêm via webhook (PRD-114).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Frontend chama provider direto (sem Edge Function) | Provider precisa de Vault/service_role; impossível no frontend |
| Queue assíncrona (envia depois) | Vendedor espera sincronicamente; UX exige imediato |
| Sem persistência prévia (envia e depois grava) | Falha de rede entre envio e persist = mensagem fantasma no provider |
| Validar janela 24h só no provider (deixa Meta lançar) | Pior UX — primeiro tenta, falha, depois sugere; pré-check é melhor |
| Upload de mídia em base64 via Edge Function | Lento; URL é mais elegante |

---

## Escopo

### Incluído

- ✅ Edge Function `supabase/functions/whatsapp-send/index.ts` que orquestra envio
- ✅ Validação de input via Zod (ou similar)
- ✅ Verificação de permissão (vendedor é dono da conversa ou owner/manager)
- ✅ Function SQL `crm.is_within_24h_window(conversation_id)`
- ✅ Persistência de message com status `queued` → `sent` (ou `failed`)
- ✅ Atualização de `conversations.last_message_at`
- ✅ Audit log estruturado
- ✅ Frontend: hook `useSendMessage(conversationId)` + integração na tela de Conversa (PRD-011)
- ✅ Upload de mídia frontend → Storage → Edge Function recebe path → gera signed URL → provider envia
- ✅ Tratamento de erros granular:
  - `TEMPLATE_REQUIRED` → frontend abre picker
  - `RATE_LIMITED` → frontend mostra "muitos envios, aguarde"
  - `PROVIDER_DISCONNECTED` (Evolution) → alerta de reconectar
  - `VALIDATION_ERROR` → mostra detalhe (número inválido etc.)
- ✅ Suporte a `sendText`, `sendMedia` (image, audio, video, document)
- ✅ Suporte a `sendTemplate` (delega ao PRD-116 que entrega catálogo + render; este PRD apenas dispara)
- ✅ Testes unitários: validação, permissão, janela 24h, sucesso, falha
- ✅ Teste E2E: enviar mensagem real, validar persistência + status + audit
- ✅ Documentação `docs/dev/whatsapp-send.md`

### Excluído

- ❌ Catálogo de templates HSM e UI de seleção (vai no PRD-116)
- ❌ Retry automático em falha (caller manual ou job futuro)
- ❌ Agendamento de envio (Onda 8 / Engagement futuro)
- ❌ Broadcast / envio em massa (Onda 8)
- ❌ Bot / auto-responder (Onda 9)
- ❌ Encriptação E2E (WhatsApp já cuida server→cliente)

---

## Requisitos Funcionais

### Edge Function — Estrutura

- **RF-001:** Endpoint POST `/functions/v1/whatsapp-send`
- **RF-002:** Autenticação obrigatória via `withAuth` (PRD-102) — apenas usuários autenticados
- **RF-003:** Input validado via Zod:
  ```ts
  {
    conversationId: string (uuid),
    kind: 'text' | 'media' | 'template',
    text?: string (max 4096),
    mediaPath?: string,
    mediaCaption?: string,
    mediaType?: 'image' | 'audio' | 'video' | 'document',
    templateName?: string,
    templateLanguage?: string,
    templateComponents?: any[]
  }
  ```

### Validação de Permissão

- **RF-010:** Lê `crm.conversations` via service_role (Edge Function bypassa RLS para checar) WHERE `id = conversationId`.
- **RF-011:** Valida que `auth.sellerId == conversation.sellerId` OR `auth.role IN ('owner', 'manager')` da mesma store.
- **RF-012:** Conversa fechada (`status = 'closed'`) → `AppError('CONVERSATION_CLOSED', 422)`.

### Janela 24h (Meta only)

- **RF-020:** Se `provider.providerName === 'meta'` e `kind === 'text'`:
  - Chama `crm.is_within_24h_window(conversationId)` → boolean
  - Se `false`: lança `AppError('TEMPLATE_REQUIRED', 422, 'Fora da janela de 24h. Use um template HSM.')`
- **RF-021:** Se `kind === 'media'` em Meta: também precisa janela (caption livre é texto livre na essência)
- **RF-022:** Se `kind === 'template'`: pular check (template é justamente para fora da janela)
- **RF-023:** Evolution: pular check (não tem janela)

### Persistência de Message

- **RF-030:** INSERT em `crm.messages` antes de chamar provider:
  - `conversation_id`
  - `direction = 'outbound'`
  - `content_type` (text/image/audio/video/document)
  - `content` (texto ou caption)
  - `media_url` (path no Storage se mídia)
  - `sender_seller_id = ctx.sellerId`
  - `dispatch_status = 'queued'`
  - `is_internal_note = false`
  - `created_at = now()`
  - Sem `meta_message_id` ainda
- **RF-031:** Recebe `messageId`. Mantém em escopo da function.

### Chamada ao Provider

- **RF-040:** Resolve via `getWhatsAppProvider(conversation.whatsappAccountId)`
- **RF-041:** Para `kind='text'`: chama `provider.sendText({ accountId, to: customer.whatsapp, text, replyToMessageId: input.replyTo, traceId })`
- **RF-042:** Para `kind='media'`:
  - Gera signed URL do mediaPath (TTL 5min) — Edge Function só, com service_role
  - Chama `provider.sendMedia({ accountId, to, mediaType, mediaUrl: signedUrl, caption })`
- **RF-043:** Para `kind='template'`:
  - Chama `provider.sendTemplate({ accountId, to, templateName, languageCode, components })`
  - PRD-116 entrega construção dos `components` (a partir de catálogo + variáveis)
- **RF-044:** Em caso de erro do provider: capture o erro, **atualize message para failed**, depois re-throw para o frontend ver.

### Atualização Pós-Envio

- **RF-050:** Em sucesso, UPDATE `crm.messages` SET:
  - `meta_message_id = result.providerMessageId`
  - `dispatch_status = 'sent'`
  - `webhook_event_ids = []` (será populado por status updates)
- **RF-051:** Em falha:
  - `dispatch_status = 'failed'`
  - `failure_reason = err.userMessage` (em coluna ou em payload jsonb)
- **RF-052:** UPDATE `crm.conversations` SET `last_message_at = now()`.

### Audit Log

- **RF-060:** `writeAuditLog`:
  - `actor_id = ctx.sellerId`
  - `actor_type = 'seller'`
  - `entity_type = 'message'`
  - `entity_id = messageId`
  - `action = 'dispatch'`
  - `payload = { provider, kind, contentType, success, providerMessageId?, errorCode? }`
  - `trace_id`

### Frontend — Hook `useSendMessage`

- **RF-070:** `useSendMessage(conversationId)` em `src/features/conversations/hooks/`
- **RF-071:** `send(input)` chama `crmClient.functions.invoke('whatsapp-send', { body })`
- **RF-072:** Estado `'idle' | 'sending' | 'sent' | 'failed'`
- **RF-073:** Em erro `TEMPLATE_REQUIRED`: retorna flag para componente abrir picker de template (PRD-116)
- **RF-074:** Em erro `RATE_LIMITED`: retorna mensagem amigável "Limite de envios atingido, aguarde alguns segundos"
- **RF-075:** Em erro `PROVIDER_DISCONNECTED`: retorna alerta para Owner notificar IT
- **RF-076:** Sucesso: message aparece via Realtime (PRD-105) automaticamente — hook não precisa atualizar lista manualmente

### Frontend — Upload de Mídia

- **RF-080:** Componente `MediaUploader` na tela de Conversa:
  - Aceita drag-and-drop ou click
  - Valida MIME e tamanho (16MB Meta, 64MB Evolution conforme capabilities)
  - Upload via `storage.upload('whatsapp-media', path, file)` (PRD-106 provider)
  - path = `conversations/<convId>/outbound/<uuid>/<sanitized-filename>`
  - Retorna path para o componente principal que dispara `send({ kind: 'media', mediaPath: path, ... })`

### Integração na Tela de Conversa

- **RF-090:** Tela `/app/conversas/<id>` (PRD-011) substitui mock de send pelo hook real
- **RF-091:** Indicador de status na mensagem (UI): ⏳ queued, ✓ sent, ✓✓ delivered, ✓✓ (azul) read, ⚠ failed
- **RF-092:** Em failed: opção "Tentar novamente" (nova invocação)
- **RF-093:** Banner de "Fora da janela de 24h" exibido quando última inbound > 24h — UX antecipa antes do envio falhar

### Tratamento de Tipo de Mensagem Não-Suportado

- **RF-100:** Se `kind='template'` em provider Evolution (que não suporta — PRD-113 RF-040): provider lança `NOT_SUPPORTED` → frontend mostra mensagem clara

### Testes

- **RF-110:** Testes unitários:
  - Input validation
  - Permissão (vendedor errado bloqueado)
  - Janela 24h (within → ok, outside → TEMPLATE_REQUIRED)
  - Sucesso: message status flow queued → sent
  - Falha: status flow queued → failed + audit
- **RF-111:** Teste E2E: enviar mensagem text real em staging; validar status; validar realtime atualiza UI

### Documentação

- **RF-120:** `docs/dev/whatsapp-send.md`:
  - Fluxo completo
  - Tratamento de erros e UX correspondente
  - Janela 24h e fallback
  - Upload de mídia
  - Status lifecycle

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Envio text simples completa em < 2s p95 (incluindo round-trip Meta).
- **RNF-002 (Confiabilidade):** Mensagem persistida ANTES do provider — em falha de provider, message existe com status failed (rastreabilidade).
- **RNF-003 (UX):** Frontend reflete status real (queued → sent → delivered → read) via Realtime sem polling.
- **RNF-004 (Segurança):** RLS protege quem pode enviar; Edge Function ainda valida explicitamente como dupla camada.
- **RNF-005 (Auditabilidade):** Audit log em 100% das tentativas (sucesso e falha).
- **RNF-006 (Idempotência opcional):** Se frontend envia o mesmo conteúdo 2× (clique duplo), idempotência via `client-generated-id` no input (futuro; MVP confia em debounce frontend).

---

## Critérios de Aceitação

### RF-020 + RF-074: Janela 24h e Picker

```gherkin
DADO uma conversa com cliente cuja última mensagem inbound foi há 30 horas (provider Meta)
QUANDO vendedor tenta enviar text "Olá"
ENTÃO Edge Function retorna AppError code='TEMPLATE_REQUIRED'
  E frontend exibe "Fora da janela de 24h, envie um template"
  E botão "Selecionar template" abre o picker (PRD-116)
```

### RF-030 + RF-050 + RNF-002: Status Flow

```gherkin
DADO vendedor envia text válido
QUANDO Edge Function processa
ENTÃO message inserido com dispatch_status='queued' em < 100ms
  E provider.sendText chamado
  E em sucesso, dispatch_status='sent' + provider_message_id preenchido
  E Realtime propaga UPDATE para frontend
  E UI atualiza ⏳ → ✓

QUANDO webhook depois recebe status 'delivered' (PRD-114)
ENTÃO dispatch_status='delivered'
  E UI atualiza ✓ → ✓✓
```

### RF-044 + RF-051: Falha

```gherkin
DADO provider Meta retorna erro de número inválido
QUANDO Edge Function captura
ENTÃO message já inserido como queued → UPDATE para dispatch_status='failed'
  E failure_reason='Número não é WhatsApp'
  E Edge Function lança AppError
  E frontend exibe mensagem amigável
  E botão "Tentar novamente" disponível
```

### RF-010 + RF-011: Permissão

```gherkin
DADO vendedor S2 tenta enviar em conversa de S1
QUANDO Edge Function valida
ENTÃO lança AppError code='FORBIDDEN'
  E mensagem não é persistida nem enviada
  E audit log registra tentativa
```

### RF-080: Upload de Mídia

```gherkin
DADO vendedor faz upload de imagem 3MB
QUANDO MediaUploader aceita
ENTÃO upload via storage.upload em < 5s
  E retorna path
  E send({ kind: 'media', mediaPath: path }) é invocado
  E provider envia via signed URL
  E message persistido com media_url=path
```

---

## Fases de Implementação

### Fase 1 — Edge Function + Validação (1 dia)
- Estrutura, withAuth, input validation
- Permissão check
- Helper SQL is_within_24h_window

### Fase 2 — Envio Text + Persistência (1.5 dias)
- sendText flow completo
- Status transitions
- Audit log

### Fase 3 — Mídia + Template (1.5 dias)
- sendMedia com signed URL
- sendTemplate delegando ao PRD-116 (stub se PRD-116 não pronto)
- Upload frontend

### Fase 4 — Frontend Hook + Tela + Docs (1.5 dias)
- useSendMessage
- Integração tela Conversa
- UI status indicators
- Picker de template stub
- `docs/dev/whatsapp-send.md`
- E2E test
- `_DONE`

---

## Dependências

- **Depende de:** PRD-111, PRD-112 ou 113, PRD-101, PRD-102, PRD-103, PRD-105, PRD-106, PRD-107
- **Bloqueia:** PRD-118 (status tracking refina o que rola aqui), PRD-119 (migração de stubs)
- **Acoplado a:** PRD-116 (templates) — pode entregar com stub se 116 não pronto
- **Decisões Pendentes:** debounce vs idempotency id (sugerido debounce no MVP); UX de retry (sugerido botão manual)

---

## Considerações de Segurança

- **Edge Function valida permissão** independente de RLS (defense-in-depth)
- **service_role limitado:** Edge Function usa para resolver provider/credentials; nunca expõe
- **Signed URL TTL curto:** 5min para mídia outbound — provider tem tempo de baixar, atacante não
- **Audit log capturalh autor:** rastreabilidade total
- **No content injection:** texto vai sanitizado (escape de caracteres Meta)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.5; CHANGELOG; renomear `PRD-115-whatsapp-send_DONE.md`; teste real ida e volta com webhook recebendo status.

| Princípio | Descrição |
|-----------|-----------|
| **Persistir antes de enviar** | message como queued garante rastreabilidade |
| **Status reflete realidade** | UI mostra o que provider efetivamente reportou |
| **Falha não desaparece** | failed message fica visível para retry |
| **Janela 24h é pré-check** | Não esperar Meta lançar; UX antecipa |

| ❌ Evitar |
|-----------|
| Enviar antes de persistir |
| Confiar só em RLS para permissão (validar explicitamente também) |
| Mostrar "enviado" antes do provider confirmar |
| Esquecer audit log em falha |
| Permitir envio em conversation fechada |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO (com desvios documentados — ver nota no topo) |
| **Data** | 2026-06-10 |
| **Versão** | PR do PRD-115 (bump no merge) |
| **Por** | Claude Code CLI |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2b do Lote 2 (Onda 5) |

---

**AILA - Sistemas Inteligentes**
