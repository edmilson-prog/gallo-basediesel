# PRD-110: Monitoring e Observabilidade

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                |
| **Repositório**       | _Repositório vivo da Fase 1, `src/`, `supabase/functions/_shared/logger.ts`_                                                                                                                                                                                                                                                            |
| **Objetivo**          | Estabelecer observabilidade end-to-end: agregação dos logs estruturados das Edge Functions (PRD-102), error tracking no frontend e backend (Sentry), métricas de saúde (latência, taxa de erro, uso de quota), alertas acionáveis, e dashboard de saúde do sistema. Fecha a Onda 4 entregando visibilidade operacional antes do go-live |
| **Tipo**              | Integração                                                                                                                                                                                                                                                                                                                              |
| **Complexidade**      | Média                                                                                                                                                                                                                                                                                                                                   |
| **Total de Fases**    | 4                                                                                                                                                                                                                                                                                                                                       |
| **Prioridade**        | P0 — necessário antes do go-live; sem observabilidade, operar em prod é voar às cegas                                                                                                                                                                                                                                                   |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                                          |
| **PRDs Relacionados** | PRD-102 (Edge Functions — produz logs estruturados que este consome); PRD-101 (Schema — `integration_logs`, `llm_usage_metrics`); PRD-100 (Setup — billing alerts); PRD-109 (Backup — alerta de falha); PRD-151D Onda 9 (Dashboard LLM — padrão similar)                                                                                |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                      |
| **Padrão de código**  | Integração Sentry no frontend e Edge Functions; dashboards em `/app/admin/saude`                                                                                                                                                                                                                                                        |

### Critérios de Complexidade

> **Justificativa de Média:** observabilidade integra múltiplas fontes (logs Edge, erros frontend, métricas DB, quotas Supabase) num todo coerente. Não tem lógica de negócio complexa, mas exige escolhas de ferramenta (Sentry vs alternativas), configuração de alertas que sejam acionáveis (não ruído), e dashboard útil. Erro aqui = ou ruído que ninguém olha, ou silêncio quando deveria alertar.

---

## Contexto do Problema

Após a Onda 4, o sistema sai do mockup e passa a ter backend real em produção. Operar sem observabilidade é arriscado:

- Erro em Edge Function (webhook falha) → ninguém sabe até cliente reclamar
- Query lenta degradando UX → invisível sem métricas
- Quota Supabase estourando → fatura surpresa
- Backup falhando → descoberto só no desastre

O PRD-102 já produz **logs estruturados JSON** com traceId. O PRD-101 já tem `integration_logs` e `llm_usage_metrics`. Este PRD **agrega tudo** numa camada de observabilidade acionável.

---

## Conceito da Solução

### Pilares de Observabilidade

| Pilar                      | Ferramenta                            | Cobre                                          |
| -------------------------- | ------------------------------------- | ---------------------------------------------- |
| **Error tracking**         | Sentry (frontend + Edge Functions)    | Exceções, stack traces, contexto de usuário    |
| **Logs estruturados**      | Supabase Logs + Logflare (ou Sentry)  | Logs JSON das Edge Functions (PRD-102)         |
| **Métricas de integração** | `crm.integration_logs` + dashboard    | Chamadas a providers externos (latência, erro) |
| **Métricas de DB**         | Supabase Dashboard + métricas         | Query performance, conexões, tamanho           |
| **Quota/billing**          | Billing alerts (PRD-100) + dashboard  | Uso vs limite do plano Pro                     |
| **Uptime**                 | Supabase Status + healthcheck próprio | Disponibilidade                                |

### Error Tracking com Sentry

Frontend e Edge Functions reportam erros ao Sentry com:

- `traceId` (correlaciona frontend ↔ backend)
- Contexto de usuário (seller_id, store_id — sem PII)
- Breadcrumbs de navegação
- Release version (correlaciona com deploy)

### Dashboard de Saúde (`/app/admin/saude`)

Tela interna (Owner only) com:

