# PRD-123: DINTEC Import Engine

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/dintec-process/`_ |
| **Objetivo** | Edge Function que processa batches validados (PRD-122): itera rows, calcula diff contra tabela final correspondente (created / updated / unchanged / removed), aplica mudanças com idempotência por `dintec_id`, gera `processing_summary` estruturado. Dispatch para handlers específicos por `entity_kind` (`processCustomer`, `processPart`, `processOrder`, `processOrderItem`). Suporta **dry-run** (preview de mudanças sem persistir). Audit log de cada decisão |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — sem engine, batches uploadados nunca viram dados úteis |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-121 (interface — consume); PRD-122 (batches — input); PRD-101 (tabelas finais + `dintec_id`/`last_dintec_sync_at`/`dintec_version_hash`); PRD-124 (Sync Customers — handler específico); PRD-125 (Parts); PRD-126 (Reconciliation — conflitos); PRD-102 (Edge Function infra + idempotency) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Edge Function modular; handlers por entity em pastas separadas |

### Critérios de Complexidade

> **Justificativa de Alta:** engine processa milhares de rows com idempotência (re-execução produz mesmo resultado), diff inteligente (não sobrescrever campo editado manualmente no GALLO), tratamento de FKs (order não pode ser criada antes de customer), atomicidade (batch inteiro ou nada — não meio import quebrado), audit completo. Erros causam corrupção de dados ou perda silenciosa. Suporte a dry-run dobra a complexidade — toda mutation precisa de versão preview.

---

## Contexto do Problema

PRD-122 entrega batches validados estruturalmente, mas com dados ainda **em CSV/objeto**. Falta:
1. **Mapear** linha CSV → row em tabela final (`crm.customers`, `crm.parts`, etc.)
2. **Diff inteligente** — se customer C1 já existe com `dintec_id='001'`, é UPDATE ou ignore?
3. **Aplicar mudanças** em transação por entity ou em chunks
4. **Reportar** quantos foram criados, atualizados, skipados, errored
5. **Auditoria** — quem fez import, quando, o que mudou

Este PRD entrega o **engine**. Handlers específicos por entity (PRD-124 customer, PRD-125 part) implementam a lógica fina; engine orquestra.

---

## Conceito da Solução

### Arquitetura

```
[Owner clica "Processar" no batch validated]
   │
   ├──▶ POST /functions/v1/dintec-process { batchId, dryRun: false }
   │
   └──▶ Edge Function dintec-process
        │
        ├── Lê batch + carrega rows via CsvDintecProvider.loadBatch
        ├── Dispatch por entityKind:
        │     ├── 'customer' → processCustomer(rows, opts)   [PRD-124]
        │     ├── 'part'     → processPart(rows, opts)        [PRD-125]
        │     ├── 'order'    → processOrder(rows, opts)
        │     └── 'order_item' → processOrderItem(rows, opts)
        │
        ├── Cada handler retorna RowOutcome[] com decisão por row
        ├── Agrega em ProcessingSummary
        ├── UPDATE crm.dintec_import_batches.processing_summary
        ├── Audit log do batch processado
        └── Responde 200 com summary
```

### Tipos Centrais

```typescript
// supabase/functions/dintec-process/types.ts
export interface ProcessOptions {
  dryRun: boolean
  batchId: string
  storeId: string
  uploadedBy: string  // sellerId
  traceId: string
}

export type RowDecision = 
  | 'create'
  | 'update'
  | 'skip_unchanged'   // dintec_version_hash igual → não atualiza
  | 'skip_locked'      // campo crítico modificado manualmente no GALLO; PRD-126 resolve
  | 'error'

export interface RowOutcome {
  rowNumber: number
  dintecId: string
  decision: RowDecision
  targetId?: string    // ID na tabela final se created/updated
  changes?: Record<string, { from: unknown, to: unknown }>  // dry-run usa
  errorCode?: string
  errorMessage?: string  // pt-BR
}

export interface ProcessingSummary {
  batchId: string
  entityKind: DintecImportEntityKind
  dryRun: boolean
  totalRows: number
  created: number
  updated: number
  skippedUnchanged: number
  skippedLocked: number
  errored: number
  outcomes: RowOutcome[]    // pode ser truncado para 1000 em response; completo em DB
  processedAt: string
  durationMs: number
}
```

### Padrão de Handler (template)

```typescript
// Handlers específicos seguem este padrão; implementados em PRDs 124+
async function processCustomer(rows: DintecRow[], opts: ProcessOptions): Promise<RowOutcome[]> {
  const outcomes: RowOutcome[] = []
  
  for (const row of rows) {
    const outcome = await processCustomerRow(row, opts)
    outcomes.push(outcome)
  }
  
  return outcomes
}

