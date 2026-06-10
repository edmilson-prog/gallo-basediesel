# PRD-108: Performance e Otimização

> **✅ STATUS: CONCLUÍDO (com ressalvas) — 2026-06-09**
>
> Policies otimizadas (InitPlan) + 21 índices de FK (rodada anterior); `pg_trgm` autorizado + 5 índices GIN de busca + índice parcial do pipeline; 3 MVs de BI com refresh `pg_cron` (15 min, CONCURRENTLY) lidas via RPCs scoped (validadas por impersonação e cobertas na suíte de regressão); baseline em `docs/db/performance-baseline.md` e estado/decisões em `docs/db/performance.md`.
>
> **Ressalvas (deferidas com motivo documentado):** cursor pagination, cache no provider, testes de carga k6 e tuning de pooling.

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                                       |
| **Repositório**       | _Repositório vivo da Fase 1, `supabase/migrations/` + `src/providers/supabase/`_                                                                                                                                                                                                                                                                               |
| **Objetivo**          | Otimizar performance do backend após schema (101), RLS (103) e provider (104) estarem operacionais: índices avançados baseados em profiling real, views materializadas para dashboards BI pesados, estratégia de cache no provider, paginação cursor-based para listas grandes, otimização de policies RLS com subquery, e baseline de métricas de performance |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                                                        |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                                                                                           |
| **Total de Fases**    | 4                                                                                                                                                                                                                                                                                                                                                              |
| **Prioridade**        | P1 — não-bloqueante para go-live com volume baixo, mas necessário antes de escala                                                                                                                                                                                                                                                                              |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                                                                 |
| **PRDs Relacionados** | PRD-101 (Schema — índices básicos; este adiciona avançados); PRD-103 (RLS — otimiza subqueries); PRD-104 (Provider — cache); PRD-110 (Monitoring — mede performance); PRD-040 Fase 1 (Visão Executiva — consome views materializadas); PRD-014 Fase 1 (Painel Gestor)                                                                                          |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                                             |
| **Padrão de código**  | Migrations de índice/view em `supabase/migrations/`; cache no provider                                                                                                                                                                                                                                                                                         |

### Critérios de Complexidade

> **Justificativa de Alta:** otimização exige profiling real (não chutar índices), entendimento de query plans (EXPLAIN ANALYZE), trade-offs de views materializadas (frescor vs performance), interação entre RLS e índices (policy com subquery pode invalidar uso de índice), estratégia de cache com invalidação correta. Erro causa lentidão em produção ou, pior, dados stale em views materializadas. Requer medição antes e depois.

---

## Contexto do Problema

Os PRDs 101-107 entregaram um backend funcional, mas otimizado para **correção, não para escala**. Com volume crescente (milhares de pedidos, dezenas de milhares de mensagens, centenas de leads ativos), algumas operações ficam lentas:

- **Dashboards BI** (Visão Executiva PRD-040, Painel Gestor PRD-014): agregações sobre orders/commissions varrem tabelas inteiras
- **Listagens com filtros** (carteira, pipeline): podem não usar índices ideais
- **RLS com subquery** (ex: messages via conversations): query plan pode degradar
- **Paginação offset** (PRD-104 MVP): lenta em páginas profundas (offset 10000 varre 10000 linhas)

Este PRD faz o tuning **baseado em medição**, não em suposição. Profiling primeiro, otimização depois.

---

## Conceito da Solução

### Profiling Primeiro

Antes de qualquer índice novo, medir:

- `pg_stat_statements` — quais queries são mais frequentes/lentas
- `EXPLAIN ANALYZE` nas queries críticas (dashboards, listagens)
- Supabase Dashboard → Query Performance
- MCP `Supabase:get_advisors` — sugere índices faltando

### Áreas de Otimização

