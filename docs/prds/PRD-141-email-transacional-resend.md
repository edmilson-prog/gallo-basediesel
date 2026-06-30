# PRD-141: Email Transacional (Resend)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/notification-dispatch/` + `_shared/channels/email.ts`_ |
| **Objetivo** | Ativar o primeiro canal externo da fundação de notificações: o esqueleto `EmailChannel` (`deferred`) do PRD-008 vira entrega real via **Resend** (decisão do briefing §13.2). Entrega: Edge Function `notification-dispatch` (o braço **server-side** do event bus — canais externos exigem credenciais no Vault), módulo `EmailChannel` chamando a API Resend com idempotência, nova tabela **`crm.notification_deliveries`** (registro por tentativa, compartilhada pelos canais externos da onda), webhook Resend (`Svix` HMAC) atualizando `sent→delivered/bounced/complained`, **supressão automática** de endereços com bounce hard/complaint, e a implementação dos **três hooks stub** que as ondas anteriores deixaram aguardando: `notifyCustomerPaymentConfirmed` (134), email de NFe com PDF (129) e email de boleto (135) |
| **Tipo** | Integração |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — canal nº 1 do transacional; sem ele, cliente paga e não recebe nada |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | PRD-008 F1 (fundação — contrato `send(notification)`, deliveryStatus, preferências); PRD-009 F1 (Center exibe); PRD-142 (templates — **co-dependência**: este define `renderEmailTemplate`, o 142 implementa o catálogo); PRD-134 (hook `notifyCustomerPaymentConfirmed`); PRD-129 (email NFe + PDF); PRD-135 (email boleto); PRD-147 (link de descadastro — stub aqui, página real lá); PRD-150 (remove os `deferred`); PRD-100 (Vault); PRD-102 (Edge infra); PRD-110 (alertas) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Canal em `_shared/channels/` (reuso entre Edge Functions); contrato do 008 intocado |

### Critérios de Complexidade

> **Justificativa de Alta:** email transacional tem dois inimigos silenciosos. (1) **Entregabilidade:** sem SPF/DKIM/DMARC verificados e sem supressão disciplinada de bounces/complaints, o domínio entra em blocklist e **todos** os emails da empresa — inclusive os pessoais — passam a cair em spam; a reputação do domínio é um ativo compartilhado que este PRD pode queimar. (2) **A fronteira frontend/server-side:** o bus do 008 nasceu frontend-first; canais externos exigem credencial no Vault e execução server-side — a costura entre os dois mundos (evento no front → dispatch no Edge → deliveryStatus de volta) é onde mora o risco arquitetural. Erro de idempotência aqui = cliente recebendo o mesmo "pagamento confirmado" cinco vezes.

---

## Contexto do Problema

Três ondas deixaram promessas registradas em audit:

| Origem | Stub aguardando | Audit atual |
|--------|-----------------|-------------|
| PRD-134 (pagamento confirmado) | `notifyCustomerPaymentConfirmed(order)` | `hook_skipped_no_notifications` |
| PRD-129 (NFe autorizada) | envio do PDF ao customer (`autoEmailCustomer`) | `nfe_email_skipped_no_resend` |
| PRD-135 (boleto gerado) | envio da linha digitável + PDF | `boleto_email_skipped_no_resend` |

E a fundação do PRD-008 deixou o `EmailChannel` como esqueleto que marca `deferred` e aponta... para este PRD. O cliente da /loja hoje paga um PIX, vê o "✓" na tela — e nunca mais ouve falar do pedido. Para o go-live, isso é inaceitável: confirmação de pedido, de pagamento, boleto e NFe por email são o mínimo civilizatório do e-commerce.

---

## Conceito da Solução

### A Costura Frontend ↔ Server-Side

