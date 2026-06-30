# PRD-128: NFe Emission (Edge Function de Emissão)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/nfe-emit/`_ |
| **Objetivo** | Edge Function `nfe-emit` que orquestra a emissão fiscal de uma NFe a partir de um `crm.orders`. Monta `NFeRequest` (PRD-127) integrando dados do order + customer + items + parts + store; valida obrigatórios fiscais; calcula tributos externamente se provider não calcula (`!capabilities.calculatesTax`); despacha via `INFeProvider.emit`; persiste resultado em nova tabela `crm.nfe_emissions` + atualiza `crm.orders.nf_*`. Trata rejection codes SEFAZ, retry idempotente de `processing`, fallback `homologacao`↔`production` |
| **Tipo** | Integração |
| **Complexidade** | Crítica |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — sem isto, NFe não é emitida |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-127 (interface — consome); PRD-101 (`crm.orders.nf_*`, nova `crm.nfe_emissions`); PRD-102 (Edge Function infra); PRD-103 (RLS); PRD-110 (monitoring); PRD-129 (PDF/XML storage); PRD-130 (Cancelamento); PRD-032 Fase 1 (Pedido — consumidor frontend) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Edge Function modular em `supabase/functions/nfe-emit/index.ts` com helpers em `mappers/`, `tax/`, `validators/` |

### Critérios de Complexidade

> **Justificativa de Crítica:** emissão fiscal é a operação mais regulada do sistema — rejection da SEFAZ paralisa entrega; dados errados geram problema jurídico/fiscal. Mapping order → NFeRequest envolve 30+ campos com regras tributárias (CFOP por operação, NCM por produto, CST por origem). Tributos brasileiros têm complexidade alta (ICMS interestadual, ST, DIFAL, simples nacional). Idempotência rigorosa: jamais emitir 2 NFes para o mesmo order. Audit completo. Retry inteligente. Erro causa duplicidade fiscal ou pedido travado em "Faturado" sem NF.

---

## Contexto do Problema

PRD-127 entregou interface; este PRD entrega o **fluxo real**. Operações:

1. Vendedor confirma pedido em `/app/pedidos/<id>` e clica "Emitir NFe"
2. Frontend invoca Edge Function `nfe-emit` com `{ orderId }`
3. Edge Function:
   - Carrega order + customer + items + store + parts (FKs)
   - Valida obrigatórios fiscais (CPF/CNPJ do customer, NCM/CFOP dos items)
   - Calcula tributos se provider não calcula (RNF gravíssimo se vier errado)
   - Monta NFeRequest normalizado
   - Despacha via `provider.emit`
   - Recebe NFeResult
   - Persiste em `crm.nfe_emissions` (nova tabela)
   - Atualiza order com `nf_number`, `nf_chave`, `nf_issued_at`
   - Audit completo
4. Frontend atualiza UI via Realtime
5. PRD-129 baixa PDF/XML e armazena

A criticidade vem do escopo regulatório + irreversibilidade (NFe autorizada não desfaz; só cancela com prazo).

---

## Conceito da Solução

### Arquitetura

```
[Frontend] ──POST orderId──▶ Edge Function nfe-emit
                                     │
                                     ├── 1. withAuth (Owner/Manager/Seller responsável)
                                     ├── 2. withIdempotency('nfe-emit:' + orderId)
                                     ├── 3. Carrega order + relations (service_role)
                                     ├── 4. Valida estado do order (status=confirmed,preparing,shipped; nf_chave IS NULL)
                                     ├── 5. Resolve nfeConfig do store (provider, environment, vault refs)
                                     ├── 6. Monta NFeRequest via mappers
                                     ├── 7. Valida fiscalmente (NFE_REQUIRED_FIELDS, formato CNPJ, NCM, CFOP)
                                     ├── 8. Se !capabilities.calculatesTax → calcula taxes externamente
                                     ├── 9. provider.emit(request)
                                     ├── 10. Persiste em crm.nfe_emissions
                                     ├── 11. UPDATE crm.orders SET nf_number, nf_chave, nf_issued_at, nf_status
                                     ├── 12. Audit log granular
                                     └── 13. Responde { status, nfNumber, chave, errorCode? }
```

### Nova Tabela `crm.nfe_emissions`

Migration:

