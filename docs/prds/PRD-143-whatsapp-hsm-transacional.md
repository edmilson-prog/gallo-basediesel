# PRD-143: WhatsApp Transacional via HSM

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `_shared/channels/whatsapp.ts` + mapa de templates_ |
| **Objetivo** | Ativar o segundo canal externo da fundação: o esqueleto `WhatsAppChannel` (`deferred`) do PRD-008 vira entrega real **reusando integralmente o pipeline da Onda 5** — envio (115), templates HSM Meta (116), janela de 24h (117) e status tracking (118). Zero infraestrutura nova de WhatsApp: este PRD entrega o **mapa tipado evento→template HSM** (`notification_hsm_map`), a **otimização de custo** janela-aberta = mensagem de sessão / janela-fechada = HSM, a integração das deliveries (141) com a fonte de status existente (`crm.messages.dispatch_status` — assimetria já documentada), e a política transacional (ignora quiet hours; categoria **utility** da Meta) |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — WhatsApp é o canal nº 1 do público da Turbo Diesel; pagamento confirmado sem WhatsApp é meio go-live |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | PRD-008 F1 (contrato do canal); PRD-141 (dispatch + deliveries — host deste canal); PRD-115 (whatsapp-send — **reusado**, não recriado); PRD-116 (`crm.message_templates` + render `{{N}}` — reusado); PRD-117 (`computeSessionWindow` — decide sessão vs HSM); PRD-118 (dispatch_status — fonte do status, via join); PRD-114 (conversa/customer pipeline); PRD-147 (opt-in marketing — transacional tem base própria); PRD-150 (verificação final) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Canal fino: orquestra os módulos da Onda 5; nenhuma chamada direta à Meta/Evolution fora do 115 |

### Critérios de Complexidade

> **Justificativa de Média:** toda a infraestrutura pesada já existe (Onda 5) — o risco deste PRD é **disciplina de reuso**: a tentação de "só dessa vez" chamar a Meta direto do canal criaria um segundo caminho de envio fora da idempotência, do failover (120) e do status tracking (118). A complexidade real concentra-se em três regras de domínio: (1) a decisão sessão-vs-HSM pela janela (custo: sessão ~grátis, HSM utility ~R$0,04-0,08); (2) o mapeamento tipado de payload de evento → parâmetros `{{1}}..{{N}}` do template aprovado (parâmetro faltando = rejeição Meta 132000); (3) transacional para customer **sem conversa prévia** — o pipeline precisa criar/encontrar a conversa sem violar as invariantes do 114.

---

## Contexto do Problema

O comprador da Turbo Diesel vive no WhatsApp — é a tese do projeto inteiro (Onda 5 existe por isso). Quando ele paga um PIX:

- **Hoje (pós-141):** recebe email. Bom, mas o email do caminhoneiro autônomo é o que ele abriu para criar o cadastro — o WhatsApp é onde ele **está**.
- **Alvo:** em segundos, recebe no WhatsApp: *"✅ Pagamento de R$ 430,00 confirmado! Pedido #PD-0042 em separação."*

O PRD-008 deixou o canal como esqueleto; a Onda 5 construiu o encanamento completo (envio idempotente, templates aprovados, janela, status ✓/✓✓, failover Meta↔Evolution). Falta apenas a **ligação**: notificação → template certo → pipeline existente. Este PRD é essa ligação — deliberadamente fino.

---

## Conceito da Solução

### Canal Fino sobre a Onda 5

```
notification-dispatch (141)
        │ canal 'whatsapp' alvo
        ▼
WhatsAppChannel.send(notification, delivery)
        │
        ├─ 1. Resolve telefone (customer.whatsapp / seller.phone) → sem? failed NO_PHONE
        ├─ 2. Resolve/encontra conversa (pipeline do 114/115 — função existente)
        ├─ 3. computeSessionWindow (117):
        │      ABERTA  → mensagem de sessão (texto do template renderizado livre)
        │      FECHADA → HSM via notification_hsm_map (116)
        ├─ 4. Invoca whatsapp-send (115) — idempotência, failover (120), tudo herdado
        ├─ 5. delivery.provider_message_id = crm.messages.id
        └─ 6. Status: lido por JOIN em messages.dispatch_status (118) — sem duplicar máquina
```

