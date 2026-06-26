# PRD-126: DINTEC Reconciliation + Conflict Resolution

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/features/dintec-reconciliation/` + Edge Function_ |
| **Objetivo** | Tratar os `RowOutcome { decision: 'skip_locked' }` produzidos pelos handlers (PRDs 124, 125) — outcomes onde DINTEC quer atualizar mas há edição manual no GALLO. Tela `/app/configuracoes/dintec-import/<batchId>/conflicts` onde Owner/Manager revisa **por linha, campo a campo**, com 3 ações: **manter local**, **aceitar DINTEC**, **merge custom**. Detecção aprimorada de edição manual via análise de audit log (não só timestamps). Audit detalhado de cada resolução |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | P1 — sem isto, skip_locked acumulam e DINTEC sai de sincronia gradualmente; mas go-live aceita resolução manual sem UI no MVP |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-123 (engine — gera skip_locked); PRD-124 (customer sync — protected fields); PRD-125 (parts sync); PRD-101 (`crm.audit_logs` para análise); PRD-122 (UI extends) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | UI em `src/features/dintec-reconciliation/`; Edge Function `supabase/functions/dintec-resolve-conflict/` |

### Critérios de Complexidade

> **Justificativa de Alta:** UX de resolução por campo é não-trivial: Owner precisa entender "valor atual no GALLO" vs "valor do DINTEC" para CADA campo divergente em cada linha. Detecção aprimorada de edição manual via audit log exige queries cuidadosas. Lógica de merge personalizado (Owner decide campo a campo). Audit pósresolução para rastreabilidade futura. Erro causa Owner aceitar mudança equivocada ou rejeitar mudança correta — ambos caros.

---

## Contexto do Problema

PRD-124 e PRD-125 introduziram `skip_locked` para evitar sobrescrever edição manual. Mas:
- Sem UI, esses outcomes ficam pendurados no `processing_summary` — visíveis mas sem ação
- Próxima sync acumula mais conflitos
- Owner não tem ferramenta para resolver

Este PRD:
1. Detecta com mais precisão se há edição manual (audit log analysis vs timestamp simples)
2. Apresenta interface clara para resolução
3. Aplica resolução com idempotência e audit
4. Engine futuro respeita resoluções (não pede de novo)

---

## Conceito da Solução

### Detecção Aprimorada de Edição Manual

PRDs 124/125 usaram heurística simples (`updated_at > last_dintec_sync_at + 5s`). Este PRD substitui por análise do audit log:

```typescript
// supabase/functions/dintec-resolve-conflict/edit-detector.ts
async function detectFieldEdits(entityType, entityId, sinceTimestamp): Promise<EditedField[]> {
  const logs = await db.audit_logs
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .gte('created_at', sinceTimestamp)
    .in('actor_type', ['seller'])  // só edições humanas, não integrações
    .order('created_at', { ascending: false })
  
  // Cada log tem payload com 'changes' (diff feito naquela atualização)
  const editedFields = new Set<string>()
  for (const log of logs) {
    if (log.payload?.changes) {
      Object.keys(log.payload.changes).forEach(k => editedFields.add(k))
    }
  }
  return Array.from(editedFields).map(field => ({
    field,
    editedBy: logs[0].actor_id,
    editedAt: logs[0].created_at,
  }))
}
```

Vantagem: identifica exatamente **quais campos** foram editados manualmente (mais granular que "registro inteiro foi tocado").

### Tela de Conflitos

```
/app/configuracoes/dintec-import/<batchId>/conflicts

Resumo:
  Batch processado em 25/05/2026
  Total de conflitos: 12 (de 1000 rows)

