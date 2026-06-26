# PRD-133: PIX QR Code Dinâmico (Multi-Provider)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/payment-create-charge/` + `src/features/payments/`_ |
| **Objetivo** | Primeiro fluxo de pagamento real fim-a-fim: Edge Function `payment-create-charge` (genérica por método; este PRD foca PIX) que valida o pedido, resolve o provider via factory (Asaas ou Mercado Pago conforme `payment_config`), cria a cobrança, persiste em `crm.payment_charges` e devolve o QR. UI `PixPaymentPanel` na `/loja` (página de pedido confirmado) e no `/app` (tela do pedido, para venda assistida): QR image + copia-e-cola + countdown de expiração + transição ao vivo para "Pago ✓" via Realtime. Cron local de expiração e regeneração de QR expirado. **Substitui o placeholder PIX do PRD-064** |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — PIX é o método nº 1 do varejo BR; sem ele não há go-live de pagamentos |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-132 (interface + Asaas + `payment_charges`); PRD-132B (Mercado Pago); PRD-134 (webhook confirma o pagamento — a transição para `paid` vem de lá); PRD-064 F1 (checkout — UI host na /loja); PRD-032 F1 (pedido /app — host da venda assistida); PRD-102 (Edge infra + idempotency); PRD-105 (Realtime); PRD-115 (envio do copia-e-cola por WhatsApp — integração leve) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Edge Function modular; UI em `src/features/payments/` reutilizável entre `/loja` e `/app` |

### Critérios de Complexidade

> **Justificativa de Alta:** é o primeiro ponto onde dinheiro real encontra o usuário final — e em **dois contextos de autenticação diferentes**: o `/app` tem seller autenticado, mas o checkout da `/loja` aceita **visitante** (guest checkout do PRD-064). A Edge Function precisa servir ambos sem abrir brecha (visitante só cria cobrança do próprio pedido recém-criado). Expiração tem dupla fonte de verdade (provider expira lá; nosso status local precisa acompanhar mesmo sem webhook de expiração). UX de espera de pagamento é sensível: countdown, transição ao vivo, regeneração — qualquer travada gera abandono.

---

## Contexto do Problema

Hoje, ao confirmar pedido com PIX na `/loja`, o cliente vê: *"Você receberá o código PIX após confirmação"* — e não recebe nada (placeholder do PRD-064 RF-026). No `/app`, a seção Pagamento do pedido (PRD-032) tem botão "Marcar como pago" manual.

Com PRDs 132/132B prontos, falta o **orquestrador + UI**:

1. Pedido confirmado com `paymentMethod='pix'` → gerar cobrança no gateway da store
2. Exibir QR + copia-e-cola imediatamente (sem email, sem espera)
3. Cliente paga no app do banco → webhook (PRD-134) confirma → tela vira "Pago ✓" **sozinha**
4. QR expirou (cliente demorou) → "Gerar novo código" sem refazer o pedido
5. Venda assistida: vendedor gera o QR no `/app` e manda o copia-e-cola pelo WhatsApp da conversa

---

## Conceito da Solução

### Arquitetura

```
/loja (visitante ou logado)                    /app (seller autenticado)
        │                                              │
        │ pedido confirmado (PRD-064)                  │ botão "Gerar cobrança PIX" (PRD-032)
        ▼                                              ▼
   POST /functions/v1/payment-create-charge { orderId, method:'pix' }
        │
        ├── 1. Contexto: withAuth OU guest-context (RF-020)
        ├── 2. withIdempotency('payment-charge:'+orderId+':pix')
        ├── 3. Carrega order (service_role) + validações de estado
        ├── 4. Checa charge ativa existente (UNIQUE já protege; pre-check p/ UX)
        ├── 5. getPaymentProvider(storeId)            ← Asaas OU MP, transparente
        ├── 6. provider.createPixCharge(...)
        ├── 7. INSERT crm.payment_charges (pending, qr, expires_at)
        ├── 8. Audit payment_charge_created
        └── 9. Responde { chargeId, qrCodePayload, qrCodeImageBase64, expiresAt }
                │
                ▼
        UI PixPaymentPanel (QR + copia-e-cola + countdown)
                │
                │ cliente paga no banco
                ▼
        [PRD-134 webhook → UPDATE charges.status='paid' + orders.payment_status='paid']
                │
                ▼ Realtime (PRD-105)
        UI transiciona para "Pagamento confirmado ✓" ao vivo
```