async function processCustomerRow(row: DintecRow, opts: ProcessOptions): Promise<RowOutcome> {
  try {
    // 1. Mapear row → entidade
    const incoming = mapRowToCustomer(row, opts.storeId)
    
    // 2. Calcular hash para idempotência
    const versionHash = computeHash(incoming)
    
    // 3. Buscar existente por dintec_id
    const existing = await findCustomerByDintecId(row.dintecId, opts.storeId)
    
    if (!existing) {
      if (!opts.dryRun) {
        const created = await insertCustomer(incoming, versionHash)
        return { rowNumber: row.rowNumber, dintecId: row.dintecId, decision: 'create', targetId: created.id }
      }
      return { rowNumber: row.rowNumber, dintecId: row.dintecId, decision: 'create' }
    }
    
    // 4. Hash igual? Skip.
    if (existing.dintecVersionHash === versionHash) {
      return { rowNumber: row.rowNumber, dintecId: row.dintecId, decision: 'skip_unchanged', targetId: existing.id }
    }
    
    // 5. Campos protegidos modificados manualmente? Skip locked (PRD-126).
    const lockedFields = detectManuallyEditedFields(existing, incoming)
    if (lockedFields.length > 0) {
      return { rowNumber: row.rowNumber, dintecId: row.dintecId, decision: 'skip_locked', targetId: existing.id, changes: lockedFields }
    }
    
    // 6. Diff e UPDATE
    const changes = computeChanges(existing, incoming)
    if (!opts.dryRun) {
      await updateCustomer(existing.id, incoming, versionHash)
    }
    return { rowNumber: row.rowNumber, dintecId: row.dintecId, decision: 'update', targetId: existing.id, changes }
    
  } catch (err) {
    return {
      rowNumber: row.rowNumber,
      dintecId: row.dintecId,
      decision: 'error',
      errorCode: err.code || 'INTERNAL',
      errorMessage: err.message,
    }
  }
}
```

### Idempotência via dintec_version_hash

Sempre que row é processada, calculamos `sha256` dos campos sincronizados. Salvamos em `crm.<table>.dintec_version_hash`. Se hash bate na próxima execução: **skip**.

```typescript
function computeHash(record: Record<string, unknown>): string {
  // Order keys, stringify
  const sortedKeys = Object.keys(record).sort()
  const canonical = sortedKeys.map(k => `${k}:${record[k]}`).join('|')
  return sha256(canonical)
}
```

### Detecção de Edição Manual (skip_locked)

Conceito: se `crm.customers.name` foi alterado depois de `last_dintec_sync_at` por uma ação de seller (audit log indica mutação), engine **não sobrescreve**. PRD-126 (Reconciliation) lida com o conflito.

Implementação simplificada MVP: comparar `last_dintec_sync_at` vs `updated_at`. Se `updated_at > last_dintec_sync_at + 5s`, assume edição manual. PRD-126 refina com audit log analysis.

### Dry-Run

Mesma lógica de produção, mas:
- Nenhum `INSERT`/`UPDATE` real
- `outcomes` retornados com `changes` (diff completo)
- Owner vê preview na UI antes de confirmar
- Útil para validar batch grande antes de processar (RNF segurança)

### Atomicidade

Trade-off:
- **All-or-nothing** (transação Postgres por batch): seguro mas lento para 50k rows; lock contention
- **Por row** (cada row = transação curta): rápido, mas batch pode terminar half-applied se erro catastrófico

**Decisão MVP:** processamento por chunks de 100 rows, cada chunk em transação. Erros isolados por row (decision='error'). Owner vê summary e re-executa batch corrigido.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Engine único monolítico (sem handlers separados) | Acopla lógica de customer e parts; PRDs 124-126 ficariam apertados |
| Atomic batch (single transaction) | Lock muito longo para 50k rows |
| Sem dry-run | Owner mete medo de processar batch grande sem preview |
| Hash em campos individuais | Computacionalmente caro; hash do registro inteiro basta |
| Engine no frontend (não Edge Function) | Volume + service_role exigem backend |
| Push para queue Bull/Redis | Overkill para MVP; Edge Function direta basta |

---

## Escopo

### Incluído

- ✅ Edge Function `supabase/functions/dintec-process/index.ts` orquestrador
- ✅ Dispatcher por `entityKind` invocando handler específico
- ✅ Estrutura modular `supabase/functions/dintec-process/handlers/` com:
  - `customer.ts` (stub que PRD-124 completa)
  - `part.ts` (stub que PRD-125 completa)
  - `order.ts` (stub que PRD futuro completa — Onda 6 ou Fase 4)
  - `order_item.ts` (idem)
- ✅ Tipos `RowOutcome`, `ProcessingSummary`, `ProcessOptions`, `RowDecision`
- ✅ Helpers compartilhados:
  - `computeHash(record): string`
  - `computeChanges(existing, incoming): Record<string, {from, to}>`
  - `detectManuallyEditedFields(existing, incoming): string[]` (versão simplificada por timestamps; PRD-126 refina)
- ✅ Suporte a dry-run (parâmetro `dryRun: boolean` no input)
- ✅ Chunking (100 rows por transação)
- ✅ Persistência de `processing_summary` em `crm.dintec_import_batches`
- ✅ Audit log: `dintec_batch_processed` com summary
- ✅ Update de status do batch: `processing` → `completed` ou `failed`
- ✅ UI no detalhe do batch (estende PRD-122): botão "Dry-run" antes de "Processar"; tabela de outcomes paginada
- ✅ Testes unitários do dispatcher; integração com mock provider + handlers stub
- ✅ Documentação `docs/dev/dintec-engine.md`

### Excluído

- ❌ Handler real de customer (PRD-124)
- ❌ Handler real de part (PRD-125)
- ❌ Handler de order completo (PRD futuro — depende de complexidade de FK customer)
- ❌ Reconciliation avançada (PRD-126)
- ❌ Auto-retry em erro transitório (Owner re-executa manualmente)
- ❌ Notificação push de batch concluído (Realtime cobre)
- ❌ Scheduling automático (toda execução é manual MVP; Onda 8 considera)
- ❌ Compressão de outcomes em DB (50k rows × ~200 bytes = 10MB jsonb — aceitável; otimização futura)

---

## Requisitos Funcionais

### Edge Function

- **RF-001:** Endpoint `POST /functions/v1/dintec-process`
- **RF-002:** `withAuth` obrigatório; valida que ctx.role IN ('owner', 'manager')
- **RF-003:** Input validado:
  ```ts
  { batchId: string (uuid), dryRun: boolean (default false) }
  ```
- **RF-004:** Carrega batch via `crm.dintec_import_batches` (service_role).
- **RF-005:** Valida status do batch:
  - `validated` → pode processar
  - `processing` → 409 (já em andamento — idempotency via processed_events)
  - `completed` (não dry-run) → 409 (re-processamento exige novo batch)
  - Outros → 400 com mensagem clara

### Idempotência

- **RF-010:** `eventKey = 'dintec-process:' + batchId + (dryRun ? ':dry' : ':apply')`
- **RF-011:** `withIdempotency` (PRD-102): segunda chamada com mesma key retorna resultado cached em < 100ms.

### Carregamento de Rows

- **RF-020:** Usa `provider.loadBatch({ kind: 'storage', bucket, path })` para carregar rows do CSV (PRD-122 já validou).
- **RF-021:** Em caso de falha de download/parse: UPDATE batch status='failed' + erro no audit; responde 500 com AppError.

### Dispatcher

- **RF-030:** Switch por `entityKind`:
  - `'customer'` → invoca `processCustomer(rows, opts)`
  - `'part'` → `processPart(rows, opts)`
  - `'order'` → `processOrder(rows, opts)` (stub MVP)
  - `'order_item'` → `processOrderItem(rows, opts)` (stub MVP)
  - default → AppError('VALIDATION_ERROR', 422, 'entity_kind não suportado')

### Helpers Compartilhados

- **RF-040:** `computeHash(record)` — SHA-256 do registro canonicalizado (chaves ordenadas, valores stringificados).
- **RF-041:** `computeChanges(existing, incoming)` retorna `Record<field, { from, to }>` apenas dos campos que mudaram.
- **RF-042:** `detectManuallyEditedFields(existing, incoming)`:
  - Compara `existing.updated_at` vs `existing.last_dintec_sync_at`
  - Se `updated_at > last_dintec_sync_at + 5s`: considera há edição manual
  - Retorna lista de campos que `incoming` quer mudar e que estão "lockados" (regra simplificada MVP; PRD-126 refina)
  - MVP: aplica a campos específicos (`name`, `email`, `phone`) — não todos

### Chunking

- **RF-050:** Processa rows em chunks de 100.
- **RF-051:** Cada chunk em transação (`BEGIN`/`COMMIT` ou `txn`).
- **RF-052:** Erro em uma row não derruba chunk (try/catch); decision='error' e segue.
- **RF-053:** Erro catastrófico (loss de conexão DB) entre chunks → batch parcial; status='failed' + audit detalhado.

### Outcome Tracking

- **RF-060:** Cada handler retorna `RowOutcome[]`.
- **RF-061:** Agregação em `ProcessingSummary`:
  ```ts
  { totalRows, created, updated, skippedUnchanged, skippedLocked, errored, outcomes }
  ```
- **RF-062:** UPDATE `crm.dintec_import_batches`:
  - `status = 'completed'` (ou `failed` se errored > totalRows * 0.5)
  - `processing_summary = <jsonb>` (com outcomes; pode truncar > 5000 outcomes para resumo)
  - `processed_at = now()`
- **RF-063:** Audit log `dintec_batch_processed` com payload resumido.

### Dry-Run

- **RF-070:** Quando `dryRun=true`:
  - Toda lógica é executada (handler invocado)
  - Mas nenhum INSERT/UPDATE em tabelas finais
  - `outcomes` retornados com `changes` (diff completo) para preview
  - Status do batch NÃO muda (continua `validated`)
  - Resposta contém `processing_summary` calculado
  - Audit log `dintec_batch_dryrun` (não conta como execução real)

### UI Estende PRD-122

- **RF-080:** No detalhe do batch (`validated`):
  - Botão "Dry-run" → invoca dintec-process com `dryRun=true`
  - Tabela mostra summary (criados/atualizados/skipped/erros) + outcomes paginados
  - Botão "Processar (real)" → invoca com `dryRun=false`
- **RF-081:** Realtime propaga UPDATE no batch — Owner vê status mudar.
- **RF-082:** Após `completed`, tela mostra outcomes completos.

### Audit

- **RF-090:** Audit log estruturado:
  - `dintec_batch_dryrun`: payload = summary resumido
  - `dintec_batch_processed`: payload = summary completo
  - `dintec_batch_failed`: payload = erro

### Testes

- **RF-100:** Testes unitários:
  - `computeHash`: mesmo input → mesmo hash; mudança em qualquer campo → hash diferente
  - `computeChanges`: detecta diffs corretamente
  - `detectManuallyEditedFields`: caso típico (timestamp recente)
  - Dispatcher: routes por entity correto
- **RF-101:** Testes de integração:
  - Mock batch com 5 customers → processCustomer mock retorna outcomes esperados
  - Dry-run não persiste; real persist
  - Batch parcialmente errado: alguns row='error', outros 'create' — summary correto

### Documentação

- **RF-110:** `docs/dev/dintec-engine.md`:
  - Arquitetura do engine
  - Padrão de handler
  - Idempotência via hash
  - Detecção de edição manual (versão MVP e roadmap PRD-126)
  - Dry-run vs apply
  - Limites de tamanho de batch
  - Troubleshooting comum

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Batch de 10k rows processa em < 5min (Edge Function timeout = 6min; ajustar chunking).
- **RNF-002 (Idempotência):** Re-executar batch produz o mesmo resultado (skip_unchanged).
- **RNF-003 (Auditabilidade):** Toda decisão registrada em outcomes; audit log capturável.
- **RNF-004 (Segurança):** Apenas Owner/Manager processa; RLS + Edge validação.
- **RNF-005 (Atomicidade limitada):** Chunks transacionais; erros isolados.
- **RNF-006 (Memoria):** Não carregar 50MB inteiro em strings; usar streaming quando viável (otimização futura).

---

## Critérios de Aceitação

### RF-070: Dry-Run Não Persiste

```gherkin
DADO batch validated com 100 customers (50 novos, 50 já existentes com hash igual)
QUANDO Owner clica "Dry-run"
ENTÃO ProcessingSummary retorna: created=50, skippedUnchanged=50, errored=0
  E NENHUM INSERT/UPDATE em crm.customers
  E status do batch continua 'validated'
  E audit log dintec_batch_dryrun registrado
