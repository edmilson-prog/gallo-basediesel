# Observabilidade (PRD-110)

> Estado em 2026-06-10. Arquitetura entregue com a faixa PRD-109/110; itens gated na
> issue de ativação de DR & Observabilidade (dono).

## Arquitetura

| Pilar | Mecanismo | Estado |
| --- | --- | --- |
| **Error tracking (frontend)** | Sentry via `src/shared/lib/observability.ts` — dynamic import, só carrega com `VITE_SENTRY_DSN` | ✅ Código pronto · ⚠️ gated: criar conta Sentry + DSN |
| **Error tracking (edge)** | `_shared/sentry.ts` — mini-client envelope API no catch do `servePost`, gated no secret `SENTRY_DSN` | ✅ Deployado em todas as functions · ⚠️ mesmo gate |
| **Correlação ponta-a-ponta** | `traceId` — header `x-trace-id` em toda resposta de function; tag em todo evento Sentry; logs estruturados JSON | ✅ Ativo |
| **Logs estruturados** | `_shared/logger.ts` (PRD-102) → Supabase Logs Explorer, pesquisável por traceId | ✅ Ativo |
| **Healthcheck** | Edge Function `health` (GET, pública — `verify_jwt:false` by design) | ✅ Ativo |
| **Dashboard interno** | `/app/gestao/saude` (Owner only) — disponibilidade, pg_cron, DB stats, links | ✅ Ativo |
| **Alertas** | Falha de backup → notificação GitHub + Resend opcional; uptime → monitor externo no healthcheck | ⚠️ Parcial (ver "Alertas") |

## Healthcheck

```
GET https://<project-ref>.supabase.co/functions/v1/health
→ 200 {"status":"healthy","checks":{"db":"ok","storage":"ok","auth":"ok"},"ts":"..."}
→ 200 status "degraded" (storage/auth falhou; DB ok)
→ 503 status "down"     (DB falhou)
```

- Sem autenticação por requisito (RF-021) — monitores externos (UptimeRobot, BetterStack,
  cron-job.org) podem sondar direto. Não vaza internals: cada check é só `ok`/`fail`.
- Probes server-side: `health_ping()` RPC (DB), metadata de bucket (Storage),
  `/auth/v1/health` (GoTrue). Timeout 5s por probe.
- Recomendação pós-go-live: cadastrar monitor externo de 5 em 5 min no endpoint e
  assinar https://status.supabase.com.

## Sentry — ativação (quando o dono criar a conta)

1. Criar projeto no Sentry (free tier basta no MVP) → copiar o DSN.
2. **Frontend:** Vercel → env var `VITE_SENTRY_DSN` (Preview primeiro; Production no flip).
3. **Edge:** Dashboard Supabase → Edge Functions → Secrets → `SENTRY_DSN` (mesmo DSN).
4. Redeploy (Vercel + nenhuma ação nas functions — elas leem o secret em runtime).
5. Validar: forçar um erro e conferir o evento com tag `traceId`.

Release tracking: o frontend reporta `gallo-base-diesel@<versão do package.json>`;
erros ficam correlacionados à versão deployada automaticamente.

## Política de PII (RF-050)

- **Nunca** enviar nome, e-mail, telefone, CPF/CNPJ ou endereço de cliente à telemetria.
- Frontend: `beforeSend` aplica `scrubPii()` recursivo no evento inteiro (chaves
  contendo name/email/phone/document/cpf/cnpj/address/password → `[scrubbed]`).
- Contexto de usuário: apenas ids opacos (`sellerId`, `storeId`, `role`) via
  `ObservabilityUserSync`.
- Edge: eventos carregam só traceId + nome da function + stack; nunca o body da request.
- Logs estruturados (PRD-102) já não logam PII por padrão — manter ao criar logs novos.
- `traceId` é UUID aleatório — não é PII.

## Telemetria é fail-open (RNF-006)

Falha do Sentry/healthcheck **nunca** derruba o app: o SDK só carrega se o DSN existe,
todo envio é fire-and-forget com timeout e todo throw de telemetria é engolido.

## Dashboard `/app/gestao/saude`

- Owner only (guarda de rota + RPCs owner-scoped no banco — a RLS é a fronteira real).
- Disponibilidade repolla a cada 30 s com a página aberta (RF-034).
- Em fonte `mock` mostra dados sintéticos com aviso explícito.
- WARNs intencionais de advisor: `system_health_cron_jobs`/`system_health_db_stats`
  são SECURITY DEFINER executáveis por `authenticated` com guard interno owner-only —
  mesmo padrão documentado das `mv_*_read()`.

## Alertas (princípio: alerta = ação necessária)

| Alerta | Mecanismo | Ação documentada |
| --- | --- | --- |
| Backup falhou | Notificação nativa do GitHub + step Resend opcional (`RESEND_API_KEY`+`BACKUP_ALERT_EMAIL`) | `docs/ops/runbooks/incident-response.md` § Backup |
| Plataforma down/degraded | Monitor externo no healthcheck (gated: cadastrar serviço) | § Disponibilidade |
| Erro novo em produção | Alerta padrão do Sentry por e-mail (gated: conta) | § Erro em produção |
| Quota Supabase | Billing alerts do Dashboard (PRD-100) | § Quota |

Itens do PRD adiados conscientemente (sem tráfego real ainda): taxa de erro >5%/10min
por function, p95 de integrações externas >5s e "provider down" — dependem de
integrações reais (WhatsApp/NF-e, PRDs 111+) e de agregação de logs que hoje não tem
fonte SQL. Revisar quando a primeira integração externa entrar.

## Limites conhecidos

- Sem APM/tracing distribuído (exclusão do PRD) — Sentry errors-only.
- Logs de Edge Functions ficam no Logs Explorer do Supabase (retenção do plano);
  arquivamento longo só se compliance exigir (Onda 13).
- Métricas de quota não têm API pública estável — acompanhar pelo Dashboard
  (link direto no painel de saúde).