### Os Dois Contextos de Autenticação

| Contexto | Quem | Autorização |
|----------|------|-------------|
| **Autenticado** (`/app`, `/portal`) | Seller responsável, Owner/Manager, customer B2B dono | `withAuth` + verificação padrão (mesma do PRD-115) |
| **Guest** (`/loja`, visitante) | Comprador anônimo que acabou de fechar o pedido | **Guest-context**: sem JWT. Validação por posse + janela: `orderId` é UUIDv4 não-enumerável que só quem criou o pedido conhece, E `order.origin='ecommerce'`, E `payment_status='pending_payment'`, E `created_at > now() - 24h` |

**Análise de risco do guest-context:** o pior que um atacante com um `orderId` vazado consegue é gerar um QR que **paga o pedido da vítima** — dano zero para o GALLO, benefício zero para o atacante. Ainda assim: rate limit por IP (Supabase nativo) + as 4 validações + audit. Sem dados sensíveis no response além do QR.

### Expiração — Dupla Fonte de Verdade

O provider expira a cobrança do lado dele (`date_of_expiration` MP / `dueDate` Asaas). Mas nem todo provider envia webhook de expiração confiável. Solução em camadas:

1. **Countdown na UI** (client-side, de `expiresAt`) — feedback imediato
2. **Cron local** `payment-expire-charges` (pg_cron `*/10 min`): `UPDATE crm.payment_charges SET status='expired' WHERE status='pending' AND method='pix' AND pix_qr_expires_at < now()` — fonte de verdade local
3. **Guarda no webhook** (PRD-134): pagamento confirmado de charge já `expired` localmente → **aceita mesmo assim** (dinheiro entrou; provider é a verdade final), reverte para `paid` + audit `paid_after_local_expiry`

A camada 3 é crítica: cliente que paga no segundo 1799 de 1800 não pode ter o dinheiro ignorado.

### Regeneração de QR Expirado

```
[charge expired na UI]
   "Código expirado"
   [ Gerar novo código PIX ]
        │
        ▼
   POST payment-create-charge { orderId, method:'pix', regenerate: true }
        │
        ├── valida que a única charge PIX do order está expired/cancelled
        ├── nova charge criada (UNIQUE parcial permite — expired fora do índice)
        └── UI troca para o novo QR + novo countdown
```

A antiga permanece no histórico (`expired`) — paridade com o princípio de imutabilidade do PRD-118 (retry cria novo, não sobrescreve).

### UI — `PixPaymentPanel`

Componente único reutilizado nos dois hosts:

```
┌──────────────────────────────────────────┐
│  Pague com PIX                            │
│                                           │
│         ┌───────────────┐                 │
│         │   [QR CODE]   │                 │
│         └───────────────┘                 │
│                                           │
│  ⏱ Expira em 28:43                       │
│                                           │
│  ┌─────────────────────────────┐ [Copiar]│
│  │ 00020126580014br.gov.bcb... │         │
│  └─────────────────────────────┘         │
│                                           │
│  Aguardando pagamento...     ◌ (pulse)   │
└──────────────────────────────────────────┘
         │ Realtime: status → paid
         ▼
┌──────────────────────────────────────────┐
│  ✓ Pagamento confirmado!                  │
│  R$ 430,00 · 09/06/2026 14:32             │
└──────────────────────────────────────────┘
```

Estados: `loading` → `awaiting` (QR + countdown) → `paid` | `expired` (CTA regenerar) | `error`.

**Host /loja:** `OrderConfirmedPage` (PRD-064 RF-033) detecta `paymentMethod='pix'` → cria a charge automaticamente no mount (sem clique extra) e renderiza o panel no lugar do texto placeholder. Banner "modo demonstração" some quando `payment_config` existe.