```

### RF-040 + RF-060: Idempotência

```gherkin
DADO batch processado com 100 customers (todos criados)
QUANDO Owner processa MESMO batch novamente
ENTÃO ProcessingSummary: created=0, skippedUnchanged=100, updated=0
  E não há side effects
```

### RF-042 + RF-061: Skip Locked

```gherkin
DADO customer C1 com dintec_id='001', nome='João' (last_dintec_sync_at = 1h atrás, updated_at = 5min atrás)
  E CSV com mesmo dintec_id='001' mas nome='João Silva'
QUANDO processCustomer
ENTÃO detecta edição manual (updated_at > last_sync_at + 5s)
  E retorna RowOutcome { decision: 'skip_locked', targetId: C1.id, changes: { name: { from:'João', to:'João Silva' } } }
  E customer NÃO é atualizado
  E summary.skippedLocked > 0
  E PRD-126 (Reconciliation) cobrirá esse caso
```

### RF-053: Chunking + Erro Isolado

```gherkin
DADO batch com 100 customers; 1 deles tem dintec_id='X' que viola constraint (FK store inexistente)
QUANDO processado
ENTÃO 99 customers criados/atualizados normalmente
  E 1 outcome com decision='error', errorCode='FOREIGN_KEY_VIOLATION'
  E batch.status='completed' (errored < 50% do total)
  E Owner vê erro específico no detalhe