**Invariante de reuso:** o canal **não** conhece Meta Cloud nem Evolution — só o contrato do 115. Failover, retry, HSM pacing, tudo vem de graça.

### Mapa Tipado Evento → Template HSM

```typescript
// _shared/notification-hsm-map.ts
export const notificationHsmMap = {
  'payment.confirmed': {
    templateKey: 'pagamento_confirmado',        // crm.message_templates (116), aprovado Meta
    metaCategory: 'utility',
    params: (p: PaymentConfirmedPayload) => [
      p.customerFirstName,                       // {{1}}
      formatBRL(p.amount),                       // {{2}}
      p.orderNumber,                             // {{3}}
    ],
    sessionText: (p) => `✅ Pagamento de ${formatBRL(p.amount)} confirmado! ...`,
  },
  'order.confirmed':        { templateKey: 'pedido_confirmado', ... },
  'payment.boleto_created': { templateKey: 'boleto_disponivel', ... },  // linha digitável em {{2}}
  'nfe.issued':             { templateKey: 'nfe_emitida', ... },        // link assinado do PDF
} as const satisfies HsmMap
```

- `params` é função tipada do payload do evento → array na ordem exata do template — parâmetro errado **não compila**
- `sessionText` é a versão livre (janela aberta): mais rica, com emoji, sem custo de HSM
- Evento sem entrada no mapa → canal retorna `skipped` com `error_code='NO_HSM_MAPPING'` (audit; não é erro — nem todo evento merece WhatsApp)
- Os 4 templates do go-live entram no seed do 116 com os corpos propostos e ficam **pendentes de aprovação Meta** (decisão pendente já registrada no INDEX — submeter antes da implementação)

### Sessão vs HSM — A Otimização de Custo

| Janela (117) | Caminho | Custo | Conteúdo |
|---|---|---|---|
| **Aberta** (cliente falou < 24h) | `sendTextMessage` (115) | conversa de serviço — ~zero | `sessionText` rico |
| **Fechada / sem conversa** | `sendTemplateMessage` (115/116) | HSM **utility** ~R$0,04–0,08 | template aprovado, params tipados |

Categoria **utility** (não marketing): transacional puro tem aprovação mais fácil na Meta, custo menor e — crucial — **base legal própria** (execução de contrato): cliente que comprou recebe confirmação do que comprou. O opt-in granular do 147 governa marketing; transacional respeita apenas o opt-out explícito de canal (matriz do 008) e a supressão de número inválido.

### Customer sem Conversa Prévia

Compra na /loja por guest → customer placeholder pode nunca ter conversado. O canal usa a função de resolução do 115 (`resolveOrCreateConversation`): cria a conversa atribuída conforme roteamento do 113, marca origem `system_notification` (campo existente de `IConversation.origin` — DELTA aditivo se ausente, declarado), e envia o HSM. Resposta do cliente cai no inbox normal (114) — a notificação **abre** relacionamento, não cria silo.

### Status — Fonte Única (assimetria do 141 honrada)

