# PRD-125: DINTEC Sync Parts

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/dintec-process/handlers/part.ts`_ |
| **Objetivo** | Implementação real do handler `processPart` consumido pelo engine (PRD-123). Mapeamento de row CSV DINTEC para `IPart` do CRM: resolução de `brand_id` por nome (lookup em `crm.brands`), resolução de `category_id` (lookup em `crm.categories`), parsing de decimais com vírgula brasileira (`125,90` → `125.90`), preservação de campos enriquecidos pelo CRM (`oem_codes`, `alternative_codes`, `tags`, `weight_kg` manual). Tratamento de SKU como índice secundário (DINTEC `codigo` = `sku` GALLO) |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — sem este, peças não entram no catálogo |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-123 (engine); PRD-122 (CSV layout part); PRD-101 (`crm.parts` + brands + categories); PRD-126 (reconciliation); PRD-030 Fase 1 (Catálogo); PRD-049 Fase 1 (Rentabilidade — consome `unit_cost`) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Handler modular em `supabase/functions/dintec-process/handlers/part.ts` + helpers |

### Critérios de Complexidade

> **Justificativa de Alta:** parts é o **catálogo crítico** — sem peças, vendedor não vende. DINTEC pode ter 5k-20k SKUs ativos. Resolução de brand/category por nome envolve fuzzy matching cuidadoso (tolerância controlada, autocriação opcional). Decimal brasileiro (vírgula) é frequente armadilha. Campos enriquecidos (`oem_codes`, `applications`) JAMAIS podem ser sobrescritos — eles são o valor agregado do CRM. Erro causa catálogo inflado com duplicatas (peça já existente sem dintec_id criou nova entry).

---

## Contexto do Problema

PRD-123 entregou stub; este implementa real. Desafios:
- DINTEC pode ter campo `marca='MANN-FILTER'`; CRM `crm.brands` tem `name='Mann Filter'` → resolver match
- DINTEC `categoria='FILTROS'`; CRM tem `Filtros` (caps diferente, possivelmente acentos) → resolver
- Preço `'125,90'` é decimal brasileiro; conversão para `numeric(12,2)` precisa de cuidado
- CRM enriqueceu peças com OEM codes manualmente, aplicações em veículos (PRD-035 Kits, PRD-016 Veículos); sync DINTEC não pode apagar
- Se peça já existe no CRM com SKU=`P001` mas sem `dintec_id`: match e linkar (não duplicar)

A complexidade está em **catálogo limpo após sync**: sem duplicatas, sem perda de enriquecimento, sem brand/category órfã.

---

## Conceito da Solução

### Mapeamento Row → Part

```typescript
// supabase/functions/dintec-process/handlers/part-mapper.ts
export async function mapDintecRowToPart(row: DintecRow, storeId: string, lookups: BrandCategoryLookups): Promise<PartSyncInput> {
  const r = row.rawRecord
  
  return {
    storeId,
    dintecId: row.dintecId,         // r.codigo
    sku: row.dintecId,              // GALLO usa mesmo código
    name: r.descricao?.trim() ?? '',
    brandId: await lookups.resolveBrandId(r.marca),
    categoryId: await lookups.resolveCategoryId(r.categoria),
    unitPrice: parseBrazilianDecimal(r.preco_venda) ?? 0,
    unitCost: parseBrazilianDecimal(r.preco_custo) ?? null,
    weightKg: parseBrazilianDecimal(r.peso_kg) ?? null,
    isActive: r.ativo !== 'N',
    // oem_codes e alternative_codes: preservados; CSV não traz
    // applications: idem
    // tags: idem
  }
}
```

### Parser Decimal Brasileiro

```typescript
export function parseBrazilianDecimal(raw?: string): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  
  // Aceita: "125,90" "125.90" "1.250,90" "1,250.90"
  // Heurística: se tem vírgula E ponto, decimal é o último símbolo
  // Senão: vírgula é decimal por default (Brasil)
  
  let normalized: string
  if (trimmed.includes(',') && trimmed.includes('.')) {
    // último símbolo é decimal
    const lastComma = trimmed.lastIndexOf(',')
    const lastDot = trimmed.lastIndexOf('.')
    if (lastComma > lastDot) {
      // "1.250,90" estilo brasileiro
      normalized = trimmed.replace(/\./g, '').replace(',', '.')
    } else {
      // "1,250.90" estilo americano
      normalized = trimmed.replace(/,/g, '')
    }
  } else if (trimmed.includes(',')) {
    // só vírgula → decimal brasileiro
    normalized = trimmed.replace(',', '.')
  } else {
    normalized = trimmed
  }
  
  const num = Number(normalized)
  return isNaN(num) ? null : num
}
```

### Resolução Brand/Category por Nome

```typescript
// supabase/functions/dintec-process/handlers/brand-category-lookups.ts
export class BrandCategoryLookups {
  private brandCache = new Map<string, string>()  // normalizedName → id
  private categoryCache = new Map<string, string>()
  
