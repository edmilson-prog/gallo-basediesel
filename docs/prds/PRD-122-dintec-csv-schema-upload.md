# PRD-122: DINTEC CSV Schema + Upload UI

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/dintec/csv/` + `src/features/dintec-import/`_ |
| **Objetivo** | Especificar layout canônico esperado dos CSVs DINTEC (customer, part, order, order_item), implementar `CsvDintecProvider` que faz parsing (papaparse), detecção automática de encoding latin-1↔utf-8, normalização de chaves (snake_case) e validação estrutural. Entregar UI `/app/configuracoes/dintec-import` para Owner/Manager fazer upload de batches, ver histórico (nova tabela `crm.dintec_import_batches`) e iniciar processamento (delegado ao PRD-123) |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — sem upload, nada entra no sistema |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-121 (interface — implementa); PRD-101 (`dintec_id` em parts/customers/orders + nova tabela batches); PRD-106 (Storage bucket `imports-temp`); PRD-103 (RLS — Owner/Manager only); PRD-123 (Engine consome batches uploadados); PRD-110 (audit/observability) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Provider em TS estrito; UI em React + shadcn; nova migration aditiva |

### Critérios de Complexidade

> **Justificativa de Alta:** layouts CSV DINTEC têm peculiaridades inéditas (latin-1 encoding, números brasileiros com vírgula decimal, datas dd/mm/yyyy, campos com aspas inconsistentes), e o cliente pode mudar layout sem aviso. Detecção automática de encoding + delimiter resiliente. UI precisa orientar Owner sem confundir (preview, validação inline, mensagens em pt-BR). Erro no parsing causa import corrompido — efeito cascata em PRDs 123-126. Schema preciso documentado é essencial.

---

## Contexto do Problema

PRD-121 entregou a interface; este PRD entrega:
1. **Layout canônico documentado** — Owner sabe exatamente o que exportar do DINTEC
2. **Provider CSV real** — implementação que parseia + normaliza
3. **UI de upload** — Owner navega, escolhe arquivo, sobe, vê histórico

Sem layout claro, cada upload vira aventura. Sem UI, dependemos de scripts CLI. Sem histórico, perdemos rastreabilidade.

---

## Conceito da Solução

### Layouts Canônicos (CSV)

Especificação rigorosa, documentada em `docs/dev/dintec-csv-layouts.md`. Owner deve exportar do DINTEC respeitando estas colunas (em qualquer ordem; encoding latin-1 ou utf-8; separador `;` ou `,`):

#### customer.csv

```
codigo;razao_social;cpf_cnpj;tipo_pessoa;endereco;cidade;uf;cep;telefone;email;data_cadastro
0001;Auto Peças Silva LTDA;12.345.678/0001-90;J;Rua A, 123;Frederico Westphalen;RS;98400-000;5599999-9999;contato@silva.com;15/03/2018
```

| Coluna | Tipo | Obrigatório | Notas |
|--------|------|-------------|-------|
| `codigo` | string | Sim | dintec_id; chave única no DINTEC |
| `razao_social` | string | Sim | name do customer |
| `cpf_cnpj` | string | Não | normalizar removendo pontuação |
| `tipo_pessoa` | char | Sim | F (física) / J (jurídica) → mapeia customer_type |
| `endereco` | string | Não | rua + número (vai no jsonb `address`) |
| `cidade` | string | Não | |
| `uf` | string | Não | sigla 2 chars |
| `cep` | string | Não | normalizar |
| `telefone` | string | Não | |
| `email` | string | Não | |
| `data_cadastro` | date | Não | dd/mm/yyyy |

#### part.csv

```
codigo;descricao;codigo_fabricante;marca;categoria;preco_venda;preco_custo;estoque;peso_kg;ativo
P001;FILTRO ÓLEO LB6175;LB6175;MANN-FILTER;FILTROS;125,90;78,40;42;0,500;S
```

| Coluna | Tipo | Obrigatório | Notas |
|--------|------|-------------|-------|
| `codigo` | string | Sim | dintec_id da peça (também é `sku` no GALLO) |
| `descricao` | string | Sim | `name` da parte |
| `codigo_fabricante` | string | Não | OEM code |
| `marca` | string | Não | nome da brand — resolver match em `crm.brands` |
| `categoria` | string | Não | nome da category |
| `preco_venda` | decimal | Sim | vírgula como decimal (`125,90`) |
| `preco_custo` | decimal | Não | `unit_cost` |
| `estoque` | int | Não | quantidade |
| `peso_kg` | decimal | Não | |
| `ativo` | char | Não | S/N → maps to `is_active` |

#### order.csv

```
numero_pedido;codigo_cliente;data;valor_total;forma_pagamento;status;nf_numero;nf_chave
P12345;0001;25/05/2026;1547,80;BOLETO;FATURADO;000123;3525...
```

#### order_item.csv

```
numero_pedido;codigo_peca;quantidade;preco_unitario;desconto_pct
P12345;P001;2;125,90;5,0
```

### Encoding Detection

```typescript
// src/providers/dintec/csv/encoding.ts
export function detectEncoding(buffer: Uint8Array): 'utf-8' | 'latin-1' {
  // 1. Procura BOM UTF-8
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return 'utf-8'
  
  // 2. Tenta decodificar como UTF-8 strict; se não tem bytes inválidos, é utf-8
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer.slice(0, 8192))
    return 'utf-8'
  } catch {
    return 'latin-1'
  }
}
```

### Delimiter Detection

`papaparse` já tem `delimiter: ""` que auto-detecta. Validar manualmente quando autodetect falha (apenas uma coluna detectada).

### Normalização de Chaves

```
"Razão Social"   → "razao_social"
"CÓDIGO"         → "codigo"
"  CPF/CNPJ  "   → "cpf_cnpj"
```

Acentos removidos, espaços viram `_`, caracteres especiais limpos, lowercase.

### Tabela Nova `crm.dintec_import_batches`

Migration aditiva:

```sql
CREATE TABLE crm.dintec_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES crm.stores(id),
  entity_kind text NOT NULL CHECK (entity_kind IN ('customer','part','order','order_item','price','stock')),
  storage_bucket text NOT NULL,           -- 'imports-temp'
  storage_path text NOT NULL,             -- 'dintec/<timestamp>/<filename>.csv'
  original_filename text NOT NULL,
  file_size_bytes integer NOT NULL,
  detected_encoding text,
  detected_delimiter text,
  total_rows integer,
  
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','validating','validated','validation_failed',
                       'processing','completed','failed','cancelled')),
  validation_result jsonb,                -- DintecValidationResult
  processing_summary jsonb,               -- counts: created, updated, skipped, errored
  
  uploaded_by uuid NOT NULL REFERENCES crm.sellers(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON crm.dintec_import_batches (store_id, entity_kind, created_at DESC);
ALTER TABLE crm.dintec_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.dintec_import_batches FORCE ROW LEVEL SECURITY;

-- RLS (estende PRD-103): Owner/Manager da store podem CRUD
CREATE POLICY "dintec_batches_manage" ON crm.dintec_import_batches
  FOR ALL TO authenticated
  USING (
    store_id = crm.current_store_id()
    AND crm.has_any_role(ARRAY['owner','manager'])
  )
  WITH CHECK (
    store_id = crm.current_store_id()
    AND crm.has_any_role(ARRAY['owner','manager'])
  );
```

### Fluxo de Upload

```
[Owner abre /app/configuracoes/dintec-import]
   │
   ├── tela mostra histórico (últimos 20 batches)
   ├── botão "Novo Import" → modal
   │
   └── Modal:
       1. Select entity_kind (customer, part, order, order_item)
       2. Drag-and-drop ou click para selecionar CSV
       3. Frontend lê arquivo, detecta encoding, parse parcial (primeiras 5 linhas)
       4. PREVIEW: mostra colunas detectadas + 5 primeiras linhas em tabela
       5. Owner confirma "Subir e validar"
       6. Upload via storage.upload (bucket: imports-temp, path: dintec/<storeId>/<timestamp>/<filename>)
       7. INSERT em crm.dintec_import_batches com status='uploaded'
       8. Trigger validação (Edge Function — PRD-123 fase 1) — atualiza status para 'validated' ou 'validation_failed'
       9. Tela atualiza via Realtime
       10. Owner vê resultado da validação
       11. Se válido: botão "Processar" (chama PRD-123 engine)
       12. Se inválido: lista de erros em pt-BR para Owner corrigir e re-uploadar
```

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Excel direto (.xlsx) | DINTEC exporta CSV nativo; suportar XLSX adiciona dep grande (xlsx lib) sem ganho |
| Layout flexível (mapeamento de colunas no upload) | Mais UX complexa; layout canônico documentado é mais simples |
| Upload via CLI | Owner não é técnico; UI necessária |
| Upload + processamento sincrono | Bloqueia UI; status + Realtime resolve |
| Sem histórico (apenas processar e descartar) | Owner precisa rastrear "esse erro veio do import de 25/05" |

---

## Escopo

### Incluído

- ✅ Migration aditiva `crm.dintec_import_batches` + RLS
- ✅ Documento `docs/dev/dintec-csv-layouts.md` com schema de cada entity_kind
- ✅ `CsvDintecProvider` em `src/providers/dintec/csv/` implementando `IDintecImportProvider`
- ✅ Detecção de encoding (UTF-8 / latin-1) e delimiter (`;` / `,`)
- ✅ Normalização de chaves (snake_case, sem acentos)
- ✅ Validação estrutural (RF-130): colunas obrigatórias presentes, encoding válido, ao menos 1 linha
- ✅ Tela `/app/configuracoes/dintec-import` (Owner/Manager):
  - Lista de batches (paginada, filtros por status/entity)
  - Detalhe de batch (clicável) com validation_result + processing_summary
  - Modal "Novo Import" com preview
- ✅ Componente `CsvFilePreview` reutilizável
- ✅ Upload usa `storage.upload` (PRD-106 — bucket `imports-temp`)
- ✅ Realtime no estado do batch (PRD-105 — Owner vê status atualizar live)
- ✅ Audit log: `dintec_batch_uploaded`
- ✅ Edge Function `dintec-validate` (lightweight) que apenas valida estrutura ao receber upload — invoca provider.validateStructure
- ✅ Testes: parsing CSV exemplo de cada entity_kind, detecção de encoding, normalização de chaves, RLS
- ✅ Seeds: nenhum (batches são criados pelo Owner em uso real)

### Excluído

- ❌ Processamento semântico / persistência em tabelas finais (PRD-123)
- ❌ Sync entre entity_kinds (PRDs 124-126)
- ❌ Suporte a XLSX (apenas CSV)
- ❌ Mapeamento custom de colunas (layout é canônico)
- ❌ Reagendamento automático (Owner dispara manualmente)
- ❌ Comparação automática entre batches (Owner faz visualmente)
- ❌ Notificação push de batch concluído (Realtime cobre na tela; alerta email opcional futuro)

---

## Requisitos Funcionais

### Schema

- **RF-001:** Migration cria `crm.dintec_import_batches` conforme conceito.
- **RF-002:** RLS: Owner/Manager da store gerenciam; vendedor sem acesso.
- **RF-003:** Trigger `updated_at` (PRD-101 RF-100).

### Layouts

- **RF-010:** Documento `docs/dev/dintec-csv-layouts.md` especifica para cada entity_kind:
  - Colunas obrigatórias e opcionais (lista)
  - Tipo esperado por coluna
  - Notas de normalização (datas, decimais, encoding)
  - Exemplos completos
- **RF-011:** Layouts cobrem: `customer`, `part`, `order`, `order_item`. `price` e `stock` documentados como reservados (não implementados MVP).

### CsvDintecProvider

- **RF-020:** Classe `CsvDintecProvider` em `src/providers/dintec/csv/CsvDintecProvider.ts` implementa `IDintecImportProvider`.
- **RF-021:** `providerName = 'csv'`; capabilities: `{ supportsIncremental: false, supportsOrderImport: true, encodingDetection: true, maxBatchSizeMB: 50 }`.
- **RF-022:** `loadBatch(source)`:
  - `source.kind === 'storage'`: baixa do bucket via Edge Function (precisa service_role para acessar imports-temp privado)
  - `source.kind === 'inline'`: usa csvText direto (útil para test)
  - Detecta encoding, delimiter
  - Parse via papaparse
  - Normaliza chaves do header
  - Retorna `DintecImportBatch` com `rows[]`
- **RF-023:** `validateStructure(batch)`:
  - Verifica colunas obrigatórias presentes para o `entityKind`
  - Verifica ao menos 1 row
  - Verifica encoding válido (sem caracteres replacement)
  - Retorna `DintecValidationResult`
- **RF-024:** `healthCheck()` sempre `healthy` (sem dependência externa).

### Detecção de Encoding

- **RF-030:** Função `detectEncoding(buffer)` em `encoding.ts`:
  - Verifica BOM UTF-8
  - Tenta decode strict UTF-8 nos primeiros 8KB
  - Falha → assume latin-1
- **RF-031:** Conversão para UTF-8 usando `TextDecoder('latin-1')` quando necessário.

### Detecção de Delimiter

- **RF-040:** Papaparse `delimiter: ''` autodetect. Se autodetect retorna `null`: fallback para `;` (DINTEC pt-BR padrão). Log warning.

### Normalização de Chaves

- **RF-050:** Função `normalizeKey(raw)`:
  - lowercase
  - Remove acentos via `String.normalize('NFD').replace(/\p{M}/gu, '')`
  - Substitui espaços e caracteres especiais por `_`
  - Colapsa `__` em `_`
  - Trim trailing/leading `_`

### Validação Estrutural

- **RF-060:** Para cada entity_kind, lista de colunas obrigatórias documentada em código:
  - `customer`: `codigo`, `razao_social`, `tipo_pessoa`
  - `part`: `codigo`, `descricao`, `preco_venda`
  - `order`: `numero_pedido`, `codigo_cliente`, `data`, `valor_total`
  - `order_item`: `numero_pedido`, `codigo_peca`, `quantidade`, `preco_unitario`
- **RF-061:** Erros com código semântico (`MISSING_COLUMN`, `EMPTY_FILE`, `ENCODING_INVALID`) e mensagem em pt-BR.

### Edge Function `dintec-validate`

- **RF-070:** `supabase/functions/dintec-validate/index.ts`:
  1. Recebe `{ batchId }`
  2. Lê `crm.dintec_import_batches` (service_role)
  3. Baixa arquivo do Storage
  4. Provider.loadBatch + validateStructure
  5. UPDATE `dintec_import_batches` com `validation_result`, `detected_encoding`, `detected_delimiter`, `total_rows`, status `validated` ou `validation_failed`
  6. Audit log

### UI `/app/configuracoes/dintec-import`

- **RF-080:** Tela protegida (RLS + guarda de rota Owner/Manager).
- **RF-081:** Lista de batches (tabela): data, entity_kind, filename, status (badge), uploaded_by, ações.
- **RF-082:** Botão "Novo Import" → modal.
- **RF-083:** Modal de upload:
  - Select entity_kind
  - Drag-and-drop ou input file
  - Preview (5 primeiras linhas + colunas detectadas)
  - Botão "Subir"
- **RF-084:** Upload via `storage.upload('imports-temp', path, file)`.
- **RF-085:** INSERT em batches → trigger Edge Function dintec-validate.
- **RF-086:** Realtime (PRD-105) propaga update de status — Owner vê live "Validando..." → "Validado" / "Falha".
- **RF-087:** Detalhe do batch:
  - Resumo (entity, total_rows, encoding, delimiter)
  - Erros de validação em pt-BR (se validation_failed)
  - Botão "Processar" se validated (chama PRD-123 engine — neste PRD só botão stub que invoca função TODO no PRD-123)
  - Botão "Cancelar" se uploaded/validated não-processado
- **RF-088:** Componente `CsvFilePreview` reutilizável: aceita File, parse parcial, mostra tabela read-only.

### Audit

- **RF-090:** Audit log na ação de upload: `actor_id=ctx.sellerId`, `action='dintec_batch_uploaded'`, `entity_type='dintec_import_batch'`, `payload={ entityKind, filename, fileSize, totalRows }`.

### Testes

- **RF-100:** Testes unitários:
  - normalizeKey: vários casos (acentos, espaços, especiais)
  - detectEncoding: utf-8 com BOM, utf-8 sem BOM, latin-1
  - parsing: CSV de cada entity_kind retorna rows corretas
  - validateStructure: missing column → error com código correto
- **RF-101:** Teste de integração: upload via UI, batch criado, validação rodada, status atualiza via Realtime.

### Documentação

- **RF-110:** `docs/dev/dintec-csv-layouts.md` — layouts completos com exemplos.
- **RF-111:** `docs/dev/dintec-upload-ui.md` — guia operacional Owner: como exportar do DINTEC, como subir, como interpretar erros comuns.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Parse de CSV 50MB em < 10s no browser para preview parcial; backend (Edge Function) parse completo em < 30s.
- **RNF-002 (Encoding robustness):** Acentos pt-BR (`ç`, `ã`, `é`) preservados corretamente em ambos encodings.
- **RNF-003 (UX):** Mensagens de erro em pt-BR amigáveis (sem stack ou códigos crus).
- **RNF-004 (Segurança):** Apenas Owner/Manager faz upload; RLS + guarda de rota; bucket `imports-temp` privado.
- **RNF-005 (Tamanho):** Limite 50MB por arquivo (config bucket PRD-106).
- **RNF-006 (Retenção):** Arquivos em `imports-temp` removidos após 30 dias (job PRD-106).

---

## Critérios de Aceitação

### RF-022: Parse com Encoding Latin-1

```gherkin
DADO um CSV exportado do DINTEC em latin-1 com "Razão Social" no header
QUANDO CsvDintecProvider.loadBatch processa
ENTÃO detecta encoding latin-1
  E normaliza chave para 'razao_social'
  E preserva acentos nos valores ("Auto Peças Ltda")
```

### RF-060: Validação Estrutural

```gherkin
DADO um CSV de customer SEM a coluna 'tipo_pessoa'
QUANDO validateStructure é chamado
ENTÃO retorna { valid: false, errors: [{ code: 'MISSING_COLUMN', field: 'tipo_pessoa', message: 'Coluna obrigatória tipo_pessoa não encontrada' }] }

DADO CSV vazio (apenas header)
QUANDO valida
ENTÃO erro EMPTY_FILE
```

### RF-083 + RF-086: Upload com Realtime

```gherkin
DADO Owner em /app/configuracoes/dintec-import
QUANDO seleciona customer.csv (válido) e clica Subir
ENTÃO upload via storage acontece
  E batch INSERT em crm.dintec_import_batches com status='uploaded'
  E Edge Function dintec-validate é triggered
  E em < 5s status muda para 'validated' via Realtime
  E linha na tabela reflete

DADO CSV inválido (sem coluna obrigatória)
QUANDO upload
ENTÃO status='validation_failed' aparece via Realtime
  E lista de erros aparece no detalhe do batch
```

### RF-080: Permissão Owner/Manager

```gherkin
DADO vendedor (não Owner/Manager) tenta acessar /app/configuracoes/dintec-import
QUANDO autenticado
ENTÃO recebe 403 (RLS + guarda de rota)
```

---

## Fases de Implementação

### Fase 1 — Schema + Layouts Doc (1 dia)
- Migration crm.dintec_import_batches
- docs/dev/dintec-csv-layouts.md

### Fase 2 — Provider CSV (2 dias)
- CsvDintecProvider
- encoding/delimiter detection
- normalizeKey
- validateStructure
- Testes unitários

### Fase 3 — Edge Function Validate (1 dia)
- supabase/functions/dintec-validate
- Audit log

### Fase 4 — UI Upload (2 dias)
- /app/configuracoes/dintec-import (lista + detalhe)
- Modal de upload + preview
- Integração Realtime
- Componente CsvFilePreview

### Fase 5 — Docs + E2E (1 dia)
- docs/dev/dintec-upload-ui.md
- E2E test (upload mock CSV, validar status flow)
- `_DONE`

---

## Dependências

- **Depende de:** PRD-121 (interface), PRD-101 (schema base), PRD-103 (RLS), PRD-106 (Storage), PRD-105 (Realtime), PRD-107 (Auth Owner/Manager)
- **Bloqueia:** PRD-123 (engine processa estes batches)
- **Decisões Pendentes:** Layout exato confirmado com cliente (sugerido — Edmilson confirma colunas reais de export DINTEC antes de implementar); separator `;` vs `,` (autodetect); cap de 50MB ok? (sugerido sim).

---

## Considerações de Segurança

- Bucket `imports-temp` privado; signed URLs com TTL curto se necessário expor
- RLS estrito: apenas Owner/Manager
- Audit log de toda upload
- Validação client + Edge Function (defense-in-depth)
- Arquivo deletado após 30d (retenção PRD-106)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.2; CHANGELOG; renomear `PRD-122-dintec-csv-schema-upload_DONE.md`; layouts documentados validados com Owner.

| Princípio | Descrição |
|-----------|-----------|
| **Layout canônico** | Owner exporta no formato; sistema não adapta |
| **Encoding robusto** | Acentos pt-BR funcionam |
| **Preview antes de subir** | Owner valida visualmente |
| **Realtime no status** | Sem polling/refresh |

| ❌ Evitar |
|-----------|
| Aceitar XLSX (CSV only) |
| Mapeamento custom de colunas |
| Skipar validação estrutural |
| Mensagens de erro em inglês ou códigos crus |

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
