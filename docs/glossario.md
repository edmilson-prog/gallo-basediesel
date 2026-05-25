# Glossário GALLO BASE DIESEL

> Fonte única da verdade semântica do domínio.
> Cada termo aqui tem um significado operacional preciso na plataforma — diferente do uso casual em outros contextos.

Este glossário é referenciado por JSDoc nas interfaces de `src/shared/types/` via tags `@see`. Sempre que criar uma entidade nova do domínio, adicione o termo correspondente aqui antes (ou junto) do tipo.

---

## Termos técnicos do mercado de peças pesadas

### OEM

**Original Equipment Manufacturer** — código original da peça atribuído pela montadora (Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco). Uma mesma peça pode ter múltiplos OEMs equivalentes quando atende a mais de uma montadora.

> **Exemplo:** um filtro de óleo pode ter OEM Volvo `21707134` e OEM Mercedes `A0001802609` — funcionalmente equivalentes.

Modelado em `IPart.oemCodes: string[]`.

### SKU

**Stock Keeping Unit** — código interno da GALLO BASE DIESEL para identificar a peça no catálogo. Distinto do OEM: o SKU é da GALLO, o OEM é da montadora.

Modelado em `IPart.sku: string`.

### Aplicação

Compatibilidade entre uma peça e um conjunto **marca + modelo + ano + motorização** de veículo. Uma peça pode ter N aplicações (vale para vários veículos). Faixa de ano é inclusiva nas duas pontas.

> **Exemplo:** filtro de combustível com aplicação `Volvo / FH 540 / 2018-2024 / D13K`.

Modelado em `IApplication` (cardinalidade N em `IPart.applications`).

### Equivalência

Relação entre peças de marcas/fabricantes diferentes que cumprem a mesma função. Permite venda alternativa quando o original está em ruptura ou quando o cliente prefere outra marca/preço.

Modelado em `IPart.equivalentPartIds: ID[]` (referências para outros `IPart`).

### Ruptura

Estado de uma peça quando o estoque chega a zero (`stockAvailable === 0`). Dispara recomendações de equivalência ao vendedor e alerta de reposição no painel.

### Frota

Conjunto de veículos pertencentes a um mesmo cliente B2B (ex: uma transportadora com 30 caminhões). Modelado como a coleção `IVehicle[]` cujo `customerId` aponta para o cliente.

### Montadora

Fabricante do veículo. No mercado-alvo da GALLO BASE DIESEL: Volvo, Scania, Mercedes-Benz, Ford Cargo e Iveco.

---

## Termos comerciais

### Carteira

Conjunto de clientes sob responsabilidade primária de um vendedor. **Relação 1:1 estrita**: cada cliente tem um único vendedor responsável (`ICustomer.sellerId`). Não há carteira compartilhada no MVP.

Transferências de carteira são modeladas via `ICarteiraTransfer`, com 4 tipos suportados (temporary, permanent_individual, permanent_batch — ver `CarteiraTransferType`).

### Positivação

Quantidade de clientes únicos atendidos no período. Conceito comercial B2B clássico: "positivar" um cliente significa fazer pelo menos uma venda para ele no período de referência.

Classifica a carteira em 5 categorias:

- **Ativos**: compraram no período corrente
- **Inativos**: não compraram no período corrente, mas compraram antes
- **Novos**: primeira compra no período corrente
- **Inativos recentes**: pararam de comprar há pouco (entre `lifecycleThresholds.dormantDays` e o limite recente)
- **Inativos antigos**: pararam há muito (além de `lifecycleThresholds.lostDays`)

Modelado em `IPositivation`.

### Curva ABC

Classificação de clientes por participação no faturamento (Pareto). Clientes A respondem por aproximadamente 80% da receita, B por ~15% e C por ~5%. É calculada por período (mensal/trimestral/anual).

Modelado em `IABCClassification`. Os clientes ordenados por receita acumulada têm `cumulativeShare` crescente.

### Ciclo de vida do cliente

Estados sequenciais que um `ICustomer` percorre:

```
lead (ILead) ──conversão──▶ ativo ──N dias sem compra──▶ dormente
                                      └──em campanha──▶ recuperacao
                                                          ├─ volta a ativo
                                                          └─ vira perdido
```

Transições controladas pelos thresholds em `IPlatformSettings.lifecycleThresholds`.