  async resolveBrandId(rawName?: string): Promise<string | null> {
    if (!rawName?.trim()) return null
    const normalized = normalizeName(rawName)
    if (this.brandCache.has(normalized)) return this.brandCache.get(normalized)!
    
    // 1. Tenta match exato (case-insensitive, ignorando acentos)
    const exactMatch = await db.brands
      .select('id')
      .ilike('name', rawName)
      .maybeSingle()
    if (exactMatch) {
      this.brandCache.set(normalized, exactMatch.id)
      return exactMatch.id
    }
    
    // 2. Fuzzy: normalizando ambos os lados (sem espaço, sem acento)
    const allBrands = await db.brands.select('id, name')
    const fuzzyMatch = allBrands.find(b => normalizeName(b.name) === normalized)
    if (fuzzyMatch) {
      this.brandCache.set(normalized, fuzzyMatch.id)
      return fuzzyMatch.id
    }
    
    // 3. Não achou → null (RowOutcome marca warning, peça importada sem marca)
    return null
  }
  
  // Mesmo padrão para resolveCategoryId
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[\s\-_\.]+/g, '')
}
```

**Decisão MVP:** **não autocria** brands/categories. Se DINTEC manda marca inexistente, peça importa sem brand_id + warning no outcome. Owner cria brand manualmente em `/app/configuracoes/marcas` (PRD futuro) e re-importa.

### Campos Protegidos no Update

| Campo | DINTEC Atualiza? | Justificativa |
|-------|------------------|---------------|
| `name`, `unit_price`, `unit_cost` | Sim (subject a manual edit lock) | DINTEC é fonte fiscal e contábil |
| `brand_id`, `category_id` | Sim (via lookup) | Categorização DINTEC vence |
| `weight_kg` | Sim (se DINTEC manda) | Operacional |
| `is_active` | Apenas S→N; reativação manual | Mesma lógica de customer |
| `oem_codes` | **NUNCA** | Enriquecimento manual no GALLO |
| `alternative_codes` | **NUNCA** | Idem |
| `tags` | **NUNCA** | Tagging interno |

### Estratégia de Matching

Mesma do customer:
1. Match por `(store_id, dintec_id)` — forte
2. Fallback: `(store_id, sku)` AND `dintec_id IS NULL` — link
3. Sem match → INSERT

### Performance

5k SKUs em 10 minutos = 8 rows/segundo. Lookups cacheados em memória durante batch (BrandCategoryLookups). DB queries em batch quando possível (preload brands e categories antes do loop).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Autocriar brand/category ausente | Inflama catálogo com nomes inconsistentes; Owner deve curar |
| Fuzzy matching agressivo (Levenshtein) | Falsos positivos perigosos ("Bosch" ≠ "Bosch Auto Parts") |
| Sync de OEM via DINTEC | DINTEC não tem; OEM é enriquecimento GALLO |
| Match por `descricao` | Texto livre, ambíguo; SKU é canônico |
| Cache cross-batch (Redis) | Lookups em memória basta para 5k rows |

---

## Escopo

### Incluído

- ✅ Handler `processPart(rows, opts)` em `supabase/functions/dintec-process/handlers/part.ts`
- ✅ `processPartRow` com mapping/validação/matching/persistence
- ✅ `mapDintecRowToPart` em `part-mapper.ts`
- ✅ `parseBrazilianDecimal` (lida com vírgula/ponto)
- ✅ `BrandCategoryLookups` com cache em memória + DB lookup com fuzzy
- ✅ `normalizeName` helper
- ✅ Validação semântica:
  - `name` obrigatório
  - `unit_price` >= 0
  - SKU não vazio (= dintec_id)
- ✅ Lista `PROTECTED_PART_FIELDS = ['oem_codes', 'alternative_codes', 'tags']`
- ✅ Estratégia de matching dual (dintec_id → sku)
- ✅ Linking automático (sku match sem dintec_id → UPDATE link)
- ✅ Lógica is_active conservadora (S→N atualiza; N→S ignora)
- ✅ Warning em outcome se brand/category não resolvidos: `RowOutcome { decision: 'create'|'update', warnings: ['BRAND_NOT_RESOLVED', 'CATEGORY_NOT_RESOLVED'] }`
- ✅ Tipo `RowOutcome` ampliado para suportar `warnings` opcional
- ✅ Audit log granular: `dintec_part_created`, `dintec_part_updated`, `dintec_part_linked`, `dintec_part_skipped`
- ✅ Testes unitários:
  - parseBrazilianDecimal (10+ casos)
  - normalizeName
  - resolveBrandId (exact, fuzzy, miss)
  - mapper completo
- ✅ Teste integração: batch com 100 parts (mix de novos, existentes, com brand inexistente)
- ✅ Documentação `docs/dev/dintec-sync-parts.md`

### Excluído

- ❌ Autocriação de brand/category ausente (Owner faz manual)
- ❌ Sync de estoque (`crm.parts.stock_quantity` não existe ainda — Onda futura)
- ❌ Sync de OEM codes (não vem do DINTEC)
- ❌ Sync de applications/compatibilidade (PRD-016 — manual no GALLO)
- ❌ Reativação automática de parts inativas
- ❌ Detecção de SKU duplicado (constraint do DB já barra)
- ❌ Bulk operations (UPDATE in batch) — performance MVP suficiente

---

## Requisitos Funcionais

### Parser Decimal

- **RF-001:** `parseBrazilianDecimal(raw)` em `helpers/decimal.ts`:
  - Aceita "125,90", "125.90", "1.250,90", "1,250.90"
  - Detecta separador decimal pelo último símbolo presente
  - Retorna `number` ou `null` (não-parseável)
- **RF-002:** Testes cobrindo: vírgula simples, ponto simples, br thousands+decimal, us thousands+decimal, vazio, lixo.

### Mapper

- **RF-010:** `mapDintecRowToPart(row, storeId, lookups)`:
  - `dintec_id` ← `r.codigo`
  - `sku` ← `r.codigo` (mesmo valor)
  - `name` ← `r.descricao.trim()`
  - `brand_id` ← `await lookups.resolveBrandId(r.marca)` (pode ser null)
  - `category_id` ← `await lookups.resolveCategoryId(r.categoria)` (pode ser null)
  - `unit_price` ← `parseBrazilianDecimal(r.preco_venda) ?? 0`
  - `unit_cost` ← `parseBrazilianDecimal(r.preco_custo) ?? null`
  - `weight_kg` ← `parseBrazilianDecimal(r.peso_kg) ?? null`
  - `is_active` ← `r.ativo !== 'N'`
  - Campos protegidos: omitidos do input (UPDATE preserva)

### BrandCategoryLookups

- **RF-020:** Classe com 2 caches (`brandCache`, `categoryCache`).
- **RF-021:** `resolveBrandId(rawName)`:
  - 1. Match exato case-insensitive (`ilike` SQL)
  - 2. Fuzzy via `normalizeName` (sem espaços, sem acentos)
  - 3. Não achou → null
- **RF-022:** `resolveCategoryId` análogo.
- **RF-023:** Cache em memória para todo batch (evita N queries de DB).
- **RF-024:** Preload opcional: no início do batch, carrega todas brands/categories em memória.

### Validação Semântica

- **RF-030:** `validatePart(input)`:
  - `name` não vazio → `MISSING_NAME`
  - `unit_price` >= 0 → `INVALID_PRICE`
  - `sku` não vazio → implícito (codigo obrigatório no CSV layout)
- **RF-031:** Erro → `RowOutcome { decision: 'error' }`.

### Matching

- **RF-040:** `findExistingPart(input)`:
  - 1. Query `(store_id, dintec_id)` — match forte
  - 2. Fallback `(store_id, sku)` AND `dintec_id IS NULL`
  - 3. Retorna Part ou null
- **RF-041:** Linking via sku audit `dintec_part_linked`.

### Campos Protegidos + Update Lógica

- **RF-050:** `PROTECTED_PART_FIELDS = ['oem_codes', 'alternative_codes', 'tags']`.
- **RF-051:** UPDATE monta payload apenas com campos DINTEC (não protegidos), preserva existing nos demais.
- **RF-052:** `dintec_id`, `last_dintec_sync_at`, `dintec_version_hash` sempre atualizados.

### Lógica is_active

- **RF-060:** Mesma de customer (PRD-124 RF-050): DINTEC ativo `S`→`true` para parts novas/atualização; `N`→`false`; reativação só manual.

### Hash

- **RF-070:** `dintec_version_hash` sobre: `name`, `brand_id`, `category_id`, `unit_price`, `unit_cost`, `weight_kg`, `is_active`. Não inclui campos protegidos.

### Warnings

- **RF-080:** `RowOutcome.warnings: string[]` opcional. Códigos:
  - `BRAND_NOT_RESOLVED` — peça criada/atualizada sem brand_id
  - `CATEGORY_NOT_RESOLVED` — idem
  - `UNIT_PRICE_ZERO` — `unit_price=0` (DINTEC pode ter mandado vazio; suspeito)
- **RF-081:** Owner vê warnings no detalhe do batch (PRD-122 UI estendida).

### Detecção Manual Edit

- **RF-090:** Mesmo padrão do PRD-124 RF-070. PRD-126 amplia.

### Audit

- **RF-100:** Granular:
  - `dintec_part_created`
  - `dintec_part_updated` (com changes diff)
  - `dintec_part_linked` (sku match sem dintec_id)
  - `dintec_part_skipped` (unchanged ou locked)
  - Warnings agregadas em `dintec_batch_processed` (PRD-123)

### Testes

- **RF-110:** Unitários:
  - parseBrazilianDecimal: 10+ casos (formatos diversos)
  - normalizeName: acentos, hyphens, spaces
  - resolveBrandId: exact match, fuzzy match, miss
  - mapper full row
- **RF-111:** Integração: batch 100 parts incluindo:
  - 80 novos sem problemas
  - 10 com brand inexistente (warning)
  - 5 já existentes com sku match (linkados)
  - 5 já existentes com hash igual (skip)

### Documentação

- **RF-120:** `docs/dev/dintec-sync-parts.md`:
  - Fluxograma
  - Decimais brasileiros explicados
  - Resolução brand/category com exemplos
  - Campos protegidos
  - Warnings esperados

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** 5k parts em < 10min (com cache preload).
- **RNF-002 (Catálogo limpo):** Zero duplicação após sync; linking funciona.
- **RNF-003 (Preservação):** OEM codes, applications nunca perdidos.
- **RNF-004 (Auditabilidade):** Warnings em outcome + audit log para investigação.
- **RNF-005 (Decimais robustos):** 125,90 e 1.250,90 sempre corretos.

---

## Critérios de Aceitação

### RF-001: Decimal Brasileiro

```gherkin
DADO raw = "125,90"
QUANDO parseBrazilianDecimal
ENTÃO retorna 125.90

