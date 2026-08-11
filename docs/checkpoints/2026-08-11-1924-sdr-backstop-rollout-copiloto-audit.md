# Checkpoint — Rollout do fix do backstop SDR + auditoria do Copiloto — 2026-08-11T19:24-03:00

> **Branch:** `worktree-sdr-backstop-eligibility-fix` · **Último commit:** `d9c42283` docs(sdr): fix reactivation order and add rollout safety notes
> **Sessão anterior:** Claude Fable 5 · **Gerado em:** 2026-08-11T19:24:32-03:00

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-08-11-1924-sdr-backstop-rollout-copiloto-audit.md` na íntegra e confirme em uma frase que entendeu:
1) o objetivo da sessão, 2) o estado atual do código, 3) qual é a próxima tarefa.
Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial (React 19 + Vite + TanStack Router, Supabase, WhatsApp multi-engine). Produção viva em crm.gallobasediesel.com.br. Módulos trabalhados nesta sessão: **SDR de produção** (backstop tick + escalonamento) e **Copiloto de conversa** (painel do atendimento).

## 🎯 Objetivo da sessão

A sessão começou como investigação ("o SDR está totalmente implementado?") e virou **resposta a incidente**: ao ligar o piloto pela 1ª vez (20/07 ~22:33), o `sdr-backstop-tick` disparou 16 mensagens em massa (backlog exposto: 1.620–2.256 conversas). Objetivos encadeados: conter → diagnosticar → corrigir com segurança (spec+plano+subagent-driven) → rollout completo em prod → e, em paralelo, auditar o Copiloto de conversa a pedido do dono.

## ✅ Progresso (o que foi feito)

- [x] **Contenção do incidente** (20/07): toggles de loja/instância desligados (parte pelo dono), crons pausados via `cron.alter_job`. Dano final: 16 mensagens, 1 burst único. Decisão do dono: mensagens enviadas ficam como estão.
- [x] **Causa raiz confirmada**: threshold=0 fora do horário + sem corte de recência (`queued_at` nunca atualiza em fila) + sem cap + elegibilidade cega a quem falou por último.
- [x] **Spec aprovado** — `docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md`, commit `4e68220d`.
- [x] **Plano** — `docs/superpowers/plans/2026-07-20-sdr-backstop-eligibility-fix.md`, commit `b4655947`.
- [x] **Implementação (6 tasks, subagent-driven, todas aprovadas)**: migration `f0add7ff`, engine `d1ebbfbd`, tick reescrito `247bbe66`, gates no escalation-tick `c3900713`, docs `ce1d37be`, fix pós-revisão `d9c42283`. Revisão final de branch (Opus): "Ready to merge: Yes".
- [x] **PR #345 MERGEADO** (21/07 12:11Z) — depois incluso no bump v0.154.0 "Dossier" (PR #348).
- [x] **Rollout em prod (21/07, cada passo com OK do dono)**: deploy `sdr-backstop-tick` v3 + `sdr-escalation-timeout-tick` v2 (`--no-verify-jwt`); migration `20260720210000` aplicada (sondas 5/5); higiene (2 escalações do incidente já estavam `abandoned`; **630 flags `is_sdr_active` legadas resetadas** — efeito colateral: 626 conversas re-enfileiradas com `queued_at=now`, inócuo p/ elegibilidade nova); crons re-armados; 1º tick das versões novas `200 OK` nos logs.
- [x] **Prova de segurança do religamento**: simulação SQL — regra antiga pegaria 2.256 conversas; regra nova completa: **0** no momento do flip.
- [x] **Auditoria do Copiloto** (workflow 4 leitores + verificação adversarial + sondas prod): real desde v0.108.0 "Quill", resumo/alertas = 3 regras determinísticas (não LLM), botão IA com 1 uso na história; **bug crítico confirmado** (prompt lia as 200 msgs mais ANTIGAS; 157 conversas >200 msgs). Memória: `project_conversation_copilot_audit`.
- [x] (Sessão posterior de 22/07, fora desta conversa) Fix do Copiloto implementado — **PR #355 draft**, branch `worktree-copilot-conversa-gaps`, migration `20260722120000` NÃO aplicada. Ver memória atualizada.

## 🔧 Estado do código

- **Branch:** `worktree-sdr-backstop-eligibility-fix` — **0 commits à frente de `origin/main`** (tudo mergeado via PR #345). Worktree em `.claude/worktrees/sdr-backstop-eligibility-fix`.
- **Working tree:** limpa exceto `src/routeTree.gen.ts` (M) — arquivo **gerado** pelo dev server, falso positivo conhecido; não commitar (memória `project_routetree_merge_block`).
- **Build/testes (na época do merge):** 2236/2236 verdes, build limpo, tsc delta zero.
- **PRs relacionados:** #345 (MERGED — este fix), #348 (MERGED — bump v0.154.0), **#355 (DRAFT — fix do Copiloto, outra sessão/branch)**.

## 📡 Estado VIVO de produção (verificado em 2026-08-11 19:24 BRT)

- `sdr_settings.sdr_enabled`: **1 loja LIGADA** (dono ligou em algum momento após 21/07).
- `whatsapp_accounts.sdr_enabled`: **0 instâncias ligadas** → **SDR continua 100% inerte** (o gate por instância fecha tudo; era esperada a instância "GALLO Site — WAHA (55) 9900-3314").
- Mensagens do SDR desde o incidente: **0**. Crons: ambos `active=true`, tickando sem erro.
- ⚠️ Nota de design: o marco `sdr_activated_at` da **instância** é carimbado quando o toggle da instância flipar — mesmo com a loja ligada há semanas, ligar a instância agora carimba marco novo e o backlog segue inelegível. Confirmar carimbos com: `select store_id, sdr_enabled, sdr_activated_at from sdr_settings; select label, sdr_enabled, sdr_activated_at from whatsapp_accounts;`

## ⏳ Pendências (próximos passos, em ordem)

1. **Ativar de fato o piloto SDR** — dono marcar a instância "GALLO Site — WAHA (55) 9900-3314" em `/app/sdr` → Configurações (a loja já está on). Critério de feito: 1º atendimento real do SDR verificado nos logs (`sdr-backstop-tick` com `activated≥1` + `sdr-respond` 200 + mensagem entregue) sem disparo indevido. **A RPC `sdr_backstop_candidates` não tem teste automatizado — vigiar o 1º tick pós-flip é a validação que falta.**
2. **Copiloto — PR #355 (draft, branch `worktree-copilot-conversa-gaps`)**: aplicar migration `20260722120000` → deployar Edge `copilot-generate` → marcar ready + merge → smoke. Ordem documentada em `docs/dev/copilot-assistant-settings.md`. (Trabalho da sessão de 22/07 — ver memória `project_conversation_copilot_audit` para o escopo A1–A7.)
3. **Faxina de worktrees** (opcional): remover `sdr-implementation`, `sdr-panel-consolidation`, `sdr-escalation-timeout` e esta (`sdr-backstop-eligibility-fix`) — todas 100% mergeadas (`git rev-list --count origin/main..<branch>` = 0). Dependência: nenhuma.

## ❓ Decisões pendentes

- **Copiloto em conversas de lead / PWA externo** (gap de alcance: painel só monta com `customerId`) — decisão de produto/roadmap. Nota: o PR #355 (A2) já pode ter endereçado o caso lead — **verificar o diff do #355 antes de retrabalhar**.
- **Sub-projeto B do Copiloto** (resumo/sugestões via LLM, cache, reserva atômica do teto) — deferido; projeção ~R$375/mês com cache.

## 🚧 Bloqueios / Riscos

- Passo 1 depende exclusivamente do dono (toggle de instância).
- O PR #355 está em draft com migration não aplicada — mergeá-lo sem aplicar a migration/deploy quebra a ordem documentada (migration→deploy→merge).

## ⚠️ Avisos do usuário (regras desta sessão)

- **NUNCA mergear sem OK explícito; sempre PR** (memória permanente). `apply_migration`/deploy de Edge em prod só com confirmação.
- Mensagens do incidente **ficam como estão** — nenhuma remediação junto aos clientes.
- Trabalhar **em worktree isolada** para correções (pedido explícito desta sessão).
- NUNCA `git stash` (stack compartilhado entre worktrees).
- Dono testa UI pessoalmente — não abrir browser para validar.

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Elegibilidade nova do backstop** (6 condições, timer por `last_inbound_at`, cap 10/tick, fail-closed) — nunca reintroduzir varredura de backlog.
- **Gates de piloto no `sdr-escalation-timeout-tick`** (com piloto off = no-op integral).
- Trigger `stamp_sdr_activated_at` nas 2 tabelas (religar = renovar marco).
- Claim idempotente do tick e trigger de pausa-por-humano (Parte A) — intocados, sagrados.
- Cache/realtime do atendimento — **congelado** (memória `feedback_atendimento_cache_do_not_touch`).

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md` — o design aprovado (regras de elegibilidade).
- `docs/superpowers/plans/2026-07-20-sdr-backstop-eligibility-fix.md` — plano + **seção Rollout** (runbook executado; passos 5–7 são o que resta).
- `supabase/functions/sdr-backstop-tick/{index.ts,eligibility.ts}` — tick novo + engine puro.
- `supabase/migrations/20260720210000_sdr_backstop_eligibility.sql` — carimbos + RPC + índice (APLICADA em prod).
- `docs/dev/sdr-production-activation.md` — guia operacional reescrito (checklist de reativação na ordem segura).
- `docs/dev/copilot-assistant-settings.md` — pendências do PR #355 (Copiloto).
- `CLAUDE.md` — convenções.

## 🧠 Memórias relacionadas

- `project_sdr_backstop_mass_dispatch_incident` — incidente + correção + rollout (a mais completa).
- `project_sdr_production_foundation` — Partes A/B/C/D do SDR.
- `project_conversation_copilot_audit` — auditoria + fix do Copiloto (PR #355, atualizada em 23/07).
- `feedback_never_merge_pr_only`, `feedback_subagent_worktree_cwd_verification`, `project_migrations_apply_manual_mcp`, `project_routetree_merge_block`.

## 📊 Atividade recente (telemetria)

Telemetria não ativa neste projeto (`.claude-metrics/` inexistente na worktree).

## 📚 Referências

- PR do fix: https://github.com/edmilson-prog/gallo-basediesel/pull/345 (MERGED)
- PR do Copiloto: https://github.com/edmilson-prog/gallo-basediesel/pull/355 (DRAFT)
- Release: v0.154.0 "Dossier" (PR #348)
- Ledger da execução subagent-driven: `.superpowers/sdd/progress.md` (nesta worktree, git-ignored)