Modelado em `CustomerStatus = 'ativo' | 'dormente' | 'recuperacao' | 'perdido'`.

### Ticket médio

Valor médio dos pedidos de um cliente em determinado período. Calculado como `sum(IOrder.total) / count(IOrder)` no período.

### LTV

**Lifetime Value** — soma de todas as compras do cliente ao longo do relacionamento (de `firstPurchaseAt` até hoje). Métrica clássica para priorização de carteira.

### Recência

Dias desde a última compra do cliente (`now - ICustomer.lastPurchaseAt`). Usada em conjunto com frequência e valor em análises RFM.

### Recuperação

Ato de trazer de volta um cliente dormente ou perdido. Tem KPI próprio em `IGoalMetric.recovery` e badge correspondente em `IGamificationBadge`.

### Comissão

Valor pago ao vendedor por venda fechada. Calculada sobre uma **base** (`revenue` ou `margin`) com uma **alíquota** (`rate`, decimal).

Modelado em `ICommission` (registro pago) e `ICommissionRule` (regra do vendedor).

### Meta

Valor-alvo de uma métrica em um período, atribuído a um nível (`store`, `team` ou `individual`). Equipes são dormentes no MVP — só lojas e indivíduos têm metas ativas.

Modelado em `IGoal`. Métricas suportadas: `revenue`, `margin`, `tickets`, `positivacao`, `recovery`, `conversion`.

### Orçamento

Proposta comercial enviada a um cliente ou lead, com itens, prazo de validade e condições de pagamento. Pode ser convertida em **pedido** via `IQuote.convertedToOrderId`.

Modelado em `IQuote`. Status: `rascunho → enviado → aceito → recusado | expirado | convertido`.

### Pedido

Transação comercial confirmada. Tem dois ciclos independentes:

- **Pagamento** (`paymentStatus`): pendente, parcial, pago, estornado
- **Fulfillment** (`fulfillmentStatus`): pendente, separacao, expedido, entregue, cancelado

Modelado em `IOrder`.

---

## Termos operacionais da plataforma

### Ficha

Visão consolidada (tela única) de um cliente: dados cadastrais, conversas, pedidos, orçamentos, veículos, notas, tags, recomendações. Implementada no PRD-012.

### Inbox

Lista de conversas ativas (`IConversation[]`), ordenadas por última interação (`lastMessageAt`). Conceito de WhatsApp/CRM moderno: cada vendedor vê suas conversas atribuídas; gestores veem todas. Implementado no PRD-010.

### Pipeline leve

Funil simplificado para leads, configurável por loja em `IPlatformSettings.pipelineStages`. Estágios típicos: **Novo → Em qualificação → Orçamento enviado → Em negociação → Convertido/Perdido**.

Modelado em `ILeadStage` (estágio) e referenciado por `ILead.stage`.

### Lead

Contato que ainda **não comprou**. Vira `Customer` no momento do primeiro pedido fechado (`ILead.convertedToCustomerId` aponta para o `ICustomer` criado).

### Temperatura do lead

Indicador subjetivo: `frio` / `morno` / `quente`. Sugerido pelo agente SDR com base no histórico da conversa, ajustável manualmente pelo vendedor.

Modelado em `LeadTemperature`.

### SDR

**Sales Development Representative**. Na GALLO BASE DIESEL, o SDR é o **agente de IA** que atende 24/7: identifica peças, qualifica leads e escala para humano quando necessário.

Implementado nos PRDs 020-024. A conversa marca `IConversation.isSdrActive: true` enquanto o SDR está no controle.

### Escalonamento

Ato do SDR repassar uma conversa para um vendedor humano, com um **resumo de contexto** pronto. Critérios de escalonamento são configuráveis no PRD-024.

### Reversão automática

Mecânica de transferência temporária de carteira: ao chegar a `endDate`, os clientes voltam automaticamente ao vendedor original (`fromSellerId`). O timestamp do retorno fica em `autoRevertAt`.

Aplicável apenas quando `ICarteiraTransfer.type === 'temporary'`.

### Promoção de tag

Ato do gestor de elevar uma tag livre (criada por um vendedor em um cliente) ao catálogo oficial de sugestões (`IPlatformSettings.tagSuggestions`). Tag promovida fica disponível como sugestão para todos os vendedores.

Modelado em `ITagSuggestion.promoted: boolean`.

### Recomendação

