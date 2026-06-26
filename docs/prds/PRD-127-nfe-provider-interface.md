# PRD-127: NFe Provider Interface

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/nfe/`_ |
| **Objetivo** | Estabelecer a interface abstrata `INFeProvider` para emissão fiscal eletrônica (NFe modelo 55) aplicando Provider Pattern. Três implementações pré-aprovadas pelo cliente (briefing v1.3 §10.4): Focus NFe, PlugNotas, eNotas. Capabilities flagam diferenças (`calculatesTax` — se provider tem motor tributário ou se precisamos enviar tributos calculados). Factory por store (cada store pode ter provider distinto). Tipos normalizados (`NFeRequest`, `NFeResult`, `NFeStatus`) consumidos pelos PRDs 128-131 |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — bloqueante para toda a metade NFe da Onda 6 |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-005 Fase 1 (Provider Pattern); PRD-100 (Vault para certificado); PRD-101 (`crm.orders.nf_*`, nova tabela `crm.nfe_emissions`); PRD-128 (Emission — implementa contra esta interface); PRD-129 (Storage); PRD-130 (Cancelamento); PRD-131 (Migração); PRD-103 (RLS); PRD-110 (monitoring integra com providers fiscais) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | TS estrito; pasta `src/providers/nfe/`; interface em `INFeProvider.ts` |

### Critérios de Complexidade

> **Justificativa de Alta:** NFe carrega obrigações legais sérias — campo obrigatório errado bloqueia emissão na SEFAZ; XML mal-formado é rejeitado; chave de acesso (44 dígitos) é imutável uma vez aprovada. Três providers heterogêneos com APIs distintas, autenticação distinta, escopo de cálculo tributário diferente. Vault para certificado digital A1 (.pfx + senha) é mais sensível que tokens API comuns. Erro causa contingência fiscal (operação parada até regularizar). Interface precisa ser cuidadosamente abstrata sem perder fidelidade.

---

## Contexto do Problema

A operação fiscal do GALLO hoje passa pelo DINTEC (sistema legado). Conforme briefing v1.3 §10.4, a Onda 6 ataca essa dependência implementando emissão **própria** via providers fiscais SaaS:

| Provider | URL | Modelo |
|----------|-----|--------|
| **Focus NFe** | focusnfe.com.br | API REST, transmite + calcula tributos básicos |
| **PlugNotas** | plugnotas.com.br | API REST, transmite + camada de cálculo |
| **eNotas** | enotasgw.com.br | API REST, transmite (cálculo limitado) |

Os três foram aprovados pelo cliente; decisão final entre eles depende de:
- Custo (varia ~R$0,30 a R$1,50 por NFe)
- Suporte ao certificado A1 vs A3 (matriz prefere A1 — mais simples)
- Suporte a contingência (SEFAZ caiu? alguns providers fazem fila)
- Cobertura tributária — qual fração do cálculo o provider faz vs nós

Este PRD entrega abstração que permite **escolha tardia** (configurável por store) e **switch sem refactor** (caso provider apresente problemas em produção).

---

## Conceito da Solução

### Interface `INFeProvider`

```typescript
// src/providers/nfe/INFeProvider.ts
export interface INFeProvider {
  readonly providerName: 'focus_nfe' | 'plugnotas' | 'enotas'
  readonly capabilities: NFeProviderCapabilities

  /**
   * Emite NFe. Provider valida payload, transmite à SEFAZ, retorna resultado.
   * Operação síncrona (provider faz a espera SEFAZ internamente, tipicamente 1-30s).
   */
  emit(request: NFeRequest): Promise<NFeResult>

  /**
   * Consulta status de NFe já enviada (caso emit retornou em processamento).
   */
  fetchStatus(emissionRef: string): Promise<NFeStatus>

  /**
   * Cancelamento (PRD-130 detalha). Apenas dentro do prazo SEFAZ (geralmente 24h).
   */
  cancel(emissionRef: string, reason: string): Promise<NFeCancellationResult>

  /**
   * Baixa XML autorizado (XML é fonte da verdade — PDF é derivado).
   */
  downloadXml(emissionRef: string): Promise<{ xml: string }>

  /**
   * Baixa PDF DANFE (representação visual).
   */
  downloadPdf(emissionRef: string): Promise<{ pdfBuffer: Uint8Array }>