```
┌─ Frontend (bus do PRD-008, intacto) ─────────────────────────┐
│ feature emite evento → roteamento → INotification persistida  │
│ canais inApp/toast entregam localmente (como na Fase 1)       │
│ canais externos: status 'pending' (não mais 'deferred')       │
└──────────────────────────┬───────────────────────────────────┘
                           │ INSERT em crm.notifications dispara
                           ▼
┌─ Server-side ────────────────────────────────────────────────┐
│ Edge Function notification-dispatch                           │
│   ├─ trigger: pg_net no INSERT (canais externos pendentes)    │
│   │   OU chamada direta de outra Edge (hooks 134/129/135)     │
│   ├─ resolve preferências + supressão                         │
│   ├─ EmailChannel.send() → Resend API                         │
│   ├─ INSERT crm.notification_deliveries (1 row por tentativa) │
│   └─ UPDATE deliveryStatus agregado na notification           │
└──────────────────────────┬───────────────────────────────────┘
                           │ Resend processa e notifica
                           ▼
        Edge notification-email-webhook (Svix HMAC)
        sent → delivered | bounced | complained
        bounce hard/complaint → supressão automática
```

**Dois caminhos de entrada, um pipeline:** eventos originados no frontend (bus do 008) chegam via trigger no INSERT; eventos originados em Edge Functions (os hooks de 134/129/135) chamam `notification-dispatch` diretamente com o evento de domínio — o dispatch cria a `INotification` server-side usando **as mesmas regras de roteamento** (módulo de regras compartilhado, portado para `_shared/notification-rules.ts` com import único — DELTA declarado no 008: regras passam a viver em módulo isomórfico consumido pelos dois mundos).

### Nova Tabela `crm.notification_deliveries`

Uma linha por **tentativa de entrega externa** — compartilhada por email (este PRD), WhatsApp (143), SMS (144) e push (145):

```sql
CREATE TABLE crm.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES crm.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms','push')),
  provider text NOT NULL,                    -- 'resend' | 'meta_cloud' | 'evolution' | ...

  recipient text NOT NULL,                   -- email ou telefone (snapshot)
  provider_message_id text,                  -- id no provider (Resend email id / crm.messages.id no whatsapp)
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','bounced','complained','failed','suppressed')),
  error_code text,
  error_message text,

  attempt integer NOT NULL DEFAULT 1,
  idempotency_key text UNIQUE,
  webhook_event_ids text[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz
);
CREATE INDEX ON crm.notification_deliveries (notification_id);
CREATE INDEX ON crm.notification_deliveries (status) WHERE status IN ('pending','sent');
CREATE INDEX ON crm.notification_deliveries (provider, provider_message_id);
-- RLS (estende PRD-103): leitura pelo destinatário/gestores; mutações service_role
```

> **Assimetria documentada:** para email, esta tabela é a fonte do status fim-a-fim. Para WhatsApp (143), a fonte do status continua sendo `crm.messages.dispatch_status` (PRD-118) — a delivery referencia `message_id` e o status é lido por join, sem duplicação de máquina de estados.

### Supressão (proteção da reputação do domínio)

Migration aditiva: `crm.customers.email_status text NOT NULL DEFAULT 'unknown' CHECK (email_status IN ('unknown','valid','bounced','complained'))` (+ espelho em `crm.sellers` para o público interno).

| Evento Resend | Ação |
|---------------|------|
| `email.delivered` | delivery `delivered`; primeiro delivered → `email_status='valid'` |
| `email.bounced` (hard) | delivery `bounced`; `email_status='bounced'`; **futuras entregas → `suppressed` sem chamada à API** |
| `email.complained` (spam) | delivery `complained`; `email_status='complained'`; supressão **permanente** + audit LGPD-relevante |
| bounce soft | delivery `failed` + retry (até 2, backoff) sem alterar email_status |

Supressão é avaliada **antes** da preferência: complained nunca recebe, mesmo opt-in.

### Resend — Integração