Insight proativo apresentado ao vendedor, gerado pela camada de IA analítica (PRD-053). Tem `type` (10 valores literais) e `priority` (low/medium/high/critical).

Modelado em `IRecommendation`. Tipos: follow_up, recovery, cross_sell, up_sell, equivalence, stock_alert, birthday, vehicle_maintenance, wallet_imbalance, positivacao_gap.

---

## Termos arquiteturais

### Division

Submarca/divisão de atuação: `parts`, `service`, `industrial`. **No MVP, sempre `parts`.** SERVICE e INDUSTRIAL ficam modelados em todas as entidades comerciais mas dormentes, ativáveis sem retrabalho de modelo na Fase 2.

Modelado em `Division`. Entidades comerciais carregam `division: Division` (`IPart`, `IQuote`, `IOrder`, opcionalmente `IGoal`).

### Submarca

Marca-filha da arquitetura GALLO:

- **PARTS** (verde) — peças
- **SERVICE** (vermelho) — serviço
- **INDUSTRIAL** (amarelo) — industrial

A marca-mãe é **GALLO BASE DIESEL** (preto técnico + dourado diesel).

### Provider

Implementação concreta de um padrão de abstração. Dois pares no MVP:

- **Dados**: `MockProvider` (Fase 1) vs `SupabaseProvider` (Fase 2), switch via `VITE_DATA_SOURCE`
- **WhatsApp**: `MetaCloudProvider` vs `EvolutionProvider`, switch por `IWhatsAppAccount.provider`

A escolha é parametrizada — código consumidor não conhece a implementação concreta.

### Drop-in replacement

Capacidade de trocar a implementação (mock → Supabase) **sem mudar código consumidor**. O contrato é a interface do provider; a Fase 2 substitui apenas a implementação.

Filosofia transversal do projeto, ver PRD-005.

### Capabilities

Conjunto de funcionalidades suportadas por um provider específico. UI adapta o que mostra baseado nas capabilities ativas.

> **Exemplo:** `supportsTemplatesHsm` é `true` no Meta Cloud API e `false` no Evolution. A UI esconde a aba de templates quando o Evolution está ativo.

Modelado em `IWhatsAppCapabilities`.

### Janela de 24h (WhatsApp)

Período após a última mensagem do cliente em que a empresa pode enviar mensagens livres pelo WhatsApp Cloud API (Meta). Fora dela:

- **Meta**: só via template HSM pré-aprovado
- **Evolution**: sempre permite envio livre

A UI usa `lastMessageAt` (da última mensagem do cliente) para alertar quando a janela está prestes a fechar.

### Template HSM

**Highly Structured Message** — mensagem pré-aprovada pela Meta para envio proativo fora da janela de 24h. Exclusiva do provider Meta Cloud API; o Evolution não tem esse conceito (envia livremente).

### Auditoria

Registro **imutável** de ações sensíveis: quem fez o quê, quando, com quais dados antes/depois. Não pode ser editada nem removida — apenas adicionada.

Modelado em `IAuditLog`. Campos `before`/`after` são `unknown` para não acoplar o tipo a domínios específicos; cada writer sanitiza PII antes de persistir.

### Equipe dormente

Entidade `ITeam` modelada no domínio mas não ativada no MVP. Hierarquia de metas (`IGoal.level`) suporta `'team'` mas nenhum mock/UI o usa na Fase 1. Ativação acontece pós-MVP sem mudança de modelo.

---

## Termos de versionamento

### Genesis

Codinome da versão `v0.1.x` — fundação completa do projeto (PRD-001 design system, PRD-002 modelo, PRD-003 shell). Permanece como codinome ativo enquanto o Bloco 0 está em andamento.

### Sequência de codinomes

Planejada para acompanhar a entrega das ondas:

| Versão | Codinome       | Marco                                   |
| ------ | -------------- | --------------------------------------- |
| v0.1.x | **Genesis**    | Fundação (Bloco 0 — em andamento)       |
| v0.2.x | **Hub**        | Onda 1 entregue (CRM + SDR + Comercial) |
| v0.3.x | **Pilot**      | Pós-validação Onda 1                    |
| v0.4.x | **Compass**    | Onda 2 (Gestão + BI)                    |
| v0.5.x | **Storefront** | Onda 3 (E-commerce)                     |
| v1.0.0 | **Heavy**      | MVP completo                            |