DADO raw = "1.250,90"
QUANDO parse
ENTÃO retorna 1250.90

DADO raw = "lixo"
QUANDO parse
ENTÃO retorna null
```

### RF-021: Brand Match Fuzzy

```gherkin
DADO crm.brands com 'Mann Filter'
  E CSV com r.marca = "MANN-FILTER"
QUANDO resolveBrandId
ENTÃO normalizeName("MANN-FILTER") == "mannfilter"
  E normalizeName("Mann Filter") == "mannfilter"
  E match retorna o id correto

DADO CSV com r.marca = "FILTROS-XYZ" (não existe)
QUANDO resolveBrandId
ENTÃO retorna null
  E RowOutcome inclui warning 'BRAND_NOT_RESOLVED'
```

### RF-051: Preservação OEM Codes

```gherkin
DADO part P1 com oem_codes=['LB6175', 'P553571'] adicionados manualmente
  E CSV manda UPDATE com novo preço
QUANDO processPart UPDATE
ENTÃO preço é atualizado
  E oem_codes PERMANECE ['LB6175', 'P553571']
```

### RF-040: Link por SKU

```gherkin
DADO part P1 no GALLO com sku='P001', dintec_id=null
  E CSV manda dintec_id='P001' (codigo == sku)
QUANDO processPart
ENTÃO findExistingPart encontra P1 via sku
  E UPDATE: P1.dintec_id='P001'
  E audit dintec_part_linked
  E NÃO duplica