| Aspecto | Detalhe |
|---------|---------|
| **Auth** | `Authorization: Bearer re_...` (Vault: `resend_api_key` — chave única da conta, não por store) |
| **Envio** | `POST https://api.resend.com/emails` `{ from, to, subject, html, text, reply_to, attachments?, headers }` |
| **Idempotência** | Header `Idempotency-Key` = `notification_deliveries.idempotency_key` |
| **From** | `GALLO Base Diesel <notificacoes@<dominio>>` — domínio verificado (SPF/DKIM/DMARC) no painel; **decisão pendente:** `gallodiesel.com.br` direto vs subdomínio `mail.gallodiesel.com.br` (subdomínio recomendado: isola reputação) |
| **Reply-to** | email da store (atendimento responde no canal humano) |
| **Anexos** | NFe PDF (129): buffer base64 ≤ 3MB direto; acima, link com signed URL 7 dias |
| **Webhook** | endpoint único, eventos assinados **Svix**: headers `svix-id`, `svix-timestamp`, `svix-signature` — HMAC-SHA256 base64 sobre `{id}.{timestamp}.{payload}`, secret no Vault (`resend_webhook_secret`), tolerância de timestamp ±5min |
| **Limites** | plano define cota (free 100/dia — insuficiente; **decisão pendente: plano pago** antes do go-live); 429 → retry com backoff |

### Hooks das Ondas Anteriores — Implementação

| Hook | Evento emitido | Conteúdo (template do 142) |
|------|----------------|----------------------------|
| `notifyCustomerPaymentConfirmed` (134) | `payment.confirmed` | valor, método, pedido, próximos passos |
| Email NFe (129 `autoEmailCustomer`) | `nfe.issued` | nº NFe, chave, **PDF anexo** |
| Email boleto (135) | `payment.boleto_created` | linha digitável, vencimento, link PDF |

Os stubs são substituídos por chamada direta ao `notification-dispatch` com o evento — os audits `*_skipped_no_resend` desaparecem do caminho feliz (o PRD-150 verifica a remoção).

### Co-dependência com o PRD-142

Este PRD define o contrato `renderEmailTemplate(templateKey, props): { subject, html, text }` e entrega **um** template de fallback (layout mínimo com a mensagem da notificação) para destravar testes. O catálogo completo com branding é o PRD-142 — implementar a Fase 1 do 142 antes da Fase 4 deste (espelho da co-dependência 137→136 da Onda 7).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| SendGrid / SES / Postmark | Briefing §13.2 fixou Resend (DX, React Email nativo, preço); Provider Pattern de email completo seria sobre-engenharia para decisão já tomada — `EmailChannel` isola o suficiente para troca futura |
| Envio direto do frontend | Credencial exposta; impossível — server-side é mandatório |
| Polling de status (sem webhook) | Resend entrega webhooks assinados; polling desperdiça cota |
| Tabela de deliveries por canal | Uma tabela com `channel` serve os 4 canais da onda e o Center (146) consulta um lugar só |
| Ignorar bounces (Resend já suprime) | A supressão local protege ANTES da chamada (cota + latência) e alimenta `email_status` visível na ficha do cliente |
| Fila própria (queue table + worker) | pg_net trigger + retry interno cobre o volume de uma distribuidora; fila dedicada é otimização prematura |

---

## Escopo

### Incluído