**Host /app:** seção Pagamento do pedido (PRD-032) ganha botão "Gerar cobrança PIX" (se `payment_status='pending_payment'` e sem charge ativa) → modal com o panel + botão "Enviar copia-e-cola por WhatsApp" que pré-preenche o composer da conversa do cliente (integração leve com PRD-115 — apenas navega com texto; envio é o fluxo normal).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Criar charge junto com o pedido (dentro do createOrderFromCart) | Acopla pedido a pagamento; pedido boleto/cartão não precisa; charge no mount da confirmação é igualmente imediato |
| Polling de status na UI (sem Realtime) | PRD-105 já entrega Realtime; polling é regressão |
| Exigir login para pagar na /loja | Mata o guest checkout (decisão do PRD-064); guest-context resolve |
| QR gerado client-side a partir do payload | Funciona (lib qrcode), mas providers já entregam base64; client-side fica como fallback se imagem ausente |
| Expirar só pelo provider (sem cron local) | Status local fica `pending` eterno; conciliação (PRD-139) e UX quebram |
| Marcar `paid` direto neste PRD | Confirmação é responsabilidade exclusiva do webhook (PRD-134) — única fonte de escrita do `paid` |

---

## Escopo

### Incluído

- ✅ Edge Function `supabase/functions/payment-create-charge/index.ts` — genérica por método (`pix` implementado; `boleto`/`card` retornam `NOT_IMPLEMENTED` claro até PRDs 135/136)
- ✅ Dual-context: `withAuth` (app/portal) + guest-context com 4 validações (loja)
- ✅ `withIdempotency` + pre-check de charge ativa (mensagem amigável antes do UNIQUE estourar)
- ✅ Resolução multi-provider via `getPaymentProvider(storeId)` — zero referência a provider concreto
- ✅ Persistência completa em `crm.payment_charges` (qr payload, expires_at, request/response, idempotency_key)
- ✅ Suporte a `regenerate: true` (nova charge se a anterior expirou/cancelou)
- ✅ Cron `payment-expire-charges` (pg_cron */10min) + migration do schedule
- ✅ Componente `PixPaymentPanel` (estados loading/awaiting/paid/expired/error) com countdown, copiar com feedback, QR base64 com fallback client-side (lib `qrcode` a partir do payload)
- ✅ Hook `usePixCharge(orderId)`: cria/carrega charge, subscreve Realtime em `payment_charges` filtrado por `order_id`, expõe estado reativo
- ✅ Integração `/loja`: `OrderConfirmedPage` renderiza o panel quando `paymentMethod='pix'`; remoção condicional do banner demo
- ✅ Integração `/app`: botão "Gerar cobrança PIX" + modal na seção Pagamento (PRD-032); ação "Enviar por WhatsApp" pré-preenchendo composer (PRD-115)
- ✅ Realtime: publication inclui `crm.payment_charges` (extensão do PRD-105); RLS de Realtime herdada
- ✅ Audit: `payment_charge_created` (com contexto guest/auth), `payment_charge_regenerated`, `payment_charge_expired` (cron, agregado)
- ✅ Testes: guest-context (4 validações, cada uma falhando), idempotência, regenerate, cron de expiração, panel por estado, E2E com MockPaymentProvider (criar → "pagar" via update manual → Realtime transiciona)
- ✅ Documentação `docs/dev/payment-pix-flow.md`

### Excluído

- ❌ Confirmação de pagamento (PRD-134 — webhook é o único escritor de `paid`)
- ❌ Boleto e cartão (PRDs 135/136 — a Edge Function já tem o switch, handlers lá)
- ❌ Envio automático do QR por email (Onda 8, PRD-141)
- ❌ PIX estático / chave fixa (só dinâmico com valor)
- ❌ PIX agendado / cobrança recorrente
- ❌ Desconto por pagamento PIX (regra comercial futura)
- ❌ Reconciliação de divergência valor pago ≠ valor cobrado (PRD-139)

---

## Requisitos Funcionais

### Edge Function — Contrato

- **RF-001:** POST `/functions/v1/payment-create-charge`; input Zod:
  ```ts
  { orderId: uuid, method: 'pix' | 'boleto' | 'card', regenerate?: boolean }
  ```
- **RF-002:** `method='boleto'|'card'` → `AppError('NOT_IMPLEMENTED', 501, 'Método disponível em breve')` até PRDs 135/136 (switch já estruturado para os handlers).
- **RF-003:** Response PIX: `{ chargeId, provider, qrCodePayload, qrCodeImageBase64?, expiresAt, amount }`.

### Dual-Context de Autorização

- **RF-010:** Se request traz JWT válido → `withAuth`; autorização igual PRD-115 RF-011 (seller responsável OU owner/manager da store) + customer B2B dono do order (portal).
- **RF-020:** Sem JWT → **guest-context**, exigindo TODAS:
  1. `order.origin = 'ecommerce'`
  2. `order.payment_status = 'pending_payment'`
  3. `order.created_at > now() - interval '24 hours'`
  4. `orderId` válido e existente (posse do UUID)
  - Qualquer falha → `404 NOT_FOUND` genérico (não revelar qual validação falhou)
