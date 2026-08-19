# PR #332 travada: correções do incidente de resgate de conversas (18/07) nunca entraram na main

> **Documento de contexto zero.** Este documento é autossuficiente: contém o diagnóstico completo, as evidências, os apontamentos de arquivos/documentos e os comandos para reproduzir cada verificação. Uma sessão nova pode partir daqui sem nenhum contexto prévio.
>
> Diagnóstico levantado em **2026-08-11**. Os números de produção são um *snapshot* dessa data — **revalidar antes de agir** (comandos na seção "Como reproduzir o diagnóstico").

## TL;DR

A PR **#332** (`fix/conversation-rescue-incident`) corrige as 4 causas-raiz do incidente de resgate de conversas de **18/07/2026** e **nunca foi mergeada**. Nenhuma PR posterior corrigiu essas causas — a última mudança funcional em `conversation-rescue` na `main` é de **17/07**, ou seja, **anterior** ao incidente.

O check `rls-regression` vermelho na PR é **alarme falso** de 18/07, já resolvido pela PR #376 (mergeada em 24/07). O único conflito de merge é **trivial** (um arquivo de teste, blocos acrescentados no fim por ambos os lados).

**Risco vivo:** o toggle está desligado, mas o cron continua ativo e existem **239 conversas** com espera acumulada (197 com +24 h, a mais antiga desde 23/06). Religar o toggle com o código atual da `main` dispara uma avalanche potencialmente **~10× maior** que o incidente original, porque a guarda que impede exatamente isso (`maxClientWaitHours`) só existe na PR não mergeada.

---

## 1. Contexto — o incidente de 18/07/2026

O dono ligou o toggle de resgate de conversas na loja Matriz. Em segundos a tela encheu de ofertas de resgate:

- **27 resgates para 8 conversas** em 10 minutos (loop de re-broadcast);
- o tick **forçou 8 atribuições** para 4 vendedores online antes do desligamento ganhar a corrida;
- o próprio dono, offline, **reclamou 19 dos próprios broadcasts** em 4 minutos (self-claim, no-op que só queimava a linha de resgate e realimentava o loop).

Remediação imediata já executada em produção na época: toggle off, 8 conversas revertidas ao dono original, 27 notificações de spam apagadas, trilha de auditoria `conversation_rescue_incident_revert`.

**A forense completa está na PR #332** — corpo da PR e no diff de `docs/dev/conversation-rescue.md` (seção "Incidente 2026-07-18"), que **só existe no branch**, não na `main`.

### As 4 causas-raiz e suas correções (todas dentro do #332)

| # | Causa-raiz | Correção |
|---|---|---|
| 1 | **Loop de re-broadcast** — o claim não limpa `awaiting_reply_since`; a graça fica permanentemente vencida para esperas antigas | Cooldown de **60 min** pós-resolução (`engine/rescueCooldown.ts`, puro + testado + espelhado em Deno), ciente de **época de espera** (mensagem nova do cliente = resgate imediato), com fetch ancorado nos mesmos relógios do engine |
| 2 | **Avalanche de backlog no enable** — toda espera antiga vira resgate de uma vez | **`maxClientWaitHours`** (default 24 h, parametrizável na tela): espera mais velha que a janela nunca gera resgate. Checado **antes** do ramo `schedule` em `determineAbsence` |
| 3 | **Painel sem filtro de audiência** — o ausente via e reclamava as próprias conversas | Oferta só para espectador **online**, nunca para o próprio ausente; teto visual (3 cards + "Mostrar mais N") e guarda de sequência no poll |
| 4 | **RPC aceitava self-claim** | Migration `20260718210000` recria `claim_conversation_rescue` com guarda **P0006** **antes** do recheque de vivacidade (a ordem é *load-bearing*: a rejeição de self-claim tem que vencer o P0005 de staleness) |

### Endurecimentos adicionais (2ª/3ª rodada de revisão adversarial, também só no #332)

- **Kill-switch real:** desligar o toggle **cancela** os broadcasts vivos da loja (`store_disabled`). Antes ficavam visíveis/reclamáveis para sempre e forçariam em massa no re-enable.
- **Re-validação pré-força:** `resolveTimeouts` **cancela** em vez de forçar quando a conversa mudou ou o ausente está genuinamente presente (online + no turno). Graça/janela **não** se re-aplicam na força — resgate de fim de semana deve forçar na segunda.
- **Caminhos de erro fail-safe:** erro no fetch de stores não vira "tudo desligado" (mass-cancel); erros transientes de leitura fazem retry no próximo tick, nunca cancelamento com razão falsa.