- ✅ Migrations: `crm.notification_deliveries` + RLS; aditivas `customers.email_status` e `sellers.email_status`; trigger `pg_net` no INSERT de `crm.notifications` com canais externos pendentes
- ✅ **DELTA PRD-008 declarado:** regras de roteamento portadas para módulo isomórfico `_shared/notification-rules.ts` (front importa o mesmo módulo; zero divergência)
- ✅ Edge Function `notification-dispatch`: entrada dupla (trigger + chamada direta com evento), roteamento server-side, preferências + supressão, despacho por canal, agregação do `deliveryStatus`
- ✅ `EmailChannel` real em `_shared/channels/email.ts`: Resend API, Idempotency-Key, anexos (≤3MB inline / link acima), retry soft-bounce (2×, backoff), mapeamento de erros
- ✅ Contrato `renderEmailTemplate` + template fallback mínimo (co-dependência 142)
- ✅ Edge Function `notification-email-webhook`: validação Svix (HMAC + tolerância de timestamp), idempotência (`processed_events`), atualização de deliveries, supressão automática (bounced/complained), audit
- ✅ Implementação dos 3 hooks stub (134/129/135) — eventos `payment.confirmed`, `nfe.issued`, `payment.boleto_created` no catálogo (extensão do Anexo A do 008, DELTA declarado)
- ✅ Supressão pré-envio: `email_status IN ('bounced','complained')` → delivery `suppressed` sem chamada
- ✅ Footer obrigatório em todo email: endereço físico da store + link de descadastro (stub: rota `/preferencias-email/:token` que o 147 implementa — token assinado já gerado aqui)
- ✅ Ficha do cliente (PRD-012): badge de `email_status` quando ≠ valid/unknown ("⚠ Email com bounce — verificar endereço")
- ✅ Vault entries: `resend_api_key`, `resend_webhook_secret`; documentação de verificação de domínio (SPF/DKIM/DMARC) com passo a passo do painel
- ✅ Alertas (110): taxa de bounce > 5% em 24h → warning Owner; webhook auth-fail repetido → warning
- ✅ Testes: Svix HMAC (válido/alterado/timestamp expirado), supressão pré-envio, retry soft, idempotência de envio e de webhook, hooks fim-a-fim com Resend mockado, anexo grande → link
- ✅ Documentação `docs/dev/notification-email.md` + runbook de entregabilidade (`docs/operations/email-deliverability.md`)

### Excluído

- ❌ Catálogo de templates com branding (PRD-142)
- ❌ WhatsApp/SMS/Push (143/144/145)
- ❌ Página real de preferências/descadastro com trilha LGPD (PRD-147 — aqui o token + rota stub)
- ❌ Digest/resumo periódico (PRD-146)
- ❌ Drip e carrinho abandonado (148/149)
- ❌ Emails de marketing em massa (transacional only; marketing exige opt-in do 147 + categoria própria)
- ❌ Customização dos emails do Supabase Auth (reset de senha etc.) — configuração de SMTP custom do Auth apontando o Resend fica como item do runbook (operação, não código)
- ❌ Editor visual de templates (templates são código — decisão do 142)

---

## Requisitos Funcionais

### Dispatch

- **RF-001:** `notification-dispatch` aceita: (a) `{ notificationId }` (via trigger pg_net) — carrega a notification persistida; (b) `{ event: { type, payload } }` (chamada direta de Edge) — roteia server-side com `_shared/notification-rules.ts`, persiste a `INotification` e segue.
- **RF-002:** Para cada canal externo alvo: resolve preferência (matriz do 008) → resolve supressão (RF-030) → cria delivery `pending` com `idempotency_key = 'delivery:'+notificationId+':'+channel+':'+attempt` → despacha pelo channel module.
- **RF-003:** Falha de um canal não afeta os demais (try/catch isolado por canal — princípio do 008 RF-013 estendido).
- **RF-004:** `deliveryStatus` agregado da notification atualizado a cada transição de delivery (pior status vence para exibição: failed > bounced > pending > sent > delivered).

### EmailChannel

- **RF-010:** `send(notification, delivery)`: resolve destinatário (`customer.email` / `seller.email` por `recipientType`), renderiza via `renderEmailTemplate(templateKeyDoEvento, props)`, POST Resend com Idempotency-Key, persiste `provider_message_id`, delivery → `sent`.
- **RF-011:** Destinatário sem email → delivery `failed` com `error_code='NO_EMAIL'` (sem retry; visível no Center).
- **RF-012:** Anexo: buffer ≤ 3MB inline base64; acima → corpo ganha link (signed URL 7 dias) e audit `attachment_replaced_by_link`.
- **RF-013:** Erros Resend: 401 → alerta crítico (chave inválida — canal inteiro parado); 422 → failed com mensagem; 429/5xx → retry (2×: 30s, 5min) e então failed.
- **RF-014:** Todo email inclui footer com endereço físico da store + link `/preferencias-email/:token` (token JWT assinado com `recipientId`+`recipientType`, expiração 90d — página real no 147).