- **RF-021:** Audit registra `context: 'guest' | 'authenticated'` + IP truncado no guest.

### Validações de Estado do Pedido

- **RF-030:** `payment_status` ∉ `{pending_payment}` → `VALIDATION_ERROR 422` "Pedido não está aguardando pagamento".
- **RF-031:** Pre-check: charge `(orderId,'pix')` com status `pending` → se `regenerate≠true`, retorna **a charge existente** (200, idempotente por UX — recarregar a página não duplica); se `pending` e `regenerate=true` → 422 "Aguarde a cobrança atual expirar".
- **RF-032:** `regenerate=true` válido apenas se a charge anterior está `expired`/`cancelled`/`failed`.

### Criação da Cobrança

- **RF-040:** `withIdempotency('payment-charge:'+orderId+':pix'+(regenerate?':'+attemptN:''))`.
- **RF-041:** `expirationMinutes` de `payment_config.pixExpirationMinutes` (default 30).
- **RF-042:** `provider.createPixCharge({ orderId, storeId, amount: order.total_value, description: 'Pedido #'+order.number+' — '+store.name, customer: <mapeado do crm.customers>, expirationMinutes })`.
- **RF-043:** INSERT `crm.payment_charges`: provider, environment, provider_charge_id, method='pix', status='pending', amount, pix_qr_payload, pix_qr_expires_at, request/response_payload, idempotency_key, `created_by` (null no guest).
- **RF-044:** Falha do provider → AppError repassada; **nenhuma** charge persiste (INSERT só após sucesso — diferente do PRD-115 onde message persiste antes: cobrança fantasma no gateway sem registro local é pior que o inverso, e aqui não há "conteúdo do usuário" a preservar).

### Cron de Expiração

- **RF-050:** Migration agenda `payment-expire-charges` via pg_cron `*/10 * * * *`.
- **RF-051:** UPDATE em lote: `status='expired'` WHERE `status='pending' AND method='pix' AND pix_qr_expires_at < now()`.
- **RF-052:** Audit agregado `payment_charges_expired { count, chargeIds }` (só se count > 0).
- **RF-053:** Realtime propaga os UPDATEs → painéis abertos transicionam para `expired` sozinhos.

### Hook `usePixCharge`

- **RF-060:** `usePixCharge(orderId)` em `src/features/payments/hooks/`:
  - `ensureCharge()` — chama a Edge Function (ou retorna existente, RF-031)
  - Subscreve Realtime `payment_charges` por `order_id` (INSERT+UPDATE)
  - Deriva estado: `loading | awaiting | paid | expired | error`
  - `regenerate()` — invoca com `regenerate:true`
  - Countdown derivado de `pix_qr_expires_at` (tick 1s local, sem query)

### Componente `PixPaymentPanel`

- **RF-070:** Props: `orderId`, `variant: 'storefront' | 'app'`.
- **RF-071:** `awaiting`: QR (base64 do provider; fallback render client-side via lib `qrcode` do payload), copia-e-cola com botão "Copiar" (feedback "Copiado ✓" 2s), countdown `mm:ss`, indicador pulsante "Aguardando pagamento...".
- **RF-072:** Transição para `paid` ao vivo (Realtime): check verde + valor + timestamp; `variant='storefront'` mostra "Você receberá a confirmação por email/WhatsApp".
- **RF-073:** `expired`: mensagem + botão "Gerar novo código PIX" → `regenerate()`.
- **RF-074:** Countdown nos últimos 5min muda para âmbar (consistente com SessionBanner PRD-117).
- **RF-075:** Acessível: payload em `<textarea readonly>` selecionável; `aria-live="polite"` na transição de status.

### Integração /loja

- **RF-080:** `OrderConfirmedPage` (PRD-064): se `order.paymentMethod='pix'` → `ensureCharge()` no mount + `<PixPaymentPanel variant='storefront'/>` substituindo o texto placeholder.
- **RF-081:** Banner "modo demonstração" (PRD-064 RF-028/037) exibido **apenas** quando provider mock ativo; com `payment_config` real, some.
- **RF-082:** Boleto/cartão seguem placeholder até PRDs 135/136 (texto ajustado: "disponível em breve").

