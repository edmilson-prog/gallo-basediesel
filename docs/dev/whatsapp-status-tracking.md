# Status tracking de mensagens WhatsApp (PRD-118)

> Completa o ciclo aberto pelos PRDs 114/115: o vendedor VÊ o estado de cada
> mensagem (✓, ✓✓, ✓✓ azul), entende POR QUE falhou e tem ação corretiva
> (retry, confirmação para número inválido); o Owner monitora a saúde de
> entrega por conta no dashboard.

## Lifecycle

```
queued ──► sent ──► delivered ──► read
   │         │           │
   └─────────┴───────────┴──► failed ──(retry manual)──► NOVA mensagem (queued…)
```

- `queued`: persist-before-send (PRD-115) — transiente; pode aparecer na UI
  por instantes via Realtime.
- `sent/delivered/read/failed`: aplicados pelo webhook (PRD-114) por
  `provider_message_id`; agora gravando também `failure_code` (código
  semântico, ex. `131026`) além de `failure_reason`.
- **Retry NUNCA muda a mensagem failed** — cria uma nova pelo pipeline real
  com `retryOfMessageId`; audit `dispatch_retry` carrega `originalMessageId`.

## Badges (espelham o WhatsApp consumer)

| Status | Ícone | Cor | aria-label |
| --- | --- | --- | --- |
| queued | relógio | cinza | Enviando |
| sent | ✓ | cinza | Enviada |
| delivered | ✓✓ | cinza | Entregue |
| read | ✓✓ | azul | Lida |
| failed | ⚠ | vermelho | Falha no envio (tooltip mostra o motivo) |

Renderizados pelo `statusVisual()` (`utils/messageDisplay.ts`) no
`BubbleChrome` (conversa) e no preview da `ConversationListItem` (inbox,
mini-badge quando a última mensagem é outbound).

## Tempo real na conversa

`useRealtimeMessages(conversationId, applyRealtimeRow)` — assina
`public.messages` (canal compartilhado ref-counted do PRD-105; RLS escopa
server-side) e faz upsert na conversa aberta:

- INSERT inbound → mensagem aparece sem reload (e a janela 24h do PRD-117
  reabre na hora);
- UPDATE → badge transiciona ao vivo; **status nunca regride** (ranking
  queued<sent<**failed**<delivered<read) — um INSERT atrasado de `queued` não
  rebaixa uma bolha `sent`. ⚠️ `failed` é **recuperável**, não terminal: o
  Evolution/Baileys dispara um ack `ERROR` espúrio no meio do ciclo (mensagens
  na verdade entregues/lidas); por isso um `delivered`/`read` posterior
  **supera** o `failed` — evita o falso negativo (bolha presa no vermelho).
  Fonte única do ranking: `src/providers/whatsapp/messageStatus.ts`
  (`statusAdvances`), espelhada no webhook via sync.
- Duplicação com a bolha otimista: o `commit` do envio remove a cópia que o
  Realtime tenha inserido antes (mesmo id real).

Fonte `mock`: no-op — simulador da Fase 1 intacto.

## Número inválido (Meta 131026)

1. **Detecção** — webhook (status failed `131026`) ou falha síncrona do envio
   (`details.metaCode`): `customers.whatsapp_status = 'invalid'` + audit
   `customer_whatsapp_marked_invalid` (ator integração).
2. **Bloqueio** — `whatsapp-send` bounça com `CUSTOMER_INVALID_WHATSAPP` 422
   antes de persistir. Staff (owner/manager) reenvia com
   `overrideInvalid: true` (audit `dispatch_override_invalid`); vendedor comum
   recebe 403 ao tentar override.
3. **UI** — diálogo de confirmação para staff no `MessageInput`; toast
   explicativo para vendedor; badge "Número não é WhatsApp" no header da
   conversa.
4. **Revalidação é MANUAL** (RF-052) — botão "Marcar como WhatsApp válido"
   (staff) no header; nunca automática após um envio dar certo.

## Saúde de entrega (dashboard Owner)

RPC `public.whatsapp_delivery_health(p_hours)` — SECURITY DEFINER com filtro
silencioso owner-only (mesmo padrão `system_health_*`): agregados por conta
(enviadas, aceitas %, entregues %, lidas %, falhas) + top 5 `failure_code`.
Consumida via `systemHealth.getWhatsAppDeliveryHealth()` e exibida na seção
"WhatsApp — Saúde de Entrega" de `/app/gestao/saude` (janelas 24h / 7 dias).
Seção #118 na suíte `supabase/tests/rls-regression.sql`.

## Desvios do PRD (registrados)

1. Schema `public` (não `crm`); coluna da casa `messages.status` (não
   `dispatch_status`); `AppError` → `WhatsAppProviderError`.
2. Dashboard em `/app/gestao/saude` (host do PRD-110), **owner-only** como o
   restante da página (o PRD pedia Owner/Manager); RPC agregadora em vez de
   view `v_whatsapp_delivery_health` (padrão da casa: RPC scoped, MVs sem RLS
   têm SELECT revogado).
3. Top falhas **sem** amostra de clientes clicável e **sem** link "Ver
   conversas com falha" / filtro de inbox por falha (RF-031) — adiados:
   exigem projeção extra e novo filtro provider-side com valor marginal no
   MVP; revisar no PRD-120 (monitoring).
4. Retry de mensagens kind=template reenvia como texto e pode bounçar em
   `TEMPLATE_REQUIRED` (template name/params não são persistidos na message)
   — o picker resolve; persistir metadata de template fica para onda futura.
5. e2e real (envio → falha → retry) **gated** nas credenciais Meta — mesmos
   gates dos PRDs 112–117; cobertura via fakes injetados (8 testes novos).
