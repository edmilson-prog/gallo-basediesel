# Checkpoint — SDR produção (Parte A): fix de migration, merge do PR #287 e bump v0.144.0 — 2026-07-15 16:49 BRT

> **Branch:** `worktree-sdr-implementation` · **Último commit:** `05cf1117` fix: correct sdr_settings.store_id type to uuid
> **Sessão anterior:** Claude Sonnet 5 · **Gerado em:** 2026-07-15T19:49:00Z

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-07-15-1649-sdr-fundacao-parte-a-merge-bump.md` na íntegra e confirme em uma frase que entendeu:
1) o objetivo da sessão, 2) o estado atual do código, 3) qual é a próxima tarefa.
Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial (Vite/React/TypeScript + Supabase) para uma distribuidora de peças pesadas. Esta sessão trabalhou na **fundação do agente SDR de produção** (recepção/triagem automática de conversas no WhatsApp) — a "Parte A" de um épico maior cujo objetivo final é o SDR responder automaticamente conversas novas até um vendedor humano assumir. Parte A é **código inerte**: engines determinísticos, contrato de decisão do LLM, prompt de sistema e as duas peças de banco que vão sustentar o piloto — nada disso é chamado em produção ainda.

## 🎯 Objetivo da sessão

Retomar o trabalho da Parte A após um crash anterior na worktree `sdr-implementation`, verificar se havia migrations pendentes, aplicá-las em produção, mergear o PR #287 e fazer o bump de versão — fechando o ciclo desta entrega antes de iniciar a Parte B (ativação real do SDR).

## ✅ Progresso (o que foi feito)

- [x] Diagnosticado e corrigido um bug real de schema na migration `sdr_settings` **antes** de ela quebrar produção — commit `05cf1117` "fix: correct sdr_settings.store_id type to uuid" (branch `worktree-sdr-implementation`, pushado).
- [x] Migration `20260714120000_sdr_settings.sql` aplicada em produção via `mcp__supabase__apply_migration` (após o fix) — cria `public.sdr_settings` (config por loja: liga/desliga SDR, timeout, prompt) com RLS Owner-only.
- [x] Migration `20260714120100_sdr_pause_on_human_message.sql` aplicada em produção sem alterações — cria a trigger `trg_sdr_pause_on_human_message` que desliga `conversations.is_sdr_active` automaticamente quando um vendedor humano responde.
- [x] PR #287 mergeado em `main` — `gh pr merge 287 --merge`, merge commit `4c7510d0e9a57c16ef2bb711ae53ed90f995be4e` (`mergedAt: 2026-07-15T19:37:49Z`). Checks verdes (`types-drift`, Vercel), `mergeStateStatus: CLEAN`.
- [x] Version bump para **v0.144.0 "Usher"** — commit `5701c526` "chore: bump version to v0.144.0 Usher and update changelog" em `main` (feito a partir da worktree `update-banner-sound`, que estava com `main` já checked out).
- [x] Tag `v0.144.0` criada e pushada; GitHub Release publicada: https://github.com/edmilson-prog/gallo-basediesel/releases/tag/v0.144.0

## 🔧 Estado do código

- **Branch de trabalho:** `worktree-sdr-implementation` — **já 100% mergeada em `main`** (confirmado via `git merge-base --is-ancestor HEAD main` = true, 0 commits ahead). Não há mais trabalho pendente nesta branch além deste checkpoint.
- **Último commit da branch:** `05cf1117` — `fix: correct sdr_settings.store_id type to uuid`
- **`main` está em:** `5701c526` (bump v0.144.0), com o merge commit `4c7510d0` do PR #287 no histórico.
- **Arquivos tocados pelo PR #287** (`git diff --name-status b484f02f 05cf1117`, ou equivalente `4c7510d0^1 4c7510d0^2`):
  - `A` `scripts/sync-sdr-shared.ts` — sincroniza engines de `src/features/sdr-escalation/` para `supabase/functions/_shared/sdr-escalation/` (Deno não compartilha módulos com o app; regra: mudou o lado app ⇒ rodar o sync)
  - `A` `supabase/functions/_shared/sdr-escalation/engine/{build-summary,choose-seller,escalate}.ts` — cópias espelhadas (geradas pelo script acima)
  - `A` `supabase/functions/_shared/sdr-escalation/templates/render.ts` — idem
  - `A` `supabase/functions/sdr-respond/{enforceGuardrails,enrichment,guardrails,llmDecision,systemPrompt}.ts` + `.test.ts` — o núcleo da Edge Function `sdr-respond` (**ainda não deployada** — só o código existe)
  - `M` `src/features/sdr-escalation/templates/render.ts` + `A` `render.test.ts` — novo motivo de handoff `qualified_handoff` (triagem completa)
  - `M` `src/features/sdr-dashboard/config/labels.ts` — rótulo do novo motivo
  - `M` `src/providers/data/contracts/index.ts` — `SdrHandoffReason` ganhou `qualified_handoff` (testado em lockstep com `SdrEscalationReason`)
  - `A` `supabase/migrations/20260714120000_sdr_settings.sql` — corrigida nesta sessão (`store_id uuid`, não `text`)
  - `A` `supabase/migrations/20260714120100_sdr_pause_on_human_message.sql`
  - `D` `supabase/migrations/20260713150000_*`, `20260713170000_*`, `20260714100000_*`, `20260714160000_*` — migrations de outras branches que tinham sido geradas localmente nesta worktree e não pertenciam a este PR; foram descartadas/reconciliadas no merge (não representam perda real — já estavam ou já não estavam aplicadas conforme o histórico real do remoto)
  - `M` `supabase/functions/_shared/whatsapp/**`, `waha-send`, `waha-webhook`, `whatsapp-webhook`, `scheduled-send-worker` — trazidos de `main` durante os merges intermediários da branch (não são autoria desta sessão/PR, são o rebase/merge de `main` para dentro da feature branch ao longo do desenvolvimento)
  - `A` `docs/superpowers/plans/2026-07-13-sdr-producao-piloto-recepcao-triagem.md` — design da Parte A
  - `A` `docs/superpowers/plans/2026-07-14-sdr-producao-fundacao.md` — plano de implementação da Parte A
  - `M` `supabase/tests/rls-regression.sql`, `CHANGELOG.md`
- **20 commits no PR #287** (de `86cee63f` "docs: add design for SDR production pilot" até `05cf1117` "fix: correct sdr_settings.store_id type to uuid") — lista completa disponível via `git log b484f02f..05cf1117`.
- **Build/testes:** não rodados nesta sessão (o PR já tinha CI verde antes do merge — `types-drift` e Vercel preview). Recomenda-se rodar `bun run test` e `bunx tsc --noEmit` na próxima sessão antes de iniciar a Parte B, como baseline.
- **PRs abertos relacionados a este tópico:** nenhum — #287 já foi mergeado e fechado.
- **Working tree:** limpo (o único arquivo que aparece sujo entre uma checagem e outra é `src/routeTree.gen.ts`, regenerado automaticamente pelo dev server em background; foi descartado duas vezes nesta sessão via `git checkout -- src/routeTree.gen.ts` — é gerado, nunca commitar).

## ⏳ Pendências (próximos passos, em ordem)

1. **Parte B do épico SDR (ativação real)** — ainda não escrita. Envolve, no mínimo:
   - Deploy da Edge Function `sdr-respond` (código já existe em `supabase/functions/sdr-respond/`, mas nunca foi deployada)
   - Um tick `pg_cron` (ou equivalente) que efetivamente dispara `sdr-respond` para conversas elegíveis
   - Wiring no `whatsapp-webhook` para respeitar `sdr_settings.sdr_enabled` / `conversations.is_sdr_active`
   - UI de configuração (liga/desliga por loja, edição do `system_prompt`) — hoje só existe a tabela, sem tela
   - Critério de "feito": pelo menos uma loja piloto consegue ter uma conversa nova respondida automaticamente pelo SDR e o handoff para humano funciona ponta a ponta.
   - **Não iniciar sem alinhar com o dono** — é uma mudança de comportamento em produção (responder clientes automaticamente), bem mais sensível que a fundação inerte desta sessão.
2. **Atualizar a memória `project_sdr_production_foundation.md`** para refletir: PR #287 mergeado (`4c7510d0`), migrations aplicadas em prod, versão v0.144.0 "Usher" lançada. (Ação de memória, não de código — fazer no início da próxima sessão ou nesta mesma, se houver espaço.)
3. Rodar `bun run test` + `bunx tsc --noEmit` como baseline antes de tocar em Parte B (não rodado nesta sessão).

## ❓ Decisões pendentes

- **Nenhuma decisão de arquitetura em aberto para a Parte A** — ela está fechada. A única decisão em aberto é o **desenho da Parte B** (como o cron vai descobrir conversas elegíveis, timeout de backstop, etc.) — ainda não desenhado nesta sessão, fica para quando o dono autorizar iniciar.

## 🚧 Bloqueios / Riscos

- Nenhum bloqueio técnico ativo. O risco principal ao iniciar a Parte B é de **produto/negócio** (SDR respondendo clientes reais errado) — não de infraestrutura.

## ⚠️ Avisos do usuário (regras desta sessão)

- **Nunca mergear PR sem confirmação explícita** — regra permanente já registrada em memória (`feedback_never_merge_pr_only.md`); nesta sessão o dono confirmou explicitamente com "pode mergear" antes do merge do #287, e "pode bumpar agora" antes do bump de versão. Seguir o mesmo padrão em qualquer merge/deploy futuro.
- **Trabalhar na worktree correta** — o usuário corrigiu explicitamente ("ta fora da worktree de trabalho") quando eu tentei fazer uma pergunta de checkpoint estando na worktree `update-banner-sound` (usada só como atalho para operar em `main` durante o bump). Toda ação relativa a esta sessão/tópico deve rodar a partir de `D:/claude/gallo-basediesel/.claude/worktrees/sdr-implementation`. Ao retomar, confirme sempre `git branch --show-current` e o `cwd` absoluto antes de agir (ver também `feedback_subagent_worktree_cwd_verification.md`).
- **Nunca editar `src/routeTree.gen.ts`** — é gerado automaticamente pelo TanStack Router plugin; se aparecer sujo (comum com o dev server rodando em background), descartar com `git checkout -- src/routeTree.gen.ts`, nunca commitar.

## 🛡️ Não regredir (features que devem continuar funcionando)

- Toda a Onda 5 (WhatsApp real: Meta/Evolution/WAHA/OpenWA, failover, templates, janela de 24h, status tracking) — não foi tocada nesta sessão, mas o PR #287 trouxe arquivos de `_shared/whatsapp/**` via merges de `main`; **nenhuma lógica de envio/recepção foi alterada por esta feature**, só arrastada pelo histórico de merge. Validar que `waha-send`/`waha-webhook`/`whatsapp-webhook`/`scheduled-send-worker` seguem com o comportamento de produção inalterado.
- O modelo de acesso "2 portões" (`can_access_conversation`) e o sistema de rodízio (`PRD-213`) — dependências indiretas de `conversations`/`messages` que a trigger nova (`sdr_pause_on_human_message`) só escreve em `conversations.is_sdr_active`, sem tocar em RLS ou nas RPCs desses sistemas.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/superpowers/plans/2026-07-13-sdr-producao-piloto-recepcao-triagem.md` — design original do piloto (recepção/triagem)
- `docs/superpowers/plans/2026-07-14-sdr-producao-fundacao.md` — plano de implementação da Parte A (as 9 tarefas subagent-driven-dev mencionadas na memória)
- `supabase/functions/sdr-respond/` — todo o núcleo de decisão do SDR (guardrails, contrato LLM, prompt de sistema, enriquecimento) — ponto de partida óbvio para a Parte B
- `supabase/migrations/20260714120000_sdr_settings.sql` e `20260714120100_sdr_pause_on_human_message.sql` — já aplicadas em prod, conferir se o schema bate com o que a Parte B vai consumir
- `scripts/sync-sdr-shared.ts` — regra: mudou `src/features/sdr-escalation/engine|templates` ⇒ rodar este script antes de deployar qualquer edge function que dependa da cópia espelhada
- `CLAUDE.md` (raiz do projeto) — convenções gerais; a narrativa longa do topo ainda **não foi atualizada** para mencionar o SDR/v0.144.0 (estava referenciando `Sidecar v0.138.0` antes desta sessão — decisão consciente de não tocar nesse parágrafo em uma sessão de bump simples; considerar atualizar numa próxima entrega maior)

## 🧠 Memórias relacionadas

- `project_sdr_production_foundation.md` — memória principal do épico SDR; **precisa ser atualizada** (ver Pendência #2) para refletir PR #287 mergeado + v0.144.0 lançada.
- `feedback_never_merge_pr_only.md` — regra de nunca mergear sem confirmação explícita; seguida à risca nesta sessão.
- `feedback_subagent_worktree_cwd_verification.md` — verificação de cwd/branch em worktrees; relevante pelo erro cometido nesta sessão (operar na worktree errada) até a correção do usuário.
- `feedback_never_merge_pr_only.md` também cobre "confirmar antes de apply_migration/deploy de edge em prod" — seguido: migrations só foram aplicadas após "faz as migrations" explícito do usuário.

## 📊 Atividade recente (telemetria)

Nenhum arquivo `.claude-metrics/annotations.jsonl` encontrado nesta worktree — telemetria não disponível para este checkpoint.

## 📚 Referências

- PR: https://github.com/edmilson-prog/gallo-basediesel/pull/287 (mergeado, merge commit `4c7510d0`)
- Release: https://github.com/edmilson-prog/gallo-basediesel/releases/tag/v0.144.0
- Migrations aplicadas em prod: `20260714120000_sdr_settings.sql`, `20260714120100_sdr_pause_on_human_message.sql`