  /**
   * Healthcheck (ping API + status SEFAZ informado).
   */
  healthCheck(): Promise<NFeHealthResult>
}

export interface NFeProviderCapabilities {
  // Provider calcula tributos a partir dos dados básicos? Senão, precisamos enviar ICMS/PIS/COFINS prontos
  calculatesTax: boolean
  
  // Provider lida com contingência (SEFAZ down → SVC)?
  supportsContingency: boolean
  
  // Webhook callback para notificar quando NFe é autorizada async?
  supportsCallback: boolean
  
  // Cancelamento dentro da janela
  supportsCancellation: boolean
  
  // Modo sandbox (homologação SEFAZ)
  hasSandbox: boolean
}
```

### Tipos Normalizados

```typescript
export interface NFeRequest {
  // identificação interna (para correlação)
  internalRef: string  // ex: order.id
  
  // emitente (puxa de configuração da store)
  issuer: NFeIssuer
  
  // destinatário (cliente)
  recipient: NFeRecipient
  
  // itens
  items: NFeItem[]
  
  // totais (provider valida e recalcula)
  total: { value: number, freight?: number, discount?: number, otherCharges?: number }
  
  // pagamento
  payment: { method: NFePaymentMethod, installments?: number }
  
  // notas adicionais
  additionalInfo?: string
  
  // operação fiscal (CFOP a aplicar)
  operationType: 'venda_dentro_estado' | 'venda_fora_estado' | 'devolucao' | 'remessa'
  
  // ambiente
  environment: 'production' | 'homologacao'
}

export interface NFeIssuer {
  cnpj: string
  ieEstadual: string
  razaoSocial: string
  endereco: NFeAddress
  regimeTributario: 'simples_nacional' | 'lucro_presumido' | 'lucro_real'
}

export interface NFeRecipient {
  document: string         // CPF ou CNPJ
  documentType: 'cpf' | 'cnpj'
  name: string
  email?: string           // para envio do PDF/XML por email automático (se provider suporta)
  ieEstadual?: string      // só se CNPJ
  ieIndicador: 'contribuinte' | 'isento' | 'nao_contribuinte'
  endereco: NFeAddress
}

export interface NFeAddress {
  cep: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  cityIbgeCode: string     // 7 dígitos IBGE
  state: string
  countryCode?: string     // default '1058' Brasil
}

export interface NFeItem {
  sku: string
  description: string
  quantity: number
  unit: string             // ex: 'UN', 'KG'
  unitPrice: number
  totalPrice: number       // qty * unitPrice
  ncm: string              // 8 dígitos
  cfop: string             // 4 dígitos — varia por operação
  cestCode?: string        // 7 dígitos se aplicável
  origin: 'nacional' | 'importado_direto' | 'importado_adquirido'
  
  // tributos (presentes se !provider.calculatesTax)
  taxes?: NFeItemTaxes
}

export interface NFeItemTaxes {
  icms: { cst: string, rate: number, value: number, baseValue: number }
  pis: { cst: string, rate: number, value: number, baseValue: number }
  cofins: { cst: string, rate: number, value: number, baseValue: number }
  ipi?: { cst: string, rate: number, value: number, baseValue: number }
}

export type NFePaymentMethod = 'dinheiro' | 'cheque' | 'cartao_credito' | 'cartao_debito' | 'pix' | 'boleto' | 'prazo'

export interface NFeResult {
  emissionRef: string      // ref do provider (ID interno deles)
  status: 'authorized' | 'rejected' | 'processing' | 'contingency'
  
  // se autorized
  nfNumber?: string        // sequencial NFe (provider gera)
  nfSeries?: string
  chave?: string           // 44 dígitos
  protocol?: string        // protocolo SEFAZ
  authorizedAt?: string    // ISO timestamp
  xmlUrl?: string          // URL temporária do provider para baixar XML
  pdfUrl?: string
  
  // se rejected
  rejectionCode?: string
  rejectionMessage?: string
  
  // dados crus do provider (audit)
  rawResponse: unknown
}

export interface NFeStatus {
  emissionRef: string
  status: NFeResult['status']
  chave?: string
  rejectionCode?: string
  rejectionMessage?: string
  lastCheckedAt: string
}

