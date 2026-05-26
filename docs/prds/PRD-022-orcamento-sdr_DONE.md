# PRD-022: Geração de Orçamento via SDR

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                              |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                   |
| **Objetivo**          | Quando o SDR identifica peça e cliente confirma (PRD-021), gerar automaticamente um orçamento estruturado (`IQuote`) com precificação base, frete preliminar, validade, e envio formatado ao cliente — com opções de Aceitar, Recusar ou Escalar para vendedor humano |
| **Tipo**              | Feature                                                                                                                                                                                                                                                               |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                  |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                     |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                                  |
| **Épico**             | Bloco 2 — SDR (Agente IA 24/7)                                                                                                                                                                                                                                        |
| **PRDs Relacionados** | PRD-020 (SDR), PRD-021 (Identificação Peça), PRD-023 (Escalonamento), PRD-031 (Orçamento — placeholder), PRD-033 (Frete — placeholder)                                                                                                                                |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                    |
| **Padrão de código**  | Feature-based; código em `src/features/sdr-quote/`; integração via stubs até PRD-031/033                                                                                                                                                                              |

### Critérios de Complexidade

> **Justificativa de Alta:** geração automática de `IQuote` completo (origin='sdr'), precificação com regras (preço de tabela, desconto SDR opcional), cálculo de frete preliminar baseado em CEP/peso (placeholder até PRD-033), validade do orçamento configurável, mensagem rica ao cliente com 3 opções de resposta (aceitar/recusar/falar com vendedor), parser de resposta do cliente para 3 fluxos distintos, regra de escalação automática quando cliente pede desconto além do permitido pelo SDR, integração com PRD-031 (placeholder estilizado), e estrutura preparada para conversão a `IOrder` (PRD-032) quando aceito.

---

## Contexto do Problema

Cliente confirmou a peça via SDR. Próxima etapa óbvia: orçamento. Hoje sem SDR estruturado, três cenários problemáticos:

**Vendedor humano só chega no orçamento.** SDR identificou tudo, mas para gerar valor o cliente precisa esperar vendedor responder. Em fim de semana / madrugada, isso pode ser 12+ horas — cliente já fechou em outro lugar. **Orçamento sem validade explícita.** "R$ 95" hoje pode ser R$ 110 daqui a 7 dias por mudança de fornecedor. Sem validade clara, vendedor é cobrado depois. **Cliente quer desconto, SDR não pode dar, ninguém escala.** Cliente pergunta "tem por menos?". SDR sem regra clara responde mal — ou nega cegamente (perde venda) ou inventa desconto (compromisso indevido). Precisa escalar.

Este PRD entrega: geração automática de orçamento pelo SDR com regras claras (preço base + desconto autorizado opcional + frete placeholder + validade), mensagem formatada ao cliente com 3 opções de resposta, escalação automática quando cliente pede algo fora do permitido, e integração com PRD-031 (orçamento estruturado).

---

## Conceito da Solução

### Trigger

`IPartIdentification.status='confirmed'` (PRD-021) com `customerConfirmedPartId` preenchido dispara fluxo deste PRD.

### Composição do orçamento

`IQuote` (PRD-002) gerado tem:

| Campo          | Valor                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| `origin`       | `'sdr'` (distingue de quotes criadas por vendedor humano)                    |
| `customerId`   | Da conversa atual                                                            |
| `sellerId`     | Vendedor atribuído à conversa (mesmo se SDR está ativo)                      |
| `items`        | Array com a peça identificada — 1 item no MVP, N itens via composição futura |
| `subtotal`     | Soma de `quantity × unitPrice` por item                                      |
| `discount`     | 0 no MVP base; até X% se SDR autorizado a dar desconto                       |
| `shippingCost` | Cálculo preliminar (placeholder PRD-033)                                     |
| `total`        | `subtotal - discount + shippingCost`                                         |
| `validUntil`   | `now + IPlatformSettings.sdrQuoteValidityDays` (default 7 dias)              |
| `status`       | `'enviado'` (orçamento já vai com status enviado, não rascunho)              |
| `createdAt`    | now                                                                          |
| `storeId`      | Da conversa                                                                  |