```sql
CREATE TABLE crm.nfe_emissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES crm.orders(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES crm.stores(id),
  
  -- Provider e ambiente
  provider text NOT NULL CHECK (provider IN ('focus_nfe','plugnotas','enotas','mock')),
  environment text NOT NULL CHECK (environment IN ('production','homologacao')),
  
  -- Identificadores do provider
  emission_ref text NOT NULL,        -- ID do provider
  nf_number text,
  nf_series text,
  chave text,                         -- 44 dígitos quando autorizada
  protocol text,                      -- protocolo SEFAZ
  
  -- Status atual
  status text NOT NULL CHECK (status IN ('processing','authorized','rejected','contingency','cancelled')),
  rejection_code text,
  rejection_message text,
  
  -- Timestamps fiscais
  emitted_at timestamptz NOT NULL DEFAULT now(),
  authorized_at timestamptz,
  cancelled_at timestamptz,
  
  -- Request enviado (audit, para reconstrução)
  request_payload jsonb NOT NULL,
  response_payload jsonb,
  
  -- Storage de XML/PDF (preenchido pelo PRD-129)
  xml_storage_path text,
  pdf_storage_path text,
  
  -- Cálculos
  tax_total numeric(12,2),
  
  -- Idempotência
  idempotency_key text UNIQUE,        -- para retry seguro
  
  -- Audit
  emitted_by uuid REFERENCES crm.sellers(id),
  cancelled_by uuid REFERENCES crm.sellers(id),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON crm.nfe_emissions (order_id) WHERE status IN ('authorized','processing');
-- Garante: 1 NFe autorizada ou em processamento por order (não pode emitir 2x)

CREATE INDEX ON crm.nfe_emissions (store_id, emitted_at DESC);
CREATE INDEX ON crm.nfe_emissions (status) WHERE status='processing';
-- Para job de polling de status (PRD-130)

ALTER TABLE crm.nfe_emissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.nfe_emissions FORCE ROW LEVEL SECURITY;
-- RLS no PRD-103 estendido: Owner/Manager veem todos da store; seller responsável vê do próprio order
```

### Mapeamento Order → NFeRequest

```typescript
// supabase/functions/nfe-emit/mappers/order-to-nfe.ts
async function buildNFeRequest(order, customer, items, store, config): Promise<NFeRequest> {
  return {
    internalRef: order.id,
    
    issuer: {
      cnpj: store.cnpj.replace(/\D/g, ''),
      ieEstadual: config.ieEstadual,
      razaoSocial: store.name,
      endereco: parseStoreAddress(store.address),
      regimeTributario: config.regimeTributario,
    },
    
    recipient: {
      document: customer.document.replace(/\D/g, ''),
      documentType: customer.documentType,
      name: customer.name,
      email: customer.email,
      ieEstadual: customer.customer_type === 'b2b' ? customer.ie_estadual : undefined,
      ieIndicador: determineIndicador(customer),
      endereco: parseCustomerAddress(customer.address),
    },
    
    items: await Promise.all(items.map(item => buildNFeItem(item, order, store, config))),
    
    total: {
      value: order.total_value,
      freight: order.freight_value,
      discount: order.discount_value,
    },
    
    payment: {
      method: mapPaymentMethod(order.payment_method),
      // installments se houver
    },
    
    operationType: determineOperationType(store, customer),
    environment: config.environment,
  }
}

async function buildNFeItem(item, order, store, config): Promise<NFeItem> {
  const part = await fetchPart(item.part_id)
  return {
    sku: part.sku,
    description: part.name,
    quantity: item.quantity,
    unit: 'UN',  // futuro: parts.unit_of_measure
    unitPrice: item.unit_price,
    totalPrice: item.quantity * item.unit_price * (1 - item.discount_pct/100),
    ncm: part.ncm || '00000000',  // ATENÇÃO: validador exigirá NCM real
    cfop: determineCfop(store, customer, part),  // helper específico
    cestCode: part.cest_code,
    origin: part.origin || 'nacional',
    // taxes: omitido se provider calcula; senão calcula via lib externa (RF-070)
  }
}
```

### Validação Fiscal Pré-Emissão