export interface NFeCancellationResult {
  emissionRef: string
  status: 'cancelled' | 'rejected'
  protocol?: string
  rejectionMessage?: string
  cancelledAt?: string
}

export interface NFeHealthResult {
  status: 'healthy' | 'degraded' | 'down'
  providerStatus?: string  // ex: 'API ok, SEFAZ-RS lento'
  sefazStatus?: 'normal' | 'contingencia' | 'down'
  details?: any
}
```

### Factory por Store

```typescript
export async function getNFeProvider(storeId: string, environment: 'production'|'homologacao'): Promise<INFeProvider> {
  const store = await fetchStoreConfig(storeId)  // crm.stores.nfe_config jsonb
  switch (store.nfeProvider) {
    case 'focus_nfe':
      return new FocusNFeProvider({ storeId, environment })
    case 'plugnotas':
      return new PlugNotasProvider({ storeId, environment })
    case 'enotas':
      return new ENotasProvider({ storeId, environment })
    default:
      return new MockNFeProvider()
  }
}
```

### Config por Store (schema)

Migration aditiva em `crm.stores`:

```sql
ALTER TABLE crm.stores
  ADD COLUMN nfe_config jsonb;
-- Estrutura esperada:
-- {
--   "provider": "focus_nfe" | "plugnotas" | "enotas",
--   "environment": "production" | "homologacao",
--   "vaultRef_apiToken": "focus_nfe_token_storeX",
--   "vaultRef_certificate": "certificate_a1_storeX",  -- .pfx em base64
--   "vaultRef_certificatePassword": "cert_password_storeX",
--   "ieEstadual": "...",
--   "regimeTributario": "lucro_presumido",
--   "nfNextNumber": 1,
--   "nfSeries": 1
-- }
```

### Certificado Digital A1

Certificado A1 é arquivo `.pfx` + senha (válido 1 ano). Armazenado no Vault como:
- Conteúdo (.pfx) em base64 → entry `certificate_a1_<store>`
- Senha → entry `cert_password_<store>`

Provider concreto resolve via Vault (Edge Function service_role) e passa ao SDK do provider fiscal.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Provider próprio (motor tributário interno) | Esforço enorme; risco fiscal; SaaS resolve com responsabilidade compartilhada |
| Apenas Focus NFe (sem abstração) | Lock-in; problema do provider trava operação |
| Sem capabilities (tax calc obrigatório no app) | Perde valor dos providers que já calculam |
| Certificado A3 (token físico) | Inviável em cloud (não há hardware) |
| Cálculo tributário em PRD separado | Acopla menos se provider faz; PRD-128 lida com edge case |

---

## Escopo

### Incluído

- ✅ Interface `INFeProvider` + tipos em `src/providers/nfe/`
- ✅ Tipos normalizados (`NFeRequest`, `NFeResult`, `NFeStatus`, `NFeCancellationResult`, `NFeHealthResult`, `NFeIssuer`, `NFeRecipient`, `NFeItem`, etc.)
- ✅ Factory `getNFeProvider(storeId, environment)` com fallback mock
- ✅ Migration aditiva: `crm.stores.nfe_config jsonb` + RLS aware (Owner/Manager only para alterar)
- ✅ `MockNFeProvider` retornando emissões fictícias (`nfNumber='000001'`, status='authorized')
- ✅ Vault entries placeholder documentados (`certificate_a1_<store>`, `cert_password_<store>`, `<provider>_api_token_<store>`)
- ✅ Capabilities padronizadas conforme cada provider real (a confirmar; defaults sugeridos)
- ✅ Tipo `NFeOperationContext` que carrega `storeId`, `environment`, `traceId` em toda operação
- ✅ Testes unitários: factory, mock provider, type safety
- ✅ Documentação `docs/dev/nfe-providers.md` cobrindo arquitetura, capabilities, esquema de Vault entries

### Excluído

- ❌ Implementação concreta dos 3 providers (cada um terá seu PRD-implementação no futuro — escopo de PRDs 128-131 cobre genericamente, mas integrações finais precisam de configuração específica)
- ❌ Decisão final entre Focus/PlugNotas/eNotas (cliente decide com base em testes paralelos)
- ❌ UI de configuração de provider por store (PRD-131 entrega)
- ❌ Cálculo tributário interno (se algum provider não calcular, PRD-128 decide estratégia)
- ❌ Sandbox SEFAZ — homologação fica em cada provider concreto
- ❌ Conta de demonstração com providers (Owner contrata real)
- ❌ Multi-emissor (matriz + filiais distintas) — cada `crm.stores` tem seu config; cobertura natural

---

## Requisitos Funcionais

### Interface

- **RF-001:** `INFeProvider` definida com métodos `emit`, `fetchStatus`, `cancel`, `downloadXml`, `downloadPdf`, `healthCheck`.
- **RF-002:** `providerName` em union literal `'focus_nfe' | 'plugnotas' | 'enotas'`.
- **RF-003:** `capabilities` readonly: `calculatesTax`, `supportsContingency`, `supportsCallback`, `supportsCancellation`, `hasSandbox`.
- **RF-004:** Tipos `NFeRequest`, `NFeResult`, etc. exportados; TS estrito; nenhum `any`.

### Tipos Domain-Specific

- **RF-010:** `NFeIssuer` modelo do emitente.
- **RF-011:** `NFeRecipient` modelo destinatário com `ieIndicador` ∈ `{contribuinte, isento, nao_contribuinte}` (impacta CFOP).
- **RF-012:** `NFeAddress` campos: `cityIbgeCode` obrigatório (NFe exige), `countryCode` default '1058'.
- **RF-013:** `NFeItem` campos completos: `ncm`, `cfop`, `cestCode`, `origin`, opcional `taxes` (se provider não calcula).
- **RF-014:** `NFePaymentMethod` em union literal cobrindo principais formas Brasil.
- **RF-015:** `NFeResult.status` ∈ `{authorized, rejected, processing, contingency}`.

### Factory

- **RF-020:** `getNFeProvider(storeId, environment)` lê `crm.stores.nfe_config` via service_role.
- **RF-021:** Retorna implementação correta conforme `config.provider`.
- **RF-022:** Cache instância por `(storeId, environment)`.
- **RF-023:** Fallback `MockNFeProvider` se `VITE_DATA_SOURCE=mock` ou `nfe_config` ausente.

### Mock Provider

- **RF-030:** Implementa todos os métodos retornando dados sintéticos.
- **RF-031:** `emit` retorna `{ emissionRef: 'mock-<uuid>', status: 'authorized', nfNumber: '000001', nfSeries: '001', chave: '44digits...', protocol: 'mock-protocol', authorizedAt: now() }`.
- **RF-032:** `cancel` sempre `cancelled`.
- **RF-033:** `healthCheck` sempre `healthy`.
- **RF-034:** Capabilities mock: `calculatesTax: true, supportsContingency: false, supportsCallback: false, supportsCancellation: true, hasSandbox: true`.

### Schema

- **RF-040:** Migration aditiva `ALTER TABLE crm.stores ADD COLUMN nfe_config jsonb`.
- **RF-041:** Documentar estrutura esperada em comment SQL + `docs/dev/nfe-providers.md`.
- **RF-042:** RLS estende PRD-103: SELECT por authenticated da store, UPDATE apenas owner.

### Vault Entries

- **RF-050:** Para cada store que vai emitir NFe, esperadas 3 entries no Vault:
  - `<provider>_api_token_<storeId>` (string)
  - `certificate_a1_<storeId>` (base64 do .pfx)
  - `cert_password_<storeId>` (string)
- **RF-051:** Documentar fluxo de cadastro: Owner sobe certificado via UI (PRD-131), backend codifica base64 e grava no Vault.

### Provider Factory Central

- **RF-060:** `src/providers/ProviderFactory.ts` (PRD-104) ganha método `getNFeProvider(storeId, env)` delegando.

### Testes

- **RF-070:** Unitários:
  - Factory retorna provider correto baseado em `nfe_config.provider`
  - Mock provider implementa interface completa
  - Type safety (tsc sem erros)

### Documentação

- **RF-080:** `docs/dev/nfe-providers.md`:
  - Visão geral dos 3 providers (Focus/PlugNotas/eNotas)
  - Capabilities esperadas de cada um
  - Esquema de `nfe_config` em `crm.stores`
  - Schema de Vault entries
  - Workflow de cadastro de certificado A1
  - Roadmap (sandbox, retry, contingência)

---

## Requisitos Não-Funcionais

- **RNF-001 (Type safety):** Zero `any`; `tsc strict mode` passa.
- **RNF-002 (Estabilidade):** Mudanças na interface exigem PR com revisão dupla (impacto downstream).
- **RNF-003 (Extensibilidade):** Adicionar 4º provider (futuro) requer apenas: nova classe, ajuste union literal, factory.
- **RNF-004 (Segurança):** Provider nunca recebe credenciais raw no construtor — resolve sob demanda do Vault.

---

## Critérios de Aceitação

### RF-020 + RF-030: Factory + Mock

```gherkin
DADO crm.stores S1 com nfe_config NULL
QUANDO getNFeProvider('S1', 'production')
ENTÃO retorna MockNFeProvider
  E emit retorna emissionRef='mock-...', status='authorized'

