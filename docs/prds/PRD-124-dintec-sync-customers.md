# PRD-124: DINTEC Sync Customers

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/dintec-process/handlers/customer.ts`_ |
| **Objetivo** | Implementação real do handler `processCustomer` consumido pelo engine (PRD-123). Mapeamento de row CSV DINTEC para `ICustomer` do CRM com normalização semântica (CPF/CNPJ com pontuação removida, telefone E.164, email lowercase, endereço estruturado em jsonb), validação de obrigatórios, criação ou update respeitando campos exclusivos do CRM (`seller_id`, `whatsapp`, `customer_type`, `lgpd_status`, `segmentation_tags`). Estratégia de **fallback de matching**: se `dintec_id` não bate, tenta CNPJ/CPF |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — sem este, customers não entram no sistema |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-123 (engine — invoca este); PRD-122 (CSV layout customer); PRD-101 (`crm.customers` + `dintec_id`/`last_dintec_sync_at`/`dintec_version_hash`); PRD-126 (reconciliation — recebe skip_locked); PRD-016 Fase 1 (Veículos — relacionado mas não import direto); PRD-191 Onda 13 (LGPD — consent_records preservado) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Handler modular em `supabase/functions/dintec-process/handlers/customer.ts` + helpers em `mappers/` e `validators/` |

### Critérios de Complexidade

> **Justificativa de Alta:** customer carrega muitos campos que o CRM **enriquece além do DINTEC** — `seller_id` (carteira), `whatsapp`, `consent_records` LGPD, `segmentation_tags`. Sync precisa atualizar campos DINTEC sem apagar enriquecimento. CPF/CNPJ normalização, endereço estruturado em jsonb. Estratégia de matching duplo (dintec_id + CNPJ) para conciliar customers já existentes no CRM antes do DINTEC. Erros silenciosos causam duplicação de customer ou perda de seller assignment.

---

## Contexto do Problema

PRD-123 entregou o engine genérico com handler stub `processCustomer`. Este PRD entrega a **lógica real**:
- Como ler "razao_social" do CSV vira `customer.name`
- Como `cpf_cnpj` é normalizado (`"12.345.678/0001-90"` → `"12345678000190"`)
- Como `endereco`, `cidade`, `uf`, `cep` viram `address jsonb`
- Como preservar campos enriquecidos (`seller_id` atribuído manualmente)
- Como reconciliar customer pré-existente: se cliente GALLO já tem CNPJ X e DINTEC manda dintec_id novo para mesmo CNPJ — match e linkar (não duplicar)

A complexidade está em **não estragar dados do CRM ao trazer dados do DINTEC**.

---

## Conceito da Solução

### Mapeamento Row → Customer

```typescript
// supabase/functions/dintec-process/handlers/customer-mapper.ts
export function mapDintecRowToCustomer(row: DintecRow, storeId: string): CustomerSyncInput {
  const r = row.rawRecord
  
  return {
    storeId,
    dintecId: row.dintecId,  // r.codigo
    name: r.razao_social?.trim() ?? '',
    document: normalizeCpfCnpj(r.cpf_cnpj),   // remove pontuação
    documentType: r.tipo_pessoa === 'F' ? 'cpf' : 'cnpj',
    email: r.email?.toLowerCase().trim() || null,
    phone: normalizePhone(r.telefone),
    address: buildAddressJsonb(r),
    customerType: r.tipo_pessoa === 'F' ? 'b2c' : 'b2b',
    isActive: true,
  }
}

function buildAddressJsonb(r: Record<string, string>) {
  return {
    street: r.endereco?.trim(),
    city: r.cidade?.trim(),
    state: r.uf?.toUpperCase().trim(),
    zipCode: normalizeCep(r.cep),
  }
}
```

### Normalizadores

```typescript
// CPF/CNPJ: remove pontuação, mantém apenas dígitos
export function normalizeCpfCnpj(raw?: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11 && digits.length !== 14) return null  // inválido
  return digits
}