| Área                 | Técnica                                                              |
| -------------------- | -------------------------------------------------------------------- |
| Dashboards BI        | Views materializadas com refresh agendado (pg_cron)                  |
| Listagens frequentes | Índices compostos baseados em padrão real de WHERE/ORDER BY          |
| RLS subqueries       | Reescrever policy com índice apropriado ou função `STABLE` cacheável |
| Paginação profunda   | Cursor-based (keyset pagination) em vez de offset                    |
| Single-record reads  | Cache no provider (PRD-104 opt-in → habilitar onde justifica)        |
| Texto/busca          | Índice GIN com pg_trgm para busca de peças/clientes                  |

### Views Materializadas para BI

```sql
CREATE MATERIALIZED VIEW crm.mv_sales_by_seller_month AS
SELECT
  seller_id, store_id,
  date_trunc('month', created_at) AS month,
  count(*) AS order_count,
  sum(total_value) AS total_revenue,
  sum(total_value - freight_value) AS net_revenue
FROM crm.orders
WHERE status NOT IN ('cancelled')
GROUP BY seller_id, store_id, date_trunc('month', created_at);

CREATE UNIQUE INDEX ON crm.mv_sales_by_seller_month (seller_id, month);

-- Refresh agendado via pg_cron (a cada hora ou sob demanda)
SELECT cron.schedule('refresh-sales-mv', '0 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_sales_by_seller_month');
```

Trade-off: dados com até 1h de defasagem. Aceitável para dashboards (não para operação transacional).

### Cursor-Based Pagination

```typescript
// Em vez de offset (lento em página profunda):
.range(10000, 10049)  // varre 10000 linhas

// Cursor (keyset) — usa índice:
.gt('created_at', lastSeenCreatedAt).order('created_at').limit(50)
```

Provider (PRD-104) ganha modo cursor para listas grandes (mensagens, audit logs).

### Alternativas Consideradas

| Alternativa                      | Por que descartada                                           |
| -------------------------------- | ------------------------------------------------------------ |
| Otimizar tudo preventivamente    | Premature optimization. Profiling guia onde otimizar         |
| Read replicas                    | Supabase Pro não inclui; overkill para volume MVP            |
| Cache externo (Redis)            | Cache in-memory no provider resolve o MVP                    |
| Desabilitar RLS para performance | Inaceitável — segurança não negocia                          |
| Denormalização agressiva         | Adiciona complexidade de sync; views materializadas resolvem |

---

## Escopo

### Incluído

- ✅ Análise de profiling: habilitar `pg_stat_statements`, documentar top 20 queries lentas
- ✅ Índices avançados baseados em profiling (compostos, parciais, GIN para busca textual)
- ✅ Views materializadas para dashboards: vendas por vendedor/mês, comissões por período, ABC, positivação, KPIs executivos
- ✅ Refresh agendado de views materializadas via `pg_cron`
- ✅ Cursor-based pagination no provider para listas grandes (messages, audit_logs, orders)
- ✅ Habilitar cache do provider (PRD-104) onde profiling justifica (single-record reads frequentes)
- ✅ Otimização de policies RLS com subquery (EXPLAIN ANALYZE antes/depois)
- ✅ Índice GIN + pg_trgm para busca de peças (por nome, OEM) e clientes (por nome, documento)
- ✅ Baseline de métricas: documento `docs/db/performance-baseline.md` com tempos antes/depois
- ✅ Configuração de connection pooling (Supavisor — Supabase nativo)
- ✅ Testes de carga básicos (k6 ou similar) nas operações críticas
- ✅ Documentação `docs/db/performance.md`

### Excluído

- ❌ Read replicas (não no plano Pro)
- ❌ Sharding / particionamento (Fase 3+ quando volume justificar)
- ❌ Cache distribuído Redis
- ❌ CDN customizado
- ❌ Otimização de Edge Functions (cobertas no próprio PRD-102)
- ❌ Particionamento de `audit_logs`/`messages` (Fase 3 quando volume justificar)

---

## Requisitos Funcionais

### Profiling

