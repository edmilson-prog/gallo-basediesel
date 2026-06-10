# Runbook — Resposta a incidentes (PRD-110, RF-061)

> Para QUALQUER alerta: triagem (2 min) → diagnóstico → ação → registro.
> Princípio: alerta sem ação documentada não deveria existir.

## Triagem (sempre primeiro)

1. Abrir `/app/gestao/saude` (Owner) ou `GET /functions/v1/health`:
   - `healthy` → o incidente é localizado (uma feature/function) — vá para o
     diagnóstico por traceId.
   - `degraded`/`down` → incidente de plataforma — vá para "Disponibilidade".
2. Conferir https://status.supabase.com — se a plataforma estiver com incidente
   global, acompanhar e comunicar usuários; não há ação local.

## Diagnóstico por traceId (correlação ponta-a-ponta)

Todo erro de Edge Function responde `{ "error": "internal error", "traceId": "..." }`
e carrega o header `x-trace-id`:

1. Copiar o traceId (da resposta, do evento Sentry ou do print do usuário).
2. Supabase Dashboard → Logs → Edge Functions → buscar pelo traceId → o log
   estruturado JSON mostra função, etapa e mensagem real do erro.
3. Se o Sentry estiver ativo: buscar a tag `traceId` para ver stack completa e
   release afetada.

## Cenários

### Disponibilidade (health degraded/down)

| Check em falha | Ação |
| --- | --- |
| `db: fail` | Dashboard → Database: conferir CPU/conexões/locks. Se exausto: identificar query no `pg_stat_statements`. Pior caso: restart do projeto (Settings → General). |
| `storage: fail` | Dashboard → Storage. Geralmente incidente da plataforma — status page. |
| `auth: fail` | Dashboard → Authentication. Login para de funcionar; comunicar usuários. |

Após normalizar: re-sondar o healthcheck e registrar o incidente (abaixo).

### Backup falhou (workflow vermelho)

1. GitHub → Actions → run falho → ler o step que quebrou.
2. Causas comuns: secret expirado/rotacionado (`SUPABASE_DB_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`), mudança de senha do banco, runner sem rede.
3. Corrigir o secret e **re-rodar manualmente** (Run workflow) até ficar verde —
   nunca deixar a semana passar sem backup válido.
4. Se o dump falha na validação (`pg_restore --list`): tratar como backup inexistente.

### Erro em produção (Sentry / usuário reportou)

1. Sentry → evento → tag `traceId` → logs da function (acima).
2. Erro só no frontend (sem traceId): conferir release na tag do evento — regressão
   de deploy? Se sim, rollback na Vercel (Deployments → Promote anterior) é a ação
   mais rápida.
3. Corrigir → deploy → marcar resolved no Sentry e monitorar reincidência.

### Quota crítica (e-mail do Supabase)

1. Dashboard → Settings → Billing → ver qual recurso (DB size, egress, storage).
2. DB size: conferir `system_health_db_stats` / maiores tabelas; avaliar limpeza de
   `audit_logs`/`imports-temp`. Egress: investigar consultas N+1 ou mídia pública.
3. Se legítimo (crescimento real): upgrade de plano — decisão do dono.

### Rotina pg_cron falhou (visto no painel de saúde)

1. `select * from cron.job_run_details order by start_time desc limit 20;`
2. Mensagem de erro na coluna `return_message`. Causas comuns: lock em MV
   (refresh concorrente), função alterada por migration.
3. Rodar o comando do job manualmente para reproduzir; corrigir e aguardar o
   próximo ciclo.

## Comunicação e registro

- Incidente com impacto a usuário: comunicar início e fim (canal do cliente).
- Registrar TODO incidente relevante em `docs/infra/dr-test-log.md` (mesma estrutura:
  linha do tempo, causa raiz, RTO real, ações de melhoria com issue).
- Se a causa foi falta de alerta: criar o alerta ANTES de fechar o incidente.

## Escalação

1. Mantenedor AILA (este repositório).
2. Suporte Supabase (Dashboard → Support) — incidentes de plataforma no plano Pro.
3. Suporte Vercel — incidentes de frontend/deploy.