```typescript
function validateNFeRequest(req: NFeRequest): ValidationError[] {
  const errors: ValidationError[] = []
  
  // Emitter
  if (!isValidCnpj(req.issuer.cnpj)) errors.push({ field: 'issuer.cnpj', code: 'INVALID_CNPJ' })
  if (!req.issuer.ieEstadual) errors.push({ field: 'issuer.ieEstadual', code: 'MISSING_IE' })
  if (!req.issuer.endereco.cityIbgeCode) errors.push({ field: 'issuer.endereco.cityIbgeCode', code: 'MISSING_IBGE' })
  
  // Recipient
  if (req.recipient.documentType === 'cnpj' && !isValidCnpj(req.recipient.document)) {
    errors.push({ field: 'recipient.document', code: 'INVALID_CNPJ' })
  }
  if (req.recipient.documentType === 'cpf' && !isValidCpf(req.recipient.document)) {
    errors.push({ field: 'recipient.document', code: 'INVALID_CPF' })
  }
  if (!req.recipient.endereco.cityIbgeCode) errors.push({ field: 'recipient.endereco.cityIbgeCode', code: 'MISSING_IBGE_RECIPIENT' })
  
  // Items
  if (req.items.length === 0) errors.push({ field: 'items', code: 'NO_ITEMS' })
  req.items.forEach((item, i) => {
    if (!item.ncm || item.ncm.length !== 8) errors.push({ field: `items[${i}].ncm`, code: 'INVALID_NCM' })
    if (!item.cfop || item.cfop.length !== 4) errors.push({ field: `items[${i}].cfop`, code: 'INVALID_CFOP' })
    if (item.quantity <= 0) errors.push({ field: `items[${i}].quantity`, code: 'INVALID_QUANTITY' })
    if (item.unitPrice <= 0) errors.push({ field: `items[${i}].unitPrice`, code: 'INVALID_PRICE' })
  })
  
  return errors
}
```

### Cálculo de Tributos (se provider não calcula)

```typescript
// supabase/functions/nfe-emit/tax/calculate.ts
function calculateTaxes(req: NFeRequest, regime: string): NFeRequest {
  return {
    ...req,
    items: req.items.map(item => ({
      ...item,
      taxes: calculateItemTaxes(item, regime, req.issuer, req.recipient),
    })),
  }
}

function calculateItemTaxes(item, regime, issuer, recipient): NFeItemTaxes {
  // Regras simplificadas — versão real precisa de lib robusta ou Owner valida tributarista
  // ICMS depende de: regime, operação, estado origem, estado destino, NCM, CST
  // PIS/COFINS depende de: regime, CST
  
  const isInterestadual = issuer.endereco.state !== recipient.endereco.state
  const cstIcms = regime === 'simples_nacional' ? '102' : '00'
  
  const icmsRate = isInterestadual
    ? getInterestadualRate(issuer.endereco.state, recipient.endereco.state)
    : getInternalRate(issuer.endereco.state)
  
  // ... etc — versão completa exige consulta de tabelas tributárias
  
  return {
    icms: { cst: cstIcms, rate: icmsRate, value: item.totalPrice * (icmsRate/100), baseValue: item.totalPrice },
    pis: { cst: '01', rate: 1.65, value: item.totalPrice * 0.0165, baseValue: item.totalPrice },
    cofins: { cst: '01', rate: 7.6, value: item.totalPrice * 0.076, baseValue: item.totalPrice },
  }
}
```

**Decisão crítica:** se provider calcula (`capabilities.calculatesTax=true`), Edge Function **não** calcula — passa items sem `taxes` e confia. Senão, calcula via função interna OU lib externa. Cliente decide qual provider exatamente; sugerimos escolher um que **calcula** para reduzir risco fiscal.

### Idempotência

`withIdempotency(eventKey, ctx, ...)` (PRD-102) com:
- `eventKey = 'nfe-emit:' + orderId`
- Segunda chamada retorna resultado cached
- Constraint `UNIQUE WHERE status IN (authorized, processing)` em `crm.nfe_emissions` reforça em nível de DB

### Status `processing` vs `authorized`

