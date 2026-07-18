# Checkpoint — Migração Evolution → WAHA (VendasExterna fechada) — 2026-07-15 23:39 UTC

> **Branch:** `docs/checkpoint-waha-vendasexterna-2026-07-15` (criada da `main` só para este arquivo) · **Último commit da `main`:** `086887a6` docs: close out VendasExterna Evolution->WAHA migration (#297)
> **Sessão anterior:** Claude Sonnet 5 · **Gerado em:** 2026-07-15T23:39:38Z
> **Worktree:** `.claude/worktrees/feature+waha-whatsapp-integration` — branch de trabalho original `fix/waha-import-duplicate-and-retry` (já 100% mergeada, sem commits pendentes; ficou "morta" depois do PR #279).

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-07-15-2339-migracao-evolution-waha-vendasexterna.md` na íntegra e confirme em uma frase que entendeu:
1) o objetivo da sessão, 2) o estado atual do código, 3) qual é a próxima tarefa.
Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial (Vite/React/TanStack Router + Supabase) para distribuidora de peças pesadas. A plataforma está migrando as contas WhatsApp de produção do engine Evolution clássico para o novo engine WAHA (self-hosted, `devlikeapro/waha`), replicando o método já usado na migração anterior evolution-go → Evolution (2026-07-07).

## 🎯 Objetivo da sessão

Sessão começou restaurando o estado de uma worktree que tinha crashado (`feature+waha-whatsapp-integration`), reconstituindo o progresso a partir de um checkpoint anterior (`docs/checkpoints/2026-07-14-1447-migracao-evolution-waha.md`) e do histórico git. Confirmado que nada tinha sido perdido no crash — tudo já estava mergeado. A partir daí, o usuário pediu para prosseguir com a próxima conta da fila: migrar `VendasExterna` de Evolution para WAHA, seguindo o runbook já validado em 3 contas anteriores (`Teste-AILA`, `Vendas`, `GALLO Site`).

## ✅ Progresso (o que foi feito)

- [x] Sessão restaurada com sucesso — worktree/branch identificados, checkpoint anterior lido, PR #279 confirmado `MERGED` (2026-07-14T19:43:43Z), zero trabalho perdido.
- [x] Estado da conta `VendasExterna` (Evolution, `382980ea-7fa6-493f-982e-b43da5931868`) verificado no banco antes de agir: 305 conversas, `connected`, sem sessão WAHA ainda.
- [x] Owner criou a sessão WAHA via UI: `VendasExterna — WAHA` (`5cfd2beb-ca13-4037-8c88-1832e4039ac9`), sessão `vendasexterna-waha-17d2dc`.
- [x] Repontamento aplicado via RPC `migrate_whatsapp_account` (dry-run → apply, rodado por MCP `execute_sql`): 305 conversas movidas, 3 regras de acesso copiadas, 0 templates vinculados. Verificado por query direta pós-apply (0 na conta antiga, 305 na nova).
- [x] Evolution deslogada, QR pareado na sessão WAHA, sessão reiniciada — `connected` confirmado.
- [x] Validação e2e (3 testes) — **todos confirmados por evidência de banco, não só relato**:
  - Inbound: mensagem "Isos" de outro número, `direction:in`, `status:delivered`.
  - Eco do celular: mensagem `fromMe:true` via evento `message.any`, `direction:out`/`author_type:seller`, sem duplicar.
  - Outbound pelo composer: mensagem "Teste-de-envio-(Isos)", `direction:out`, `status:sent`, exercitando o pipeline `waha-send` (caminho historicamente frágil — já foi causa do bug do PR #273).
- [x] Import de histórico rodado na conta WAHA nova: 236 chats processados, 0 conversas novas, 0 mensagens importadas, 4.704 mensagens "já existiam" (esperado — o repontamento já carregava o histórico completo via `conversation_id`).
- [x] Sincronização de fotos: 79 contatos processados, 66 fotos encontradas.
- [x] Conta Evolution antiga excluída pelo dono via UI — confirmado por ausência na tabela `whatsapp_accounts`.
- [x] Verificação final: 306 conversas na conta WAHA nova (305 + 1 nova do teste de outbound), 0 na Evolution antiga, 0 clientes com mais de uma conversa (zero duplicata residual).
- [x] Doc de encerramento escrito: `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-VENDASEXTERNA-2026-07-15.md`.
- [x] Commit `6681b894` na branch nova `docs/waha-vendasexterna-closure` (criada a partir da `main`, já que o PR #279 original estava fechado e não dava pra empilhar).
- [x] **PR #297 aberto e MERGEADO na `main`** (squash, branch remota apagada) — commit final na `main`: `086887a6`.

## 🔧 Estado do código

- **Nenhuma mudança de código nesta sessão** — só o doc de encerramento (`docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-VENDASEXTERNA-2026-07-15.md`), já mergeado.
- **Branch de trabalho original da worktree** (`fix/waha-import-duplicate-and-retry`): 0 commits à frente da `main`, working tree limpa.
- **Esta branch de checkpoint** (`docs/checkpoint-waha-vendasexterna-2026-07-15`): criada da `main` só para conter este arquivo; sem mudanças de código.
- **Build/testes:** não rodados nesta sessão (não houve mudança de código-fonte, só SQL via MCP e doc).
- **PRs abertos relacionados a esta migração:** nenhum. PR #297 já mergeado.
- **Outros PRs abertos no repo (não relacionados a esta sessão):** #286 (OpenWA checkpoint, draft), #271 (bug de visibilidade de clientes), #267 (fix inbox status refresh), #266/#263 (import DINTEC), #110 (eliminação modo demo, draft), #9 (landing page).

## ⏳ Pendências (próximos passos, em ordem)

1. **Investigar `Comercial Lucas`** (Evolution `69c75986-80d8-47b1-ba4c-318c04c8c2fa`) — está **desconectada há mais de 13 dias** (última mensagem em 30/06), diferente de todas as outras contas migradas até agora, que estavam ativas. **Não aplicar o runbook às cegas** — entender a causa da desconexão primeiro (a conta pode estar morta/abandonada, banida, ou só esquecida). Critério de "feito" desta etapa: decisão tomada e registrada (migrar como as outras, migrar com cuidado extra, ou não migrar) antes de qualquer ação de produção.
2. **Migrar `Comercial Lucas`** (se a investigação acima concluir que deve migrar) — mesmo runbook das 4 contas anteriores: criar sessão WAHA → repontar (`migrate_whatsapp_account`, dry-run→apply) → deslogar Evolution → parear QR → reiniciar → validar e2e (3 testes, **confirmar contra o banco antes de aceitar como feito**) → importar histórico → sincronizar fotos → excluir conta antiga → documentar em `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-COMERCIAL-LUCAS-<data>.md`.
3. **`GALLO Matriz (Oficial)`** (`a7b1be48-...`, provider `meta`) — confirmar que continua **fora** desta migração (decisão de sessão anterior, conta dormente mantida de propósito). Não é uma tarefa, é um lembrete de não mexer.
4. **Decisão adiada: quando revogar o secret Evolution compartilhado** `WA_EVO_CAMPANHAS` — usado por todas as contas Evolution ainda existentes (só `Comercial Lucas` resta depois desta sessão, mais a `GALLO Matriz` que é `meta`, não usa esse secret). Só revogar depois que `Comercial Lucas` migrar (ou a decisão for não migrá-la).
5. **Débito de baixo risco, não bloqueante:** instâncias Evolution órfãs no servidor remoto para `Vendas` e `GALLO Site` — o teardown remoto não roda quando a exclusão é via RPC/SQL direto em vez da Edge Function `whatsapp-connect action=delete`. Não afeta a plataforma, só limpeza de infraestrutura externa.

## ❓ Decisões pendentes

- **`Comercial Lucas` desconectada há 13+ dias: migrar do mesmo jeito ou tratar diferente?**
  - Opção A: investigar a causa da desconexão primeiro (pode ser conta abandonada por decisão do dono, não um bug) e só migrar se fizer sentido reconectá-la.
  - Opção B: migrar direto (repontar + parear um QR novo resolveria a desconexão de qualquer forma).
  - Inclinação atual: nenhuma — o checkpoint anterior já registrava isso como "investigar antes", ainda sem decisão tomada nesta sessão.
- **Tratamento de `message_templates` vinculados a uma conta na hora de excluí-la** (bloqueia `delete_whatsapp_account` se houver) — segue sem teste real, porque nenhuma das 4 contas migradas até agora tinha templates vinculados. Se `Comercial Lucas` tiver, decidir com o dono antes de aplicar (repontar pra WAHA + `is_active=false` é a assunção adotada, nunca testada).

## 🚧 Bloqueios / Riscos

- Nenhum bloqueio ativo. Risco a monitorar (herdado de sessão anterior): servidor WAHA (`waha.ailainteligente.com.br`) já teve 1 incidente de OOM-kill (2026-07-14, mitigado com `mem_limit` 2GB→5GB + `autoheal`) — vale atenção em imports grandes, mas `Comercial Lucas` está desconectada então não deve ter volume alto pra importar de qualquer forma.

## ⚠️ Avisos do usuário (regras desta sessão)

- **Nunca aceitar "já fiz"/"já validei" em passo de produção sem cruzar contra o banco antes de marcar como concluído.** Nesta sessão, o usuário relatou "validado"/"já fiz" 3 vezes (outbound pelo composer, import de histórico, exclusão da conta antiga) e em 2 dos 3 casos (outbound, import) o banco mostrou que o passo ainda não tinha rodado de fato — a checagem pegou antes de prosseguir. Comportamento a manter: sempre verificar `messages`/`integration_logs`/contagens antes de aceitar um passo como pronto, mesmo quando o usuário afirma que já fez. Não é desconfiança pessoal — é que a UI tem duas contas com nomes quase idênticos (`VendasExterna` Evolution vs. `VendasExterna — WAHA`) e é fácil clicar na errada.
- **Confirmar explicitamente cada ação destrutiva/de produção antes de executar** — seguido à risca: o dry-run do repontamento foi mostrado e só aplicado (`dry_run=false`) depois de "confirma" explícito do usuário; a exclusão da conta antiga também teve pedido de confirmação explícita antes (o usuário informou que já tinha feito, e isso foi verificado).
- **Repontar SEMPRE antes de parear/importar** — lição de sessões anteriores, reaplicada aqui sem incidente.

## 🛡️ Não regredir (features que devem continuar funcionando)

- `can_access_conversation` e as 3 RPCs-espelho (modelo "2 portões") — **congelado**, não tocado nesta sessão.
- Isolamento do pipeline WAHA — `waha-connect`/`waha-webhook`/`waha-send` continuam sem importar `_shared/whatsapp/{send,webhook}/core.ts`. Nenhuma mudança de código nesta sessão, só operação (SQL via MCP + cliques na UI pelo dono).
- RPC `migrate_whatsapp_account` (`supabase/migrations/20260713170000_migrate_whatsapp_account_rpc.sql`) — reutilizável, já usada em 4 migrações sem alteração; deve continuar servindo pra `Comercial Lucas`.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-VENDASEXTERNA-2026-07-15.md` — encerramento desta sessão, modelo pra replicar em `Comercial Lucas`.
- `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-VENDAS-2026-07-14.md` e `ENCERRAMENTO-EVOLUTION-GALLO-SITE-2026-07-14.md` — precedentes com os 3 bugs de código já corrigidos.
- `docs/checkpoints/2026-07-14-1447-migracao-evolution-waha.md` — checkpoint anterior, usado para restaurar esta sessão.
- `supabase/migrations/20260713170000_migrate_whatsapp_account_rpc.sql` — RPC de repontamento reutilizável.
- `docs/dev/waha-integration.md` — arquitetura do engine WAHA.
- `docs/dev/conversation-access-model.md` — modelo "2 portões" (não tocar).
- `CLAUDE.md` — convenções do projeto.

## 🧠 Memórias relacionadas

- `project_waha_whatsapp_integration.md` — atualizada nesta sessão com o fechamento de `VendasExterna` e a lição sobre verificar "já fiz" contra o banco.
- `project_whatsapp_waha_lid_resolution.md`
- `project_evo_go_to_legacy_migration.md`
- `project_access_model_decision.md`
- `feedback_never_merge_pr_only.md`

## 📊 Atividade recente (telemetria)

Não há `.claude-metrics/annotations.jsonl` neste projeto — telemetria não configurada.

## 📚 Referências

- PR #279 (base WAHA import fixes, mergeado 2026-07-14): https://github.com/edmilson-prog/gallo-basediesel/pull/279
- PR #297 (encerramento VendasExterna, mergeado 2026-07-15): https://github.com/edmilson-prog/gallo-basediesel/pull/297
- IDs restantes: `Comercial Lucas` = `69c75986-80d8-47b1-ba4c-318c04c8c2fa` (Evolution, desconectada); `GALLO Matriz (Oficial)` = `a7b1be48-...` (meta, fora do escopo).