```

---

## Fases de Implementação

### Fase 1 — Decimal + Mapper (1 dia)
- parseBrazilianDecimal + testes
- mapper com lookups

### Fase 2 — Lookups (1 dia)
- BrandCategoryLookups com cache
- Preload opcional
- normalizeName

### Fase 3 — Handler + Warnings (1 dia)
- processPartRow integrado
- Warnings em RowOutcome
- Audit hooks

### Fase 4 — Testes + Docs (1 dia)
- Testes integração 100 parts
- docs/dev/dintec-sync-parts.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-123 (engine), PRD-124 (padrão), PRD-101 (parts + brands + categories), PRD-122 (CSV layout part)
- **Bloqueia:** PRD-126 (reconciliation cobre lock); PRD futuros de sync de estoque/preço
- **Decisões Pendentes:** autocriação brand confirmado off (sugerido); fuzzy threshold (atual: normalização total — sem Levenshtein); preload brands/categories no início (sugerido sim para perf).

---

## Considerações de Segurança

- OEM codes (valor comercial) jamais sobrescritos
- Audit log de UPDATE de preço (sensível)
- Resolução de brand inexistente não cria registro órfão (peça vai com brand_id=null + warning)
- service_role em Edge Function apenas

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.5; CHANGELOG; renomear `PRD-125-dintec-sync-parts_DONE.md`.

| Princípio | Descrição |
|-----------|-----------|
| **Decimal brasileiro** | Vírgula é decimal MVP padrão |
| **OEM intocável** | Enriquecimento manual respeitado |
| **No autocriação** | Brand/category curados pelo Owner |
| **Warnings visíveis** | brand não resolvida não falha; alerta |
| **SKU = dintec_id** | Convenção; matching dual via sku |

| ❌ Evitar |
|-----------|
| Autocriar brand inexistente |
| Sobrescrever oem_codes |
| Fuzzy agressivo (Levenshtein) |
| Decimal ingênuo (parseFloat puro falha em "1.250,90") |
| Duplicar peça (sempre tentar link via sku) |

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