Lista de conflitos:
  ┌─────────────────────────────────────────────────┐
  │ Customer C001 - "Auto Peças Silva LTDA"        │
  │ 2 campos em conflito                            │
  │                                                  │
  │ campo: email                                     │
  │   GALLO (atual):  contato@silva.com             │
  │   DINTEC manda:   suprimentos@silva.com.br      │
  │   Editado em GALLO por João em 20/05            │
  │   [ Manter local ] [ Aceitar DINTEC ]            │
  │                                                  │
  │ campo: phone                                     │
  │   GALLO (atual):  +5599888-7766                 │
  │   DINTEC manda:   +5599888-9999                 │
  │   Editado em GALLO por Maria em 22/05            │
  │   [ Manter local ] [ Aceitar DINTEC ]            │
  │                                                  │
  │ [ Aplicar Resoluções ]                          │
  └─────────────────────────────────────────────────┘
```

Owner decide por campo. Submit aplica tudo numa transação.

### Ações de Resolução

| Ação | Efeito |
|------|--------|
| **Manter local** | Não atualiza no GALLO. Marca campo como "permanently_locked" → engine futuro nem sugere mudança |
| **Aceitar DINTEC** | UPDATE no GALLO com valor DINTEC. Reseta lock |
| **Merge custom** (avançado) | Owner digita valor próprio (não DINTEC, não atual) — útil se Owner sabe valor correto que não está em nenhum dos dois |

### Sinalização Persistente (Permanently Locked)

Adicionar à `crm.customers` (e `crm.parts`) coluna:
- `dintec_locked_fields text[] DEFAULT '{}'` — lista de campos que Owner decidiu manter local

Engine (PRD-123/124/125) consulta antes de marcar skip_locked: se campo já está em `dintec_locked_fields`, decision='skip_locked' silencioso (sem aparecer em conflicts UI — já foi resolvido).

### Edge Function `dintec-resolve-conflict`

```typescript
POST /functions/v1/dintec-resolve-conflict
Body: {
  batchId,
  resolutions: [
    {
      entityType: 'customer',
      entityId: 'C1-uuid',
      decisions: {
        email: { action: 'accept_dintec', dintecValue: 'novo@email.com' },
        phone: { action: 'keep_local' },
        name: { action: 'merge_custom', customValue: 'Novo Nome Custom' }
      }
    },
    // ... outras linhas
  ]
}
```

Edge Function:
1. Para cada resolução, busca entity atual
2. Aplica decisões:
   - `accept_dintec` → UPDATE field com `dintecValue`; remove field de `dintec_locked_fields`
   - `keep_local` → mantém field; ADD field em `dintec_locked_fields` (permanente)
   - `merge_custom` → UPDATE field com `customValue`; ADD em `dintec_locked_fields` (porque é decisão manual)
3. Atualiza `last_dintec_sync_at` para não reativar conflito
4. Audit log granular por decisão: `dintec_conflict_resolved`

### Persistência de Conflitos

Nova tabela `crm.dintec_conflicts`:
```sql
CREATE TABLE crm.dintec_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES crm.dintec_import_batches(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field_name text NOT NULL,
  local_value jsonb,
  dintec_value jsonb,
  edited_by uuid REFERENCES crm.sellers(id),
  edited_at timestamptz,
  resolved boolean NOT NULL DEFAULT false,
  resolved_action text CHECK (resolved_action IN ('keep_local', 'accept_dintec', 'merge_custom')),
  resolved_value jsonb,
  resolved_by uuid REFERENCES crm.sellers(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON crm.dintec_conflicts (batch_id, resolved);
ALTER TABLE crm.dintec_conflicts ENABLE ROW LEVEL SECURITY;
-- RLS: Owner/Manager da store
```

Engine grava conflito ao detectar `skip_locked`. Owner resolve via UI. Histórico preservado.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Resolução em lote ("aceitar tudo DINTEC") | Perigoso; Owner não revisa caso a caso |
| Sem `dintec_locked_fields` persistente | Próxima sync repete mesmo conflito (loop sem fim) |
| Apenas timestamp para detectar edit | Imprecisão; audit log dá granularidade por campo |
| Resolução automática por regra (e-mail sempre DINTEC) | Cliente decidir; auto-regra esconde decisão |
| Sem tela dedicada (resolve via DB direto) | Owner não-técnico |
| Audit log analysis no engine (em vez de PRD dedicado) | Adiciona latência ao engine; melhor pré-computar |

---

## Escopo

### Incluído

- ✅ Migration aditiva: `crm.dintec_locked_fields text[] DEFAULT '{}'` em customers e parts
- ✅ Nova tabela `crm.dintec_conflicts` + RLS
- ✅ Edge Function `dintec-detect-conflicts` que pós-processa batch:
  - Para cada `skip_locked` outcome, faz audit log analysis → identifica campos editados manualmente
  - INSERT em `crm.dintec_conflicts` para cada campo divergente
- ✅ Atualização nos handlers (PRDs 124/125) para registrar conflicts ao detectar lock
- ✅ Tela `/app/configuracoes/dintec-import/<batchId>/conflicts`:
  - Lista de conflitos agrupados por entity
  - Card por entity com lista de campos
  - 3 botões/ações por campo (manter local, aceitar DINTEC, merge custom)
  - Botão "Aplicar Resoluções" no topo
- ✅ Edge Function `dintec-resolve-conflict` para aplicar resoluções em batch
- ✅ Lógica de `dintec_locked_fields` (campos lockados permanentemente após `keep_local` ou `merge_custom`)
- ✅ Engine (PRD-123 reusado) consulta `dintec_locked_fields` antes de gerar skip_locked — campos já resolvidos não viram novo conflito
- ✅ Audit log estruturado:
  - `dintec_conflict_detected` (engine cria conflict)
  - `dintec_conflict_resolved` (Owner resolve, com ação e valor)
- ✅ UI de re-processamento: após resolver conflitos, opção "Re-processar batch" aparece (re-roda engine, agora respeitando resoluções)
- ✅ Testes: cenários comuns (3 conflitos, owner resolve 1 de cada forma); permissão; persistência de locked
- ✅ Documentação `docs/dev/dintec-reconciliation.md`

### Excluído

- ❌ Auto-resolução por regra (Owner sempre humano)
- ❌ Histórico longo (apenas última resolução por campo; multi-versionamento futuro)
- ❌ Notificação ao seller que editou (poderia avisar — fora de escopo MVP)
- ❌ Bulk apply ("aceitar tudo DINTEC nesta entity") — Owner decide campo a campo
- ❌ Reversão de resolução já aplicada (audit permite ver, mas desfazer manualmente)

---

## Requisitos Funcionais

### Schema

- **RF-001:** Migration aditiva: `crm.customers.dintec_locked_fields text[] NOT NULL DEFAULT '{}'`
- **RF-002:** Idem para `crm.parts`
- **RF-003:** Migration cria `crm.dintec_conflicts` conforme conceito.
- **RF-004:** RLS: SELECT/UPDATE apenas Owner/Manager da store.

### Edge Function `dintec-detect-conflicts`

- **RF-010:** Roda automaticamente após `dintec-process` (PRD-123) completar (chamada interna ou trigger).
- **RF-011:** Para cada `skip_locked` outcome:
  - Chama `detectFieldEdits(entityType, entityId, last_dintec_sync_at)` (audit log analysis)
  - Para cada campo editado E que DINTEC quer mudar: INSERT em `crm.dintec_conflicts`
- **RF-012:** Se campo já está em `dintec_locked_fields[]`: NÃO cria conflict novo (silencioso skip).

### Update nos Handlers (124/125)

- **RF-020:** No PRD-124 handler customer:
  - Antes de marcar skip_locked, consultar `dintec_locked_fields` do existing
  - Filtrar campos que DINTEC quer mudar: aqueles que estão em `locked_fields` → ignora silenciosamente
  - Aqueles que NÃO estão → conflito real → marca skip_locked + cria conflict (via dintec-detect-conflicts)
- **RF-021:** Idem para PRD-125 parts.

### Audit Log Analysis

- **RF-030:** `detectFieldEdits(entityType, entityId, since)`:
  - Query `crm.audit_logs` filtrado por entity + actor_type='seller' + created_at >= since
  - Extrai `payload.changes` (já presente nos updates do PRD-124/125)
  - Retorna lista de campos editados manualmente
- **RF-031:** Performance: paginar logs antigos se entity tem muito histórico (cap em 100 logs mais recentes).

### Tela de Conflitos

- **RF-040:** Rota `/app/configuracoes/dintec-import/<batchId>/conflicts` (Owner/Manager).
- **RF-041:** Lista de conflicts não-resolvidos agrupados por entity.
- **RF-042:** Card por entity (customer ou part) mostrando:
  - Nome/identificação (`name`, `dintec_id`)
  - Lista de campos divergentes
  - Por campo: valor local atual, valor DINTEC sugerido, quem editou em GALLO + quando
- **RF-043:** Ações por campo:
  - Botão "Manter local" → ação `keep_local` (campo vai para `dintec_locked_fields`, valor permanece)
  - Botão "Aceitar DINTEC" → ação `accept_dintec` (UPDATE com valor DINTEC, campo removido de locked_fields)
  - Botão "Merge custom" abre input de texto → ação `merge_custom` (UPDATE com valor custom, campo lockado)
- **RF-044:** Estado local da tela acumula decisões; botão "Aplicar Resoluções" submete tudo.
- **RF-045:** Após aplicar, lista de conflitos resolvidos remove da tela; mostra opção "Re-processar batch" que invoca PRD-123 novamente.

### Edge Function `dintec-resolve-conflict`

- **RF-050:** POST `/functions/v1/dintec-resolve-conflict` com body `{ batchId, resolutions[] }`.
- **RF-051:** Para cada resolution:
  - Carrega entity
  - Aplica decision por campo:
    - `accept_dintec`: SET field = dintecValue; locked_fields = array_remove(locked_fields, field)
    - `keep_local`: SET locked_fields = array_append(locked_fields, field) (idempotent); valor não muda
    - `merge_custom`: SET field = customValue; SET locked_fields = array_append(locked_fields, field)
  - UPDATE `last_dintec_sync_at = now()` (evita conflito recorrente)
  - INSERT em `crm.dintec_conflicts` UPDATE `resolved=true, resolved_action, resolved_value, resolved_by, resolved_at`
  - Audit log `dintec_conflict_resolved` por field
- **RF-052:** Transacional por entity (se erro em um campo, rollback entity inteira).

### Auditoria

- **RF-060:** Logs por evento:
  - `dintec_conflict_detected`: payload com batch_id, entity, field, valores
  - `dintec_conflict_resolved`: payload com action, valores, sellerId resolver
- **RF-061:** Owner pode consultar histórico via audit log timeline (existente em PRD-019 Fase 1 ou similar).

### Re-processamento

- **RF-070:** Após resoluções aplicadas, opção UI "Re-processar batch":
  - Invoca `dintec-process` (PRD-123) novamente com `batchId`
  - Engine consulta `dintec_locked_fields` — campos lockados são ignorados silenciosamente
  - Resultado: conflicts originais não retornam; updates restantes aplicados

### Testes

- **RF-080:** Unitários:
  - detectFieldEdits: cenários com diferentes logs
  - Lógica de locked_fields array (append/remove idempotent)
- **RF-081:** Integração:
  - Batch com 3 conflitos → tela mostra 3
  - Owner resolve 1 de cada forma → estado final correto no banco
  - Re-processar batch → 0 conflitos novos

### Documentação

- **RF-090:** `docs/dev/dintec-reconciliation.md`:
  - Modelo de conflict
  - Detecção via audit log
  - UI de resolução
  - locked_fields semantics
  - Roadmap (multi-versionamento, etc.)

---

## Requisitos Não-Funcionais

- **RNF-001 (UX clara):** Owner não-técnico entende cada conflito em < 30s.
- **RNF-002 (Performance):** Tela carrega 100 conflitos em < 2s.
- **RNF-003 (Auditabilidade):** Toda resolução logada com rationale completa.
- **RNF-004 (Idempotência):** Re-aplicar mesma resolução não causa side effects.
- **RNF-005 (Segurança):** Apenas Owner/Manager resolve; RLS + Edge auth.

---

## Critérios de Aceitação

### RF-011 + RF-030: Detecção via Audit Log

```gherkin
DADO customer C1 atualizado pelo seller João em 20/05 (audit log payload.changes.email = {from, to})
  E batch DINTEC quer atualizar email C1 em 25/05
QUANDO dintec-detect-conflicts roda
ENTÃO INSERT em dintec_conflicts: field='email', edited_by=João, edited_at=20/05
  E NÃO cria conflict para campos NÃO editados manualmente
```

### RF-051: Resolução Apply

```gherkin
DADO conflict pendente: customer C1 field='email', local='atual@x.com', dintec='novo@y.com'
QUANDO Owner clica "Aceitar DINTEC"
ENTÃO UPDATE C1 SET email='novo@y.com', dintec_locked_fields = array_remove(locked_fields, 'email')
  E dintec_conflicts atualiza resolved=true, action='accept_dintec'
  E audit dintec_conflict_resolved

DADO mesmo conflict
QUANDO Owner clica "Manter local"
ENTÃO C1.email permanece 'atual@x.com'
  E dintec_locked_fields adiciona 'email'
  E conflict resolved
```

### RF-070: Re-processamento Respeita Locks

```gherkin
DADO customer C1 com dintec_locked_fields=['email']
QUANDO engine PRD-123 processa nova batch que muda email
ENTÃO campo email é silenciosamente ignorado (não cria conflict novo)
  E outros campos atualizados normalmente
  E summary não inclui esse field em skip_locked count
```

---

## Fases de Implementação

### Fase 1 — Schema + Detector (1.5 dias)
- Migrations (locked_fields, dintec_conflicts)
- detectFieldEdits function
- Edge Function dintec-detect-conflicts

### Fase 2 — Handlers Update (1 dia)
- PRDs 124/125 atualizados para registrar conflicts e consultar locked_fields
- Audit log estruturado

### Fase 3 — UI de Conflitos (1.5 dias)
- Tela /conflicts
- Cards por entity, lista de campos
- 3 ações por campo (manter, aceitar, merge custom)
- Submit em batch

### Fase 4 — Edge Resolve + Re-processar + Docs (1 dia)
- Edge Function dintec-resolve-conflict
- Botão re-processar batch
- docs/dev/dintec-reconciliation.md
- E2E test (3 conflitos resolvidos)
- `_DONE`

---

## Dependências

- **Depende de:** PRD-101 (audit_logs com payload.changes), PRD-123-125 (engine + handlers), PRD-122 (UI batches host), PRD-103 (RLS)
- **Bloqueia:** Onda 6 declarada "operacionalmente sólida" — sem este, conflicts acumulam
- **Decisões Pendentes:** Multi-versionamento (não — só última resolução); reversão de resolução (não — audit log permite ver, ação manual); notificação ao seller que teve edit "reversado" por aceitar DINTEC (não MVP).

---

## Considerações de Segurança

- Owner/Manager only; RLS + Edge auth
- Audit log preserva valor anterior e novo em toda resolução
- `dintec_locked_fields` impede sync futura sobrescrever — Owner precisa explicitamente reverter via UI
- Permissão de "merge custom" pode ser sensível (Owner digita valor arbitrário) — audit captura

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.6; CHANGELOG; renomear `PRD-126-dintec-reconciliation_DONE.md`.

| Princípio | Descrição |
|-----------|-----------|
| **Audit log granular** | Identificação por campo, não registro |
| **locked_fields persistente** | Resolução não-perdida em sync futura |
| **3 ações claras** | Sem combinações que confundam |
| **Re-process respeita** | Engine consulta locked antes de sugerir |
| **Owner decide** | Sem auto-regras de resolução |

| ❌ Evitar |
|-----------|
| Auto-resolução por regra |
| Esquecer locked_fields (conflict eterno) |
| UI confusa com >3 opções |
| Resolução sem audit |
| Reversão silenciosa de lock |

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