- Taxa de erro por Edge Function (últimas 24h)
- Latência p50/p95/p99 de integrações
- Uso de quota Supabase (DB, egress, storage, realtime)
- Status de último backup
- Erros recentes (link para Sentry)
- Saúde de providers externos (WhatsApp, pagamentos, LLM, NFe) via `integration_logs`

### Alertas Acionáveis

| Alerta                | Condição                             | Canal                       |
| --------------------- | ------------------------------------ | --------------------------- |
| Taxa de erro alta     | > 5% erros em Edge Function em 10min | Email + (futuramente Slack) |
| Latência degradada    | p95 integração > 5s                  | Email                       |
| Quota crítica         | > 95% de qualquer limite             | Email (já no PRD-100)       |
| Backup falhou         | Workflow backup falha                | Email (PRD-109)             |
| Provider externo down | > 50% erro em provider em 5min       | Email                       |

Princípio: **alerta = ação necessária**. Sem ruído. Alerta que não exige ação vira dashboard, não notificação.

### Alternativas Consideradas

| Alternativa                 | Por que descartada                                  |
| --------------------------- | --------------------------------------------------- |
| Datadog / New Relic         | Caro para MVP. Sentry + Supabase nativo cobre       |
| Logs em texto livre         | Já resolvido no PRD-102 (JSON estruturado)          |
| Sem error tracking          | Operar cego em prod é inaceitável                   |
| Alertas para tudo           | Ruído faz equipe ignorar. Apenas acionáveis         |
| Dashboard externo (Grafana) | Overkill MVP; dashboard interno no app é suficiente |

---

## Escopo

### Incluído

- ✅ Integração Sentry no frontend (React) — captura de exceções, contexto, releases
- ✅ Integração Sentry nas Edge Functions — erros server-side com traceId
- ✅ Correlação frontend ↔ backend via traceId
- ✅ Agregação de logs estruturados (Supabase Logs nativo + opcionalmente Logflare)
- ✅ Dashboard de saúde `/app/admin/saude` (Owner only): taxa de erro, latência, quota, backup, providers
- ✅ Alertas acionáveis (taxa de erro, latência, provider down) via email
- ✅ Healthcheck endpoint (Edge Function `health`) que valida DB + storage + auth
- ✅ Métricas de integração consumidas de `crm.integration_logs`
- ✅ Configuração de release tracking (correlaciona erro com versão deployada)
- ✅ Sanitização de PII nos logs/erros (não enviar dados de cliente ao Sentry)
- ✅ Documentação `docs/ops/observability.md`: como ler dashboards, como responder a alertas, runbook de incidente

### Excluído

- ❌ APM completo (tracing distribuído detalhado) — Sentry básico cobre MVP
- ❌ Grafana/Prometheus self-hosted
- ❌ Log retention longa (>30 dias) — Supabase nativo cobre; arquivamento em Onda 13 se compliance exigir
- ❌ On-call / PagerDuty — equipe pequena; email basta no MVP
- ❌ Dashboard de LLM (esse é específico, vai no PRD-151D Onda 9)
- ❌ Synthetic monitoring (testes sintéticos periódicos) — avaliar pós-go-live

---

## Requisitos Funcionais

### Error Tracking (Sentry)

- **RF-001:** Integrar Sentry SDK no frontend React. DSN via env (`VITE_SENTRY_DSN`).
- **RF-002:** Capturar exceções não-tratadas + erros explícitos (AppError com httpStatus >= 500).
- **RF-003:** Contexto enviado: `traceId`, `sellerId`, `storeId`, `role`, release version. **Sem PII** (nome, email, documento de cliente).
- **RF-004:** Integrar Sentry nas Edge Functions (Deno SDK). Erros server-side com mesmo traceId.
- **RF-005:** Release tracking: cada deploy registra a versão no Sentry (correlaciona erro com release).
- **RF-006:** Breadcrumbs de navegação no frontend (sem capturar input sensível).

### Logs Estruturados

- **RF-010:** Logs JSON das Edge Functions (PRD-102) visíveis no Supabase Logs Explorer.
- **RF-011:** Opcionalmente, configurar Logflare ou drain para Sentry (decisão de custo/necessidade).
- **RF-012:** Logs pesquisáveis por traceId (correlação ponta-a-ponta).