### Integração /app

- **RF-090:** Seção Pagamento do pedido (PRD-032): botão "Gerar cobrança PIX" visível se `payment_status='pending_payment'` e sem charge pix ativa.
- **RF-091:** Modal com `<PixPaymentPanel variant='app'/>` + botão "Enviar por WhatsApp": navega para a conversa do customer com composer pré-preenchido (`"Segue o PIX do pedido #X — copia e cola: <payload>"`) — envio pelo fluxo normal do PRD-115.
- **RF-092:** Charge existente (qualquer status) listada na seção Pagamento: método, valor, status badge, expiração — histórico completo, incluindo expiradas.
- **RF-093:** Botão "Marcar como pago" (manual, do PRD-032) **permanece** — cobre PIX por fora/dinheiro; ganha confirm extra se há charge `pending` ("Existe cobrança PIX aguardando — confirmar pagamento manual?").

### Realtime

- **RF-100:** Publication do PRD-105 estendida com `crm.payment_charges` (migration aditiva); RLS aplica (guest da /loja não tem JWT → o panel da loja usa canal por POST polling leve a cada 5s **OU** Realtime anônimo com policy restrita por order_id? → **Decisão:** Realtime exige auth; para guest, fallback de polling 5s no hook quando sem sessão — flag interna, transparente no componente).

### Audit

- **RF-110:** `payment_charge_created` (orderId, chargeId, provider, amount, context, ip truncado se guest), `payment_charge_regenerated` (previousChargeId), `payment_charges_expired` (agregado cron).

### Testes

- **RF-120:** Unitários: guest-context (cada uma das 4 validações falhando → 404 genérico), RF-031 (charge existente retornada sem duplicar), regenerate (válido/inválido), countdown helper.
- **RF-121:** Integração (MockPaymentProvider): criar → INSERT correto → UPDATE manual para `paid` → Realtime/polling transiciona painel em < 5s; cron expira pending vencida.
- **RF-122:** E2E /loja: checkout guest completo → pedido → QR na tela → simular pagamento → "Confirmado ✓".

### Documentação

- **RF-130:** `docs/dev/payment-pix-flow.md`: fluxo fim-a-fim, dual-context e análise de risco do guest, dupla fonte de verdade da expiração (e a guarda do PRD-134), regeneração, fallback polling do guest.

---

## Requisitos Não-Funcionais

- **RNF-001 (Time-to-QR):** confirmação do pedido → QR na tela < 4s p95 (inclui round-trip do gateway).
- **RNF-002 (Transição ao vivo):** webhook processado → painel "paid" < 3s (Realtime) / < 8s (polling guest).
- **RNF-003 (Segurança guest):** 404 genérico em qualquer falha de validação; rate limit por IP; zero dados além do QR no response.
- **RNF-004 (Consistência):** nunca 2 charges PIX `pending` para o mesmo order (pre-check + UNIQUE).
- **RNF-005 (Resiliência):** falha do gateway na criação não deixa lixo local (RF-044); falha do cron não afeta criação (fail-open, próxima execução cobre).
- **RNF-006 (UX mobile):** panel funcional em 360px; copia-e-cola é o caminho primário no mobile (QR é secundário — ninguém escaneia a própria tela).

---

## Critérios de Aceitação

### RF-020: Guest-Context

```gherkin
DADO pedido O1 criado há 5min via /loja (origin='ecommerce', pending_payment)
QUANDO POST sem JWT { orderId: O1, method:'pix' }
ENTÃO cobrança criada e QR retornado

DADO pedido O2 com origin='app' (venda interna)
QUANDO POST sem JWT { orderId: O2 }
ENTÃO 404 genérico (guest não cria cobrança de venda interna)

DADO O1 criado há 30 horas
QUANDO POST sem JWT
ENTÃO 404 genérico (janela de 24h)
```

### RF-031: Idempotência de UX

```gherkin
DADO charge PIX pending para O1
QUANDO o cliente RECARREGA a página de confirmação (novo ensureCharge)
ENTÃO a MESMA charge é retornada (mesmo chargeId, mesmo QR)
  E nenhuma nova cobrança no gateway
```

### RF-053 + RF-073: Expiração e Regeneração