DADO store S2 com nfe_config.provider='focus_nfe'
QUANDO getNFeProvider('S2', 'production')
ENTÃO retorna FocusNFeProvider (stub no MVP, implementação real em PRD-128)
```

### RF-001: Interface Completa

```gherkin
DADO tsc rodando em src/providers/nfe/
QUANDO compila
ENTÃO zero erros TS
  E todos os métodos da interface implementados em MockNFeProvider
  E nenhum any
```

### RF-013: NFeItem com Tributos Opcionais

```gherkin
DADO um provider com capabilities.calculatesTax=true
QUANDO sendo NFeRequest com items SEM taxes preenchido
ENTÃO interface aceita (taxes é opcional)
  E provider calcula internamente

DADO um provider com calculatesTax=false
QUANDO request SEM taxes
ENTÃO PRD-128 validará e calculará via lib externa antes de enviar
```

---

## Fases de Implementação

### Fase 1 — Tipos + Interface (1 dia)
- INFeProvider.ts com todos os métodos
- Tipos normalizados (NFeRequest, NFeResult, etc.)
- Capabilities

### Fase 2 — Factory + Mock (1 dia)
- factory.ts com cache
- MockNFeProvider
- Stubs FocusNFeProvider, PlugNotasProvider, ENotasProvider (apenas constructor — implementação em PRDs 128+)
- Testes

### Fase 3 — Schema + Vault Docs (meio dia)
- Migration nfe_config
- Schema Vault entries
- Documentação placeholder

### Fase 4 — Docs + Handoff (meio dia)
- docs/dev/nfe-providers.md completo
- `_DONE`

---

## Dependências

- **Depende de:** PRD-005 Fase 1 (Provider Pattern), PRD-100 (Vault), PRD-101 (`crm.stores`), PRD-104 (ProviderFactory central)
- **Bloqueia:** PRDs 128-131
- **Decisões Pendentes:**
  - Provider final escolhido (cliente decide entre Focus/PlugNotas/eNotas — Edmilson confirma)
  - Capabilities reais de cada provider (a validar com docs oficiais ou testes)
  - Workflow de upload de certificado A1 (sugerido: UI Owner em PRD-131)
  - Estratégia se `calculatesTax=false` em todos os providers escolhidos (sugerido: lib `nfe-utils-brasil` ou similar)

---

## Considerações de Segurança

- **Certificado A1 no Vault** — base64 do .pfx + senha como entries separadas. Acesso apenas service_role (Edge Functions).
- **API tokens dos providers** — também no Vault.
- **Provider instâncias** não retém credentials em memória além da operação ativa.
- **Logs sanitizados** — token e password jamais em logs/audit.
- **Audit fiscal** — toda emissão registrada em `crm.audit_logs` + futura `crm.nfe_emissions` (PRD-128).

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.7; CHANGELOG; renomear `PRD-127-nfe-provider-interface_DONE.md`; integração real com provider escolhido fica para PRDs 128-131.

| Princípio | Descrição |
|-----------|-----------|
| **Capabilities flagam diferenças** | Sem if(provider==='focus') em consumidores |
| **Certificado é o mais sensível** | Vault sempre; nunca em logs |
| **3 providers homologados** | Cliente decide; arquitetura é neutra |
| **Tipos completos** | NFe tem muitos campos obrigatórios; estruturar bem agora |

| ❌ Evitar |
|-----------|
| Hardcode de provider |
| Credenciais no construtor |
| `any` em campos fiscais (validação perdida) |
| Confiar 100% no provider sem audit log local |
| Implementar motor tributário próprio |

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
