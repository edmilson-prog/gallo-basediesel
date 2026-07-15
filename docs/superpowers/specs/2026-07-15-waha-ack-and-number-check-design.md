# Design — WAHA: checagem de número + confirmação de entrega/leitura

- **Data:** 2026-07-15
- **Codinome sugerido:** _(definir no version bump)_
- **Status:** Aprovado (brainstorming) — aguardando plano de implementação
- **Escopo:** engine **WAHA** apenas · `whatsapp-check-number` · `waha-webhook` · `src/providers/whatsapp/waha/`

---

## 1. Contexto e problema

Um vendedor criou uma conversa nova pra um número sem histórico prévio (fluxo "Nova conversa" → número novo) e mandou uma mensagem de teste pela conta WAHA "VendasExterna". A mensagem ficou com check único (✓) parado — nunca virou check duplo — e o destinatário confirmou fisicamente que ela nunca chegou.

Investigação (ver `docs/checkpoints/` desta sessão) achou a causa: **não é bug de código, são duas lacunas conhecidas e documentadas** desde o design original da integração WAHA (`docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md`, seção "Não-objetivos"):

1. **`whatsapp-check-number` é Evolution-only.** Pra contas WAHA, a edge function sempre responde `422 UNSUPPORTED_PROVIDER`; o cliente trata qualquer erro como "pular checagem" (fail-open, por design). Resultado: pra WAHA, a checagem "esse número tem WhatsApp?" nunca roda — o app manda a mensagem sem saber se existe conta do outro lado.
2. **`message.ack` não é assinado.** `WAHA_DEFAULT_EVENTS` só tem `["message", "message.any", "session.status"]` — documentado como "fica para uma 2ª fase" no design original. Sem esse evento, o sistema nunca sabe se uma mensagem WAHA foi entregue, lida, ou falhou — ela fica "enviada" pra sempre, com ou sem entrega real.

Combinadas, as duas lacunas tornam uma falha de entrega **completamente silenciosa** pro vendedor: nem é bloqueado antes de mandar, nem é avisado depois que falhou.

Evidência da investigação: o próprio eco do envio (evento `message.any`, tratado como duplicado) já trazia `"ack":1,"ackName":"SERVER"` embutido no payload — prova de que o dado existe no WAHA, só não estava sendo lido nem havia assinatura para atualizações posteriores.

## 2. Objetivo

Fechar as duas lacunas, **só para o engine WAHA**, sem tocar nos outros 3 engines (Meta/Evolution/Evolution Go) nem nos objetos congelados (`can_access_conversation`, as 3 RPCs cópia, `current_seller_accessible_account_ids`, `whatsapp_health_tick`) — mesma régua de isolamento do design original.

### Não-objetivos (YAGNI, confirmados com o dono)

- **Sem reconciliação retroativa** — mensagens WAHA já enviadas (ex.: a de teste) continuam como estão; só passa a valer para envios após o deploy.
- **Sem mudança nos outros engines** — Meta/Evolution/Evolution Go/OpenWA seguem exatamente como estão.
- **Sem novo failover ou tick de saúde** — escopo é só checagem de número + status de entrega/leitura.
- **Sem mudança de UX no frontend** — `NewConversationDialog`/`checkWhatsAppNumber.ts` já são agnósticos de provider; o bloqueio "não parece ter WhatsApp" + override "Iniciar mesmo assim" (D6) passa a funcionar pra WAHA sem tocar em nenhum componente React.

### Critérios de sucesso

1. Iniciar conversa nova com um número WAHA sem WhatsApp aciona o mesmo aviso/bloqueio que já existe pro Evolution.
2. Uma mensagem WAHA que é entregue de fato mostra check duplo na UI (sem intervenção manual).
3. Uma mensagem WAHA lida pelo destinatário mostra o indicador de lida.
4. Contas WAHA já conectadas (ex.: "VendasExterna") recebem `message.ack` automaticamente após o deploy, sem o dono precisar reabrir/salvar cada conta manualmente.
5. Nenhum arquivo de `_shared/whatsapp/{webhook,send}/core.ts`, `can_access_conversation`, as 3 RPCs cópia ou `current_seller_accessible_account_ids` é alterado.

## 3. Checagem de número (`whatsapp-check-number`)

### 3.1 Novo helper WAHA

`checkWahaNumberExists(apiKey, fetchFn, target: IWahaSessionTarget, phone: string)` em `src/providers/whatsapp/waha/contacts.ts` (mesmo arquivo de `resolveWahaLid`/`getWahaContactName` — já é "WAHA contact/identity helpers"). Usa o endpoint real do WAHA:

```
GET /api/contacts/check-exists?phone={phone}&session={session}
→ { numberExists: boolean, chatId: string }
```

(contrato confirmado em `waha.devlike.pro/docs/how-to/contacts/` durante o brainstorming — existe também um `GET /api/checkNumberStatus` mais antigo, **deprecated** em favor deste.)

Retorna `{ exists: boolean, e164?: string }` — `e164` derivado do `chatId` (`<digits>@c.us` → `+<digits>`) quando `numberExists`, mirando o formato que `IWhatsAppNumberCheck` (Evolution) já usa. Nunca lança em 404/resposta vazia — mesmo contrato defensivo dos outros helpers desse arquivo.

### 3.2 `whatsapp-check-number/index.ts`

