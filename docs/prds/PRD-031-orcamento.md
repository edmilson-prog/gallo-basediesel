# PRD-031: Orçamento (Quote)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                   |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                        |
| **Objetivo**          | Construir o sistema completo de orçamentos — listagem com filtros, criação manual estruturada, ficha de detalhe, status lifecycle, conversão em pedido, e integração com SDR (PRD-022) que cria orçamentos automaticamente |
| **Tipo**              | Feature                                                                                                                                                                                                                    |
| **Complexidade**      | Alta                                                                                                                                                                                                                       |
| **Total de Fases**    | 5                                                                                                                                                                                                                          |
| **Prioridade**        | Alta                                                                                                                                                                                                                       |
| **Épico**             | Bloco 3 — Comercial Operacional                                                                                                                                                                                            |
| **PRDs Relacionados** | PRD-012 (Ficha — tab Orçamentos), PRD-015 (Lista Clientes — drill-down), PRD-022 (SDR orçamento), PRD-030 (Catálogo), PRD-032 (Pedido — conversão), PRD-033 (Frete)                                                        |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                         |
| **Padrão de código**  | Feature-based; código em `src/features/quotes/`; reutiliza `DetailLayout` do PRD-003                                                                                                                                       |

### Critérios de Complexidade

> **Justificativa de Alta:** lista paginada com 8 filtros + busca; criação manual com 5 seções (cliente, items, condições, frete, notas) e validações; ficha de detalhe com 6 seções incluindo histórico de mudanças via audit log; status lifecycle de 6 estados (rascunho/enviado/aceito/recusado/expirado/convertido); 4 origins (sdr/vendedor/portal_cliente/ecommerce) distinguidas visualmente e funcionalmente; aprovação de descontos especiais por Gestor com workflow próprio; conversão estruturada para pedido (PRD-032 stub no MVP); integração com SDR (PRD-022 cria orçamentos com origin='sdr' que aparecem nesta lista); ações de envio (WhatsApp placeholder), duplicação, expiração automática via timer.

---

## Contexto do Problema

Orçamento é o ponto crítico do ciclo comercial — entre a identificação da necessidade e a venda concretizada. PRD-022 já gera orçamentos via SDR, mas precisa de uma tela centralizada onde:

- Vendedor humano cria orçamentos manuais
- Owner/Gestor revisam todos os orçamentos do mês
- Cliente B2B no portal (Fase 2) consulta seus orçamentos
- Orçamentos do SDR aparecem misturados com manuais, distinguidos por origin

Três problemas concretos sem PRD-031:

**SDR cria orçamentos mas não há onde gerenciá-los.** PRD-022 salva `IQuote`, mas nenhuma tela mostra. Lista de quotes vira inacessível. **Vendedor humano sem ferramenta para criar manual.** Cliente liga, faz pedido por voz — vendedor precisa criar orçamento via interface. Sem fluxo estruturado, vira improviso. **Conversão orçamento → pedido perdida.** Sem botão "Converter em pedido", vendedor recria tudo manualmente no PRD-032.

Este PRD entrega: lista navegável de todos os orçamentos (SDR + manuais), criação manual estruturada com busca de catálogo, ficha de detalhe rica, conversão automática em pedido, aprovação de descontos.

---

## Conceito da Solução

### Modelo (revisão PRD-002)

```typescript
IQuote {
  id: ID;
  number: string;                  // ex: "OR-2026-0123" — gerado automaticamente
  customerId: ID;
  sellerId: ID;                     // quem criou
  conversationId?: ID;              // se criado via SDR (PRD-022) ou conversa
  origin: 'sdr' | 'vendedor' | 'portal_cliente' | 'ecommerce';
  // Items
  items: IQuoteItem[];
  // Valores
  subtotal: number;
  discount: number;                 // valor absoluto
  discountReason?: string;          // se desconto > 5% requer justificativa
  shippingCost: number;
  total: number;
  // Condições
  paymentMethod?: 'pix' | 'boleto' | 'cartao' | 'prazo' | 'outro';
  paymentTerms?: string;            // texto livre: "30/60/90 dias"
  deliveryAddress?: IAddress;       // pode ser diferente do cadastro
  // Status
  status: 'rascunho' | 'enviado' | 'aceito' | 'recusado' | 'expirado' | 'convertido';
  validUntil: ISO8601;
  // Aprovação
  requiresApproval: boolean;        // true se desconto > threshold
  approvedBy?: ID;
  approvedAt?: ISO8601;
  rejectedReason?: string;
  // Conversão
  convertedToOrderId?: ID;
  convertedAt?: ISO8601;
  // Auditoria
  notes?: string;                   // notas internas (não visíveis ao cliente)
  storeId: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

IQuoteItem {
  partId: ID;
  partName: string;                 // snapshot
  partOemCode: string;              // snapshot
  quantity: number;
  unitPrice: number;                // snapshot do preço
  itemDiscount: number;             // desconto por item (R$)
  subtotal: number;                 // (unitPrice - itemDiscount) * quantity
}
```