### Regras de precificação

| Regra                   | Comportamento MVP                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Preço base**          | `IPart.unitPrice` (tabela do catálogo PRD-030 — stub)                                                             |
| **Desconto automático** | 0 no MVP base; configurável em `IPlatformSettings.sdrAutoDiscountPct` (default 0%)                                |
| **Markup por canal**    | Sem markup no MVP — preço único                                                                                   |
| **Validade**            | `IPlatformSettings.sdrQuoteValidityDays` (default 7 dias)                                                         |
| **Frete**               | Placeholder no MVP: valor fixo R$ 50 ou "a combinar" — Fase 2 com PRD-033 (cálculo via integração transportadora) |

### Mensagem ao cliente

Quando orçamento é gerado, SDR envia mensagem rica:

```
🧾 *Orçamento GALLO BASE DIESEL*

▫️ Filtro de óleo Volvo R450
   Cód. 21380488 (original Volvo)
   Quantidade: 1 un
   Valor unitário: R$ 95,00

💰 *Resumo*
   Subtotal: R$ 95,00
   Frete: R$ 50,00 (estimado)
   *TOTAL: R$ 145,00*

📅 Válido até: 01/06/2026

✅ Para confirmar, responde: *1*
❌ Para recusar: *2*
👤 Para falar com vendedor: *3*
```

### Parser de resposta do cliente

Quando cliente responde após receber orçamento, parser detecta:

| Resposta                                                | Ação                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| "1", "sim", "aceito", "fechado", "ok", "pode mandar"    | `quote.status='aceito'`; dispara fluxo de pedido (PRD-032 placeholder) |
| "2", "não", "deixa", "obrigado"                         | `quote.status='recusado'`; pergunta se quer ver outras opções          |
| "3", "vendedor", "humano", "atendente"                  | Escalar para humano (PRD-023)                                          |
| "tem por menos?", "desconto", "mais barato", "negociar" | Detecta intenção de negociação → escalar automaticamente               |
| Outra coisa                                             | SDR pergunta de novo: "Não entendi. Responde 1, 2 ou 3."               |

### Escalação automática por negociação

Quando cliente menciona "desconto", "menor", "negociar", "barato":

- SDR responde: "Beleza! Vou conectar você com um vendedor especialista que pode avaliar."
- Aciona PRD-023 (escalonamento)
- Resumo do contexto inclui: orçamento gerado, valor, peça, pedido de negociação

### Conversão orçamento → pedido

Quando cliente aceita (resposta "1"):

- `IQuote.status='aceito'`
- SDR envia: "Perfeito, [nome]! Pedido em andamento. Você prefere pagar via PIX ou boleto? Quando puder receber?"
- No MVP, transição para pedido (IOrder) é placeholder estilizado — PRD-032 implementa de fato
- SDR captura método de pagamento e endereço de entrega (texto livre no MVP), salva como nota
- Audit log de aceite

### Templates configuráveis

`IPlatformSettings.sdrQuoteTemplates` permite Owner configurar:

- Template de geração (estrutura visual do orçamento)
- Template de aceite ("Perfeito! ...")
- Template de recusa ("Tudo bem, ..."
- Template de escalação ("Vou te conectar...")

Templates usam variáveis: `{{cliente_nome}}`, `{{peca_nome}}`, `{{valor_total}}`, `{{validade}}`, etc.

### Integração com PRD-031 (placeholder)

Orçamento gerado pelo SDR aparece na lista de orçamentos do PRD-031 (quando implementado) com badge `origin='sdr'`. No MVP, placeholder coerente: lista mockada com 1-2 quotes SDR como exemplo.

### Alternativas Consideradas

| Alternativa                                                 | Por que foi descartada                           |
| ----------------------------------------------------------- | ------------------------------------------------ |
| SDR sempre escala para humano antes de orçar                | Defeat the purpose — SDR existe para automatizar |
| Sem validade no orçamento SDR                               | Vendedor cobrado depois por preço desatualizado  |
| Sem opções formatadas (cliente responde livre)              | UX confuso; cliente não sabe o que responder     |
| Desconto livre pelo SDR                                     | Sem controle, prejuízo certo                     |
| Frete sempre "a combinar"                                   | Cliente quer valor concreto para decidir         |
| Sem escalação automática em negociação                      | Cliente fica frustrado quando bate em parede     |
| Aceite muda direto para pedido sem checar pagamento/entrega | Cliente surpreso com cobrança; precisa de etapa  |

**Decisão consolidada:** **orçamento estruturado com validade, mensagem rica com 3 opções claras, escalação automática em negociação, templates configuráveis, captura de pagamento/entrega após aceite (texto livre no MVP), placeholder do PRD-031.**

---

## Escopo

### Incluído

- ✅ Modelo de `IQuote` (PRD-002) com campo `origin: 'sdr' | 'vendedor' | 'portal_cliente' | 'ecommerce'`
- ✅ Função `generateSdrQuote(identification, context)` em `src/features/sdr-quote/engine/`
- ✅ Composição do orçamento com items (1 no MVP), subtotal, desconto, frete, total, validade
- ✅ Cálculo de frete preliminar via stub do PRD-033 (no MVP, valor fixo R$ 50 ou "a combinar" para fora da região)
- ✅ Templates configuráveis em `IPlatformSettings.sdrQuoteTemplates` (4 templates: generation, accept, reject, escalate)
- ✅ Renderização de mensagem rica formatada para WhatsApp (markdown leve)
- ✅ Parser de resposta do cliente para 5 intents (aceitar, recusar, escalar, negociar, outro)
- ✅ Escalação automática para humano quando detecta intenção de negociação
- ✅ Transição orçamento → pedido placeholder: pergunta pagamento/entrega, salva como nota
- ✅ Integração com PRD-020 (SDR) — chama `generateSdrQuote` quando identificação confirmada
- ✅ Integração com PRD-021 — recebe `IPartIdentification` confirmada
- ✅ Integração com PRD-023 (escalonamento) — chamado em casos de negociação ou pedido explícito
- ✅ Validade configurável via `IPlatformSettings.sdrQuoteValidityDays`
- ✅ Audit log em todas as etapas (criação, envio, aceite, recusa, escalação)
- ✅ Histórico de orçamentos SDR no painel SDR (PRD-024 prepara visualização)
- ✅ Permissões: SDR cria orçamentos; Vendedor/Gestor visualizam; Owner edita templates e regras de desconto

### Excluído

- ❌ Geração de orçamento com múltiplos itens (1 item por orçamento SDR no MVP) — Fase 2
- ❌ Cálculo de frete real via integração transportadora — Fase 2 (PRD-033)
- ❌ Promoções/cupons aplicáveis — Fase 2
- ❌ Negociação automática de desconto pelo SDR — Fase 2 (com IA)
- ❌ Pagamento integrado dentro da conversa — Fase 2
- ❌ Conversão automática orçamento → pedido com NF — Fase 2 (PRD-032)
- ❌ Aprovação de orçamento pelo Gestor antes de envio — fora do MVP
- ❌ Envio de PDF do orçamento — Fase 2
- ❌ Expiração automática de orçamentos vencidos (notificação ao cliente) — Fase 2
- ❌ Lembretes de cliente que não respondeu orçamento — Fase 2

---

## Requisitos Funcionais

### Modelo e configurações

- **RF-001:** Validar `IQuote` (PRD-002) tem campo `origin` com union literal `'sdr' | 'vendedor' | 'portal_cliente' | 'ecommerce'`.
- **RF-002:** Adicionar em `IPlatformSettings`:
  - `sdrQuoteValidityDays: number` (default 7)
  - `sdrAutoDiscountPct: number` (default 0; opcional ativar até 5%)
  - `sdrQuoteTemplates: ISdrQuoteTemplates`
  - `sdrShippingPlaceholder: { sameCityValue: number; sameStateValue: number; otherStatesAction: 'to_negotiate' | 'fixed_value'; otherStatesValue?: number }`
- **RF-003:** Tipo `ISdrQuoteTemplates` com 4 templates: `generation`, `accept`, `reject`, `escalate`.

### Engine de geração

- **RF-004:** Criar `generateSdrQuote(identification, context): IQuote` em `src/features/sdr-quote/engine/generate.ts`.
- **RF-005:** Função pura recebe:
  - `identification: IPartIdentification` (com `customerConfirmedPartId`)
  - `context: { conversation: IConversation; customer: ICustomer; settings: IPlatformSettings }`
- **RF-006:** Construir `IQuote`:
  - `items: [{ partId, partName, quantity: 1, unitPrice }]`
  - `subtotal = sum(quantity * unitPrice)`
  - `discount = subtotal * sdrAutoDiscountPct` (se autorizado)
  - `shippingCost` via `calculateShippingPlaceholder(customer.address, settings)` — função em `src/features/sdr-quote/engine/shipping.ts`
  - `total = subtotal - discount + shippingCost`
  - `validUntil = now + sdrQuoteValidityDays * 24 * 60 * 60 * 1000`
  - `origin = 'sdr'`
  - `status = 'enviado'`
- **RF-007:** Função pura — sem side effects; mutation no provider feita fora.

### Cálculo de frete placeholder

- **RF-008:** Criar `calculateShippingPlaceholder(address, settings): { value?: number; isToNegotiate: boolean }`:
  - Mesma cidade do customer (Frederico Westphalen): `sameCityValue` (default R$ 50)
  - Mesmo estado (RS): `sameStateValue` (default R$ 80)
  - Outros estados: `otherStatesAction='to_negotiate'` (default) → retorna `isToNegotiate: true`
- **RF-009:** Quando `isToNegotiate=true`, mensagem ao cliente substitui valor por "a combinar".

### Renderização da mensagem

- **RF-010:** Criar `renderQuoteMessage(quote, template, customer): string` em `src/features/sdr-quote/templates/render.ts`.
- **RF-011:** Template default `generation`:

  ```
  🧾 *Orçamento GALLO BASE DIESEL*

  ▫️ {{peca_nome}}
     Cód. {{peca_codigo}} ({{peca_tipo}})
     Quantidade: {{quantidade}} un
     Valor unitário: R$ {{valor_unitario}}

  💰 *Resumo*
     Subtotal: R$ {{subtotal}}
     Frete: {{frete_formatado}}
     *TOTAL: R$ {{total}}*

  📅 Válido até: {{validade}}

  ✅ Para confirmar, responde: *1*
  ❌ Para recusar: *2*
  👤 Para falar com vendedor: *3*
  ```

- **RF-012:** Substituição de variáveis com formatação BRL (helpers de PRD-012).
- **RF-013:** Se frete é "a combinar", `{{frete_formatado}}` vira "a combinar" (sem valor).

### Envio via SDR

- **RF-014:** Quando engine gera quote, SDR (PRD-020):
  - Salva `IQuote` via `useQuotesProvider().create()` (stub PRD-031)
  - Renderiza mensagem via `renderQuoteMessage()`
  - Envia como `IMessage` com `direction='out'`, `authorType='sdr'`
  - Atualiza `ISdrSession.collectedData.quoteId = quote.id`
  - Avança `session.state = 'aguardando_resposta_orcamento'` (novo estado em PRD-020 — adicionar)
- **RF-015:** Audit log: "Orçamento SDR criado: quote-id, valor X, cliente Y".

### Parser de resposta

- **RF-016:** Criar `parseQuoteResponse(text): 'accept' | 'reject' | 'escalate' | 'negotiate' | 'unknown'` em `src/features/sdr-quote/engine/parse-response.ts`.
- **RF-017:** Pattern matching:
  - Accept: "1", "sim", "aceito", "fechado", "ok", "pode mandar", "vamos lá"
  - Reject: "2", "não", "deixa", "obrigado mas não", "agora não"
  - Escalate: "3", "vendedor", "humano", "atendente", "alguém"
  - Negotiate: "desconto", "menos", "barato", "negociar", "valor maior"
  - Unknown: outras coisas
- **RF-018:** Quando session está em `'aguardando_resposta_orcamento'` e nova mensagem in chega, dispara o parser.

### Fluxo após resposta

- **RF-019:** **Accept**:
  - `quote.status = 'aceito'`
  - SDR envia template `accept`: "Perfeito, {{nome}}! Pedido em andamento. Você prefere pagar via PIX ou boleto? E quando você prefere receber?"
  - Aguarda resposta com método e prazo (livre no MVP)
  - Quando cliente responde, SDR salva como nota da conversa
  - Cria `IOrder` placeholder (stub PRD-032) com status `pending_payment`
  - Audit log: "Orçamento aceito, pedido placeholder criado"
- **RF-020:** **Reject**:
  - `quote.status = 'recusado'`
  - SDR envia template `reject`: "Sem problema! Posso te mostrar outras opções? Ou foi um motivo específico?"
  - Audit log
  - Session permanece — pode continuar conversa
- **RF-021:** **Escalate**:
  - Chama PRD-023 com contexto: quote-id, motivo='solicitação humana'
  - SDR envia template `escalate`: "Beleza, {{nome}}! Vou te conectar com um vendedor. Aguarda um instante."
- **RF-022:** **Negotiate**:
  - Chama PRD-023 com contexto: quote-id, motivo='negociação de desconto'
  - SDR envia template `escalate`: "Beleza! Vou conectar você com um vendedor especialista que pode avaliar."
  - Audit log: "SDR escalou por solicitação de negociação"
- **RF-023:** **Unknown**:
  - SDR envia: "Não entendi muito bem. Você quer **confirmar (1)**, **recusar (2)**, ou **falar com vendedor (3)**?"
  - Permanece em mesmo state

### Validade e expiração

- **RF-024:** No MVP, expiração não tem ação automática — apenas dado registrado em `quote.validUntil`.
- **RF-025:** Quando cliente responde aceitar a um quote já expirado, SDR detecta via comparação `now > validUntil`:
  - SDR responde: "Esse orçamento já passou da validade. Vou gerar um novo para você."
  - Re-executa fluxo de geração

### Integração com painel SDR (PRD-024)

- **RF-026:** Histórico de quotes SDR aparece como métrica:
  - Total de quotes gerados pelo SDR
  - Taxa de aceite, recusa, escalação
  - Valor total movimentado
- **RF-027:** Hook `useSdrQuoteMetrics()` calcula esses dados para PRD-024.

### Permissões

- **RF-028:** SDR cria quotes (via PRD-020).
- **RF-029:** Vendedor/Gestor visualizam quotes SDR na lista de quotes (PRD-031 placeholder).
- **RF-030:** Owner edita templates e regras (`sdrAutoDiscountPct`, `sdrQuoteValidityDays`, `sdrShippingPlaceholder`) via `/app/configuracoes/sdr/orcamento`.

### Audit log

- **RF-031:** Audit em:
  - Geração de quote (`action='sdr_quote_create'`)
  - Aceite (`action='sdr_quote_accepted'`)
  - Recusa (`action='sdr_quote_rejected'`)
  - Escalação (`action='sdr_quote_escalate'`)
  - Negociação detectada (`action='sdr_quote_negotiate_detected'`)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `generateSdrQuote()` executa em < 100ms.
- **RNF-002 (Determinismo):** Mesma identificação + contexto produz mesma quote.
- **RNF-003 (Tipagem):** Zero `any`; tipos do PRD-002 respeitados.
- **RNF-004 (Auditoria):** Cada quote SDR tem trace completo do que aconteceu.
- **RNF-005 (Arquitetura preparada):** Função `generateSdrQuote` se tornará chamada a serviço backend na Fase 2; consumidores não mudam.

---

## Critérios de Aceitação

### Geração de orçamento

```gherkin
DADO IPartIdentification status="confirmed" com customerConfirmedPartId
QUANDO generateSdrQuote() executa
ENTÃO IQuote é criado com:
  - origin = "sdr"
  - items contém 1 item com a peça confirmada
  - subtotal = unitPrice * quantity
  - shippingCost calculado via placeholder
  - total = subtotal - discount + shippingCost
  - validUntil = now + 7 dias
  - status = "enviado"

DADO settings.sdrAutoDiscountPct = 5
QUANDO quote é gerado para peça R$ 100
ENTÃO discount = R$ 5
  E total = R$ 95 + frete
```

### Cálculo de frete placeholder

```gherkin
DADO customer.address.city = "Frederico Westphalen" (mesma cidade)
QUANDO calculateShippingPlaceholder() executa
ENTÃO retorna { value: 50, isToNegotiate: false }

DADO customer.address.state = "RS" (mesmo estado, outra cidade)
QUANDO executa
ENTÃO retorna { value: 80, isToNegotiate: false }

DADO customer.address.state = "SP" e settings.otherStatesAction = "to_negotiate"
QUANDO executa
ENTÃO retorna { isToNegotiate: true }
  E mensagem ao cliente substitui valor por "a combinar"
```

### Mensagem ao cliente

```gherkin
DADO quote gerado para Filtro Volvo R$ 95 + frete R$ 50 = R$ 145
QUANDO renderQuoteMessage() executa
ENTÃO mensagem contém:
  - 🧾 Orçamento GALLO BASE DIESEL
  - Nome da peça e código
  - Subtotal R$ 95,00
  - Frete R$ 50,00
  - TOTAL R$ 145,00
  - Validade
  - 3 opções (1, 2, 3)

DADO frete = "a combinar"
QUANDO mensagem é renderizada
ENTÃO "Frete: a combinar" em vez de valor
```

### Parser de resposta

```gherkin
DADO session em "aguardando_resposta_orcamento"
QUANDO cliente responde "1"
ENTÃO parseQuoteResponse retorna "accept"
  E quote.status = "aceito"
  E SDR envia template accept perguntando pagamento e entrega

QUANDO cliente responde "tem por menos?"
ENTÃO parseQuoteResponse retorna "negotiate"
  E SDR escala para humano via PRD-023
  E quote.status permanece "enviado"
  E audit log: "negociação detectada"

QUANDO cliente responde "blá blá"
ENTÃO parseQuoteResponse retorna "unknown"
  E SDR re-pergunta: "Não entendi... responde 1, 2 ou 3"
```

### Aceite e transição para pedido

```gherkin
DADO cliente aceita quote
QUANDO accept flow processa
ENTÃO quote.status = "aceito"
  E SDR pergunta pagamento e entrega
  E quando cliente responde, dados salvos como nota da conversa
  E IOrder placeholder é criado (stub PRD-032)
  E audit log "quote aceito, pedido criado"
```

### Expiração

```gherkin
DADO um quote com validUntil ontem
QUANDO cliente responde "1" hoje
ENTÃO SDR detecta validade expirada
  E responde: "Esse orçamento já passou da validade. Vou gerar um novo."
  E re-executa generateSdrQuote (eventualmente com preços atualizados)
```

### Cenários de erro

```gherkin
DADO peça não tem unitPrice no catálogo (stub retorna sem preço)
QUANDO generateSdrQuote tenta executar
ENTÃO retorna erro graceful
  E SDR escala para humano com mensagem: "Preciso de um vendedor para fechar o valor dessa peça"

DADO customer sem address cadastrado
QUANDO calculateShippingPlaceholder executa
ENTÃO retorna { isToNegotiate: true } como default seguro
  E mensagem ao cliente diz "Frete: a combinar"
```

---

## Fases de Implementação

| Fase | Objetivo                                                         | Arquivos Estimados |
| ---- | ---------------------------------------------------------------- | ------------------ |
| 1    | Configurações + engine de geração + cálculo de frete placeholder | 5-6                |
| 2    | Templates + renderização da mensagem                             | 4-5                |
| 3    | Parser de resposta + integração com PRD-020 (state machine)      | 4-5                |
| 4    | Aceite (transição para pedido), recusa, escalação, negociação    | 4-5                |
| 5    | Métricas, painel admin (`/configuracoes/sdr/orcamento`), polish  | 3-4                |

### Detalhamento das Fases

#### Fase 1: Engine e Frete

- [ ] Configurações em `IPlatformSettings`
- [ ] `generateSdrQuote()` função pura
- [ ] `calculateShippingPlaceholder()`
- [ ] Tipo `ISdrQuoteTemplates`

**Validação:** chamar com identificação confirmada produz quote válido com items, subtotal, frete, total, validade.

#### Fase 2: Templates e Renderização

- [ ] 4 templates default (generation, accept, reject, escalate)
- [ ] `renderQuoteMessage()` com substituição de variáveis
- [ ] Formatação BRL (helpers reusados)
- [ ] Suporte a frete "a combinar"

**Validação:** mensagem renderizada visualmente bonita em WhatsApp; placeholders todos substituídos.

#### Fase 3: Parser e Integração SDR

- [ ] `parseQuoteResponse()` com 5 intents
- [ ] Adicionar state `'aguardando_resposta_orcamento'` em ISdrSession (PRD-020)
- [ ] Modificar PRD-020 para chamar `generateSdrQuote` quando identificação confirmada
- [ ] Detecção de nova mensagem in nesse state dispara parser

**Validação:** ciclo completo identificação → quote → resposta → ação.

#### Fase 4: Ações por Resposta

- [ ] Accept: salvar pagamento/entrega como nota, criar IOrder placeholder
- [ ] Reject: marcar status, oferecer alternativas
- [ ] Escalate: chamar PRD-023 com contexto
- [ ] Negotiate: chamar PRD-023 com motivo específico
- [ ] Audit log para cada ação

**Validação:** todas as 4 ações funcionam end-to-end.

#### Fase 5: Métricas e Painel

- [ ] Hook `useSdrQuoteMetrics()` para PRD-024
- [ ] Sub-rota `/app/configuracoes/sdr/orcamento` para edição de templates e regras
- [ ] Empty states em cada lugar
- [ ] Documentação `docs/sdr-quote.md`

**Validação:** Owner edita validade e próximo quote SDR usa novo valor.

---

## Dependências

### PRDs Anteriores

| PRD                     | Status      |
| ----------------------- | ----------- |
| PRD-002 (modelo IQuote) | 📝 Redigido |
| PRD-005 (provider)      | 📝 Redigido |
| PRD-020 (SDR engine)    | 📝 Redigido |
| PRD-021 (Identificação) | 📝 Redigido |

### Dependências Futuras (placeholders)

| PRD                     | Como Lidar                                                  |
| ----------------------- | ----------------------------------------------------------- |
| PRD-023 (Escalonamento) | Stub no MVP — chamada de função; integração real no PRD-023 |
| PRD-031 (Orçamento UI)  | Stub: salvar quote via provider; visualização placeholder   |
| PRD-032 (Pedido)        | Stub: criar IOrder placeholder ao aceitar                   |
| PRD-033 (Frete)         | Stub via `calculateShippingPlaceholder`                     |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Status       |
| ------ | ------------ | ------------ |
| 1-12   | PRDs 010-021 | 📝           |
| **13** | **PRD-022**  | **🔄 ATUAL** |
| 14     | PRD-023      | ⏳           |
| 15     | PRD-024      | ⏳           |

---

## Considerações de Segurança

### Compromisso pelo SDR

Orçamento SDR é compromisso comercial — preço, validade, condições. Audit log + validade clara protegem cliente e empresa.

### Desconto sem aprovação

SDR só dá desconto se `sdrAutoDiscountPct` autorizado. Sem isso, defaults to zero. Owner controla a política.

### Frete preliminar é preliminar

Mensagem deve deixar claro que é valor estimado, sujeito a confirmação. Cliente que escolhe entrega expressa pode pagar mais (não no MVP, mas conceito preservado).

---

## Fluxos de Usuário

### Fluxo Principal — Cliente aceita

1. Cliente confirma peça via PRD-021
2. PRD-022 gera quote automaticamente em < 1s
3. SDR envia mensagem formatada ao cliente
4. Cliente: "1"
5. SDR responde: "Perfeito, João! Pedido em andamento. PIX ou boleto?"
6. Cliente: "PIX, posso pagar amanhã"
7. SDR salva como nota, cria IOrder placeholder, audit log
8. Manhã seguinte, vendedor humano vê o pedido aceito durante a noite

### Fluxo Alternativo — Negociação

1. Cliente confirma peça, quote enviado
2. Cliente: "tá caro, tem por menos?"
3. Parser detecta `negotiate`
4. SDR responde: "Vou conectar com vendedor especialista"
5. PRD-023 escala
6. Vendedor humano abre conversa com contexto completo: quote, peça, valor

### Fluxo de Recusa

1. Quote enviado
2. Cliente: "deixa pra próxima"
3. Parser detecta `reject`
4. Quote vira `recusado`
5. SDR pergunta: "Posso te mostrar outras opções?"
6. Pode iniciar nova identificação

### Fluxo Expirado

1. Quote gerado em 01/05, validade 08/05
2. Cliente responde "aceito" em 12/05
3. SDR detecta validade vencida
4. Responde: "Esse orçamento expirou. Vou gerar um novo."
5. Re-executa fluxo

---

## Convenções de Código

| Elemento        | Convenção             | Exemplo                                                                      |
| --------------- | --------------------- | ---------------------------------------------------------------------------- |
| **Engine**      | camelCase função pura | `generateSdrQuote()`, `parseQuoteResponse()`                                 |
| **Templates**   | string em config      | `IPlatformSettings.sdrQuoteTemplates.generation`                             |
| **Pasta**       | kebab-case            | `sdr-quote/`, `engine/`, `templates/`                                        |
| **Git commits** | Conventional          | `feat(sdr-quote): add automatic quote generation with rich response options` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                                           | Descrição                                                |
| --------------------------------------------------- | -------------------------------------------------------- |
| **Quote é compromisso**                             | Validade clara protege todos                             |
| **3 opções claras**                                 | Não deixar cliente em dúvida do que responder            |
| **Escalação por palavra-chave**                     | Negociação detectada → humano, sem improviso do SDR      |
| **Frete preliminar é OK**                           | "A combinar" para fora da região mantém honestidade      |
| **Aceite captura intenção, não confirma pagamento** | Pedido placeholder até PRD-032 implementar checkout real |
| **Audit em tudo**                                   | Histórico completo do que SDR fez comercialmente         |

### O que NÃO Fazer

| ❌ Evitar                                                       |
| --------------------------------------------------------------- |
| Permitir SDR dar desconto sem regra configurada                 |
| Quote sem validade                                              |
| Esquecer escalação automática em negociação                     |
| Implementar criação real de IOrder com pagamento aqui — PRD-032 |
| Cálculo de frete real — placeholder até PRD-033                 |
| Múltiplos items por quote SDR — apenas 1 no MVP                 |
| Esquecer audit log em qualquer ação comercial                   |
| Geração de PDF — Fase 2                                         |

---

## Status de Implementação

| Campo      | Valor                                   |
| ---------- | --------------------------------------- |
| **Status** | ✅ IMPLEMENTADO (v0.19.0 — Quotemaster) |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — geração automática de orçamento via SDR com templates, parser de resposta, escalação por negociação, transição para pedido placeholder |

---

**AILA - Sistemas Inteligentes**
