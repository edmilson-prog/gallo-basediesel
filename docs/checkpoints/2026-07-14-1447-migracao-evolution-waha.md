# Checkpoint — Migração Evolution → WAHA — 2026-07-14 14:47 UTC

> **Branch:** `fix/waha-import-duplicate-and-retry` · **Último commit:** `4a8b5834` fix(waha): reuse closed conversations on import + retry transient history fetch failures
> **Sessão anterior:** Claude Sonnet 5 · **Gerado em:** 2026-07-14T14:47:00Z

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-07-14-1447-migracao-evolution-waha.md` na íntegra e confirme em uma frase que entendeu:
1) o objetivo da sessão, 2) o estado atual do código, 3) qual é a próxima tarefa.
Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial (Vite/React/TanStack Router + Supabase) para distribuidora de peças pesadas. A plataforma está migrando as contas WhatsApp de produção do engine Evolution clássico para o novo engine WAHA, replicando o método já usado na migração anterior evolution-go → Evolution (2026-07-07).

## 🎯 Objetivo da sessão

Planejar (Plan Mode) e executar a migração Evolution → WAHA de todas as contas WhatsApp restantes, na ordem: `Teste-AILA` (piloto) → `Vendas` → `VendasExterna` → `Comercial Lucas` → `GALLO Site`. No caminho, dois bugs reais de produção foram encontrados e corrigidos no código do importador de histórico.

## ✅ Progresso (o que foi feito)

- [x] Plano de migração desenhado e aprovado via Plan Mode (3 agentes Explore + 2 agentes Plan). Plano salvo em `C:\Users\Edmilson Souza\.claude\plans\graceful-sprouting-petal.md`.
- [x] Limpeza de 3 contas Evolution de teste órfãs e desconectadas (`migration-test`, `Teste-222`, `Teste-3333`) — 338 conversas / 15.195 mensagens apagadas com confirmação explícita do dono, contas excluídas via `delete_whatsapp_account`.
- [x] Migration versionada e **aplicada em produção**: `supabase/migrations/20260713170000_migrate_whatsapp_account_rpc.sql` — RPC `migrate_whatsapp_account(old, new, dry_run)`, reutilizável, substitui o "SQL assistido" ad-hoc do precedente.
- [x] **Piloto `Teste-AILA` — migração COMPLETA.** Conta Evolution antiga (`520ef62d-...`) excluída; conta WAHA nova (`Teste-AILA — WAHA`, `793f2d92-7350-4155-ab19-83a7824bcff3`) ativa com as 45 conversas corretas. No meio do processo, o operador pareou o QR e importou histórico *antes* do repontamento — criou 29 conversas duplicadas, corrigidas manualmente (105 mensagens redundantes descartadas, 52 novas preservadas, merge por direção+horário). Documentado em `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-TESTE-AILA-2026-07-13.md`.
- [x] **`Vendas` repontada corretamente** (conta Evolution `9ceb9256-c8c6-445e-8259-37a98c43dd9a` → conta WAHA `d1a9f086-8932-4d69-a396-a5385a2f5ccd`) **antes** do pareamento — lição do piloto aplicada. Mesmo assim, ao rodar "Importar conversas" (histórico), um **bug real no código** criou 401 conversas novas indevidamente — reconciliado manualmente: 457 clientes, 561 conversas duplicadas removidas, mensagens deduplicadas.
- [x] **BUG #1 corrigido e deployado:** `landNormalizedChat` (import de histórico, Evolution + WAHA) usava `findOpenConversation` — só reconhecia conversa **aberta** como existente, diferente do webhook ao vivo (que reabre conversa fechada no inbound do cliente, spec 2026-07-03 §1.5). Renomeado para `findConversation` (qualquer status) em `src/providers/whatsapp/import/core.ts` + `supabase/functions/_shared/import-db.ts` + testes (1 teste novo de regressão). Deployado em produção (`whatsapp-import-history` v14).
- [x] **BUG #2 corrigido e deployado:** `processWahaImportBatch` (`waha-history-core.ts`) re-lista o histórico inteiro de chats a cada lote de 10, sem proteção contra falha transiente — um erro isolado (timeout/429/5xx) quebrava a requisição inteira com 500 em vez do try/catch por-chat absorver. Adicionado retry com backoff (3 tentativas, 300ms×tentativa) nas duas chamadas externas (listar chats, listar mensagens); erros de auth/not-found continuam falhando rápido, sem retry. 3 testes novos. Deployado em produção (`whatsapp-import-history` v15).
- [x] **Diagnosticado (com relatório de incidente trazido pelo dono) que o 2º 500 em `Vendas` foi causado por um incidente de infraestrutura separado**, não pelo nosso código: o container WAHA travou por OOM-kill do processo `gows` das 13:33 às 14:06 UTC (2026-07-14). Já resolvido pelo dono (`mem_limit` 2GB→5GB + serviço `autoheal` novo). **Confirmado via SQL que nenhuma mensagem foi perdida** — tudo que chegou durante a queda foi entregue em rajada logo após o restart (mesmo `sent_at`, `created_at` atrasado em até ~33min).
- [x] Commit `4a8b5834` criado e pushado nesta branch nova.

## 🔧 Estado do código

- **Branch:** `fix/waha-import-duplicate-and-retry` (1 commit à frente de `origin/main`) — criada do zero a partir da `origin/main` atualizada, porque a branch anterior do worktree (`fix/waha-scheduled-send-dispatch`) já estava mergeada via PR #277.
- **Último commit:** `4a8b5834` — `fix(waha): reuse closed conversations on import + retry transient history fetch failures`
- **Arquivos modificados nesta linha de trabalho:**
  - `src/providers/whatsapp/import/core.ts` (M) — `findOpenConversation` → `findConversation`, sem filtro de status
  - `src/providers/whatsapp/import/core.test.ts` (M) — mock renomeado + 1 teste novo (reaproveita conversa fechada)
  - `src/providers/whatsapp/import/waha-history-core.ts` (M) — `withWahaRetry` (retry com backoff) nas duas chamadas HTTP externas
  - `src/providers/whatsapp/import/waha-history-core.test.ts` (M) — 3 testes novos (retry em `/chats`, retry em `/messages`, erro não-transiente não tenta de novo)
  - `supabase/functions/_shared/import-db.ts` (M) — implementação Deno espelhando o rename + remoção do filtro de status
  - `supabase/functions/_shared/whatsapp/import/core.ts` (M) — mirror auto-gerado (`bun run scripts/sync-whatsapp-shared.ts`)
  - `supabase/functions/_shared/whatsapp/import/waha-history-core.ts` (M) — mirror auto-gerado
  - `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-TESTE-AILA-2026-07-13.md` (A) — fechamento do piloto
  - `supabase/migrations/20260713170000_migrate_whatsapp_account_rpc.sql` (A) — RPC de repontamento
- **Build/testes:** 1794/1794 passando (rodado antes do commit, `bun run test`).
- **⚠️ IMPORTANTE:** o código deste commit **já está rodando em produção** — a migration já foi aplicada via MCP e a edge function `whatsapp-import-history` já foi deployada (v14 e depois v15) ANTES deste commit existir. Este commit só sincroniza o Git com o que já está no ar; não é um "aplicar depois".
- **PR:** **ainda não criado** — próximo passo imediato (`gh pr create` a partir de `fix/waha-import-duplicate-and-retry` contra `main`).

## ⏳ Pendências (próximos passos, em ordem)

1. **Criar o PR** para `fix/waha-import-duplicate-and-retry` → `main` (`gh pr create`). Critério de pronto: PR aberto, CI verde.
2. **Confirmar que o "Importar conversas" em `Vendas` que o dono estava rodando terminou sem duplicar.** Rodar a mesma query de checagem usada nesta sessão (clientes com mais de uma conversa no `whatsapp_account_id` da WAHA `d1a9f086-8932-4d69-a396-a5385a2f5ccd`, cruzando `created_at` recente) — com os 2 bugs corrigidos, não deveria ter criado nenhuma duplicata nova.
3. **Sincronizar fotos** em `Teste-AILA` e `Vendas` (botão "Sincronizar fotos" na tela — o dono faz, roda por loja).
4. **Excluir a conta Evolution `Vendas` antiga** (`9ceb9256-c8c6-445e-8259-37a98c43dd9a`) — já está com 0 conversas/templates vinculados, só falta confirmação explícita do dono + rodar `delete_whatsapp_account`.
5. **Registrar doc de fechamento da migração `Vendas`** em `docs/integracoes/waha/`, mesmo formato do `Teste-AILA`.
6. **Migrar `VendasExterna`** (Evolution `382980ea-7fa6-493f-982e-b43da5931868`, ~305+ conversas) — runbook corrigido: criar sessão WAHA → **repontar IMEDIATAMENTE** (antes de parear ou importar) → deslogar Evolution → parear QR → restart → teste e2e → importar histórico (agora seguro com os 2 bugs corrigidos) → sincronizar fotos → excluir conta antiga → documentar.
7. **Investigar `Comercial Lucas`** (Evolution `69c75986-80d8-47b1-ba4c-318c04c8c2fa`) antes de migrar — está **desconectada há 13+ dias** (última mensagem 30/06), diferente das outras contas ativas. Entender por quê antes de simplesmente repetir o runbook.
8. **Migrar `GALLO Site`** (Evolution `d1d16b14-50ea-4090-b244-68f8b4d88181`, 786 conversas, ativa) — não estava no radar original da migração, apareceu no inventário desta sessão; é a 2ª maior conta.

## ❓ Decisões pendentes

- **Tratamento de `message_templates` vinculados a uma conta na hora de excluí-la** (bloqueia `delete_whatsapp_account` se houver): assunção adotada nesta sessão é repontar pra conta WAHA + `is_active = false` (reversível, preserva histórico) — mas nunca foi testado de verdade, porque nem `Teste-AILA` nem `Vendas` tinham templates vinculados. Se `VendasExterna`/`Comercial Lucas`/`GALLO Site` tiverem, confirmar essa abordagem com o dono antes de aplicar.
- **Quando revogar os secrets Vault das contas Evolution excluídas:** `credentials_ref` (`WA_EVO_CAMPANHAS`) é **compartilhado** entre todas as contas Evolution — não dá pra revogar até a ÚLTIMA conta migrar. Sem decisão de prazo ainda.

## 🚧 Bloqueios / Riscos

- Nenhum bloqueio ativo agora. **Risco a monitorar:** o servidor WAHA (`waha.ailainteligente.com.br`) teve 1 incidente de OOM-kill nesta sessão (13:33–14:06 UTC, 2026-07-14) — já mitigado (memória 2GB→5GB + `autoheal`), mas vale ficar atento durante os próximos imports grandes, sobretudo `GALLO Site` (786 conversas).

## ⚠️ Avisos do usuário (regras desta sessão)

- **Confirmar explicitamente cada ação destrutiva/de produção antes de executar** (excluir conta, aplicar migration, deploy de edge function, apagar mensagens) — seguido à risca a sessão inteira; o classificador de auto-modo chegou a bloquear 2 ações por confirmação insuficiente (exclusão de conversas de teste, exclusão da conta Evolution `Teste-AILA`) e a resposta correta foi parar e pedir confirmação explícita, não insistir.
- **"Quero migrar da mesma forma que fizemos da última vez"** — reusar o método da migração evolution-go→Evolution (criar → repontar → parear → reiniciar → validar e2e → importar → excluir), **sem** as janelas de observação de 14-30 dias que eu tinha sugerido inicialmente na estratégia de rollout.
- **Ordem de migração confirmada:** `Teste-AILA` (piloto) → `Vendas` → "todas as contas restantes" (`VendasExterna`, `Comercial Lucas`, `GALLO Site`).
- **`GALLO Matriz (Oficial)` NÃO entra nesta migração** — é conta `meta`, dormente, mantida por decisão de sessão anterior (registrada em memória do projeto).
- **Repontar SEMPRE antes de parear/importar** — o incidente de duplicação no piloto `Teste-AILA` (e o bug real encontrado em `Vendas`) só existiram porque essa ordem foi violada ou porque o import tinha um bug de verdade; a lição já está aplicada no runbook, mas reforçar verbalmente com o dono antes de cada conta nova evita repetição.

## 🛡️ Não regredir (features que devem continuar funcionando)

- `can_access_conversation` e as 3 RPCs-espelho (`count_conversations`, `search_conversations`, `search_conversation_messages`) — modelo "2 portões" **congelado**, não tocado nesta sessão.
- Isolamento do pipeline WAHA — `waha-connect`/`waha-webhook`/`waha-send` continuam **sem importar** `_shared/whatsapp/{send,webhook}/core.ts`. Os fixes desta sessão foram só no **import** (`_shared/whatsapp/import/core.ts` + `waha-history-core.ts`), não tocaram send/webhook/failover.
- Regra "instância é o portão-mestre": sempre copiar `whatsapp_account_access_rules` **antes** de repontar conversas pra conta nova — `migrate_whatsapp_account` já faz isso automaticamente, não pular esse passo se repontar manualmente por outro motivo.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/integracoes/evo-go/ENCERRAMENTO-EVO-GO-2026-07-07.md` — precedente/template da migração original (evolution-go → Evolution).
- `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-TESTE-AILA-2026-07-13.md` — fechamento do piloto, com a lição do bug de duplicação.
- `docs/dev/waha-integration.md` — arquitetura do engine WAHA.
- `docs/dev/conversation-access-model.md` — modelo "2 portões" (não tocar).
- `src/providers/whatsapp/import/core.ts` — `landNormalizedChat` + `IImportDb` (fix do bug de conversa fechada).
- `src/providers/whatsapp/import/waha-history-core.ts` — `processWahaImportBatch` (fix do retry).
- `supabase/functions/_shared/import-db.ts` — implementação Deno de `IImportDb`.
- `supabase/migrations/20260713170000_migrate_whatsapp_account_rpc.sql` — RPC de repontamento reutilizável.
- `CLAUDE.md` — convenções do projeto (versionamento, RTK, etc.).

## 🧠 Memórias relacionadas

- `project_waha_whatsapp_integration.md`
- `project_whatsapp_waha_lid_resolution.md`
- `project_evo_go_to_legacy_migration.md`
- `project_access_model_decision.md`
- `feedback_never_merge_pr_only.md`

## 📊 Atividade recente (telemetria)

Não há `.claude-metrics/annotations.jsonl` neste projeto — telemetria não configurada.

## 📚 Referências

- Plano de migração aprovado (Plan Mode): `C:\Users\Edmilson Souza\.claude\plans\graceful-sprouting-petal.md`
- PR #277 (trabalho anterior desta mesma worktree, já mergeado): `fix/waha-scheduled-send-dispatch`
- IDs das contas Evolution restantes: `Vendas` = `9ceb9256-c8c6-445e-8259-37a98c43dd9a` (WAHA nova: `d1a9f086-8932-4d69-a396-a5385a2f5ccd`), `VendasExterna` = `382980ea-7fa6-493f-982e-b43da5931868`, `Comercial Lucas` = `69c75986-80d8-47b1-ba4c-318c04c8c2fa`, `GALLO Site` = `d1d16b14-50ea-4090-b244-68f8b4d88181`.