Alguns providers retornam `processing` (assíncrono SEFAZ — tipicamente até 30s). PRD-128 retorna ao caller com `processing`. PRD-130 (Cancelamento + Status Tracking) tem job `nfe-status-poller` que checa periodicamente e atualiza para `authorized` ou `rejected`.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Cálculo tributário sempre interno | Risco fiscal alto; provider que calcula transfere responsabilidade |
| Sem `crm.nfe_emissions` (só campos em orders) | Histórico de rejeições perdido; reemissão difícil |
| Síncrono (espera autorização SEFAZ no request) | Pode demorar > 30s (Edge Function timeout 60s); melhor processing + poller |
| Atomicidade order+nfe na mesma transação | Order já existe; NFe é evento posterior; FK + audit basta |
| Sem validação pré-emissão | Provider rejeita, custo de chamada perdido + UX ruim |
| Multi-NFe por order | Não suportado MVP; futuro PRD se necessário (desdobramento por filial) |

---

## Escopo

### Incluído

- ✅ Migration: tabela `crm.nfe_emissions` + RLS + UNIQUE constraint (1 NFe ativa por order)
- ✅ Edge Function `supabase/functions/nfe-emit/index.ts`
- ✅ Module helpers:
  - `mappers/order-to-nfe.ts` (montagem do NFeRequest)
  - `mappers/address.ts` (parse jsonb → NFeAddress)
  - `validators/fiscal.ts` (`validateNFeRequest`)
  - `validators/cpf-cnpj.ts` (com dígito verificador real — PRD-128 exige correção)
  - `tax/calculate.ts` (cálculo se necessário)
  - `tax/cfop-rules.ts` (determine CFOP por operação)
- ✅ Verificação de estado do order antes de emitir: status ∈ {confirmed, preparing, shipped}; sem NFe ativa
- ✅ Idempotência via `withIdempotency` + UNIQUE no DB
- ✅ Validação fiscal pré-emissão com error codes claros em pt-BR
- ✅ Cálculo tributário interno simplificado (apenas se provider !calculatesTax) — versão MVP cobre Simples Nacional + Lucro Presumido para ICMS intra-estadual; alertas para casos complexos
- ✅ Despacha via `INFeProvider.emit`
- ✅ Persistência em `crm.nfe_emissions` + atualização de `crm.orders.nf_*`
- ✅ Audit log granular: `nfe_emission_attempted`, `nfe_emission_authorized`, `nfe_emission_rejected`, `nfe_emission_processing`
- ✅ Tratamento de erros do provider: rejection com `rejection_code` semântico mapeado para mensagem pt-BR
- ✅ Frontend: hook `useEmitNFe(orderId)` em `src/features/orders/hooks/`; tela do pedido (PRD-032) ganha botão "Emitir NFe"
- ✅ UI feedback: queued → processing → authorized (badge); rejected mostra rejection_message
- ✅ Realtime (PRD-105) propaga UPDATE em `crm.nfe_emissions` para o frontend
- ✅ Testes unitários (mappers, validators, calculator) + teste integração com MockNFeProvider
- ✅ Documentação `docs/dev/nfe-emission.md`

### Excluído

- ❌ Polling de status (PRD-130 entrega)
- ❌ Cancelamento (PRD-130)
- ❌ PDF/XML download e storage (PRD-129)
- ❌ Emissão em lote (futuro)
- ❌ Carta de correção CC-e (futuro PRD pós-MVP)
- ❌ NFCe (modelo 65) — apenas NFe modelo 55
- ❌ Cálculo tributário avançado (DIFAL, ST, IPI complexo) — apenas se provider!calcula entrega o básico; cenários complexos exigem provider que calcula
- ❌ Sandbox automático (homologação fica em config por store)

---

## Requisitos Funcionais

### Schema

- **RF-001:** Migration cria `crm.nfe_emissions` conforme conceito.
- **RF-002:** UNIQUE INDEX em `(order_id)` WHERE `status IN ('authorized','processing')` — garante 1 NFe ativa por order.
- **RF-003:** RLS estende PRD-103: SELECT para Owner/Manager da store + seller responsável do order; INSERT/UPDATE só service_role.

### Edge Function

- **RF-010:** Endpoint POST `/functions/v1/nfe-emit`
- **RF-011:** Auth obrigatório via `withAuth` (PRD-102); permissão: Owner, Manager, ou seller responsável pelo order
- **RF-012:** Input validado: `{ orderId: string (uuid) }`
- **RF-013:** Idempotência `withIdempotency('nfe-emit:' + orderId)` — segunda chamada cached

### Carregamento de Dados

- **RF-020:** Carrega via service_role:
  - `order` (com FKs)
  - `customer`
  - `items` + parts associadas
  - `store` + `nfe_config`
