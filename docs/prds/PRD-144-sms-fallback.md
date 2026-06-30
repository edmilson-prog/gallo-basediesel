# PRD-144: SMS (Fallback de Canal)

> **Perfil E (esqueleto enxuto)** — P3: pós-go-live. Contrato e fundação definidos; implementação concreta condicionada à decisão de provider e à demanda real.

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `_shared/channels/sms.ts` + `src/providers/sms/`_ |
| **Objetivo** | Ativar o esqueleto `SmsChannel` do PRD-008 como **canal de nicho**: o público da Turbo Diesel vive no WhatsApp, mas existe a cauda — cliente sem WhatsApp ativo, número fixo-móvel antigo, e o cenário de contingência (incidente prolongado nos dois providers de WhatsApp). Entrega: interface `ISmsProvider` leve (Provider Pattern mínimo — o provider concreto é **decisão pendente**: Zenvia/Twilio/AWS SNS, com Twilio como referência de contrato), integração às `notification_deliveries` (141), restrições do meio (GSM-7, 160 chars, sem links longos) e roteamento **opt-in por evento** — nenhum evento ganha SMS por default |
| **Tipo** | Integração |
| **Complexidade** | Baixa |
| **Total de Fases** | 3 |
| **Prioridade** | P3 |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | PRD-008 F1 (contrato do canal); PRD-141 (dispatch + deliveries — host); PRD-143 (WhatsApp é o canal primário — SMS não é fallback automático dele, decisão da onda); PRD-147 (opt-in); PRD-150 (verificação) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Canal fino sobre `ISmsProvider`; mensagens como funções puras por evento |

### Critérios de Complexidade

> **Justificativa de Baixa (perfil E):** o pipeline (dispatch, deliveries, supressão) já existe do 141; SMS adiciona um provider HTTP simples e um meio com restrições conhecidas. O risco não é técnico — é de **produto**: SMS custa R$ 0,08–0,15/mensagem com taxa de leitura inferior ao WhatsApp no Brasil; este PRD existe para a cauda e a contingência, e o desenho (opt-in por evento, default vazio) impede que vire custo silencioso.

---

## Contexto do Problema

Três cenários reais que email+WhatsApp não cobrem: (1) o motorista com aparelho antigo cujo WhatsApp não recebe HSM (número não registrado na Meta); (2) o cliente que pediu explicitamente "me avisa por SMS" — existe no B2B mais tradicional; (3) **contingência**: Meta e Evolution simultaneamente indisponíveis (o failover do 120 cobre um; não os dois) durante uma janela de pagamentos — SMS é o canal de emergência operável em minutos. P3 honesto: não bloqueia go-live; nasce pronto para ativar quando a demanda aparecer.

---

## Conceito da Solução

```typescript
// src/providers/sms/ISmsProvider.ts
export interface ISmsProvider {
  readonly providerName: 'twilio' | 'zenvia' | 'mock'
  send(input: { to: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>
  // status via webhook do provider concreto (esqueleto: polling/none documentado por provider)
  healthCheck(): Promise<{ status: 'healthy' | 'down' }>
}
```

- **Factory** por env (`SMS_PROVIDER`), `MockSmsProvider` ativo; Twilio como **referência de contrato** no esqueleto (`POST /Messages`, Basic auth SID:token via Vault, status callback) — implementação real só após a decisão de provider (custo/cobertura BR pesa para Zenvia; documentação pesa para Twilio)
- **`SmsChannel`** sobre o contrato do 008: resolve telefone (mesmo campo do 143), supressão por `whatsapp_status='invalid'` **não se aplica** (número pode receber SMS sem ter WhatsApp) — supressão própria futura por DLR de número inexistente
- **Mensagens por evento**: funções puras `(payload) => string`, validadas em build para ≤ 160 chars GSM-7 (acentos pt-BR forçam UCS-2 e cortam para 70 — normalização sem acentos é decisão consciente do meio: "Pagamento de R$ 430,00 confirmado. Pedido PD-0042. GALLO Diesel"); links apenas curtos do próprio domínio quando indispensável
- **Roteamento opt-in:** nenhum evento tem SMS nos defaults; ativação por evento via configuração de regras (008) — e o modo **contingência** (toggle Owner) promove `payment.confirmed` e `order.confirmed` para SMS enquanto ativo, com audit