- **RF-001:** Habilitar extensão `pg_stat_statements` em ambos ambientes.
- **RF-002:** Documentar top 20 queries por tempo total e por frequência em `docs/db/performance-baseline.md`.
- **RF-003:** Rodar `Supabase:get_advisors` (MCP) e documentar sugestões de índices faltando.
- **RF-004:** `EXPLAIN ANALYZE` nas queries dos dashboards principais (Visão Executiva, Painel Gestor, listagem de carteira) — documentar plans.

### Índices Avançados

- **RF-010:** Migration `00000000000070_indexes_advanced.sql` com índices baseados no profiling. Candidatos prováveis:
  - GIN trgm em `crm.parts(name)`, `crm.parts(sku)` para busca
  - GIN trgm em `crm.customers(name)`, índice em `crm.customers(document)` para busca
  - Composto `crm.orders(store_id, status, created_at DESC)` para listagens filtradas
  - Composto `crm.messages(conversation_id, created_at DESC)` (confirmar se já existe do 101)
  - Parcial `crm.leads(seller_id) WHERE status NOT IN ('won','lost')` para pipeline ativo
- **RF-011:** Cada índice criado com justificativa (qual query acelera) em comentário SQL.
- **RF-012:** Validar uso real do índice com `EXPLAIN ANALYZE` após criação (deve aparecer `Index Scan`, não `Seq Scan`).

### Views Materializadas

- **RF-020:** `crm.mv_sales_by_seller_month` — vendas agregadas por vendedor/mês.
- **RF-021:** `crm.mv_commissions_by_period` — comissões agregadas.
- **RF-022:** `crm.mv_executive_kpis` — KPIs da Visão Executiva (faturamento, ticket médio, conversão).
- **RF-023:** Cada MV tem índice único para permitir `REFRESH CONCURRENTLY` (não bloqueia leitura durante refresh).
- **RF-024:** Refresh agendado via `pg_cron` (frequência por MV: KPIs a cada 15min, vendas/mês a cada 1h).
- **RF-025:** Provider (PRD-104) lê das MVs para dashboards em vez de agregar on-the-fly.
- **RF-026:** Documentar defasagem aceita de cada MV em `docs/db/performance.md`.

### Cursor Pagination

- **RF-030:** Provider ganha método de paginação cursor-based para listas grandes: `listMessages({ cursor, limit })` retorna `{ items, nextCursor }`.
- **RF-031:** Aplicar cursor em: messages (por conversa), audit_logs, orders (listagem longa).
- **RF-032:** Listas pequenas (carteira de vendedor ~dezenas) mantêm offset (mais simples).

### Cache

- **RF-040:** Habilitar cache do provider (PRD-104 opt-in) para single-record reads frequentes (getCustomerById, getPartById) onde profiling mostra repetição.
- **RF-041:** TTL ajustado por entidade (parts: 5min; customer: 30s; platform_settings: 5min).
- **RF-042:** Invalidação: mutation + Realtime (PRD-105) limpam cache.

### RLS Optimization

- **RF-050:** Revisar policies com subquery (messages, order_items) via EXPLAIN ANALYZE.
- **RF-051:** Onde subquery degrada plan, reescrever (ex: índice em coluna de junção, ou função STABLE).
- **RF-052:** Documentar antes/depois de cada otimização de policy.

### Connection Pooling

- **RF-060:** Confirmar Supavisor (pooler nativo Supabase) configurado em modo transaction para o provider.
- **RF-061:** Documentar string de conexão pooled vs direct em `docs/infra/`.

### Testes de Carga

- **RF-070:** Script k6 (ou similar) simulando: 50 usuários concorrentes navegando carteira + dashboard.
- **RF-071:** Métricas alvo: p95 < 500ms para listagens, p95 < 800ms para dashboard com MV.
- **RF-072:** Documentar resultados em `docs/db/load-test-results.md`.

---

## Requisitos Não-Funcionais