`crm.messages.dispatch_status` (118) já modela queued→sent→delivered→read→failed com webhooks reais. A delivery (141) para WhatsApp guarda `provider_message_id = message.id` e **lê** o status por join (view `v_notification_delivery_status` unificando email-nativo + whatsapp-join para o Center/146). Falha do envio (115 lança) → delivery `failed` com o erro mapeado; número inválido reportado pela Meta (131026) → migration aditiva `customers.whatsapp_status='invalid'` (campo do 118 — reuso, com supressão pré-envio paralela ao email_status do 141).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Sempre HSM (ignorar janela) | Custo desnecessário e experiência pior (HSM é mais rígido que texto de sessão) |
| Sempre sessão (nunca HSM) | Janela fechada = mensagem não entrega; HSM é o único caminho fora de 24h — regra Meta |
| Canal chamando Meta direto | Quebra idempotência/failover/status da Onda 5; proibido por desenho |
| Duplicar status em deliveries | Duas máquinas de estado para o mesmo fato divergem; join na leitura (assimetria documentada no 141) |
| Categoria marketing nos templates | Aprovação difícil, custo maior, base legal errada para transacional |
| Esperar opt-in do 147 para transacional | Execução de contrato não exige opt-in marketing; bloquear confirmação de pagamento seria anti-serviço |

---

## Escopo

### Incluído

- ✅ `WhatsAppChannel` real em `_shared/channels/whatsapp.ts` (substitui o esqueleto `deferred` do 008) — orquestração fina sobre 114/115/116/117
- ✅ `notification-hsm-map.ts` tipado (`satisfies HsmMap`) com os 4 eventos do go-live + `sessionText` por evento
- ✅ Seed dos 4 templates HSM no 116 (`pagamento_confirmado`, `pedido_confirmado`, `boleto_disponivel`, `nfe_emitida`) com corpos propostos, categoria utility, status `pending_meta_approval`
- ✅ Decisão sessão-vs-HSM via `computeSessionWindow` (117) com audit do caminho escolhido (`whatsapp_sent_via: 'session'|'hsm'` — visibilidade de custo)
- ✅ Resolução/criação de conversa para customer sem histórico (`origin='system_notification'` — DELTA aditivo declarado se campo ausente)
- ✅ Integração deliveries↔messages: `provider_message_id=message.id`, view `v_notification_delivery_status` (email nativo + whatsapp join)
- ✅ Supressão por `whatsapp_status='invalid'` (118) pré-envio, paralela ao email (141 RF-030)
- ✅ Política transacional: ignora quiet hours (modelada no 008, adormecida) — registrado que marketing (148/149) **respeitará**
- ✅ `skipped/NO_HSM_MAPPING` para eventos sem entrada (auditado, não-erro)
- ✅ Roteamento default atualizado: `payment.confirmed`, `order.confirmed`, `payment.boleto_created`, `nfe.issued` ganham canal whatsapp para `recipientType='customer'` (DELTA Anexo A do 008, somando ao DELTA do 141)
- ✅ Testes: mapa tipado (param faltando não compila), decisão de janela (aberta→sessão / fechada→HSM), sem conversa→cria+HSM, NO_PHONE, supressão invalid, join de status, custo-audit
- ✅ E2E mock (Onda 5 mock providers): payment.confirmed → HSM enviado → webhook status 118 → Center exibe ✓✓
- ✅ Documentação `docs/dev/notification-whatsapp.md` (regra de janela, mapa, custo, base legal transacional vs marketing)

### Excluído

- ❌ Qualquer infraestrutura de envio/status/failover (Onda 5 — reuso total)
- ❌ Templates de marketing/drip/abandono (148/149 — categoria marketing + opt-in do 147)
- ❌ Botões interativos/listas em HSM (templates utility simples no MVP; interactive é evolução)
- ❌ Fallback automático entre canais (HSM falhou → email) — decisão registrada no plano da onda: deliveryStatus failed visível; fallback é candidato pós-MVP
- ❌ Opt-in/out granular com trilha (147)
- ❌ SMS como fallback de WhatsApp (144 trata SMS isoladamente)

---

## Requisitos Funcionais

### Canal