---

## 2. Situação atual — o que está na `main`

**Nada do #332 entrou.** Verificado por `git cat-file` / `git ls-tree` contra `origin/main`:

| Item | Na `main`? | Aplicado em prod? |
|---|---|---|
| `src/features/conversation-rescue/engine/rescueCooldown.ts` | ❌ ausente | — |
| `src/features/conversation-rescue/engine/rescueCooldown.test.ts` | ❌ ausente | — |
| `supabase/functions/_shared/conversation-rescue/engine/rescueCooldown.ts` (espelho Deno) | ❌ ausente | — |
| `maxClientWaitHours` em `engine/determineAbsence.ts` | ❌ ausente | — |
| Filtro de audiência em `components/RescueBroadcastClaim.tsx` | ❌ ausente | — |
| `supabase/migrations/20260718210000_conversation_rescue_claim_guards.sql` | ❌ ausente | ❌ `has_p0006_guard = false` |
| Seção "Incidente 2026-07-18" em `docs/dev/conversation-rescue.md` | ❌ ausente | — |

### Nenhuma PR posterior corrigiu isso

Histórico completo de `conversation-rescue` na `main`:

```
d0f1d1bf 2026-08-06 refactor: adopt severity tokens across the remaining scattered features (phase 6)   <-- cosmético
21d82277 2026-07-17 fix(conversation-rescue): remove dead-code UPDATE in claim RPC's stale-rescue rejection
21a80ed6 2026-07-17 fix(conversation-rescue): auto-cancel stale rescue broadcasts when the conversation resolves itself
...        2026-07-17 (feature original, PR #326)
```

A **última mudança funcional é de 17/07** — anterior ao incidente. O toque de 06/08 é apenas o refactor de tokens de severidade, sem relação.

Migrations de resgate presentes na `main` (todas de 17/07, nenhuma do fix):

```
supabase/migrations/20260717170000_conversation_rescues.sql
supabase/migrations/20260717180000_conversation_rescue_worker_secret.sql
supabase/migrations/20260717190000_conversation_rescue_cron_trigger.sql
```

---

## 3. Estado de produção (snapshot 2026-08-11)

**O que está seguro:**

- Toggle da Matriz: `enabled: false` — desligado desde o incidente.
  ```json
  {"enabled": false, "fallbackSellerIds": [], "forceAssignTimeoutMinutes": 5, "temporaryAbsenceGraceMinutes": 15}
  ```
  (persistido em `stores.settings -> 'conversationRescue'` — **não existe tabela `platform_settings`**; ver `src/providers/data/impl/supabase/settings.ts`)
- Os 27 resgates são **todos** de 18/07 e estão em estado **terminal** (19 `claimed`, 8 `forced`). **Zero pendentes** — não há fila de broadcast viva esperando para detonar no re-enable.

**O que está armado:**

- O cron `conversation-rescue-tick` (jobid 8) continua **`active = true`, rodando a cada minuto** (`* * * * *`). Está inerte apenas porque o toggle está off.
- `fallbackSellerIds` está **vazio** — limitação já documentada como risco na doc as-built.
- A RPC em prod **não tem** a guarda P0006 (`has_p0006_guard = false`), e a migration `20260718210000` **não consta** em `supabase_migrations.schema_migrations`.

### ⚠️ O risco quantificado

Conversas não resolvidas e atribuídas, com `awaiting_reply_since` preenchido:

| Métrica | Valor |
|---|---|
| Total aguardando | **239** |
| Aguardando há mais de 24 h | **197** |
| Aguardando há mais de 7 dias | **127** |
| Espera mais antiga | **2026-06-23** (~7 semanas) |

Religar o toggle hoje, com o código atual da `main`, expõe até **239 conversas** ao ciclo de resgate de uma vez — contra as 8 conversas / 27 resgates do incidente original. **A guarda `maxClientWaitHours` (default 24 h), que reduziria isso de 239 para ~42, só existe na PR #332 não mergeada.**

---

## 4. Por que a CI está vermelha — e por que é alarme falso

O check `rls-regression` da PR falhou em 18/07 com:

```
psql:supabase/tests/rls-regression.sql:127: ERROR:
  lucas: must not see other sellers' customers without an accessible conversation (cross-leak)
```

**Isso não tem relação com o #332.** Evidências:

1. Essa asserção fica na **linha ~104** do arquivo (bloco de clientes). O #332 **só acrescentou** um bloco no fim do arquivo (linha 1568+), e ainda por cima **com skip guard** — o teste de self-claim se auto-pula enquanto a migration `20260718210000` não estiver aplicada, justamente para a CI não nascer vermelha.
2. Era um bug de RLS **real em produção** (o workflow roda `psql` contra o banco alvo via secret `SUPABASE_DB_URL` — o resultado reflete o estado do banco, não só o código do branch).
3. Foi corrigido 6 dias depois pela **PR #376** — `fix(db): aplica o portão de instância na leitura de clientes (destrava o CI rls-regression)`, mergeada em **2026-07-24T20:42:53Z** (commit `6f3fcd35` na `main`).
4. A própria branch `fix/customers-select-instance-gate` mostra a virada: 3 runs `failure` seguidos de `success` em 24/07. **Todos os runs de `RLS regression` desde então estão verdes.**

**Conclusão: re-rodar o check hoje deve passar.** O vermelho é resíduo histórico de 18/07.

---

## 5. O que falta para mergear

### 5.1 Conflito de merge — apenas 1 arquivo, e é trivial

Verificado com `git merge-tree` (não modifica a árvore de trabalho):

```
Auto-merging src/features/conversation-rescue/components/RescueBroadcastClaim.tsx
Auto-merging src/shared/types/platform.ts
Auto-merging supabase/tests/rls-regression.sql
CONFLICT (content): Merge conflict in supabase/tests/rls-regression.sql
```

**Todo o código de feature faz auto-merge limpo.** O único conflito é em `supabase/tests/rls-regression.sql` e é do tipo "os dois lados acrescentaram blocos de teste no fim do arquivo, antes do `select 'ALL RLS REGRESSION TESTS PASSED'`":

- lado `main`: bloco novo `lead_via_conversation` (lead fiche spec, 20/07) e demais testes acrescentados nos 403 commits de deriva;
- lado `#332`: bloco de 63 linhas do self-claim guard (P0006).

**Resolução: manter os dois blocos.** Não há conflito semântico.

### 5.2 Passo a passo sugerido

> ⚠️ Regra do projeto (`CLAUDE.md`): **nunca** criar branch nem commitar no diretório principal. Começar criando worktree isolada.

1. `git worktree add .claude/worktrees/rescue-incident-rebase fix/conversation-rescue-incident` (ou `EnterWorktree`).
2. Rebase/merge de `origin/main` no branch, resolvendo o conflito único de `supabase/tests/rls-regression.sql` mantendo ambos os blocos.
3. **Revalidar** — 403 commits de deriva desde 18/07, atenção especial a `engine/determineAbsence.ts` e `src/shared/types/platform.ts`:
   - `bun run test` (a PR original marcava 2132/2132, +11 casos novos nos engines — o número mudou desde então)
   - `bun run build`
   - `bunx tsc --noEmit` avaliado **por delta** (há baseline de erros pré-existentes; ver `docs/` e a nota no `CLAUDE.md`)
4. Re-sincronizar os espelhos Deno se algum engine mudou: **`scripts/sync-conversation-rescue-shared.ts`** (script dedicado desta feature — não confundir com `sync-whatsapp-shared.ts`). Regra: mudou o engine fonte em `src/features/conversation-rescue/engine/` ⇒ rodar o sync **e** redeployar o tick.
5. Push, deixar a PR *ready for review*, confirmar que os checks ficaram verdes.
6. **Merge só com OK explícito do dono.**

### 5.3 Gates de produção pós-merge (cada um exige OK explícito do dono)

Nesta ordem:

1. **Aplicar a migration** `supabase/migrations/20260718210000_conversation_rescue_claim_guards.sql` via MCP (`apply_migration`). Lembrete: **mergear a PR não aplica a migration** — a aplicação em produção é manual.
2. **Redeploy do `conversation-rescue-tick`** — `npx supabase functions deploy conversation-rescue-tick`. O deploy empacota todo o grafo de imports (o corpo da PR contabiliza **14 arquivos**, contra 13 no deploy original de 17/07). O arquivo **novo** é o espelho `rescueCooldown.ts`. Imports diretos do tick no branch:
   ```
   supabase/functions/conversation-rescue-tick/index.ts
   ../_shared/env.ts
   ../_shared/http.ts
   ../_shared/serve.ts
   ../_shared/secrets.ts
   ../_shared/workerAuth.ts
   ../_shared/access/workSchedule.ts
   ../_shared/access/accessRecipients.ts
   ../_shared/conversation-rescue/engine/determineAbsence.ts
   ../_shared/conversation-rescue/engine/pickFallbackSeller.ts
   ../_shared/conversation-rescue/engine/rescueCooldown.ts   <-- NOVO
   ```
   Nota do deploy original: os arquivos precisam ser nomeados com o path relativo exato do import (`../_shared/...`) para o deploy resolver corretamente.
