# PRD-121: DINTEC Import Provider Interface

> ✅ **CONCLUÍDO em 2026-06-10** (release v0.84.0 `Anchor`). Ressalvas e desvios documentados:
>
> - **`loadBatch(source, context)`** — assinatura ganhou um segundo argumento `DintecBatchContext` (batchId, entityKind, storeId, uploadedBy, uploadedAt): o `DintecImportBatch` retornado exige esses campos e a `source` sozinha não os carrega. Eles vivem na tabela `dintec_import_batches` (PRD-122) e o chamador já os conhece.
> - **RF-030 adaptado** — o repo não tem `src/providers/ProviderFactory.ts` central; camadas de integração (WhatsApp, DINTEC) são módulos irmãos com factory própria. A camada segue o precedente `src/providers/whatsapp/` (factory + cache + barrel próprio).
> - **RF-012 staged** — `CsvDintecProvider` chega no PRD-122; até lá a factory em modo `supabase` lança `DintecProviderError("NOT_IMPLEMENTED")` nomeando o PRD (mesmo staging usado nos engines WhatsApp).
> - **Decisões pendentes resolvidas:** `order_item` separado de `order` (CSVs distintos; mock traz 4 itens compostos `numero_pedido:codigo_peca`); `price`/`stock` declarados como kinds reservados no union — mock devolve batch vazio, nenhum provider MVP os carrega.
> - Env nova: `VITE_DINTEC_PROVIDER=mock` (opcional — força o mock independente da fonte de dados), documentada em `.env.example` e `src/vite-env.d.ts`.
> - Docs: `docs/dev/dintec-providers.md`. Testes: 15 (factory + mock contract).

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/dintec/`_ |
| **Objetivo** | Estabelecer a interface abstrata `IDintecImportProvider` para importação de dados do ERP DINTEC (atualmente sem API nem acesso ao banco — vide briefing v1.3 §10), aplicando o Provider Pattern: implementação MVP via CSV manual, e abertura para futuras implementações (API direta caso DINTEC venha a expor, conexão de banco em modo readonly, etc.). Fornece tipos normalizados (`DintecRow`, `DintecImportBatch`) que o engine de import (PRD-123) consome |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 3 |
| **Prioridade** | P0 — bloqueia toda a Onda 6 |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-005 Fase 1 (Provider Pattern); PRD-122 (CSV Schema + Upload — implementa esta interface); PRD-123 (Engine — consome); PRD-104 (provider central); PRD-101 (`crm.parts.dintec_id`, `crm.customers.dintec_id`, `crm.orders.dintec_order_id`) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | TS estrito; pasta `src/providers/dintec/`; interface em `IDintecImportProvider.ts` |

### Critérios de Complexidade

> **Justificativa de Média:** o desafio aqui não é técnico, é de **modelagem abstrata**. DINTEC tem formato proprietário, semântica de campos peculiar (códigos numéricos sem padrão, encoding latin-1 frequente, sequências de cancelamento), e o cliente pode mudar layout de export sem aviso. A interface precisa absorver essas variações sem expor especificidades aos consumidores. Erro = refactor em toda a Onda 6.

---

## Contexto do Problema

Conforme briefing v1.3 §10 (confirmação do cliente), o ERP DINTEC:
- **Não expõe API** — equipe DINTEC não tem roadmap e não autoriza
- **Não dá acesso ao banco** — modelo legado, sem documentação, sem credenciais para terceiros
- **Único caminho viável:** export manual em CSV pelo operador GALLO

A Onda 6 vai construir todo o pipeline de import baseado nesse CSV. Mas a longo prazo (Fases 4-5 do roadmap — substituição do DINTEC), pode haver:
- Conexão direta a um DB de espelho criado pela GALLO via integração custom
- API mock interna durante migração
- Múltiplas fontes (DINTEC + DINTEC Cloud + GALLO próprio em transição)

O Provider Pattern resolve: **interface estável, implementação trocável**. PRD-122 implementa `CsvDintecProvider`. Futuro PRD pode implementar `MirrorDbDintecProvider` sem tocar consumidores.

---

## Conceito da Solução

### Interface `IDintecImportProvider`

```typescript
// src/providers/dintec/IDintecImportProvider.ts
export interface IDintecImportProvider {
  readonly providerName: 'csv' | 'mirror_db' | 'api'  // 'csv' único MVP
  readonly capabilities: DintecProviderCapabilities

  /**
   * Carrega uma batch de import. Source pode ser path no Storage (CSV)
   * ou query params (DB mirror), conforme implementação.
   */
  loadBatch(source: DintecImportSource): Promise<DintecImportBatch>

  /**
   * Valida estrutura/encoding/colunas mínimas SEM tocar banco.
   * Retorna lista de erros estruturais (não semânticos).
   */
  validateStructure(batch: DintecImportBatch): Promise<DintecValidationResult>

  /**
   * Healthcheck do provider (CSV: sempre healthy; DB mirror: ping; API: ping).
   */
  healthCheck(): Promise<{ status: 'healthy'|'degraded'|'down', details?: any }>
}