### Webhook Resend

- **RF-020:** Validação Svix: reconstruir `{svix-id}.{svix-timestamp}.{rawBody}`, HMAC-SHA256 (secret Vault, decodificado base64), comparar com cada assinatura de `svix-signature` via `timingSafeEqual`; timestamp fora de ±5min → 403.
- **RF-021:** Idempotência: `processed_events` por `svix-id`.
- **RF-022:** Mapeamento: `email.sent→sent`, `email.delivered→delivered` (+`email_status='valid'` no primeiro), `email.bounced→bounced` (hard → supressão RF-031), `email.complained→complained` (supressão permanente + audit `email_complaint_received` com flag LGPD), `email.delivery_delayed→` mantém sent + audit.
- **RF-023:** Delivery não encontrada por `provider_message_id` → 200 + audit `email_webhook_orphan` (paridade 134 RF-040).

### Supressão

- **RF-030:** Pré-envio: `email_status ∈ {bounced, complained}` → delivery `suppressed`, zero chamada, audit.
- **RF-031:** Bounce hard → `email_status='bounced'`; complaint → `'complained'`. Correção manual: editar o email na ficha do cliente reseta para `unknown` (audit `email_status_reset`).
- **RF-032:** Badge na ficha (PRD-012) quando `bounced|complained`, com a data do evento.

### Hooks das Ondas Anteriores

- **RF-040:** PRD-134 `notifyCustomerPaymentConfirmed`: stub → `dispatch({ event: { type:'payment.confirmed', payload: { orderId, chargeId } } })`. Roteamento: recipient = customer do order; canais default: email (+whatsapp quando 143 ativo).
- **RF-041:** PRD-129: quando `autoEmailCustomer`, archive concluído → `nfe.issued` com `attachmentPath` do PDF.
- **RF-042:** PRD-135: boleto criado → `payment.boleto_created` (linha digitável, vencimento, boleto_url).
- **RF-043:** Catálogo `NotificationEventType` estendido com os 3 eventos + regras (DELTA Anexo A do 008, declarado).

### Testes e Docs

- **RF-050:** Unitários: Svix (4 casos), supressão, retry, idempotência, NO_EMAIL, anexo>3MB.
- **RF-051:** Integração (Resend mockado): hook 134 fim-a-fim → notification + delivery sent → webhook delivered → Center (009) exibe entregue; bounce → supressão → segundo envio suppressed.
- **RF-052:** `notification-email.md` (arquitetura, costura front/server, assimetria de fontes de status) + `email-deliverability.md` (verificação de domínio, SPF/DKIM/DMARC, monitorar bounce rate, o que NUNCA fazer com a reputação).

---

## Requisitos Não-Funcionais

- **RNF-001 (Reputação do domínio):** supressão disciplinada + footer conforme + monitoramento de bounce — o runbook é parte do entregável.
- **RNF-002 (Idempotência dupla):** envio (Idempotency-Key) e webhook (processed_events) — replay nunca duplica email nem transição.
- **RNF-003 (Isolamento):** falha do email jamais afeta o fluxo de negócio que o originou (herda 008 RF-013) nem outros canais.
- **RNF-004 (Latência):** evento → email aceito pela Resend < 10s p95.
- **RNF-005 (Auditabilidade):** toda tentativa é uma delivery; toda transição tem webhook_event_id; complaint tem trilha LGPD.

---

## Critérios de Aceitação

### RF-040: Hook do 134 Implementado

```gherkin
DADO pedido pago via webhook do PRD-134
QUANDO runPostPaymentHooks executa
ENTÃO notifyCustomerPaymentConfirmed chama notification-dispatch com payment.confirmed
  E INotification persistida (recipientType='customer')
  E delivery email 'sent' com provider_message_id
  E audit hook_skipped_no_notifications NÃO ocorre mais
  E webhook Resend posterior marca 'delivered'
```

### RF-030/031: Supressão

