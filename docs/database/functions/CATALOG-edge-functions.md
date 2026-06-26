---
objeto: catalogo-edge-functions
tipo: catalogo
schema: supabase/functions
status: gerado
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# Catálogo de Edge Functions — `supabase/functions/` (18 no repo + 1 só implantada)

> Edge Functions vivem no repositório (Deno), **não** no Postgres. Camada mecânica
> (slug, implantação, `verify_jwt`, versão) = `[mecânico]` (`list_edge_functions` + pasta do repo).
> Propósito = `🔍 inferido (nome + CLAUDE.md + memória do projeto)`; trigger/tabelas/IO/segredos
> de cada uma a aprofundar lendo o fonte (Fase 3) onde marcado `❓`.

`verify_jwt=não` ⇒ endpoint público (validação própria no corpo — webhook/health).

---

## WhatsApp (núcleo do atendimento)

| slug | impl. | jwt | ver. | propósito |
|------|:-----:|:---:|----:|-----------|
| `whatsapp-webhook` | sim | **público** | 20 | Recepção unificada de eventos dos provedores (Meta/Evolution): mensagens in, status, conexão. Fail-closed; idempotência via `processed_events`. **Não tocado pelo PRD-213.** `🔍` |
| `whatsapp-send` | sim | sim | 15 | Pipeline de envio (texto/mídia/template) com conta efetiva + failover; grava `messages`; audita em `integration_logs`. `🔍` |
| `whatsapp-connect` | sim | sim | 10 | Conexão Evolution por QR in-platform (pareamento, status). `🔍 (PR #67 Socket)` |
| `whatsapp-import-history` | sim | sim | 6 | Importa histórico de conversas/mensagens da Evolution. `🔍 (PR #69/#70)` |
| `whatsapp-media-backfill` | sim | não | 5 | Recupera mídia recente recebida para o bucket privado (mídia antiga é irrecuperável). `🔍` |
| `whatsapp-avatar-sync` | sim | sim | 6 | Sincroniza fotos de perfil dos contatos (bucket `avatars`). `🔍 (branch fix/contact-avatars)` |
| `whatsapp-contacts-name-backfill` | **não** | — | — | One-shot: backfill de `whatsapp_name` via Evolution. Não implantada. `🔍 (Nameplate)` |
| `whatsapp-check-number` | **não (deploy pendente)** | — | — | Pré-checa se um número tem WhatsApp via Evolution (nova conversa para número inédito). **Deploy pendente** (memória). `🔍 (PR #102)` |

## Envio agendado / IA

| slug | impl. | jwt | ver. | propósito |
|------|:-----:|:---:|----:|-----------|
| `scheduled-send-worker` | sim | não | 5 | Worker (pg_cron/HTTP) que dispara `scheduled_sends` vencidos via `claim_due_scheduled_sends`. `🔍 (Chronicle)` |
| `ai-generate` | sim | sim | 4 | Proxy de geração LLM (Anthropic/OpenRouter/OpenAI); teto best-effort; grava `ai_usage_events`; chaves no Vault. `🔍 (v0.102 Cortex)` |

## Gestão de usuários (Admin/RBAC)

| slug | impl. | jwt | ver. | propósito |
|------|:-----:|:---:|----:|-----------|
| `invite-seller` | sim | sim | 12 | Cria usuário/seller e dispara convite (fluxo base). `🔍 (PRD-107)` |
| `invite-seller-email` | sim | sim | 13 | Convite por e-mail (Resend) com redirect configurável. `🔍 (#46)` |
| `reset-seller-password` | sim | sim | 12 | Reseta senha de um seller. `🔍 (PRD-107)` |
| `set-seller-role` | sim | sim | 12 | Troca o papel de um seller (atualiza `profiles`/claims). `🔍` |
| `set-seller-access` | sim | sim | 12 | Define acesso/override de um seller. `🔍 (PRD-212)` |
| `delete-seller` | sim | sim | 4 | Desliga/remove um seller. `🔍` |

## Infra / Observabilidade

| slug | impl. | jwt | ver. | propósito |
|------|:-----:|:---:|----:|-----------|
| `integration-secrets` | sim | sim | 8 | Gestão write-only de segredos no Vault (Resend/WhatsApp/webhook), auditada. `🔍 (Keyring)` |
| `health` | sim | **público** | 9 | Healthcheck público (`/functions/v1/health`); aceita `HEAD` (UptimeRobot). `🔍 (PRD-110)` |
| `hello-trace` | sim | sim | 10 | Canário de tracing/observabilidade. `🔍 (PRD-109)` |

---

## Perguntas / achados pendentes (Fase 3/4)

- ❓ **`ai-generate` está implantada (v4) mas o fonte não apareceu na árvore principal de `supabase/functions/`** (origem em worktree `feat+ai-llm-real-integration`). Confirmar se o fonte foi mergeado na `main`; caso não, há divergência repo↔produção.
- ❓ `list-models` é citada na memória do projeto (v0.104 Manifest) mas **não está implantada nem na pasta** — confirmar nome/estado.
- ❓ `whatsapp-check-number` e `whatsapp-contacts-name-backfill` estão no repo mas **não implantadas** — confirmar se `check-number` deve ser deployada (pendência da PR #102).
- ❓ Para cada função: mapear no fonte as **tabelas que toca**, **input/output** e **segredos** consumidos (aprofundar lendo `index.ts`).