### Healthcheck

- **RF-020:** Edge Function `health` que valida: conexão DB (`SELECT 1`), Storage acessível, Auth respondendo. Retorna `{ status: 'healthy'|'degraded'|'down', checks: {...} }`.
- **RF-021:** Endpoint público (sem auth) para monitoring externo poder consultar.
- **RF-022:** Status page externa (Supabase Status) assinada pela equipe.

### Dashboard de Saúde

- **RF-030:** Tela `/app/admin/saude` (Owner only via RLS + guarda de rota).
- **RF-031:** Cards: taxa de erro por Edge Function (24h), latência p50/p95/p99 de integrações, uso de quota (DB/egress/storage/realtime vs limite), status último backup, saúde de cada provider externo.
- **RF-032:** Dados de integração vêm de `crm.integration_logs` (agregados via query ou MV do PRD-108).
- **RF-033:** Link direto para Sentry para investigar erros.
- **RF-034:** Atualização: polling a cada 30s ou Realtime (PRD-105) para métricas em tempo real.

### Alertas

- **RF-040:** Alerta taxa de erro: > 5% de erros em uma Edge Function em janela de 10min → email.
- **RF-041:** Alerta latência: p95 de integração externa > 5s → email.
- **RF-042:** Alerta provider down: > 50% erro em um provider em 5min → email.
- **RF-043:** Alertas de quota (PRD-100) e backup (PRD-109) consolidados aqui.
- **RF-044:** Email para `infra@ailasistemas.com.br`. Estrutura para Slack/webhook futuro.
- **RF-045:** Princípio: cada alerta tem ação documentada no runbook. Sem alerta puramente informativo.

### Sanitização de PII

- **RF-050:** Sentry `beforeSend` hook remove campos PII (email, document, name de cliente) antes de enviar.
- **RF-051:** Logs estruturados (PRD-102) já não logam PII por padrão; reforçar.
- **RF-052:** Documentar política de PII em logs em `docs/ops/observability.md`.

### Documentação

- **RF-060:** `docs/ops/observability.md`: arquitetura de observabilidade, como ler cada dashboard, como responder a cada alerta (runbook de incidente), política de PII.
- **RF-061:** Runbook `docs/ops/runbooks/incident-response.md`: passos ao receber alerta (triagem, diagnóstico via traceId, escalação).

---

## Requisitos Não-Funcionais

- **RNF-001 (Overhead):** Instrumentação não degrada performance perceptível (< 5ms por request).
- **RNF-002 (PII):** Zero PII de cliente em Sentry ou logs externos. Validado.
- **RNF-003 (Acionabilidade):** Todo alerta exige ação; taxa de falso positivo < 10%.
- **RNF-004 (Correlação):** traceId conecta erro frontend ao log backend em 100% dos casos.
- **RNF-005 (Custo):** Sentry plan adequado ao volume MVP (free tier ou team). Documentar.
- **RNF-006 (Disponibilidade do monitoring):** observabilidade não pode derrubar o app — falha de Sentry não trava UX (fail open para telemetria).

---

## Critérios de Aceitação

### RF-001 + RF-004 + RNF-004: Correlação Ponta-a-Ponta

```gherkin
DADO um erro 500 originado em uma Edge Function
QUANDO o erro é capturado
ENTÃO aparece no Sentry com traceId
  E o log estruturado no Supabase Logs tem o mesmo traceId
  E o erro no frontend (se propagado) carrega o mesmo traceId
  E é possível rastrear o fluxo completo pelo traceId
```

### RF-003 + RF-050 + RNF-002: Sem PII

```gherkin
DADO um erro ocorrendo durante operação com customer "João Silva" (CPF 123...)
QUANDO o erro é enviado ao Sentry
ENTÃO o contexto contém sellerId, storeId, traceId
  E NÃO contém "João Silva"
  E NÃO contém o CPF
  E NÃO contém email do cliente
```