```gherkin
DADO customer com email_status='bounced'
QUANDO novo evento roteia email para ele
ENTÃO delivery criada como 'suppressed', ZERO chamadas à Resend
  E Center exibe o canal como suprimido

DADO webhook email.complained chega
ENTÃO email_status='complained' (permanente)
  E audit email_complaint_received com flag LGPD
```

### RF-020: Svix

```gherkin
DADO secret válido e payload íntegro
QUANDO svix-signature confere e timestamp está em ±5min
ENTÃO 200 e processamento segue

QUANDO um byte do body muda OU timestamp tem 10min
ENTÃO 403 sem processamento
```

### RF-012: Anexo NFe

```gherkin
DADO nfe.issued com PDF de 1,2MB
QUANDO EmailChannel envia
ENTÃO PDF segue como attachment inline

DADO PDF de 4,5MB
ENTÃO corpo traz link assinado (7 dias) no lugar
  E audit attachment_replaced_by_link
```

---

## Fases de Implementação

### Fase 1 — Schema + Regras Isomórficas (1 dia)
- Migrations (deliveries, email_status, trigger pg_net)
- Porte das regras para `_shared/notification-rules.ts` (DELTA 008) + testes de paridade front/server

### Fase 2 — Dispatch + EmailChannel (2 dias)
- Entrada dupla, preferências+supressão, deliveries
- Resend client, idempotência, anexos, retry, template fallback

### Fase 3 — Webhook + Supressão (1.5 dias)
- Svix, mapeamentos, orphan, email_status + badge na ficha

### Fase 4 — Hooks 134/129/135 (1 dia)
- 3 eventos no catálogo + regras + substituição dos stubs
- (Requer 142 Fase 1 para os templates reais)

### Fase 5 — Testes + Runbooks (1 dia)
- Integração fim-a-fim, deliverability runbook
- `_DONE`

---

## Dependências

- **Depende de:** PRD-008 F1 (fundação), PRD-100/102/103/105/110, PRD-134/129/135 (hooks), **PRD-142 Fase 1** (templates — co-dependência declarada)
- **Bloqueia:** 142 (Fases 2+, hosts reais), 143 (reusa dispatch+deliveries), 146/147/148/149/150
- **DELTAs declarados:** PRD-008 (regras → módulo isomórfico; catálogo +3 eventos)
- **Decisões Pendentes:**
  - **Domínio de envio:** `mail.gallodiesel.com.br` (recomendado) vs raiz — Owner + DNS
  - **Plano Resend** (free 100/dia insuficiente) — contratar antes do go-live
  - Reply-to por store (email de atendimento) — confirmar endereços

---

## Considerações de Segurança

- API key e Svix secret só no Vault; resolução sob demanda
- Token de descadastro assinado (JWT) — manipulação inválida; página do 147 valida
- Supressão de complaint é permanente e auditada (LGPD: manifestação do titular)
- PII nos emails: snapshot mínimo necessário; deliveries guardam o endereço como snapshot histórico (RLS estrita)
- Webhook 403 sem detalhe; orphan 200 sem eco do payload

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.1; CHANGELOG; renomear `PRD-141-email-transacional-resend_DONE.md`; anotar DELTA no `_DONE` do PRD-008; domínio verificado em sandbox antes do teste real.

| Princípio | Descrição |
|-----------|-----------|
| **Reputação > feature** | Supressão e conformidade vêm antes de volume |
| **Regras isomórficas** | Um módulo, dois mundos — zero divergência de roteamento |
| **Uma delivery por tentativa** | A tabela é a verdade das entregas externas |
| **Hooks pagam a dívida** | Os 3 stubs somem do caminho feliz |
| **Complaint é palavra final** | Permanente, auditada, LGPD |

| ❌ Evitar |
|-----------|
| Enviar para bounced/complained "só dessa vez" |
| Credencial fora do Vault |
| Roteamento duplicado (front ≠ server) |
| Email sem footer/descadastro |
| Retry de hard bounce |
| Webhook sem validar Svix byte-a-byte |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 5a do Lote 5 (Onda 8) |

---

**AILA - Sistemas Inteligentes**