Passa a ramificar por `account.provider`:
- `"evolution"` → caminho atual, inalterado.
- `"waha"` → resolve `waha_servers` por `account.waha_server_id` (mesmo padrão de `resolveWahaTarget` em `wahaSendAdapter.ts`: `base_url` + `api_key_ref` via Vault), extrai `sessionName` de `provider_config`, chama `checkWahaNumberExists`.
- Qualquer outro provider → mantém `422 UNSUPPORTED_PROVIDER` (sem mudança).

Gate de `status !== "connected"` (`409 INSTANCE_OFFLINE`) se aplica igual para os dois providers.

### 3.3 Frontend

Zero mudança. `checkWhatsAppNumber.ts` já invoca a edge function por `accountId` sem saber o provider; `classifyNumberCheck` já trata `exists:false` como bloqueio (D6) e qualquer erro como `skipped`. O fluxo "Iniciar mesmo assim" em `NewConversationDialog` já existe e passa a ser exercitado pra WAHA automaticamente.

## 4. Confirmação de entrega/leitura (`message.ack`)

### 4.1 Assinatura do evento

`WAHA_DEFAULT_EVENTS` (em `src/providers/whatsapp/waha/constants.ts`) passa de:

```ts
["message", "message.any", "session.status"]
```

para:

```ts
["message", "message.any", "session.status", "message.ack"]
```

### 4.2 Mapeamento de ack (função pura, testada)

Nova função `mapWahaAckToStatus(ack: number): DeliveryStatus` em `src/providers/whatsapp/waha/ack.ts` (mirror gerado em `_shared/whatsapp/waha/ack.ts`). Escala confirmada tanto na investigação (`ackName:"SERVER"` = `ack:1`, visto ao vivo) quanto nos docs públicos do WAHA (`waha.devlike.pro/docs/how-to/events/`):

| `ack` | `ackName` | `DeliveryStatus` |
|---|---|---|
| ≤ -1 | ERROR | `failed` |
| 0 | PENDING | `queued` |
| 1 | SERVER | `sent` |
| 2 | DEVICE | `delivered` |
| ≥ 3 | READ / PLAYED | `read` |

### 4.3 `waha-webhook/index.ts`

Novo helper `applyWahaAckToMessage(admin, providerMessageId, ack, timestamp)`:
1. Busca a mensagem por `provider_message_id` (mesma busca sem-escopo-extra já usada no dedup do eco outbound).
2. Se não achar, no-op (mensagem pode não existir ainda, ou ser de outra loja/instância — silencioso, mesma postura defensiva do resto do arquivo).
3. Calcula o `DeliveryStatus` alvo via `mapWahaAckToStatus`.
4. Aplica com `statusAdvances` (reaproveitado de `_shared/whatsapp/messageStatus.ts`, já genérico — **sem editar esse arquivo**), gravando `delivered_at`/`read_at` quando avança pra `delivered`/`read`.

Dois pontos de chamada:
- **Evento dedicado `"message.ack"`** — novo branch no switch de eventos, chama o helper e responde 200.
- **Eco `"message.any"` já tratado como duplicado** (linha ~384 do arquivo atual) — antes de responder `{ok:true, duplicate:"app-send echo"}`, chama o helper com o `ack`/`ackName` que já vêm embutidos no payload (confirmado na investigação: `payload.ack`, `payload.ackName`). Sinal extra "de graça", sem esperar o evento dedicado.

### 4.4 Rollout nas contas já conectadas

Nenhuma migration de schema é necessária (`messages.delivered_at/read_at/failure_reason/failure_code/provider_message_id` já existem — usados pelo pipeline Meta/Evolution).

Passo de deploy dedicado (script ou chamada única, não uma Edge Function nova): para cada linha de `whatsapp_accounts` com `provider='waha'` e `status='connected'`, chama `updateWahaSessionConfig` (já existe em `session.ts`) reconstruindo a config completa com a lista de eventos nova — reinscreve a sessão sem novo QR (comportamento já documentado da função: "requires the COMPLETE config and, when the session isn't STOPPED, stops+starts it with the new config, auth/pairing preserved").

## 5. Testes

- `mapWahaAckToStatus`: tabela de casos (todos os níveis de ack, incluindo negativo e desconhecido/futuro).
- `checkWahaNumberExists`: parsing de `{numberExists, chatId}`, 404/resposta vazia, erro de rede.
- `applyWahaAckToMessage` (ou o parsing do envelope `message.ack`): idempotência (`statusAdvances` não regride), mensagem não encontrada é no-op.
- `whatsapp-check-number`: branch novo `waha` cobre conta desconectada, sessão sem `sessionName`, resposta `exists:true/false`.

## 6. Riscos & mitigações

- **`check-exists` do WAHA falhar/timeout** → mesma postura fail-open já usada pro Evolution (`classifyNumberCheck` trata qualquer erro como `skipped`); nenhuma mudança de contrato do lado do cliente.
- **Reenvio de config em massa na ativação** (passo 4.4) atingir um servidor WAHA com muitas sessões → sequencial, não paralelo; erro em uma conta não interrompe as demais (best-effort, logado).
- **Evento `message.ack` chegar para mensagem inbound** (não faz sentido, mas WAHA é third-party) → `applyWahaAckToMessage` só encontra por `provider_message_id`, que só existe em mensagens `direction='out'` enviadas por nós; inbound nunca tem esse campo preenchido do mesmo jeito, então o lookup naturalmente não bate.