```gherkin
DADO charge criada com expiração 30min e cliente não pagou
QUANDO cron roda após o vencimento
ENTÃO status='expired'
  E painel aberto transiciona para "Código expirado" sozinho
QUANDO cliente clica "Gerar novo código PIX"
ENTÃO nova charge pending criada (UNIQUE permite — anterior expired)
  E novo QR + novo countdown
  E charge antiga preservada no histórico
```

### RF-072: Transição ao Vivo

```gherkin
DADO painel aberto em awaiting
QUANDO PRD-134 processa o webhook e UPDATE status='paid'
ENTÃO em < 3s o painel mostra "✓ Pagamento confirmado" com valor e horário
  E sem qualquer ação do usuário
```

### RF-093: Convivência com Pagamento Manual

```gherkin
DADO charge PIX pending no pedido O1
QUANDO seller clica "Marcar como pago" (recebeu por fora)
ENTÃO confirm extra: "Existe cobrança PIX aguardando — confirmar pagamento manual?"
  E ao confirmar, order.payment_status='paid' (fluxo PRD-032)
  E a charge permanece pending até expirar pelo cron (audit reflete os dois eventos)
```

---

## Fases de Implementação

### Fase 1 — Edge Function + Dual-Context (1.5 dias)
- Estrutura, Zod, switch por método
- withAuth + guest-context (4 validações + 404 genérico)
- withIdempotency + pre-check RF-031

### Fase 2 — Criação + Persistência + Cron (1.5 dias)
- createPixCharge via factory + INSERT
- regenerate
- pg_cron expiração + audit agregado

### Fase 3 — Hook + Panel (2 dias)
- usePixCharge (Realtime + fallback polling guest)
- PixPaymentPanel (5 estados, countdown, copiar, QR fallback client-side)

### Fase 4 — Integrações Host (1.5 dias)
- /loja: OrderConfirmedPage + banner condicional
- /app: botão + modal + "Enviar por WhatsApp" + histórico de charges + confirm do RF-093

### Fase 5 — Testes + Docs (1 dia)
- E2E guest completo com mock
- payment-pix-flow.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-132 (interface, Asaas, schema), PRD-132B (MP), PRD-102 (Edge + idempotency + pg_cron), PRD-105 (Realtime + extensão da publication), PRD-064 F1 (host /loja), PRD-032 F1 (host /app)
- **Bloqueia:** PRD-134 (webhook fecha o ciclo — sem charge não há o que confirmar), PRD-140B (migração de stubs)
- **Decisões Pendentes:**
  - `pixExpirationMinutes` default 30 (confirmar com Owner)
  - Guest sem Realtime → polling 5s (sugerido; alternativa de Realtime anônimo com policy por order_id avaliada e descartada por superfície)
  - Janela guest de 24h (sugerido; alinhada à expiração máxima razoável de um checkout)

---

## Considerações de Segurança

- Guest-context: 404 genérico, rate limit, audit com IP truncado, posse de UUID não-enumerável como credencial fraca-mas-suficiente (dano potencial: pagar o pedido alheio)
- `paid` tem escritor único (PRD-134) — esta função jamais escreve `paid`
- QR payload não contém PII além do que o BR Code exige (nome do recebedor)
- service_role confinado à Edge Function; UI usa apenas o response + Realtime/polling com RLS

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.3; CHANGELOG; renomear `PRD-133-pix-qr-dinamico_DONE.md`; E2E guest documentado com screenshots dos 5 estados do panel.

| Princípio | Descrição |
|-----------|-----------|
| **`paid` vem só do webhook** | Esta função cria; PRD-134 confirma |
| **Recarregar ≠ duplicar** | Charge pending existente é retornada, não recriada |
| **Expiração em camadas** | Countdown UI + cron local + guarda paid-after-expiry no 134 |
| **Guest com 404 genérico** | Nunca revelar qual validação falhou |
| **Copia-e-cola primeiro no mobile** | QR é secundário na própria tela |

| ❌ Evitar |
|-----------|
| Escrever `paid` aqui |
| Persistir charge antes do gateway confirmar criação |
| Revelar motivo da falha ao guest |
| Polling agressivo (< 5s) no fallback |
| Regenerar com pending ativa |
| Esconder charges expiradas do histórico no /app |

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
| 09/06/2026 | v1 | Criação inicial — Sub-lote 4a do Lote 4 (Onda 7) |

---

**AILA - Sistemas Inteligentes**