- **RF-001:** `WhatsAppChannel.send(notification, delivery)` implementa o contrato do 008; nenhum import de Meta/Evolution — apenas módulos do 115/116/117.
- **RF-002:** Telefone ausente → delivery `failed`/`NO_PHONE` sem retry.
- **RF-003:** `whatsapp_status='invalid'` → delivery `suppressed` sem chamada (paridade 141 RF-030).
- **RF-004:** Conversa resolvida/criada via função do 115; criada → `origin='system_notification'`; resposta do cliente flui pelo inbox normal (114) sem tratamento especial.

### Decisão de Janela

- **RF-010:** `computeSessionWindow(conversation)` (117): aberta → `sendTextMessage` com `sessionText(payload)`; fechada/inexistente → `sendTemplateMessage` com `templateKey` + `params(payload)`.
- **RF-011:** Audit `whatsapp_sent_via` em toda entrega (relatório de custo: % sessão vs HSM).
- **RF-012:** Quiet hours ignoradas para `category='transactional'` (registro explícito de que marketing respeitará — guarda no dispatch por categoria).

### Mapa HSM

- **RF-020:** `notificationHsmMap` tipado: `params` é função do payload tipado do evento → `string[]` na aridade exata do template; divergência não compila (teste de tipo).
- **RF-021:** Evento sem entrada → `skipped`/`NO_HSM_MAPPING` + audit (canal não é erro para evento email-only).
- **RF-022:** Render final dos params passa pela validação do 116 (aridade vs template registrado) — defesa dupla contra Meta 132000.
- **RF-023:** Seed dos 4 templates com corpos propostos (Anexo no PRD) e flag `pending_meta_approval`; envio HSM com template não-aprovado → erro claro orientando o status (não silencioso).

### Status e Deliveries

- **RF-030:** `provider_message_id = crm.messages.id`; delivery email-style `sent` no aceite do 115; transições posteriores **lidas** de `dispatch_status` via `v_notification_delivery_status`.
- **RF-031:** Falha do 115 (após retries dele) → delivery `failed` com `failure_code` herdado (118).
- **RF-032:** View unificada consumida pelo Center (009/146): por delivery → canal, status efetivo, timestamps, sem duplicação de escrita.

### Roteamento

- **RF-040:** Os 4 eventos do go-live ganham canal `whatsapp` nos defaults para customer (DELTA Anexo A, junto ao DELTA do 141).
- **RF-041:** Preferência do destinatário (matriz 008) pode desligar o canal — exceto supressão técnica, que é independente.

### Testes e Docs

- **RF-050:** Tipo (param faltando = `@ts-expect-error`), janela (2 caminhos), conversa nova, NO_PHONE, suppressed, skipped, join da view.
- **RF-051:** E2E mock fim-a-fim com status ✓✓ no Center.
- **RF-052:** `notification-whatsapp.md` + Anexo com os 4 corpos de template para submissão Meta.

---

## Requisitos Não-Funcionais

- **RNF-001 (Reuso absoluto):** zero caminhos de envio fora do 115 — lint `no-restricted-imports` para os clients da Onda 5 fora de `providers/whatsapp`.
- **RNF-002 (Custo visível):** todo envio audita o caminho; relatório sessão-vs-HSM trivial.
- **RNF-003 (Type-safety dos params):** divergência de aridade/ordem não compila.
- **RNF-004 (Latência):** pagamento confirmado → mensagem aceita pelo 115 < 8s p95.
- **RNF-005 (Base legal limpa):** transacional = execução de contrato; nenhum envio de categoria marketing por este canal até o 147.

---

## Critérios de Aceitação

### RF-010: Janela Decide o Caminho

```gherkin
DADO customer com conversa ativa (última inbound há 3h)
QUANDO payment.confirmed roteia whatsapp
ENTÃO mensagem de SESSÃO enviada (sessionText rico)
  E audit whatsapp_sent_via='session' (custo ~zero)

DADO customer sem conversa OU janela fechada (28h)
QUANDO o mesmo evento roteia
ENTÃO HSM 'pagamento_confirmado' com params [nome, valor, pedido]
  E conversa criada com origin='system_notification' se inexistente
  E audit whatsapp_sent_via='hsm'
```