---

## Requisitos Funcionais (essenciais)

- **RF-001:** `ISmsProvider` + factory + `MockSmsProvider` (determinístico) + stub `TwilioSmsProvider` com o contrato comentado.
- **RF-002:** `SmsChannel.send` integra deliveries (141): `pending→sent` no aceite; status posterior por webhook do provider concreto (esqueleto documenta; mock simula).
- **RF-003:** Validador de mensagem: build falha se função de evento gerar > 160 chars GSM-7 com payload máximo de fixture; normalização de acentos aplicada e testada.
- **RF-004:** Telefone ausente → `failed/NO_PHONE`; idempotência por `idempotencyKey` da delivery.
- **RF-005:** Roteamento: catálogo sem SMS por default; toggle de contingência (config Owner, audit `sms_contingency_enabled/disabled`) promove os 2 eventos críticos enquanto ativo.
- **RF-006:** Custo visível: audit por envio com custo estimado configurável (`smsCostEstimate`); contador mensal simples na tela de conciliação (139) como linha informativa.
- **RF-007:** Testes: validador GSM-7 (acentos, payloads máximos), opt-in (evento sem regra → canal ausente), contingência liga/desliga, mock fim-a-fim com delivery.
- **RF-008:** Documentação `docs/dev/notification-sms.md`: quando ativar, comparação de providers BR, contrato Twilio de referência, restrições do meio, modo contingência.

---

## Critérios de Aceitação (núcleo)

```gherkin
DADO nenhum evento com SMS nos defaults
QUANDO payment.confirmed roteia
ENTÃO canais = email + whatsapp; SMS ausente (custo zero por design)

DADO modo contingência ATIVADO pelo Owner
QUANDO payment.confirmed roteia
ENTÃO delivery SMS criada e enviada via provider
  E mensagem ≤160 chars GSM-7, sem acentos, valores formatados
  E audit com custo estimado

DADO função de mensagem gerando 174 chars com fixture máxima
QUANDO build roda
ENTÃO falha com apontamento do evento e do excesso
```

---

## Fases de Implementação

### Fase 1 — Interface + Mock + Canal (1 dia)
ISmsProvider, factory, MockSmsProvider, SmsChannel sobre deliveries, NO_PHONE.

### Fase 2 — Mensagens + Validador + Contingência (1 dia)
Funções por evento (2 críticos), validador GSM-7 em build, toggle de contingência + audit + custo.

### Fase 3 — Stub Twilio + Docs (0.5 dia)
Contrato de referência comentado; notification-sms.md; `_DONE`.

---

## Dependências

- **Depende de:** PRD-141 (dispatch+deliveries), PRD-008 (contrato), PRD-100 (Vault para o provider real futuro)
- **Bloqueia:** PRD-150 (verificação de que o esqueleto `deferred` saiu)
- **Decisões Pendentes:** provider concreto (Zenvia vs Twilio vs SNS — Owner decide quando ativar); custo estimado por mensagem para o contador; eventos elegíveis além dos 2 críticos

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.4; CHANGELOG; renomear `PRD-144-sms-fallback_DONE.md`.

| Princípio | Descrição |
|-----------|-----------|
| **Opt-in por design** | SMS nunca entra de carona — custo é decisão |
| **160 chars é lei de build** | O meio define a mensagem, não o contrário |
| **Contingência auditada** | Liga em minutos, desliga com rastro |
| **Provider é decisão adiada** | Interface pronta; concreto quando houver demanda |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 5b do Lote 5 (Onda 8), perfil E |

---

**AILA - Sistemas Inteligentes**