export interface DintecProviderCapabilities {
  supportsIncremental: boolean        // true se sabe enviar apenas diffs; false = sempre full snapshot
  supportsOrderImport: boolean        // CSV de pedidos é difícil; muitos não suportam
  encodingDetection: boolean          // detecta latin1 vs utf-8 automaticamente
  maxBatchSizeMB: number              // limite por batch
}

export type DintecImportEntityKind =
  | 'customer'
  | 'part'
  | 'order'
  | 'order_item'
  | 'price'
  | 'stock'

export interface DintecRow {
  entityKind: DintecImportEntityKind
  dintecId: string                   // identificador no DINTEC (codigo, código de cliente, etc.)
  rawRecord: Record<string, string>  // chaves normalizadas; valores ainda como string
  rowNumber: number                  // linha do CSV (para erro reporting)
  warnings?: string[]
}

export interface DintecImportBatch {
  batchId: string                    // UUID gerado no upload
  source: DintecImportSource
  entityKind: DintecImportEntityKind
  storeId: string                    // a qual store este import pertence
  uploadedBy: string                 // sellerId
  uploadedAt: string
  rows: DintecRow[]                  // pode ser stream em implementação futura; MVP é array
  detectedEncoding?: string
  detectedDelimiter?: string
  totalRows: number
}

export type DintecImportSource =
  | { kind: 'storage', bucket: string, path: string }
  | { kind: 'inline', csvText: string }            // útil para testes
  | { kind: 'mirror', query: string }              // futuro

export interface DintecValidationResult {
  valid: boolean
  errors: DintecValidationError[]
  warnings: DintecValidationError[]
}

export interface DintecValidationError {
  level: 'error' | 'warning'
  rowNumber?: number                  // null para erro estrutural
  field?: string
  code: string                        // ENCODING_INVALID, MISSING_COLUMN, DUPLICATE_DINTEC_ID, ...
  message: string                     // human-readable em pt-BR
}
```

### Factory por Store

```typescript
// src/providers/dintec/factory.ts
import { CsvDintecProvider } from './csv/CsvDintecProvider'
import { MockDintecProvider } from './mock/MockDintecProvider'