- **RF-021:** Erro se algum não-existe ou está inativo → `AppError NOT_FOUND`

### Verificação de Estado

- **RF-030:** Order deve ter `status IN ('confirmed','preparing','shipped','delivered')`. Senão `AppError VALIDATION_ERROR`.
- **RF-031:** Order não deve ter `nf_chave` ainda (UNIQUE constraint reforça)
- **RF-032:** Customer deve ter `document` válido. Senão erro claro.

### Montagem do NFeRequest

- **RF-040:** `buildNFeRequest(order, customer, items, store, config)`:
  - Issuer: dados do store + nfe_config
  - Recipient: dados do customer
  - Items: parts + cálculos de totais
  - Total: order.total_value, freight, discount
  - Payment: mapeamento order.payment_method → NFePaymentMethod
  - OperationType: helper `determineOperationType` baseado em store/customer states
- **RF-041:** Helper `parseStoreAddress` / `parseCustomerAddress` converte jsonb → NFeAddress.
- **RF-042:** Helper `determineCfop` retorna CFOP baseado em:
  - Operação (venda/devolução/remessa)
  - Estado origem vs destino (intra-estadual = 5xxx; interestadual = 6xxx)
  - Tipo de cliente (contribuinte vs não-contribuinte)
- **RF-043:** Cidades buscam IBGE code: nova tabela `crm.cities_ibge` (ou lib externa) ou campo direto em store/customer address jsonb (preferido).

### Validação Fiscal

- **RF-050:** `validateNFeRequest(req)` retorna array de erros.
- **RF-051:** Validação CPF/CNPJ com dígito verificador (PRD-128 exige correção sobre PRD-124 que só validou formato — aqui é fiscal).
- **RF-052:** NCM obrigatório (8 dígitos); CFOP obrigatório (4 dígitos); IBGE code obrigatório.
- **RF-053:** Lista de items > 0.
- **RF-054:** Em caso de erro de validação: AppError `VALIDATION_ERROR` com lista de campos em pt-BR.

### Cálculo Tributário Externo

- **RF-060:** Se `provider.capabilities.calculatesTax === false`:
  - Chama `calculateTaxes(request, regime)`
  - Popula `items[i].taxes` com ICMS, PIS, COFINS calculados
- **RF-061:** Cálculo MVP cobre:
  - Simples Nacional (CST 102): ICMS = 0
  - Lucro Presumido / Real (CST 00): ICMS intra = alíquota interna do estado; ICMS interestadual = tabela origem-destino
  - PIS: 1,65% (alíquota padrão); COFINS: 7,6%
  - IPI: 0 (default; produtos industrializados específicos exigem ajuste manual)
- **RF-062:** Cenários não-cobertos (ST, DIFAL, ICMS reduzido por benefício): retorna warning no log e prossegue com cálculo padrão (provider pode rejeitar; Owner ajusta config).

### Despacho

- **RF-070:** `provider.emit(request)` com timeout 60s.
- **RF-071:** Em sucesso (authorized): retorna `NFeResult` com nfNumber, chave, etc.
- **RF-072:** Em sucesso (processing): provider retorna emissionRef; PRD-130 fará polling.
- **RF-073:** Em rejected: result contém `rejection_code`, `rejection_message`.
- **RF-074:** Em erro de rede ou timeout: `AppError INTEGRATION_ERROR`.

### Persistência

- **RF-080:** INSERT em `crm.nfe_emissions`:
  - `order_id`, `store_id`, `provider`, `environment`
  - `emission_ref`, `nf_number`, `nf_series`, `chave`, `protocol`
  - `status` (do result)
  - `rejection_code`, `rejection_message` (se rejected)
  - `request_payload`, `response_payload` (audit)
  - `idempotency_key = 'nfe-emit:' + orderId`
  - `emitted_by = ctx.sellerId`
- **RF-081:** UPDATE `crm.orders`:
  - `nf_number`, `nf_chave`, `nf_issued_at = authorizedAt`
  - **Apenas se status=authorized** (rejected/processing não atualizam order)
- **RF-082:** UNIQUE constraint impede duplicação (se já existe authorized/processing, INSERT falha — captura e retorna erro claro).

### Tratamento de Erros do Provider