```

---

## Fases de Implementação

### Fase 1 — Estrutura + Tipos (1 dia)
- Edge Function scaffold
- Tipos RowOutcome, ProcessingSummary
- Helpers (computeHash, computeChanges, detectManuallyEditedFields)

### Fase 2 — Dispatcher + Stubs (1 dia)
- Switch por entityKind
- Handlers stub que retornam outcomes fictícios (PRDs 124+ completam)
- Chunking + tratamento de erros

### Fase 3 — Dry-Run + Persistência (1.5 dias)
- Lógica dry-run
- UPDATE batch + processing_summary
- Audit log

### Fase 4 — UI Estende PRD-122 (1.5 dias)
- Botões Dry-run e Processar
- Tabela de outcomes paginada
- Realtime status

### Fase 5 — Testes + Docs (1 dia)
- Unit + integração com mock handler
- docs/dev/dintec-engine.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-121, PRD-122, PRD-101 (tabelas + colunas dintec_*), PRD-102 (Edge infra + idempotency), PRD-103 (RLS), PRD-105 (Realtime UI)
- **Bloqueia:** PRDs 124, 125, 126 (completam handlers + reconciliação)
- **Decisões Pendentes:** Chunk size 100 ok? (sugerido — ajustar conforme perf); detect manual edit por timestamp ok como MVP? (sugerido — PRD-126 amplia); truncate outcomes em DB se > 5000? (sugerido — preserva resumo).

---

## Considerações de Segurança

- Owner/Manager only; RLS + Edge auth
- Audit log de toda processing (dry-run e real)
- Idempotência impede execução duplicada
- Erros catastróficos não corrompem tabelas (chunks isolam)
- service_role apenas em Edge Function; nunca exposto

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.3; CHANGELOG; renomear `PRD-123-dintec-import-engine_DONE.md`; handlers stub deixam comentário `// IMPLEMENTED BY PRD-124` para Claude Code identificar.

| Princípio | Descrição |
|-----------|-----------|
| **Dry-run sempre disponível** | Owner valida antes de aplicar |
| **Idempotência por hash** | Re-executar é seguro |
| **Skip locked respeita usuário** | Edição manual no GALLO não é sobrescrita |
| **Chunks isolam erros** | Uma row ruim não derruba 10k |
| **Audit completo** | Toda decisão rastreável |

| ❌ Evitar |
|-----------|
| Sobrescrever edição manual sem reconciliação |
| Batch transação única (lock muito longo) |
| Dry-run que muda banco |
| Engine que sabe lógica de customer/part (delegue a handlers) |
| Erros sem outcome (engole) |

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
| 27/05/2026 | v1 | Criação inicial — Sub-lote 3a do Lote 3 (Onda 6) |

---

**AILA - Sistemas Inteligentes**
