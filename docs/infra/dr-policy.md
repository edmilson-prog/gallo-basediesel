# Política de Backup e Disaster Recovery (PRD-109)

> Projeto Supabase: `njizaasajkdqptlxddqn` (plano Pro, região São Paulo).
> Estado: **projeto único** — o Preview da Vercel faz o papel de staging do frontend.
> Última revisão: 2026-06-10.

## Camadas de backup

| Camada | Mecanismo | Frequência | Retenção | Cobre | Estado |
| --- | --- | --- | --- | --- | --- |
| **Daily backup** | Supabase nativo (Pro) | Diário | 7 dias | Snapshot físico diário | ✅ Ativo (incluso no Pro) |
| **PITR** | Supabase (add-on do Pro) | Contínuo (WAL) | 7 dias | Restauração a qualquer segundo | ⚠️ **Pendente de habilitação pelo dono** (Dashboard → Database → Backups → PITR) |
| **Backup lógico** | `pg_dump` via CI (`logical-backup.yml`) | Semanal (dom 06:00 UTC) | 90 dias (GitHub Artifacts) | Cópia fria fora da conta Supabase | ✅ Workflow pronto — no-op até secret `SUPABASE_DB_URL` (issue de ativação) |
| **Storage backup** | `storage-backup.yml` + `scripts/dr/backup-storage.ts` | Semanal (dom 07:00 UTC) | 90 dias (GitHub Artifacts) | `fiscal-documents`, `whatsapp-media` | ✅ Workflow pronto — no-op até secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` |
| **Config backup** | Git | A cada commit | Permanente | Migrations (`supabase/migrations/`), Edge Functions (`supabase/functions/`), workflows, runbooks | ✅ Ativo |

Buckets públicos e recriáveis (`product-images`, `avatars`) ficam de fora do backup de
Storage por decisão do PRD (RF-041 — baixa prioridade). `quote-documents` e
`imports-temp` são derivados/temporários.

## RTO / RPO

| Métrica | Alvo (PRD) | Real hoje | Real com PITR habilitado |
| --- | --- | --- | --- |
| **RPO** (perda máxima de dados) | < 5 min | **até 24 h** (daily backup) | < 5 min (WAL contínuo) |
| **RTO** (tempo até voltar a operar) | < 4 h | < 4 h (runbook) | < 4 h (runbook) |

> ⚠️ Enquanto o PITR não for habilitado, o RPO real é o do daily backup (até 24 h de
> perda no pior caso). Habilitar o PITR é o item nº 1 da issue de ativação de DR.
> Importante: **produção segue em modo `mock`** (flip gated na issue #47) — até o flip,
> o risco de perda de dados reais é limitado ao Preview.

## Runbooks

| Cenário | Runbook |
| --- | --- |
| Deleção/corrupção acidental (voltar no tempo) | `docs/infra/runbooks/restore-pitr.md` |
| Recriar banco do zero a partir do dump semanal | `docs/infra/runbooks/restore-logical.md` |
| Recuperar mídias/documentos do Storage | `docs/infra/runbooks/restore-storage.md` |
| Failover total (Supabase indisponível / conta comprometida) | `docs/infra/runbooks/disaster-recovery.md` |

## Princípios

1. **Restauração sempre manual com validação humana** — nunca automática (evita
   restaurar estado comprometido por cima de estado bom).
2. **Independência de conta** — o backup lógico vive em GitHub Artifacts (conta GitHub),
   sobrevivendo a comprometimento da conta Supabase (RNF-004).
3. **Backup não testado é falsa segurança** — teste de DR trimestral, registrado em
   `docs/infra/dr-test-log.md`.
4. **Compliance fiscal** — `fiscal-documents` tem backup independente semanal
   (obrigação legal de retenção).

## Agenda de testes de DR

| Teste | Frequência | Procedimento | Registro |
| --- | --- | --- | --- |
| Restauração PITR (staging = banco vivo do Preview) | Trimestral | `restore-pitr.md` | `dr-test-log.md` |
| Validação do dump lógico (`pg_restore --list`) | Automática, a cada backup | Step do workflow | Log do workflow |
| Restauração lógica completa em projeto descartável | Anual (ou antes do go-live) | `restore-logical.md` | `dr-test-log.md` |

## Alertas de falha

- Workflow de backup falho → notificação nativa do GitHub (e-mail ao mantenedor).
- Opcional: e-mail explícito via Resend (secrets `RESEND_API_KEY` + `BACKUP_ALERT_EMAIL`
  no GitHub) — step `Alert on failure` em ambos os workflows.
- Verificação humana semanal recomendada: conferir em **Actions** que o último run de
  `Logical backup` e `Storage backup` está verde e gerou artifact.