- **RNF-001 (Listagens):** p95 < 300ms para carteira de vendedor (até 200 clientes).
- **RNF-002 (Dashboard):** p95 < 800ms com views materializadas.
- **RNF-003 (Busca):** busca de peça por nome/OEM < 200ms p95 (GIN trgm).
- **RNF-004 (MV freshness):** documentada e aceita por dashboard (15min-1h).
- **RNF-005 (Refresh não-bloqueante):** `REFRESH CONCURRENTLY` não trava leituras.
- **RNF-006 (Segurança preservada):** otimização nunca enfraquece RLS.

---

## Critérios de Aceitação

### RF-010 + RF-012: Índices Usados

```gherkin
DADO um índice GIN trgm em crm.parts(name) criado
QUANDO busco peças com name ILIKE '%filtro%'
ENTÃO EXPLAIN ANALYZE mostra "Bitmap Index Scan" usando o índice GIN
  E não "Seq Scan"
  E o tempo de execução é < 200ms com 10k parts
```

### RF-020 + RF-024: View Materializada

```gherkin
DADO a MV crm.mv_sales_by_seller_month com refresh agendado a cada hora
QUANDO o dashboard de Visão Executiva carrega vendas do mês
ENTÃO lê da MV (não agrega orders on-the-fly)
  E o tempo de resposta é < 800ms
  E os dados refletem o estado de até 1h atrás (documentado)
```

### RF-030: Cursor Pagination

```gherkin
DADO uma conversa com 5000 mensagens
QUANDO carrego a "página 100" via offset
ENTÃO seria lento (varre 5000 linhas)

QUANDO uso cursor (created_at > lastSeen)
ENTÃO usa índice, retorna em < 100ms
  E retorna nextCursor para continuar
```

---

## Fases de Implementação

### Fase 1 — Profiling (1 dia)

- pg_stat_statements, get_advisors, EXPLAIN ANALYZE; documentar baseline

### Fase 2 — Índices + Views Materializadas (2 dias)

- Índices avançados; MVs + pg_cron; provider lê das MVs

### Fase 3 — Cursor + Cache + RLS opt (1.5 dias)

- Cursor pagination; habilitar cache; otimizar policies

### Fase 4 — Testes de Carga + Docs (1 dia)

- k6; documentação; comparativo antes/depois; `_DONE`

---

## Dependências

- **Depende de:** PRD-101 (schema), PRD-103 (RLS), PRD-104 (provider). Idealmente após dados realistas em staging.
- **Decisões pendentes:** frequência de refresh de cada MV (sugerido KPIs 15min, vendas 1h); ferramenta de load test (k6 sugerido).

---

## Considerações de Segurança

- Otimização nunca enfraquece RLS. MVs respeitam acesso via policies de leitura nas próprias MVs.
- Cache em memória limpo no logout (não vaza entre sessões).
- MVs com dados agregados não expõem PII individual além do já permitido.

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.0.0-rc.8; CHANGELOG; renomear `PRD-108-performance_DONE.md`; baseline documentado antes/depois.

| Princípio                        | Descrição                                |
| -------------------------------- | ---------------------------------------- |
| **Profiling primeiro**           | Nunca criar índice sem medir necessidade |
| **MV para BI, não transacional** | Defasagem aceitável só em dashboard      |
| **Cursor para listas grandes**   | Offset só para listas pequenas           |
| **Validar com EXPLAIN**          | Índice criado deve ser usado de fato     |

| ❌ Evitar                                     |
| --------------------------------------------- |
| Índice sem profiling (premature optimization) |
| MV em dado transacional (frescor crítico)     |
| Enfraquecer RLS por performance               |
| Cache sem invalidação                         |
| Refresh de MV bloqueante (use CONCURRENTLY)   |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |
| **Data**   | -           |
| **Versão** | -           |
| **Por**    | -           |

---

## Histórico

| Data       | Versão | Alteração                              |
| ---------- | ------ | -------------------------------------- |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1d (Onda 4) |

---

**AILA - Sistemas Inteligentes**