- **RF-090:** Mapeamento de rejection_codes SEFAZ comuns → mensagens pt-BR:
  - `203` Início data emissão posterior → "Data inválida"
  - `233` Manifestação destinatário pendente → "Cliente precisa manifestar NFe anterior"
  - `293` CFOP de operação interestadual diverge da UF → "CFOP incorreto"
  - `539` Duplicidade — chave acesso existente → "NFe já emitida (verifique histórico)"
  - Outros → mensagem do provider preservada
- **RF-091:** Tabela de mapeamento mantida em `validators/sefaz-rejection-codes.ts`.

### Frontend

- **RF-100:** Hook `useEmitNFe(orderId)` em `src/features/orders/hooks/`:
  - `emit()` chama Edge Function
  - State: `idle | emitting | success | failed`
  - Retorna result com nfNumber/chave em sucesso; rejection_message em falha
- **RF-101:** Tela do pedido (PRD-032) ganha:
  - Card "Documentação Fiscal" mostrando estado da NFe
  - Botão "Emitir NFe" (se não há NFe ainda e order está confirmed/preparing/shipped/delivered)
  - Status atual: badge (processing/authorized/rejected/cancelled)
  - Em rejected: rejection_message visível + botão "Reemitir" (nova tentativa)
  - Em authorized: nf_number + chave + botões "Baixar PDF/XML" (PRD-129)
- **RF-102:** Realtime: atualizações de status propagadas via PRD-105 (subscribe a `crm.nfe_emissions` filtrado por order_id).

### Audit

- **RF-110:** Audit log estruturado:
  - `nfe_emission_attempted` (entrada da função)
  - `nfe_emission_authorized` (sucesso)
  - `nfe_emission_rejected` (rejeição com código)
  - `nfe_emission_processing` (assíncrono — PRD-130 completa)
  - Payloads contêm `orderId`, `emissionId`, código de rejeição, sem PII além do necessário

### Testes

- **RF-120:** Unitários:
  - Mappers (order → request)
  - Validators (CPF/CNPJ dígito verificador, NCM, CFOP)
  - CFOP rules (intra vs inter, contribuinte vs não)
  - Tax calculator (Simples vs Presumido; intra vs inter)
  - Sefaz rejection mapper
- **RF-121:** Integração com MockNFeProvider: ordem completa → emissão → persistence → audit
- **RF-122:** Edge cases: order sem customer document; item sem NCM; UNIQUE violation (segunda emissão)

### Documentação

- **RF-130:** `docs/dev/nfe-emission.md`:
  - Fluxo completo
  - Mappers e validações
  - Estratégia de cálculo (provider calcula vs interno)
  - Mapeamento de rejection codes
  - Troubleshooting comum (NFe rejected, IBGE faltando, etc.)
  - Roadmap (CC-e, NFCe, batch)

---

## Requisitos Não-Funcionais

- **RNF-001 (Idempotência):** Mesmo orderId nunca gera 2 NFes ativas. Constraint DB + idempotency_key + withIdempotency.
- **RNF-002 (Performance):** Emissão sincrona completa em < 15s p95 (depende do provider + SEFAZ).
- **RNF-003 (Auditabilidade):** request_payload e response_payload preservados em `crm.nfe_emissions` para inspeção futura.
- **RNF-004 (Segurança):** Certificado A1 jamais sai do Vault; provider resolve internamente.
- **RNF-005 (Compliance fiscal):** Validações pré-emissão reduzem rejeições SEFAZ a < 5% em uso normal.
- **RNF-006 (Disponibilidade):** Falha do provider não corrompe order (apenas não emite); retry seguro.

---

## Critérios de Aceitação

### RF-080 + RNF-001: Idempotência DB

```gherkin
DADO order O1 confirmed sem NFe
QUANDO seller invoca nfe-emit para O1
ENTÃO INSERT em nfe_emissions com status='authorized'
  E UPDATE order O1 SET nf_chave='44digits...'

QUANDO seller invoca nfe-emit para O1 NOVAMENTE (ex: clique duplo)
ENTÃO withIdempotency retorna resultado cached em < 100ms
  E NÃO faz INSERT novo
  E UNIQUE constraint DB barra se cached escapar
```

### RF-050 + RF-051: Validação Fiscal

```gherkin
DADO order O1 com customer sem documento
QUANDO nfe-emit
ENTÃO valida fiscalmente
  E retorna AppError com errors=[{ field:'recipient.document', code:'INVALID_CPF', message:'Documento do cliente obrigatório' }]
  E NENHUM call ao provider acontece

DADO customer com CNPJ válido formato mas dígito verificador errado
QUANDO valida
ENTÃO erro INVALID_CNPJ
```