// Telefone: tenta E.164 com DDD; senão preserva como está
export function normalizePhone(raw?: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`  // assume Brasil
  }
  return raw.trim()  // fallback
}

// CEP: digits only, 8 caracteres
export function normalizeCep(raw?: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length === 8 ? digits : null
}
```

### Estratégia de Matching

```typescript
// supabase/functions/dintec-process/handlers/customer-match.ts
async function findExistingCustomer(input: CustomerSyncInput): Promise<Customer | null> {
  // 1. Match por dintec_id (forte)
  let existing = await db.customers
    .select('*')
    .eq('store_id', input.storeId)
    .eq('dintec_id', input.dintecId)
    .maybeSingle()
  if (existing) return existing
  
  // 2. Match por documento (fallback — customer existente no GALLO sem dintec_id)
  if (input.document) {
    existing = await db.customers
      .select('*')
      .eq('store_id', input.storeId)
      .eq('document', input.document)
      .is('dintec_id', null)   // só customer ainda sem link
      .maybeSingle()
    
    if (existing) {
      // Linkar! Atualiza dintec_id no existing
      return existing  // engine sabe que vai UPDATE
    }
  }
  
  return null
}
```

### Campos Protegidos (Engine Não Sobrescreve)

| Campo | DINTEC Atualiza? | Justificativa |
|-------|------------------|---------------|
| `name`, `document`, `document_type` | Sim (mas detecta locked se editado manualmente) | DINTEC é fonte fiscal |
| `email`, `phone` | Sim (mesma lógica) | DINTEC tem o oficial |
| `address` jsonb | Sim | DINTEC tem o de cadastro |
| `customer_type` | Sim na criação; não atualiza depois | Mudança de B2B↔B2C tem implicação no CRM |
| `seller_id` | **NUNCA** | Carteira é decisão GALLO |
| `whatsapp` | **NUNCA** | Geralmente diferente do `phone` cadastrado; preencher manualmente |
| `consent_records` | **NUNCA** | LGPD — só altera por consent explícito |
| `lgpd_status` | **NUNCA** | LGPD |
| `segmentation_tags` | **NUNCA** | Tagging CRM próprio |
| `is_active` | Apenas `S→N` (DINTEC desativou); `N→S` requer ação manual | Evita reativar inadvertidamente |
| `dintec_id`, `last_dintec_sync_at`, `dintec_version_hash` | Sim (sempre — controle interno) | Tracking |

### Fluxo Resumido

```
1. mapDintecRowToCustomer → CustomerSyncInput
2. validate (campos obrigatórios, formato CNPJ)
3. findExistingCustomer (dintec_id, fallback documento)
4. Se não existe → INSERT (preserva defaults: lgpd_status='not_collected', segmentation_tags=[])
5. Se existe:
   a. computeHash(syncFields) vs existing.dintec_version_hash
   b. Igual → skip_unchanged
   c. Detectar manually_edited_fields (PRD-126 detalha) → skip_locked (se houver)
   d. UPDATE apenas campos DINTEC, preserva campos protegidos
6. Atualiza last_dintec_sync_at + dintec_version_hash
7. Retorna RowOutcome
```

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Sobrescrever tudo do CRM com DINTEC | Apaga seller_id, whatsapp, LGPD — inaceitável |
| Não fazer match por CNPJ (só dintec_id) | Cria customer duplicado se já existir no GALLO antes do DINTEC |
| Match fuzzy por nome | Cliente mudou razão social? Falsos positivos. Documento é canônico |
| Não normalizar telefone | Inconsistência cresce; normalizar agora é barato |
| `customer_type` mutável via sync | Mudança de B2B↔B2C impacta portal_settings, etc. — restrito a manual |

---

## Escopo

### Incluído

- ✅ Handler `processCustomer(rows, opts)` implementado em `supabase/functions/dintec-process/handlers/customer.ts`
- ✅ `processCustomerRow` com toda lógica de mapping/validação/matching/persistence
- ✅ `mapDintecRowToCustomer` em `customer-mapper.ts`
- ✅ Normalizadores: `normalizeCpfCnpj`, `normalizePhone`, `normalizeCep`, `buildAddressJsonb`
- ✅ `findExistingCustomer` com fallback de matching (dintec_id → documento)
- ✅ Validação semântica:
  - `name` obrigatório (vazio → error)
  - `document` opcional mas se presente, formato válido
  - `tipo_pessoa` ∈ `{F, J}` (caso contrário error)
- ✅ Detecção de campos protegidos: lista hardcoded em `PROTECTED_CRM_FIELDS`; estes são preservados no UPDATE
- ✅ Lógica de `is_active`: DINTEC `N` → CRM `is_active=false`; mas `S→S` ou `N→N` mantém; `S→N` é update; `N→S` ignorado (manual)
- ✅ Cálculo de `dintec_version_hash` cobrindo apenas campos DINTEC (não protegidos)
- ✅ Linking automático: customer existente sem dintec_id que bate por documento recebe dintec_id via UPDATE
- ✅ Audit log granular: `dintec_customer_created`, `dintec_customer_updated`, `dintec_customer_linked`, `dintec_customer_skipped`
- ✅ Testes unitários:
  - Normalizadores (vários casos)
  - Mapper (row completa → customer)
  - findExistingCustomer (dintec_id match, documento fallback, sem match)
  - Lógica de campos protegidos
- ✅ Teste integração: batch com 10 customers (mix de novos, existentes, com edição manual) → outcomes corretos
- ✅ Documentação `docs/dev/dintec-sync-customer.md` com fluxograma + campos protegidos

### Excluído

- ❌ Resolução manual de skip_locked (PRD-126)
- ❌ Sync de vehicles do customer (se DINTEC exporta — fora de escopo MVP)
- ❌ Histórico de mudanças por campo (audit log basta)
- ❌ Notificação ao seller de novo customer atribuído (Onda 8 — engagement)
- ❌ Validação de CPF/CNPJ via algoritmo de dígito verificador (apenas formato; futura validação avançada)
- ❌ Sync de `consent_records` (LGPD imutável aqui)

---

## Requisitos Funcionais

### Mapper

- **RF-001:** `mapDintecRowToCustomer(row, storeId)` em `customer-mapper.ts`.
- **RF-002:** Lê `r.codigo` como `dintec_id`, `r.razao_social` como `name`.
- **RF-003:** `r.tipo_pessoa === 'F'` → `customer_type='b2c'`, `document_type='cpf'`. `'J'` → `'b2b'`/`'cnpj'`. Outros → AppError.
- **RF-004:** `address jsonb` montado de `r.endereco`, `r.cidade`, `r.uf`, `r.cep`.
- **RF-005:** Campos opcionais ausentes → null no objeto retornado.

### Normalizadores

- **RF-010:** `normalizeCpfCnpj(raw)`:
  - Remove tudo que não é dígito
  - Valida length: 11 (CPF) ou 14 (CNPJ); senão retorna null
- **RF-011:** `normalizePhone(raw)`:
  - Remove não-dígitos
  - Se length ∈ {10, 11}: prefixa `+55`
  - Senão: preserva raw com trim
- **RF-012:** `normalizeCep(raw)`:
  - Dígitos only
  - Se length 8: retorna; senão null

### Validação Semântica

- **RF-020:** `validateCustomer(input): { valid, errors }`:
  - `name` não vazio → senão error `MISSING_NAME`
  - `document_type` ∈ `{cpf, cnpj, null}` → senão error
  - `document` se presente: length correto pelo tipo
  - `email` se presente: regex básico
- **RF-021:** Erro de validação → `RowOutcome { decision: 'error', errorCode, errorMessage }` em pt-BR

### Matching

- **RF-030:** `findExistingCustomer(input)`:
  1. Query por `(store_id, dintec_id)` — match forte
  2. Se não achou: query por `(store_id, document)` AND `dintec_id IS NULL`
  3. Retorna Customer ou null
- **RF-031:** Match por documento triggar `dintec_customer_linked` audit (não é create comum).

### Campos Protegidos

- **RF-040:** Constante `PROTECTED_CRM_FIELDS`:
  ```ts
  const PROTECTED_CRM_FIELDS = [
    'seller_id',
    'whatsapp',
    'consent_records',
    'lgpd_status',
    'segmentation_tags',
    'tags'
  ] as const
  ```
- **RF-041:** Lógica de UPDATE: monta payload apenas com campos DINTEC (não-protegidos) + `dintec_id`, `last_dintec_sync_at = now()`, `dintec_version_hash = newHash`.

### Lógica is_active

- **RF-050:** Lê `r.ativo`:
  - `'S'` → input.isActive = true (DINTEC ativo)
  - `'N'` → input.isActive = false
  - Outro → null (não muda)
- **RF-051:** No UPDATE:
  - Existing `is_active=true`, input=false → atualiza para false (DINTEC desativou)
  - Existing `is_active=false`, input=true → **mantém false** (reativação só manual)
  - Igual → mantém

### Hash

- **RF-060:** `dintec_version_hash` calculado SOMENTE sobre campos sincronizados (não-protegidos):
  - `name`, `document`, `document_type`, `email`, `phone`, `address`, `is_active`
- **RF-061:** Se hash bate `existing.dintec_version_hash`: skip_unchanged.

### Detecção de Manual Edit (Coordena com PRD-126)

- **RF-070:** Função `getProtectedDintecFields(existing): string[]` retorna campos DINTEC que foram editados manualmente:
  - Compara `existing.updated_at` vs `existing.last_dintec_sync_at`
  - Se diff > 5s: assume há edição
  - Retorna lista dos campos DINTEC que mudariam — esses ficam `skip_locked` (handled em PRD-126)
- **RF-071:** Versão MVP simples; PRD-126 amplia com audit log analysis.

### Audit

- **RF-080:** Audit log granular:
  - `dintec_customer_created`: payload com dintec_id, customerId criado, nome
  - `dintec_customer_updated`: payload com customerId, changes (diff)
  - `dintec_customer_linked`: payload com customerId, documento, dintec_id linkado
  - `dintec_customer_skipped`: payload com motivo (unchanged ou locked)

### Testes

- **RF-090:** Testes unitários:
  - Normalizadores: 5+ casos por função
  - Mapper: CSV row → customer válido
  - Mapper: row inválida → validation error
  - findExisting: 3 cenários (dintec match, doc fallback, miss)
  - Hash: same input → same hash; mudança em campo protegido NÃO muda hash
- **RF-091:** Teste integração: batch fictício 10 customers → outcomes esperados

### Documentação

- **RF-100:** `docs/dev/dintec-sync-customer.md`:
  - Fluxograma de processCustomerRow
  - Lista de campos protegidos (com justificativa)
  - Normalizações aplicadas
  - Estratégia de matching dual
  - Roadmap (futuras melhorias)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** 1000 customers processados em < 30s.
- **RNF-002 (Atomicidade por row):** Erro em uma row não derruba outras (engine chunking).
- **RNF-003 (Auditabilidade):** Toda decisão logada com payload útil para investigação.
- **RNF-004 (Preservação CRM):** Zero perda de campos protegidos em update.
- **RNF-005 (Idempotência):** Re-rodar batch produz skip_unchanged em 100% se nada mudou.

---

## Critérios de Aceitação

### RF-010: Normalização CPF/CNPJ

```gherkin
DADO raw = "12.345.678/0001-90"
QUANDO normalizeCpfCnpj
ENTÃO retorna "12345678000190"

DADO raw = "ABC123"
QUANDO normalizeCpfCnpj
ENTÃO retorna null (length inválido)
```

### RF-030: Matching Fallback

```gherkin
DADO customer C1 no GALLO com document='12345678000190', dintec_id=null
  E CSV manda dintec_id='X001' com document='12345678000190'
QUANDO processCustomer
ENTÃO findExistingCustomer encontra C1 via documento
  E UPDATE: C1.dintec_id='X001', last_sync atualizado
  E audit log dintec_customer_linked
  E NÃO cria customer novo (não duplica)
```

### RF-040: Preservação de Campos

```gherkin
DADO customer C1 com seller_id=S1, whatsapp='+5599999...', segmentation_tags=['VIP']
  E CSV manda atualização com novo email
QUANDO processCustomer UPDATE
ENTÃO email é atualizado
  E seller_id, whatsapp, segmentation_tags PERMANECEM intactos
  E audit log mostra apenas email no diff
```

### RF-050: is_active Sem Reativação

```gherkin
DADO customer C1 com is_active=false (desativado manualmente)
  E CSV manda ativo='S'
QUANDO processCustomer UPDATE
ENTÃO is_active continua false
  E audit log inclui notice "ignorando reativação DINTEC"
```

### RF-070: Manual Edit Detectado

```gherkin
DADO customer C1 com updated_at = 5min atrás, last_dintec_sync_at = 2h atrás
  E CSV manda novo name 'Razão Social Atualizada'
QUANDO processCustomer
ENTÃO detecta possível edição manual (updated_at > last_sync)
  E retorna RowOutcome { decision: 'skip_locked', changes: { name: { from: 'X', to: 'Razão Social Atualizada' } } }
  E PRD-126 (Reconciliation) trata depois
```

---

## Fases de Implementação

### Fase 1 — Mapper + Normalizadores (1 dia)
- mapper.ts + normalizers
- Testes unitários

### Fase 2 — Matching + Validação (1 dia)
- findExistingCustomer
- validateCustomer
- Audit hooks

### Fase 3 — Handler Completo + Persistência (1 dia)
- processCustomerRow integra tudo
- Lógica protected fields
- Hash logic
- is_active rules

### Fase 4 — Testes + Docs (1 dia)
- Testes integração com mock batches
- docs/dev/dintec-sync-customer.md
- E2E com 10 customer CSV
- `_DONE`

---

## Dependências

- **Depende de:** PRD-121, PRD-122, PRD-123 (engine + scaffold), PRD-101 (`crm.customers`)
- **Bloqueia:** PRD-125 (parts segue mesmo padrão), PRD-126 (reconciliation precisa entender campos protegidos)
- **Decisões Pendentes:** validação CPF/CNPJ com dígito verificador (sugerido NÃO no MVP, apenas formato); reativação manual ou DINTEC pode reativar com flag? (sugerido nunca DINTEC reativa — preserva controle GALLO).

---

## Considerações de Segurança

- `seller_id`, `lgpd_status`, `consent_records` jamais sobrescritos por DINTEC
- Audit log inclui mudança de campos LGPD-relevant (`document`, `email`, `phone`) para rastreabilidade
- Erros não vazam internamente (mensagens pt-BR sanitizadas)
- service_role apenas em Edge Function

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.4; CHANGELOG; renomear `PRD-124-dintec-sync-customers_DONE.md`.

| Princípio | Descrição |
|-----------|-----------|
| **Campos protegidos sagrados** | Nunca sobrescrever seller_id, whatsapp, LGPD |
| **Matching dual** | dintec_id → documento (sem fuzzy) |
| **Linking, não duplicação** | Cliente pré-existente recebe dintec_id |
| **is_active conservador** | Só desativa; reativa só manual |
| **Hash sobre campos DINTEC** | Edição manual em outros não invalida |

| ❌ Evitar |
|-----------|
| Sobrescrever seller_id |
| Match por nome (false positives) |
| Reativar customer automaticamente |
| Validar CPF/CNPJ com dígito (overkill MVP) |
| Erros silenciosos (engole row) |

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
| 27/05/2026 | v1 | Criação inicial — Sub-lote 3b do Lote 3 (Onda 6) |

---

**AILA - Sistemas Inteligentes**