3. **Deploy do frontend** (Vercel, automático via merge na `main`).
4. **Só então religar** `enabled` por loja — e **preencher `fallbackSellerIds` antes** (hoje está `[]`, que é uma limitação conhecida e documentada).
5. **Smoke pós-religamento:** monitorar `public.conversation_rescues` nos primeiros minutos; com `maxClientWaitHours = 24h` o volume esperado cai de ~239 para a ordem de ~42 conversas elegíveis. Volume muito acima disso = a guarda não está ativa; desligar imediatamente.

---

## 6. Apontamentos — documentos e arquivos de referência

### No repositório (`main`)

| Caminho | O que é |
|---|---|
| `docs/dev/conversation-rescue.md` | Doc as-built da feature. **A seção "Incidente 2026-07-18" só existe no branch do #332** — chega na `main` junto com o merge |
| `src/features/conversation-rescue/` | Feature completa (components, config, engine, hooks) |
| `src/features/conversation-rescue/engine/determineAbsence.ts` | Onde entra a guarda `maxClientWaitHours` (antes do ramo `schedule`) |
| `src/features/conversation-rescue/config/defaults.ts` | `DEFAULT_CONVERSATION_RESCUE_SETTINGS` |
| `src/features/conversation-rescue/hooks/useConversationRescueSettings.ts` | Leitura/escrita de `IPlatformSettings.conversationRescue` |
| `src/providers/data/impl/supabase/settings.ts` | **Caso especial:** settings de plataforma vivem em `stores.settings`, não em tabela própria |
| `src/providers/data/impl/supabase/conversationRescues.ts` | Chama a RPC `claim_conversation_rescue` |
| `supabase/functions/conversation-rescue-tick/index.ts` | O tick (cron a cada minuto) |
| `supabase/tests/rls-regression.sql` | Suíte de RLS — **o único arquivo com conflito** |
| `supabase/migrations/20260717170000_conversation_rescues.sql` | Versão original da RPC `claim_conversation_rescue` (sem P0006) |
| `scripts/sync-conversation-rescue-shared.ts` | Gera os espelhos Deno em `supabase/functions/_shared/conversation-rescue/`. Mudou engine ⇒ rodar o sync e redeployar o tick |
| `supabase/functions/_shared/access/workSchedule.ts` · `accessRecipients.ts` | Também espelhos Deno consumidos pelo tick (agenda PRD-212 e destinatários por acesso) |
| `CLAUDE.md` | Regras de infra: migration manual, deploy de edge com OK do dono, worktree isolada obrigatória |

### No branch `fix/conversation-rescue-incident` (ainda não na `main`)

| Caminho | O que é |
|---|---|
| `supabase/migrations/20260718210000_conversation_rescue_claim_guards.sql` | Recria a RPC com a guarda **P0006**. O cabeçalho do arquivo documenta a ordem load-bearing das guardas |
| `src/features/conversation-rescue/engine/rescueCooldown.ts` (+ `.test.ts`) | Engine puro do cooldown de 60 min, ciente de época de espera |
| `supabase/functions/_shared/conversation-rescue/engine/rescueCooldown.ts` | Espelho Deno do acima |
| `docs/dev/conversation-rescue.md` (diff) | Seção "Incidente 2026-07-18" — forense completa |

### PRs e histórico relacionados

| Ref | Estado | Relação |
|---|---|---|
| **PR #332** | **ABERTA** — objeto deste issue | O fix do incidente |
| PR #326 | MERGEADA (17/07) | A feature original de resgate de conversas |
| PR #376 | MERGEADA (24/07) | `fix(db)`: portão de instância na leitura de clientes — **é o que destravou o `rls-regression`**, tornando o vermelho do #332 obsoleto |
| Commit `6f3fcd35` | na `main` | O merge do #376 |

---

## 7. Como reproduzir o diagnóstico

### Estado do código