### RF-080 + RF-081: Persistência Bem-Sucedida

```gherkin
DADO provider retorna NFeResult status='authorized', chave='35260...'
QUANDO Edge Function processa
ENTÃO INSERT em nfe_emissions com status='authorized', chave preenchida
  E UPDATE orders SET nf_chave='35260...', nf_issued_at=now()
  E audit nfe_emission_authorized
  E Realtime propaga update para frontend
```

### RF-090: Rejection Mapping

```gherkin
DADO provider retorna rejection com sefaz code 539
QUANDO Edge Function processa
ENTÃO INSERT nfe_emissions com status='rejected', rejection_code='539', rejection_message='NFe já emitida (verifique histórico)'
  E order NÃO é atualizado (sem nf_chave)
  E audit nfe_emission_rejected
  E frontend exibe mensagem clara
```

---

## Fases de Implementação

### Fase 1 — Schema + Mappers (1.5 dias)
- Migration nfe_emissions
- Mappers order-to-nfe, address, cfop-rules
- Testes unitários de mappers

### Fase 2 — Validators + Tax Calculator (2 dias)
- validateNFeRequest
- CPF/CNPJ dígito verificador
- calculateTaxes (regimes principais)
- Sefaz rejection mapper

### Fase 3 — Edge Function (1.5 dias)
- Estrutura, withAuth, withIdempotency
- Carregamento de dados
- Despacho ao provider
- Persistência

### Fase 4 — Frontend (1.5 dias)
- useEmitNFe hook
- UI tela pedido com card NFe
- Status flow + Realtime
- Mensagens de erro

### Fase 5 — Testes + Docs (1 dia)
- Integração com MockNFeProvider
- E2E test simulando emissão
- docs/dev/nfe-emission.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-127 (interface), PRD-101 (orders, nfe_emissions migration), PRD-102 (Edge infra + idempotency), PRD-103 (RLS), PRD-105 (Realtime), PRD-032 Fase 1 (tela pedido — host UI)
- **Bloqueia:** PRD-129 (storage de PDF/XML), PRD-130 (cancelamento + polling), PRD-131 (migração)
- **Decisões Pendentes:**
  - Provider final (Focus/PlugNotas/eNotas) confirmar para validar capabilities reais
  - Estratégia se provider !calculatesTax (sugerido: escolher provider que calcula para simplificar)
  - IBGE code: armazenar em customer.address jsonb (recomendado) vs tabela própria
  - Validação CPF/CNPJ dígito verificador agora (PRD-128) — mais rigorosa que PRD-124

---

## Considerações de Segurança

- **Certificado A1** jamais sai do Vault (provider resolve)
- **request_payload** registrado contém PII fiscal (CNPJ, endereço); RLS protege
- **NFe imutável** após autorização — DELETE/UPDATE bloqueados em nfe_emissions exceto serviceRole para campos específicos (cancellation)
- **audit completo** — toda emissão registrada com sellerId
- **idempotência** evita emissão duplicada (problema fiscal grave)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.8; CHANGELOG; renomear `PRD-128-nfe-emission_DONE.md`; teste E2E com MockNFeProvider documentado; integração real com provider escolhido cobrirá PRD-131.

| Princípio | Descrição |
|-----------|-----------|
| **Idempotência sagrada** | Nunca emitir 2 NFes para mesmo order |
| **Validação pré-emissão** | Evita rejeição cara (chamada perdida) |
| **Provider calcula > nós calculamos** | Risco fiscal menor |
| **Audit completo** | request_payload preserva tudo para reconstrução |
| **Order atualizado só em authorized** | rejected/processing não polui order |

| ❌ Evitar |
|-----------|
| Permitir 2 NFes ativas no mesmo order |
| Skipar validação pra "ganhar tempo" |
| Calcular ICMS interestadual sem tabela |
| Esquecer IBGE code (rejeição garantida) |
| Sobrescrever NFe rejeitada (cria nova; preserva history) |
| Logar certificado |

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
| 27/05/2026 | v1 | Criação inicial — Sub-lote 3c do Lote 3 (Onda 6) |

---

**AILA - Sistemas Inteligentes**