### Status lifecycle

```
       rascunho
          ↓
       enviado
        ↙   ↘
    aceito  recusado
       ↓        ↓
  convertido  (fim)

   expirado (qualquer momento se validUntil < now e ainda não decidido)
```

| Status       | Significado                                    | Quem pode mudar                                                           |
| ------------ | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `rascunho`   | Em criação, não enviado ainda                  | Criador + Gestor + Owner                                                  |
| `enviado`    | Disparado ao cliente, aguardando resposta      | Sistema (após envio)                                                      |
| `aceito`     | Cliente aceitou (pode virar pedido)            | Cliente via portal, ou vendedor registrando manualmente, ou SDR (PRD-022) |
| `recusado`   | Cliente recusou                                | Mesmos que aceito                                                         |
| `expirado`   | Passou da `validUntil` sem ser aceito/recusado | Sistema automaticamente                                                   |
| `convertido` | Virou pedido (`IOrder` criado)                 | Vendedor/Gestor via botão "Converter em pedido"                           |

### Origins distinguidas

Cada origin tem badge visual + comportamento:

| Origin           | Badge                | Diferenças                                                                       |
| ---------------- | -------------------- | -------------------------------------------------------------------------------- |
| `sdr`            | 🤖 SDR (verde)       | Criado pelo PRD-022; campo `conversationId` preenchido; histórico SDR no detalhe |
| `vendedor`       | 👤 Manual (azul)     | Criação humana via formulário                                                    |
| `portal_cliente` | 🏢 Portal (laranja)  | Cliente B2B criou no portal (Fase 2 — placeholder)                               |
| `ecommerce`      | 🛒 E-commerce (roxo) | Carrinho convertido em orçamento via PRD-064 (Fase 2 — placeholder)              |

### Listagem `/app/orcamentos`

Tabela paginada (50/página) com colunas:

- Número (#OR-2026-0123)
- Cliente (link para PRD-012)
- Origin (badge)
- Vendedor responsável
- Total
- Status (badge colorido)
- Data criação
- Validade restante (verde/amarelo/vermelho)
- Ações (visualizar, duplicar, converter)

**Filtros:**

- Status (multi-select com checkbox)
- Origin (multi-select)
- Vendedor (multi-select; Vendedor locked em si mesmo)
- Cliente (autocomplete)
- Período de criação (24h/7d/30d/personalizado)
- Faixa de valor total
- Validade (expirando em 3 dias / expirado / válido)
- Loja (Owner)

**Busca**: número, nome do cliente, OEM de itens.

### Criação manual `/app/orcamentos/novo`

Fluxo estruturado em 5 seções (página dedicada, não modal — por complexidade):

**Seção 1 — Cliente:**

- Autocomplete de cliente existente (lista filtrada por carteira do vendedor)
- Botão "+ Novo cliente" abre modal rápido (PRD-015)
- Dados do cliente preenchidos automaticamente (endereço default)

**Seção 2 — Items:**

- Botão "+ Adicionar item" abre modal com busca de catálogo (PRD-030):
  - Busca por nome ou OEM
  - Filtro por aplicação (se cliente tem veículo cadastrado, prepopula filtro)
  - Lista de candidatos com preço
  - Seleciona um → input quantidade → "Adicionar"
- Tabela inline com items adicionados:
  - Nome + OEM
  - Quantidade (editável)
  - Preço unitário (editável — alerta visual se modificado vs catálogo)
  - Desconto por item em R$ (editável)
  - Subtotal calculado automaticamente
  - Botão remover
- Resumo: subtotal de items

**Seção 3 — Desconto e frete:**

- Desconto global em R$ ou % (cálculo automático)
- Justificativa de desconto (textarea, obrigatória se desconto > 5%)
- Frete:
  - Endereço de entrega (default do cliente; pode trocar)
  - Cálculo de frete (stub PRD-033) com botão "Recalcular"
  - Frete editável manualmente

**Seção 4 — Condições:**

- Forma de pagamento (dropdown)
- Prazo de pagamento (texto livre: "à vista", "30/60/90", "boleto 30 dias")
- Validade do orçamento (date picker, default = today + 7 dias)

**Seção 5 — Notas:**

- Textarea para notas internas (não visíveis ao cliente)
- Toggle "Salvar como rascunho" vs "Enviar agora"

**Botão final:** "Salvar rascunho" / "Salvar e enviar"

### Página de detalhe `/app/orcamentos/:id`

6 seções:

**Seção 1 — Header:**

- Número grande (#OR-2026-0123)
- Status badge prominente
- Origin badge
- Total grande
- Data criação + dias até expirar
- Ações: Duplicar / Editar (se rascunho) / Converter em pedido (se aceito) / Cancelar / Enviar via WhatsApp (placeholder)

**Seção 2 — Cliente:**

- Card com avatar, nome, CNPJ/CPF, telefone, endereço de entrega
- Link para ficha (PRD-012)

**Seção 3 — Items:**

- Tabela com items completa, com snapshots de preço/OEM no momento da criação

**Seção 4 — Valores:**

- Subtotal
- Desconto (com justificativa se houver)
- Frete
- Total
- Indicador de aprovação se requiresApproval (link para fluxo)

**Seção 5 — Condições:**

- Forma de pagamento
- Prazo
- Validade

**Seção 6 — Histórico:**

- Linha do tempo de mudanças (audit log filtrado para este quote)
- Eventos: criado, enviado, visualizado pelo cliente, aceito/recusado, convertido, etc.

### Conversão orçamento → pedido

Botão "Converter em pedido" aparece quando status = `aceito`:

1. Modal de confirmação: "Confirma converter este orçamento em pedido?"
2. Permite editar antes (endereço, observações finais, parcelamento)
3. Cria `IOrder` (PRD-032 stub no MVP) com:
   - Mesmos items
   - Mesmas condições
   - `quoteId` referenciando este orçamento
4. `quote.status = 'convertido'`, `quote.convertedToOrderId = order.id`
5. Audit log
6. Navega para `/app/pedidos/:id`

### Aprovação de desconto especial

Settings: `IPlatformSettings.discountApprovalThresholdPct` (default 5%).

Se vendedor aplicou desconto > threshold:

- `requiresApproval = true`
- Status fica `rascunho` (não pode enviar) ou flag especial "Aguardando aprovação"
- Gestor recebe notificação na inbox (placeholder no MVP)
- Gestor abre orçamento, vê "Aguardando aprovação"
- Aprova (campo `approvedBy`, `approvedAt`) ou Rejeita (`rejectedReason`)
- Vendedor é notificado

### Expiração automática

Timer (similar ao de carteira PRD-018) verifica a cada hora:

- Orçamentos com `status='enviado'` e `validUntil < now`
- Status → `expirado`
- Audit log

Owner pode configurar default de validade global e por origin.

### Envio via WhatsApp (placeholder)

Botão "Enviar via WhatsApp" no detalhe:

- MVP: copia link/texto do orçamento para clipboard com toast "Orçamento copiado — cole no WhatsApp"
- Fase 2: integração real com Meta/Evolution para enviar via API

### Permissões

| Papel                  | Listagem              | Criar             | Editar rascunho | Aceitar/Recusar | Aprovar desconto | Converter     |
| ---------------------- | --------------------- | ----------------- | --------------- | --------------- | ---------------- | ------------- |
| **Owner**              | tudo cross-store      | ✅                | ✅              | ✅              | ✅               | ✅            |
| **Gestor**             | loja                  | ✅                | ✅              | ✅              | ✅               | ✅            |
| **Vendedor**           | só os criados por mim | ✅                | ✅ (próprios)   | ✅ (próprios)   | ❌               | ✅ (próprios) |
| **SDR**                | (via API)             | ✅ (origin='sdr') | ❌              | (via cliente)   | ❌               | ❌            |
| **Cliente B2B portal** | seus orçamentos       | ❌                | ❌              | ✅ (seus)       | ❌               | ❌            |

### Integração com PRD-012 (ficha do cliente)

Tab "Orçamentos" da ficha (PRD-012) lista todos os orçamentos do cliente com paginação e mesmas colunas resumidas. Click leva ao detalhe.

### Integração com PRD-022 (SDR)

Orçamentos criados pelo PRD-022 têm `origin='sdr'` e `conversationId` preenchido. Aparecem normalmente na listagem deste PRD com badge visual.

### Alternativas Consideradas

| Alternativa                                          | Por que foi descartada                                     |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Orçamento sem status formal (apenas "ativo/inativo") | Lifecycle de 6 estados é necessário para gestão e métricas |
| Sem aprovação de desconto                            | Vendedor pode dar prejuízo arbitrário                      |
| Conversão orçamento→pedido manual (recriar)          | Trabalho duplicado; vinculação preserva auditoria          |
| Sem expiração automática                             | Orçamentos viram cemitérios                                |
| Envio WhatsApp obrigatório no MVP                    | Complexidade alta; placeholder ok até PRDs 100-102         |
| Sem distinção visual de origin                       | Owner não sabe quantos foram SDR vs manuais                |
| Items com texto livre (sem catálogo)                 | Erros de preço; sem aplicações; sem comissão               |

**Decisão consolidada:** **lifecycle de 6 estados, criação estruturada em 5 seções via formulário, ficha rica em 6 seções, aprovação de desconto > 5%, expiração automática via timer, conversão integrada com PRD-032, envio WhatsApp placeholder, distinção visual de origins.**

---

## Escopo

### Incluído

- ✅ Modelo `IQuote` e `IQuoteItem` em `src/shared/types/quotes.ts`
- ✅ Geração de número sequencial por loja (#OR-{ano}-{seq})
- ✅ Geradores de mock: ~80 orçamentos históricos com mix de status, origins e valores
- ✅ Página `/app/orcamentos` substituindo placeholder do PRD-003
- ✅ Tabela paginada com 9 colunas + 8 filtros + busca + ordenação + URL sync
- ✅ Criação manual `/app/orcamentos/novo` com 5 seções (formulário robusto)
- ✅ Editor de items com busca no catálogo (PRD-030)
- ✅ Detalhe `/app/orcamentos/:id` com 6 seções incluindo histórico
- ✅ Status lifecycle de 6 estados com transições controladas
- ✅ Distinção visual de 4 origins (SDR/Vendedor/Portal/E-com) com badges
- ✅ Conversão orçamento → pedido (cria `IOrder` placeholder do PRD-032)
- ✅ Aprovação de desconto > 5% por Gestor com workflow
- ✅ Expiração automática via timer (1x por hora)
- ✅ Botão "Duplicar orçamento" (cria novo rascunho a partir deste)
- ✅ Botão "Enviar via WhatsApp" placeholder (copia para clipboard)
- ✅ Audit log em todas mutations (criação, edição, mudança de status, aprovação)
- ✅ Histórico de mudanças no detalhe (audit log filtrado)
- ✅ Integração com PRD-012 (tab Orçamentos da ficha) — componente `<CustomerQuotesList>` reusado
- ✅ Permissões granulares por papel
- ✅ Empty states contextuais

### Excluído

- ❌ Envio real via WhatsApp — Fase 2 (PRDs 100-102)
- ❌ Geração de PDF do orçamento — Fase 2
- ❌ Assinatura digital do cliente — Fase 2
- ❌ Aprovação multi-nível (Gestor → Owner para descontos > 10%) — fora do MVP
- ❌ Parcelas detalhadas (boleto 30/60/90 com cálculo de juros) — Fase 2
- ❌ Negociação dentro do orçamento (chat embutido) — Fase 2
- ❌ Workflow de templates de orçamento (modelos pré-prontos) — Fase 2
- ❌ Comparação lado-a-lado de orçamentos — Fase 2
- ❌ Análise de margem por orçamento — Bloco 4 (PRD-049)
- ❌ Lembretes automáticos de orçamento próximo de expirar — Fase 2

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Adicionar `IQuote`, `IQuoteItem`, `QuoteStatus`, `QuoteOrigin` em `src/shared/types/quotes.ts`.
- **RF-002:** Geração de número via `generateQuoteNumber(storeId): string` — formato `#OR-{YYYY}-{seq}` com sequencial por loja (mockado).
- **RF-003:** Mocks (PRD-004): ~80 orçamentos:
  - 30 com `origin='sdr'` (correlacionados com sessões SDR)
  - 40 com `origin='vendedor'`
  - 5 com `origin='portal_cliente'` (placeholder)
  - 5 com `origin='ecommerce'` (placeholder)
- **RF-004:** Distribuição de status: 10% rascunho, 30% enviado, 25% aceito, 15% recusado, 10% expirado, 10% convertido.

### Listagem

- **RF-005:** Criar `QuotesListPage` em `src/features/quotes/pages/`, rota `/app/orcamentos`.
- **RF-006:** Tabela paginada (50/página) com colunas: número, cliente (link), origin (badge), vendedor, total, status (badge), data criação, validade restante, ações.
- **RF-007:** 8 filtros: status, origin, vendedor, cliente, período criação, faixa valor, validade, loja (Owner).
- **RF-008:** Busca textual em: número, nome do cliente, OEM de itens.
- **RF-009:** URL sync de filtros, ordenação, página, busca.
- **RF-010:** Botão "+ Orçamento" no header (Vendedor/Gestor/Owner).
- **RF-011:** Validade restante visualmente:
  - Verde se > 3 dias
  - Amarelo se 1-3 dias
  - Vermelho se ≤ 1 dia ou expirado

### Criação manual

- **RF-012:** Página `/app/orcamentos/novo` com 5 seções verticais (responsive: stack em mobile, grid em desktop).
- **RF-013:** Seção Cliente:
  - Autocomplete com `useCustomersProvider`
  - Filtragem implícita por carteira (Vendedor vê só seus; Gestor/Owner vê todos da loja)
  - Botão "+ Novo cliente" abre modal de PRD-015
  - Ao selecionar, pré-popula endereço de entrega
- **RF-014:** Seção Items:
  - Botão "+ Adicionar item" abre `<AddItemModal>`:
    - Busca em catálogo via `searchPartsByText` (PRD-030)
    - Filtro por aplicação (se cliente tem veículo cadastrado, prepopula)
    - Lista de até 20 candidatos
    - Selecionar peça + quantidade → "Adicionar"
  - Tabela inline editável com items:
    - Quantidade (input numérico)
    - Preço unitário (editável; alerta visual se modificado vs catálogo)
    - Desconto por item em R$ (input)
    - Subtotal calculado
    - Botão remover
- **RF-015:** Seção Desconto e Frete:
  - Desconto global: input em R$ ou %
  - Justificativa de desconto (textarea, obrigatória se > 5%)
  - Endereço de entrega editável
  - Frete:
    - Botão "Calcular frete" chama stub do PRD-033
    - Valor editável manualmente
- **RF-016:** Seção Condições:
  - Forma de pagamento (dropdown: PIX/Boleto/Cartão/Prazo/Outro)
  - Prazo de pagamento (texto livre)
  - Validade (date picker default = today + 7 dias)
- **RF-017:** Seção Notas:
  - Textarea para notas internas
  - Botões finais: "Salvar rascunho" (status='rascunho') / "Salvar e enviar" (status='enviado')
- **RF-018:** Validações:
  - Cliente obrigatório
  - Pelo menos 1 item
  - Justificativa obrigatória se desconto > threshold
  - Validade > today

### Detalhe `/app/orcamentos/:id`

- **RF-019:** Criar `QuoteDetailPage` com 6 seções.
- **RF-020:** Header com número, status, origin, total, ações contextuais por status:
  - `rascunho`: Editar, Enviar, Duplicar, Excluir
  - `enviado`: Marcar como aceito, Marcar como recusado, Duplicar, Enviar via WhatsApp (placeholder), Cancelar
  - `aceito`: Converter em pedido, Duplicar
  - `recusado`/`expirado`: Duplicar
  - `convertido`: link "Ver pedido"
- **RF-021:** Seção Cliente: card com link para ficha (PRD-012).
- **RF-022:** Seção Items: tabela com snapshots.
- **RF-023:** Seção Valores: subtotal, desconto (com justificativa expansível), frete, total.
- **RF-024:** Seção Condições: pagamento, prazo, validade.
- **RF-025:** Seção Histórico: linha do tempo cronológica reversa de audit log filtrado por quote.id. Cada evento mostra timestamp, autor (avatar), ação, detalhes.

### Conversão para pedido

- **RF-026:** Botão "Converter em pedido" disponível quando `status='aceito'`.
- **RF-027:** Modal `<ConvertToOrderModal>`:
  - Resumo do orçamento
  - Campos editáveis finais (endereço, observações finais, parcelamento)
  - Confirma → cria `IOrder` (stub PRD-032 — no MVP, placeholder coerente)
  - Atualiza `quote.status='convertido'`, `quote.convertedToOrderId`, `quote.convertedAt`
  - Audit log
  - Navega para `/app/pedidos/:id`

### Aprovação de desconto

- **RF-028:** Setting `IPlatformSettings.discountApprovalThresholdPct` (default 5%).
- **RF-029:** Ao salvar quote com `discount/subtotal > threshold`:
  - `quote.requiresApproval = true`
  - Status permanece `rascunho`; envio bloqueado até aprovação
  - Banner no detalhe: "Aguardando aprovação do gestor"
  - Notificação para gestores da loja (toast no MVP)
- **RF-030:** Gestor abre o orçamento, vê banner com botões "Aprovar" / "Rejeitar":
  - Aprovar: `approvedBy`, `approvedAt`, libera para envio
  - Rejeitar: pede `rejectedReason` (textarea), quote volta para rascunho com banner
- **RF-031:** Audit log em aprovação/rejeição.

### Expiração automática

- **RF-032:** Hook `useQuoteExpirationTimer()` roda a cada hora:
  - Busca quotes com `status='enviado'` e `validUntil < now`
  - Atualiza para `status='expirado'`
  - Audit log
- **RF-033:** No MVP, timer no front simulado (similar PRD-018). Fase 2 via Edge Function.

### Duplicação

- **RF-034:** Botão "Duplicar" em qualquer quote cria novo `IQuote`:
  - Mesmos items e condições
  - Status volta a `rascunho`
  - Número novo
  - Validade recalculada (today + default days)
  - Audit log
  - Navega para `/app/orcamentos/:novoId` em modo edição

### Envio via WhatsApp (placeholder)

- **RF-035:** Botão "Enviar via WhatsApp" copia para clipboard texto formatado:

  ```
  🧾 Orçamento GALLO BASE DIESEL
  Número: #OR-2026-0123
  Cliente: [Nome]

  Items:
  • Filtro óleo Volvo (qtd 1) - R$ 95,00

  Subtotal: R$ 95,00
  Frete: R$ 50,00
  Total: R$ 145,00

  Válido até: 01/06/2026
  ```

- **RF-036:** Toast: "Texto do orçamento copiado para a área de transferência. Cole no WhatsApp do cliente."

### Aceitar/Recusar manualmente

- **RF-037:** Botões em quotes com `status='enviado'`:
  - **Marcar como aceito**: confirma → status='aceito' + audit log
  - **Marcar como recusado**: pede motivo opcional (textarea) → status='recusado' + audit log

### Permissões

- **RF-038:** Vendedor lista só seus orçamentos (via carteira/filtro implícito).
- **RF-039:** Aprovação de desconto: apenas Gestor/Owner.
- **RF-040:** Cliente B2B portal vê seus orçamentos (Fase 2 placeholder).

### Integração com PRD-012

- **RF-041:** Tab "Orçamentos" da ficha (PRD-012) usa componente `<CustomerQuotesList customerId>` deste módulo.
- **RF-042:** Lista resumida com paginação; click leva ao detalhe (`/app/orcamentos/:id`).

### Integração com PRD-022 (SDR)

- **RF-043:** Quando PRD-022 chama `generateSdrQuote()`, salva via `useQuotesProvider().create()` (este módulo) com `origin='sdr'` e `conversationId`.
- **RF-044:** Detalhe de quote SDR tem banner: "🤖 Criado pelo SDR durante conversa [link]".

### Audit log

- **RF-045:** Audit em:
  - Criação (`action='quote_create'`)
  - Edição (`action='quote_update'`)
  - Mudança de status (`action='quote_status_change'` com before/after)
  - Aprovação/rejeição de desconto (`action='quote_approval_*'`)
  - Conversão (`action='quote_convert_to_order'`)
  - Expiração (`action='quote_expired'`)
  - Duplicação (`action='quote_duplicate'`)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Listagem com 80 quotes + filtros renderiza em < 350ms.
- **RNF-002 (Snapshots):** Items preservam preço/OEM no momento da criação (mesmo se catálogo mudar depois, quote mantém dados originais).
- **RNF-003 (Atomicidade):** Conversão orçamento→pedido é atômica.
- **RNF-004 (Tipagem):** Zero `any`; lifecycle tipado via union literal.
- **RNF-005 (Acessibilidade):** WCAG 2.1 AA.

---

## Critérios de Aceitação

### Listagem

```gherkin
DADO que sou Vendedor e acesso /app/orcamentos
QUANDO a página carrega
ENTÃO vejo apenas orçamentos criados por mim (filtragem implícita)

DADO que aplico filtro Status=enviado + Origin=sdr
QUANDO filtros aplicam
ENTÃO tabela mostra apenas orçamentos enviados criados pelo SDR
  E URL atualiza

DADO um orçamento com validUntil amanhã
QUANDO observo na listagem
ENTÃO indicador "Validade: 1 dia" em vermelho
```

### Criação

```gherkin
DADO que clico "+ Orçamento"
QUANDO acesso /app/orcamentos/novo
ENTÃO vejo formulário com 5 seções
  E botão "Salvar e enviar" desabilitado até preencher cliente + 1 item

DADO selecciono cliente "Aurora" e adiciono filtro de óleo
QUANDO clico em "+ Adicionar item"
ENTÃO modal busca peças no catálogo
  E filtro prepopulado pelos veículos do cliente (Volvo R450 2020)
  E vejo peças compatíveis

DADO aplico desconto de 8% (acima do threshold 5%)
QUANDO tento salvar sem justificativa
ENTÃO validação inline: "Justificativa obrigatória para descontos > 5%"
  E save bloqueado
```

### Aprovação de desconto

```gherkin
DADO quote criado por Vendedor com desconto 8% e justificativa
QUANDO save processa
ENTÃO requiresApproval=true, status=rascunho
  E banner: "Aguardando aprovação do gestor"
  E gestores recebem notificação

DADO sou Gestor e abro o orçamento pendente
QUANDO clico "Aprovar"
ENTÃO approvedBy, approvedAt preenchidos
  E vendedor é notificado
  E status pode mudar para enviado

DADO Gestor rejeita com motivo "desconto excessivo"
QUANDO save
ENTÃO quote volta para rascunho com banner: "Rejeitado: [motivo]"
  E vendedor pode editar e ressubmeter
```

### Status lifecycle

```gherkin
DADO quote em status rascunho
QUANDO clico "Salvar e enviar"
ENTÃO status muda para enviado
  E audit log registra

DADO quote enviado E cliente respondeu por outro canal "aceito"
QUANDO Vendedor clica "Marcar como aceito"
ENTÃO status muda para aceito
  E botão "Converter em pedido" aparece

DADO quote enviado com validUntil ontem
QUANDO timer roda
ENTÃO status muda automaticamente para expirado
  E audit log registra
```

### Conversão

```gherkin
DADO quote em status aceito
QUANDO clico "Converter em pedido"
ENTÃO modal abre com resumo + campos finais editáveis
  E ao confirmar, IOrder é criado (stub PRD-032)
  E quote.status="convertido", convertedToOrderId preenchido
  E sou navegado para /app/pedidos/:id
  E audit log gerado
```

### Duplicação

```gherkin
DADO quote qualquer
QUANDO clico "Duplicar"
ENTÃO novo IQuote criado com mesmos items/condições
  E status="rascunho"
  E número novo gerado
  E validade recalculada
  E sou navegado para edit
```

### Integração com SDR

```gherkin
DADO quote criado pelo PRD-022 com origin="sdr"
QUANDO listo /app/orcamentos
ENTÃO aparece com badge "🤖 SDR" verde
  E ao abrir detalhe, banner "Criado pelo SDR durante conversa [link]"
  E click no link leva à conversa correspondente
```

### Cenários de erro

```gherkin
DADO tento criar quote sem cliente
QUANDO submeto
ENTÃO validação: "Cliente é obrigatório"

DADO tento converter quote em status enviado (não aceito)
QUANDO botão "Converter em pedido" não aparece
ENTÃO segura ação inválida

DADO falha ao salvar
QUANDO MockNetworkError
ENTÃO toast erro + dados preservados no formulário
  E botão "Tentar novamente"
```

---

## Fases de Implementação

| Fase | Objetivo                                               | Arquivos Estimados |
| ---- | ------------------------------------------------------ | ------------------ |
| 1    | Modelo, mocks, listagem com filtros                    | 6-7                |
| 2    | Criação manual em 5 seções                             | 7-8                |
| 3    | Detalhe em 6 seções com histórico                      | 5-6                |
| 4    | Lifecycle (status transitions, expiração, aprovação)   | 4-5                |
| 5    | Conversão para pedido, duplicação, integrações, polish | 4-5                |

### Detalhamento das Fases

#### Fase 1: Listagem

- [ ] Tipos `IQuote`, `IQuoteItem` e helpers de número
- [ ] Geradores de mock com 80 orçamentos variados
- [ ] `QuotesListPage` com tabela + 8 filtros + busca + URL sync
- [ ] Indicadores visuais de validade

**Validação:** lista paginada de 80 quotes com filtros funcionando.

#### Fase 2: Criação

- [ ] `NewQuotePage` com 5 seções
- [ ] `<AddItemModal>` com busca no catálogo (PRD-030)
- [ ] Validações de campos
- [ ] Salvar rascunho vs enviar
- [ ] Geração de número sequencial

**Validação:** vendedor cria quote completo com 3 items, salva rascunho, depois envia.

#### Fase 3: Detalhe

- [ ] `QuoteDetailPage` com 6 seções
- [ ] Histórico de mudanças via audit log filtrado
- [ ] Botões contextuais por status
- [ ] Banner para SDR-origin

**Validação:** abrir detalhe mostra todas as informações + histórico cronológico.

#### Fase 4: Lifecycle

- [ ] Transições controladas de status
- [ ] Aprovação de desconto > 5% com banner e workflow
- [ ] Timer de expiração automática
- [ ] Botões "Marcar como aceito/recusado"
- [ ] Audit log em todas transições

**Validação:** desconto > 5% bloqueia envio até aprovação; orçamentos expiram automaticamente.

#### Fase 5: Conversão e Polish

- [ ] Conversão orçamento → pedido (stub PRD-032)
- [ ] Duplicação de orçamento
- [ ] Envio WhatsApp placeholder (copy to clipboard)
- [ ] Integração com PRD-012 (tab Orçamentos via `<CustomerQuotesList>`)
- [ ] Validação PRD-022 — quotes SDR aparecem corretamente
- [ ] Mobile responsivo
- [ ] Documentação `docs/quotes.md`

**Validação:** ciclo completo de orçamento → conversão; tab da ficha mostra orçamentos; SDR quotes integrados.

---

## Dependências

### PRDs Anteriores

| PRD                                  | Status                               |
| ------------------------------------ | ------------------------------------ |
| PRD-002                              | 📝 Redigido                          |
| PRD-005                              | 📝 Redigido                          |
| PRD-006                              | 📝 Redigido                          |
| PRD-012 (consumido)                  | 📝 Redigido                          |
| PRD-022 (consome este)               | 📝 Redigido                          |
| PRD-030 (consumido — busca catálogo) | 📝 Redigido (apresentado neste lote) |

### Dependências Futuras

| PRD                                  | Como Lidar                                 |
| ------------------------------------ | ------------------------------------------ |
| PRD-032 (Pedido — destino conversão) | Stub no MVP — criar placeholder coerente   |
| PRD-033 (Frete)                      | Stub — usar `calculateShippingPlaceholder` |
| PRDs 100-102 (WhatsApp)              | Placeholder envio                          |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Status       |
| ------ | ------------ | ------------ |
| 1-16   | PRDs 010-030 | 📝           |
| **17** | **PRD-031**  | **🔄 ATUAL** |
| 18     | PRD-032      | ⏳           |
| 19     | PRD-033      | ⏳           |

---

## Considerações de Segurança

### Snapshots preservados

Items guardam snapshots de `partName`, `partOemCode`, `unitPrice` no momento da criação. Mudanças no catálogo não alteram quotes históricos — auditoria preservada.

### Aprovação de desconto

Threshold configurável; ação requer permissão `quote.approve`. Audit log registra quem aprovou — comissões dependem disso.

### Envio WhatsApp placeholder

No MVP, copy to clipboard. Vendedor é responsável por colar e enviar — mas audit log registra tentativa. Fase 2 com envio real terá audit completo.

---

## Fluxos de Usuário

### Fluxo Principal — Vendedor cria orçamento manual

1. Carlos atende cliente Aurora via telefone
2. Acessa `/app/orcamentos/novo`
3. Seleciona Aurora no autocomplete (endereço prepopulado)
4. Adiciona 3 items via busca catálogo (filtros prepopulados pelos veículos da Aurora)
5. Aplica desconto de 3% sem justificativa (abaixo do threshold)
6. Frete calculado automaticamente
7. Validade default 7 dias
8. Clica "Salvar e enviar"
9. Toast: "Orçamento #OR-2026-0124 enviado"
10. Carlos clica "Enviar via WhatsApp" → texto copiado → cola no WhatsApp do cliente

### Fluxo Alternativo — Aprovação de desconto

1. Marina (Gestor) recebe notificação: "Orçamento #OR-2026-0125 aguarda aprovação"
2. Abre detalhe
3. Vê: Carlos aplicou 8% desconto com justificativa "Cliente fidelizado há 5 anos"
4. Clica "Aprovar" → audit log
5. Carlos recebe toast: "Orçamento #OR-2026-0125 aprovado por Marina"
6. Carlos envia ao cliente

### Fluxo SDR Integration

1. Cliente via WhatsApp aceita orçamento SDR
2. PRD-022 atualiza `quote.status='aceito'`
3. Próximo dia, Marina filtra `/app/orcamentos` por status=aceito
4. Vê quote SDR aceito
5. Abre detalhe, vê banner "Criado pelo SDR durante conversa"
6. Click "Converter em pedido"
7. Pedido criado (stub PRD-032)

### Fluxo Expiração

1. Quote criado 23/05 com validUntil=30/05
2. Cliente não respondeu
3. 01/06 timer roda → status='expirado'
4. Quote aparece em listagem como vermelho
5. Vendedor pode duplicar para gerar novo

### Fluxo Mobile

1. Vendedor em campo cria quote no celular
2. Sections em stack vertical
3. Adicionar item: modal full-screen com busca
4. Salvar rascunho, completar depois no desktop

---

## Convenções de Código

| Elemento        | Convenção           | Exemplo                                                         |
| --------------- | ------------------- | --------------------------------------------------------------- |
| **Página**      | PascalCase + `Page` | `QuotesListPage`, `QuoteDetailPage`, `NewQuotePage`             |
| **Componentes** | PascalCase          | `<AddItemModal>`, `<CustomerQuotesList>`, `<QuoteStatusBadge>`  |
| **Hooks**       | camelCase + `use`   | `useQuotesList`, `useQuoteExpirationTimer`                      |
| **Pasta**       | kebab-case          | `quotes/`                                                       |
| **Git commits** | Conventional        | `feat(quotes): add complete quote lifecycle with approval flow` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                         | Descrição                                                             |
| --------------------------------- | --------------------------------------------------------------------- |
| **Lifecycle estrito**             | 6 estados com transições controladas; sem atalhos                     |
| **Snapshots imutáveis**           | Items preservam preço/OEM — auditoria intacta mesmo se catálogo mudar |
| **Aprovação como gate**           | Desconto > 5% trava envio até gestor aprovar                          |
| **Expiração automática**          | Timer regular; não depende de ação manual                             |
| **Conversão preserva referência** | quote.convertedToOrderId rastreia                                     |
| **Distinção visual de origins**   | SDR vs Manual vs Portal vs E-com — Owner sabe a fonte                 |

### O que NÃO Fazer

| ❌ Evitar                                                    |
| ------------------------------------------------------------ |
| Implementar envio real do WhatsApp — Fase 2                  |
| Gerar PDF — Fase 2                                           |
| Permitir items com texto livre (sem catálogo)                |
| Permitir desconto > 5% sem justificativa                     |
| Permitir Vendedor aprovar próprio desconto                   |
| Esquecer snapshots nos items (referência direta ao catálogo) |
| Expiração manual obrigatória — timer cuida                   |
| Implementar pedido completo aqui — stub PRD-032              |
| Esquecer URL sync de filtros                                 |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                          |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — lifecycle completo, criação manual estruturada, aprovação de desconto, conversão para pedido, integração com SDR |

---

**AILA - Sistemas Inteligentes**