### RF-030 + RF-031: Dashboard de Saúde

```gherkin
DADO Owner logado acessando /app/admin/saude
QUANDO a tela carrega
ENTÃO exibe taxa de erro por Edge Function (24h)
  E latência p95 de cada integração
  E uso de quota Supabase vs limite
  E status do último backup
  E saúde de cada provider externo (WhatsApp, pagamento, LLM, NFe)

QUANDO um seller (não-owner) tenta acessar /app/admin/saude
ENTÃO recebe 403 / redirect (guarda de rota + RLS)
```

### RF-040: Alerta Acionável

```gherkin
DADO a Edge Function whatsapp-webhook com taxa de erro normal
QUANDO a taxa de erro sobe para > 5% em 10min
ENTÃO um alerta é enviado para infra@ailasistemas.com.br
  E o alerta contém: qual função, taxa atual, link para Sentry, ação sugerida
```

---

## Fases de Implementação

### Fase 1 — Sentry Frontend + Edge (1 dia)

- SDK no React e Edge Functions; traceId correlation; release tracking; sanitização PII

### Fase 2 — Healthcheck + Métricas (1 dia)

- Edge Function `health`; agregação de integration_logs; queries/MV de métricas

### Fase 3 — Dashboard de Saúde (1.5 dias)

- Tela `/app/admin/saude`; cards de métricas; link Sentry; Owner only

### Fase 4 — Alertas + Docs (1 dia)

- Alertas acionáveis; runbook de incidente; observability.md; `_DONE` + **fecha Onda 4 → v2.0.0 Engine**

---

## Dependências

- **Depende de:** PRD-102 (logs estruturados), PRD-101 (integration_logs), PRD-100 (billing alerts), PRD-109 (alerta backup), PRD-107 (Owner role para dashboard)
- **Fecha:** Onda 4 (Backend Supabase Real) → release v2.0.0 "Engine"
- **Decisões pendentes:** Sentry tier (free vs team — depende de volume); Logflare sim/não (custo vs valor); canal de alerta futuro (Slack? confirmar).

---

## Considerações de Segurança

- **PII jamais ao Sentry:** `beforeSend` sanitiza. Validado por teste.
- **Dashboard Owner only:** RLS + guarda de rota.
- **Healthcheck público não vaza:** retorna status, não detalhes internos.
- **Telemetria fail-open:** falha de monitoring não derruba app.
- **traceId não é PII:** é ULID aleatório, seguro para logs.

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump para **v2.0.0** (release final da Onda 4 — codinome "Engine", sai do RC); CHANGELOG consolidado da Onda 4; renomear `PRD-110-monitoring_DONE.md`; validar que toda a Onda 4 está coesa (smoke test end-to-end de todos os PRDs 100-110).

| Princípio                     | Descrição                             |
| ----------------------------- | ------------------------------------- |
| **Alerta = ação**             | Sem ruído; informativo vira dashboard |
| **Zero PII em telemetria**    | beforeSend sanitiza sempre            |
| **traceId correlaciona tudo** | Frontend ↔ Edge ↔ logs                |
| **Telemetria fail-open**      | Monitoring quebrado não trava app     |

| ❌ Evitar                                               |
| ------------------------------------------------------- |
| PII em Sentry ou logs externos                          |
| Alertas informativos (ruído)                            |
| Dashboard de saúde acessível a não-Owner                |
| Healthcheck vazando detalhes internos                   |
| Telemetria que trava o app se falhar                    |
| Esquecer release tracking (perde correlação com deploy) |

---

## Status de Implementação

| Campo           | Valor                          |
| --------------- | ------------------------------ |
| **Status**      | ⏳ PENDENTE                    |
| **Data**        | -                              |
| **Versão**      | -                              |
| **Por**         | -                              |
| **Observações** | Fecha a Onda 4 → v2.0.0 Engine |

---

## Histórico

| Data       | Versão | Alteração                              |
| ---------- | ------ | -------------------------------------- |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1d (Onda 4) |

---

**AILA - Sistemas Inteligentes**