export async function getDintecProvider(storeId: string): Promise<IDintecImportProvider> {
  // MVP: única implementação CSV
  if (import.meta.env.VITE_DATA_SOURCE === 'mock' || import.meta.env.VITE_DINTEC_PROVIDER === 'mock') {
    return new MockDintecProvider()
  }
  return new CsvDintecProvider({ storeId })
}
```

Configuração futura pode vir de `crm.stores.dintec_provider_config jsonb` — não necessário no MVP.

### Tipos Centrais Normalizados

Após import via provider, o engine (PRD-123) trabalha com `DintecRow[]`. Provider já entrega chaves do `rawRecord` normalizadas (snake_case, sem espaços, lowercase) — diferentes layouts de CSV são normalizados pelo provider, **não** pelo engine. Esse contrato firme protege engine de mudanças de layout.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Sem Provider Pattern (engine lê CSV direto) | Acopla engine a formato; trocar fonte exige reescrita |
| Provider com método `import()` que faz tudo | Mistura validação + persistência; engine (PRD-123) tem responsabilidade própria |
| Tipos `any` no rawRecord | Type safety perdida; CHECK em provider torna explícito |
| Streaming via async iterator | MVP cabe em memória (~100MB max batch); streaming = complexidade desnecessária |
| Capability `supportsRealtime` (eventos em tempo real) | DINTEC sem API; futuro distante |

---

## Escopo

### Incluído

- ✅ Interface `IDintecImportProvider` + tipos auxiliares em `src/providers/dintec/`
- ✅ Factory `getDintecProvider(storeId)` com fallback para mock
- ✅ `MockDintecProvider` retornando dados sintéticos determinísticos (3 customers, 5 parts, 2 orders fictícios)
- ✅ Capabilities padronizadas: `{ supportsIncremental: false, supportsOrderImport: true, encodingDetection: true, maxBatchSizeMB: 50 }`
- ✅ Validação estrutural padrão (sem semântica): encoding válido, separador detectado, cabeçalho mínimo presente
- ✅ Testes unitários da factory + mock provider
- ✅ Documentação `docs/dev/dintec-providers.md`: como adicionar novo provider futuro

### Excluído

- ❌ Implementação CSV real (PRD-122)
- ❌ Engine de import / persistência (PRD-123)
- ❌ Sync específico por entidade (PRDs 124-126)
- ❌ Streaming de batches gigantes (Fase 4+)
- ❌ Conexão DB direta (não-objetivo)
- ❌ API real DINTEC (não existe)

---

## Requisitos Funcionais

### Interface

- **RF-001:** Interface `IDintecImportProvider` definida com métodos `loadBatch`, `validateStructure`, `healthCheck` + props `providerName` e `capabilities`.
- **RF-002:** Tipos `DintecRow`, `DintecImportBatch`, `DintecImportSource`, `DintecValidationResult`, `DintecValidationError`, `DintecProviderCapabilities` exportados.
- **RF-003:** `entityKind` em union literal: `'customer' | 'part' | 'order' | 'order_item' | 'price' | 'stock'`.
- **RF-004:** `DintecRow.rawRecord` em `Record<string, string>` — provider entrega valores como string (engine converte tipos).

### Factory

- **RF-010:** `getDintecProvider(storeId)` retorna implementação correta.
- **RF-011:** Se `VITE_DATA_SOURCE=mock`: retorna `MockDintecProvider`.
- **RF-012:** Caso default no MVP: retorna `CsvDintecProvider` (implementação no PRD-122).
- **RF-013:** Cache por storeId (mesma instância reutilizada).

### MockDintecProvider

- **RF-020:** Implementa todos os métodos da interface retornando dados sintéticos.
- **RF-021:** `loadBatch` retorna `DintecImportBatch` com rows fictícias para o `entityKind` solicitado:
  - Customer: 3 rows com `dintecId='C001','C002','C003'`
  - Part: 5 rows com `dintecId='P001'...'P005'`
  - Order: 2 rows
- **RF-022:** `validateStructure` sempre retorna `{ valid: true, errors: [], warnings: [] }`.
- **RF-023:** `healthCheck` sempre `healthy`.

### Provider Factory Central

- **RF-030:** `src/providers/ProviderFactory.ts` (do PRD-104) ganha método `getDintecProvider(storeId)` que delega para `dintec/factory.ts`.

### Testes

- **RF-040:** Testes unitários: factory retorna provider correto; mock retorna dados consistentes; type safety preservada.

### Documentação

- **RF-050:** `docs/dev/dintec-providers.md`:
  - Contexto: por que CSV no MVP
  - Arquitetura da interface
  - Como criar novo provider (template baseado em mock)
  - Limitações conhecidas

---

## Requisitos Não-Funcionais

- **RNF-001 (Type safety):** Zero `any` na interface.
- **RNF-002 (Estabilidade):** Mudança na interface = refactor em PRDs 122-126. PR exige revisão dupla.
- **RNF-003 (Extensibilidade):** Adicionar `MirrorDbDintecProvider` no futuro deve exigir apenas: pasta nova, classe nova, ajuste no factory.

---

## Critérios de Aceitação

### RF-010 + RF-020: Factory e Mock

```gherkin
DADO VITE_DATA_SOURCE=mock
QUANDO getDintecProvider('any-store-id')
ENTÃO retorna MockDintecProvider
  E loadBatch({entityKind:'customer'}) retorna batch com 3 rows mock
  E todas as rows têm dintecId, rawRecord, rowNumber
```

### RF-002: Type Safety

```gherkin
DADO tsc rodando no projeto
QUANDO compila src/providers/dintec/**
ENTÃO zero erros, zero warnings
  E nenhum any nas assinaturas
```

---

## Fases de Implementação

### Fase 1 — Interface + Tipos (meio dia)
- IDintecImportProvider, tipos auxiliares
- Capabilities consolidadas

### Fase 2 — Factory + Mock (1 dia)
- factory.ts
- MockDintecProvider com dados sintéticos
- Testes unitários

### Fase 3 — Docs + Handoff (meio dia)
- docs/dev/dintec-providers.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-005 Fase 1 (Provider Pattern), PRD-101 (campos `dintec_id` em parts/customers/orders), PRD-104 (Provider Factory central)
- **Bloqueia:** PRDs 122-126 (toda a parte DINTEC da Onda 6)
- **Decisões Pendentes:** suportar `order_item` separado de `order` ou unificar? (sugerido: separado — DINTEC exporta em CSVs distintos); incluir `price` e `stock` entity kinds agora ou em Fase 4? (sugerido: declarar como reservados; implementação MVP só customer/part/order/order_item)

---

## Considerações de Segurança

- Provider em si não acessa banco — apenas carrega/valida dados em memória
- Permissões de upload e processamento ficam em PRDs 122/123
- Mock determinístico não vaza dados reais

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.1; CHANGELOG; renomear `PRD-121-dintec-import-interface_DONE.md`.

| Princípio | Descrição |
|-----------|-----------|
| **Interface estável** | Mudança = refactor downstream |
| **rawRecord como string** | Conversão de tipos é responsabilidade do engine |
| **Provider normaliza chaves** | snake_case lowercase — engine não lida com layouts |
| **Mock primeiro** | Destrava testes downstream |

| ❌ Evitar |
|-----------|
| Misturar parsing e persistência |
| `any` em qualquer campo |
| Acoplar engine a formato CSV |
| Streaming complexo sem necessidade |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Data** | 2026-06-10 |
| **Versão** | v0.84.0 `Anchor` |
| **Por** | Claude Code (AILA) |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 3a do Lote 3 (Onda 6) |

---

**AILA - Sistemas Inteligentes**