```bash
# Nada do #332 está na main?
git fetch origin
for f in src/features/conversation-rescue/engine/rescueCooldown.ts \
         supabase/migrations/20260718210000_conversation_rescue_claim_guards.sql; do
  git cat-file -e origin/main:"$f" 2>/dev/null && echo "EXISTE $f" || echo "AUSENTE $f"
done

# Histórico da feature na main
git log --oneline --pretty="%h %ad %s" --date=short origin/main -- src/features/conversation-rescue

# Deriva e conflitos (não modifica nada)
git rev-list --count origin/main..origin/fix/conversation-rescue-incident   # ahead
git rev-list --count origin/fix/conversation-rescue-incident..origin/main   # behind
git merge-tree --write-tree --name-only origin/main origin/fix/conversation-rescue-incident
```

### Estado da CI

```bash
gh pr checks 332
gh run list --workflow="RLS regression" --limit 20 \
  --json conclusion,createdAt,headBranch \
  --jq '.[] | "\(.createdAt)  \(.conclusion)  \(.headBranch)"'
```

### Estado de produção (MCP Supabase, somente leitura)

```sql
-- Guarda P0006 e migration aplicada?
select
  (select pg_get_functiondef('public.claim_conversation_rescue(uuid)'::regprocedure) like '%P0006%')
    as has_p0006_guard,
  (select exists(select 1 from supabase_migrations.schema_migrations
                  where version = '20260718210000')) as migration_applied;

-- Toggle por loja
select s.name as loja, s.settings -> 'conversationRescue' as rescue_settings
from public.stores s order by s.name;

-- Resgates existentes (esperado: só 18/07, todos terminais)
select date_trunc('day', created_at)::date as dia, status, count(*)
from public.conversation_rescues group by 1, 2 order by 1 desc;

-- ⚠️ O risco: backlog de espera acumulada
select
  count(*) filter (where awaiting_reply_since is not null)                            as aguardando_total,
  count(*) filter (where awaiting_reply_since < now() - interval '24 hours')          as mais_24h,
  count(*) filter (where awaiting_reply_since < now() - interval '7 days')            as mais_7d,
  min(awaiting_reply_since)                                                           as espera_mais_antiga
from public.conversations
where status <> 'resolved' and assigned_seller_id is not null;

-- O cron continua ativo?
select jobid, jobname, schedule, active from cron.job where jobname ilike '%rescue%';
```

---

## 8. Checklist de execução

- [ ] Revalidar o snapshot de produção (seção 7) — os números podem ter mudado desde 2026-08-11
- [ ] Criar worktree isolada a partir de `fix/conversation-rescue-incident`
- [ ] Rebase/merge de `origin/main`, resolvendo `supabase/tests/rls-regression.sql` **mantendo ambos os blocos**
- [ ] Conferir espelhos Deno de `conversation-rescue/engine/` (src ↔ `_shared`)
- [ ] `bun run test` verde
- [ ] `bun run build` verde
- [ ] `bunx tsc --noEmit` avaliado por delta (baseline pré-existente)
- [ ] Push; PR #332 *ready*; checks verdes (o `rls-regression` deve passar agora)
- [ ] **OK do dono** → merge
- [ ] **OK do dono** → aplicar migration `20260718210000`
- [ ] **OK do dono** → `npx supabase functions deploy conversation-rescue-tick`
- [ ] Deploy do front (automático via Vercel no merge)
- [ ] Preencher `fallbackSellerIds` da Matriz (hoje `[]`)
- [ ] **OK do dono** → religar `enabled` por loja
- [ ] Smoke: monitorar `conversation_rescues` nos primeiros minutos; volume muito acima de ~42 = guarda inativa, desligar na hora
- [ ] Exportar a migration para `supabase/migrations/` no mesmo PR (já está — confirmar que sobreviveu ao rebase)

---

## 9. Riscos e ressalvas

- **Não foi rodado `build`/`test` no branch rebaseado.** A validação da PR (2132/2132) é de 18/07, antes dos 403 commits de deriva. Tudo na seção 5.2 precisa ser efetivamente executado, não assumido.
- **`maxClientWaitHours` é o item mais crítico do lote.** Se por qualquer motivo o merge for fatiado, essa guarda tem que entrar **antes** de qualquer religamento do toggle.
- **A ordem das guardas na RPC é load-bearing** — P0006 (self-claim) tem que vir **antes** do recheque de vivacidade (P0005). O teste de RLS depende dessa ordem. Não reordenar ao resolver conflitos.
- **O cron nunca foi desligado.** Está ativo e rodando a cada minuto desde 17/07; o que segura tudo é só o `enabled: false`. Qualquer alteração acidental nesse campo religa o comportamento.