### RF-020: Params Tipados

```gherkin
DADO mapa exigindo 3 params para 'pagamento_confirmado'
QUANDO código fornece função retornando 2
ENTÃO tsc falha (teste @ts-expect-error documenta)
  E em runtime a validação do 116 seria a 2ª defesa
```

### RF-030: Status por Join

```gherkin
DADO HSM enviado (delivery sent, provider_message_id=M1)
QUANDO webhook da Meta marca M1 delivered e depois read (118)
ENTÃO v_notification_delivery_status reflete sem nenhum UPDATE em deliveries
  E o Center exibe ✓✓ azul na notificação
```

### RF-004: Resposta Abre Relacionamento

```gherkin
DADO conversa criada por system_notification
QUANDO o cliente responde "obrigado, quando chega?"
ENTÃO mensagem cai no inbox normal (114) roteada ao seller
  E a janela 24h abre — próximas notificações vão por sessão
```

---

## Fases de Implementação

### Fase 1 — Mapa + Seed de Templates (1 dia)
- notificationHsmMap tipado + sessionTexts
- Seed dos 4 no 116 (pending_meta_approval) + Anexo de submissão

### Fase 2 — Canal + Janela (1.5 dias)
- WhatsAppChannel sobre 114/115/117
- Supressões, NO_PHONE, skipped, audit de custo

### Fase 3 — Status + Roteamento (1 dia)
- View unificada + integração deliveries
- DELTA de roteamento (4 eventos × whatsapp)

### Fase 4 — Testes + Docs (1 dia)
- Tipo, janela, E2E mock até ✓✓
- notification-whatsapp.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-141 (dispatch + deliveries — host), PRD-008 (contrato), **Onda 5 completa** (114–118; mocks suficientes para dev, produção exige Onda 5 implementada), PRD-117 (janela)
- **Bloqueia:** 146 (view no Center), 148/149 (canal para marketing — com 147), 150
- **DELTAs declarados:** PRD-008 (roteamento +whatsapp nos 4 eventos — somando ao DELTA do 141); `IConversation.origin` valor `system_notification` se ausente
- **Decisões Pendentes:**
  - **Submissão dos 4 templates à Meta** (corpos no Anexo) — fazer **já**: aprovação leva dias e bloqueia produção (sandbox/mock não bloqueiam dev)
  - Fallback HSM→email automático — pós-MVP (registrado)

---

## Considerações de Segurança

- Conteúdo transacional com snapshot mínimo (valor, pedido) — sem dados de cartão, sem chave PIX de terceiros
- Link de PDF (NFe) sempre signed URL com TTL — nunca path público
- Base legal: transacional por execução de contrato; categoria marketing tecnicamente bloqueada neste canal até o 147
- Supressão de número inválido evita custo e flag de qualidade na Meta (quality rating protege o número da empresa)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.3; CHANGELOG; renomear `PRD-143-whatsapp-hsm-transacional_DONE.md`; anotar DELTAs no `_DONE` do 008; lembrar o Owner da submissão Meta (gate de produção, não de dev).

| Princípio | Descrição |
|-----------|-----------|
| **Canal fino, Onda 5 grossa** | Zero envio fora do 115 |
| **Janela decide o custo** | Sessão quando dá; HSM quando precisa |
| **Params não compilam errados** | Mapa tipado é o contrato com a Meta |
| **Status tem um dono** | dispatch_status (118); deliveries leem por join |
| **Utility, não marketing** | Base legal e custo correto do transacional |

| ❌ Evitar |
|-----------|
| Chamar Meta/Evolution direto |
| HSM com janela aberta (custo grátis ignorado) |
| Segunda máquina de status |
| Template não-aprovado falhando silencioso |
| Marketing disfarçado de utility |
| Quiet hours bloqueando confirmação de pagamento |

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
