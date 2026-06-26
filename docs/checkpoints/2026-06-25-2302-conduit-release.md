# Checkpoint — Release v0.121.0 `Conduit` (Evolution Go) — 2026-06-25T23:02-03:00

> **Branch:** `chore/checkpoint-conduit-release` · **Último commit (main):** `758ccf0` Merge pull request #174
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-26T02:02:49Z

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-25-2302-conduit-release.md` na íntegra e confirme em uma frase
que entendeu: 1) o objetivo da sessão, 2) o estado atual do código, 3) qual é a próxima tarefa.
Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial para distribuidora de peças pesadas (Frederico Westphalen/RS). Stack: React 19 + TypeScript strict + Vite + TanStack Router/Query + Tailwind v4 + shadcn/ui + Supabase (Auth/DB/Edge/Storage/RLS). Em produção (`crm.gallobasediesel.com.br`) rodando `supabase` em dados e auth desde o go-live (2026-06-10). O módulo trabalhado nesta sessão é a **integração WhatsApp**, especificamente a **migração do motor Evolution API v2.3.7 (Baileys) para Evolution Go (whatsmeow)** — servidor `https://evogo.ailainteligente.com.br`.

## 🎯 Objetivo da sessão

A sessão começou retomando a **Fase 5 (UI de pareamento Go)** da migração Evolution Go (já implementada via Subagent-Driven antes da compactação) e cobriu a **finalização do release**:
1. Mergear o PR #173 (Fases 0+1+2+5 do Evolution Go) na `main` — **autorizado pelo dono ("pode mergear")**.
2. **Bump de versão + versionamento** do release.
3. **Atualizar a `main` local** com o estado remoto.

**Tudo concluído nesta sessão.** Não há trabalho de código em andamento.

## ✅ Progresso (o que foi feito)

- [x] **PR #173 mergeado** na `main` — merge commit `29ea456` (Evolution Go Fases 0+1+2+5; preserva os 43 commits atômicos; CI verde Vercel + types-drift). UI de pareamento Go (10 commits `b4d939a..9d30206`) entrou em produção via deploy Vercel.
- [x] **Bump de versão v0.121.0 `Conduit`** — commit `0d7d811`:
  - `package.json`: `0.120.0` → `0.121.0`
  - `CHANGELOG.md`: nova seção `[0.121.0] — Conduit · 2026-06-25` (Added/Changed, voltada ao usuário em pt-BR)
  - `CLAUDE.md`: codinome atual (`Conduit`) + lista de tags sincronizados
- [x] **PR #174 mergeado** (release/bump) na `main` — merge commit `758ccf0`.
- [x] **Tag `v0.121.0`** criada e empurrada, apontando para `758ccf0`.
- [x] **GitHub Release** [v0.121.0 — Conduit](https://github.com/edmilson-prog/gallo-basediesel/releases/tag/v0.121.0) publicado.
- [x] **Branch remota** `release/v0.121.0-conduit` deletada (limpeza pós-merge).
- [x] **`main` local** fast-forward `fc134b2` → `758ccf0` (0 behind de `origin/main`). FF limpo, sem checkout (a `main` não estava ativa em nenhum worktree).
- [x] **Memória atualizada** — `project_evolution_go_migration.md` registra o lançamento v0.121.0 Conduit.

## 🔧 Estado do código

- **Branch:** `main` = `origin/main` = `758ccf0` (sincronizadas). A branch desta sessão de trabalho (`claude/beautiful-fermat-fba8fa`) e a `release/v0.121.0-conduit` já estão mergeadas.
- **Working tree:** limpo (apenas `.serena/` untracked, scratch pré-existente).
- **Build/testes:** não rodados nesta sessão — o bump é só versão + docs, sem mudança de código de produto. O gate de código da Fase 5 já fora validado na implementação (160 arquivos / 1169 testes verdes, build OK, tsc delta zero).
- **Escopo desta sessão (Evolution Go) é UI-only** — zero toque em `src/providers/whatsapp/` ou `supabase/functions/` na Fase 5, portanto sem necessidade de mirror sync.
- **PRs abertos relacionados:** nenhum. (Abertos no repo, **não** relacionados a esta sessão: #110 eliminação demo/mock; #9 página "em breve".)
- **Edge Functions Go em prod:** `whatsapp-webhook`, `whatsapp-connect`, `whatsapp-send` já deployadas (Fase 2). Migration `20260625120000` aplicada em prod.

## ⏳ Pendências (próximos passos, em ordem)

Nenhuma pendência de código minha. Todos os itens abaixo são **gates do dono** (externos):

1. **Smoke e2e do Evolution Go** (dono) — em produção: Configurações → WhatsApp → "Adicionar número" → escolher Evolution Go → informar servidor + chave global → parear por QR → confirmar status **"Conectada"** → enviar/receber 1 mensagem real.
   - **Critério de "feito":** número Go conectado e mensagem real trafegando nos dois sentidos.
   - **Destrava:** resolve os 2 contratos ainda não verificados — (a) corpo do `/message/downloadimage` (mediaKey base64 vs `[]int`); (b) shape exato do webhook + **onde** vem o `instanceToken` — além da idempotência do `connectGoInstance` em re-QR.
   - **Se algum contrato divergir:** é hotfix de Edge Function (`supabase/functions/whatsapp-webhook` e/ou `whatsapp-connect`) → novo PR + redeploy (CLI supabase autenticada é o caminho preferido). ⚠️ Mudou `src/providers/whatsapp/` ⇒ rodar `scripts/sync-whatsapp-shared.ts` + redeploy.
2. **Rotacionar a global API key** do servidor Evolution Go (dono) — a chave passou pelo chat em sessões anteriores; trocar no servidor Go e regravar no Vault via Configurações → Integrações → Chaves & API.
3. **Fase 3 (futura)** — paridade de avatar/profile-phone do motor Go (espelhar o que o motor v2 já faz). Ainda não planejada.

## ❓ Decisões pendentes

Nenhuma em aberto do lado do desenvolvimento. Decisões já tomadas e fechadas nesta linha de trabalho:
- **Go como padrão + v2 ainda disponível** (wizard tem seletor de provedor). ✅ implementado.
- **Chave global colada por número** (cada conta Go = `credentialsRef` único, senão `_INSTANCE_TOKEN` colide). ✅ implementado.
- **Botão "Adicionar número" sempre habilitado** (1ª conta Go do zero). ✅ implementado.
- **Bump = MINOR** (`0.120.0` → `0.121.0`): capacidade nova e backward-compatible. Codinome `Conduit` (conduíte/novo canal de transmissão).

## 🚧 Bloqueios / Riscos

- **Smoke e2e gated** nas credenciais/decisão do dono — sem o smoke, os 2 contratos Go (downloadimage body; webhook/instanceToken) seguem não-verificados em produção real. A UI e as edges estão no ar, mas o pareamento real só foi exercitado depois que o dono executar o smoke.
- **Teto de orçamento / nada relacionado a este release.** Sem riscos de regressão conhecidos: os fluxos meta/v2 ficam byte-idênticos (verificado nos reviews por-task e no review final opus).

## ⚠️ Avisos do usuário (regras desta sessão)

- **NUNCA mergear sem autorização expressa** — toda integração via PR (push + PR). Por extensão, confirmar antes de `apply_migration`/deploy de edge em prod. (Nesta sessão o dono autorizou explicitamente "pode mergear" para #173 e #174.)
- **NÃO tocar no cache do atendimento** (ordem expressa): signing em lote #137, Realtime, query keys, RPC gated-once estão **congelados**. Ao mexer em Inbox/conversa, escopar só ao alvo.
- **Segredos vivem no Vault**, nunca no banco nem no código.
- **Responder em português do Brasil** com acentuação correta.
- **`rtk` não está instalado** neste ambiente — usar `git` puro (apesar do CLAUDE.md global citar RTK).
- **Ignorar `.claude/worktrees/`** ao raciocinar sobre a `main` — MAS o cwd **é** o worktree `beautiful-fermat-fba8fa`; trabalhar normalmente nele.
- **Bump de versão é passo de release à parte** — só fazer quando solicitado (foi solicitado: "faz bump e versiona").

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Conexão WhatsApp pelo motor Evolution v2 (Baileys)** e pelo Meta Cloud — inalterados; o wizard, a conexão, edição e exclusão preservam o comportamento v2 byte-a-byte.
- **Atendimento (Inbox / Conversa / Distribuição)** — performance de mensagens e mídia (gated-once RPC, batch signing) intocada.
- **Modelo de acesso "2 portões"** (atendimento por instância + carteira por dono) — não afetado.
- **Multi-instância WhatsApp** (Switchboard) — não afetado.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `src/features/admin-settings/components/AddInstanceWizard.tsx` — wizard provider-aware (ramo Go: cria row + grava `_API_KEY` no Vault + fases QR).
- `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` — tela de contas Go-aware (gates `isEvolutionFamily`, edição/exibição Go via `instanceId`).
- `src/features/admin-settings/utils/goCredentials.ts` — `generateGoCredentialsRef` (env-style `WA_EVO_GO_<SLUG>_<SUF>`).
- `src/features/admin-settings/utils/accountDraft.ts` — extração do draft (meta/v2/go).
- `src/shared/utils/whatsappProvider.ts` — helper `isEvolutionFamily`.
- `src/providers/whatsapp/evolution-go/` — engine runtime-agnostic (constants/errors/media/parser/client/instance/EvolutionGoProvider).
- `supabase/functions/whatsapp-connect/index.ts` — ramo Go (qr=create→Vault token→connect→QR; status/logout/restart/delete).
- `supabase/functions/whatsapp-webhook/index.ts` — rota `/evolution-go` (parser whatsmeow, gate por `instanceToken`).
- `docs/dev/evolution-go-edges.md` — runbook das edges Go.
- `docs/dev/evolution-go-api-contracts.md` — contratos da API Go (inclui os 2 abertos).
- `docs/integracoes/evo-go/doc.json` — swagger versionado.
- `CLAUDE.md` — convenções do projeto. · `CHANGELOG.md` — histórico de versões.

## 🧠 Memórias relacionadas

- `project_evolution_go_migration.md` — estado-mestre da migração (atualizada com o release v0.121.0).
- `feedback_never_merge_pr_only.md` — regra: nunca mergear sem autorização.
- `feedback_atendimento_cache_do_not_touch.md` — cache do atendimento congelado.
- `project_evolution_global_apikey_required.md` — apikey global vs per-instância.
- `project_concurrent_version_race.md` — corrida de versão (por isso `git fetch` antes de escolher o número — nesta sessão sem corrida).

## 📊 Atividade recente (telemetria)

Sem arquivo de telemetria (`.claude-metrics/annotations.jsonl` ausente).

## 📚 Referências

- Entrega base (Evolution Go): PR [#173](https://github.com/edmilson-prog/gallo-basediesel/pull/173) — merge `29ea456`.
- Release/bump: PR [#174](https://github.com/edmilson-prog/gallo-basediesel/pull/174) — merge `758ccf0`.
- Tag/Release: [v0.121.0 — Conduit](https://github.com/edmilson-prog/gallo-basediesel/releases/tag/v0.121.0).
- Plano: `docs/superpowers/plans/2026-06-25-evolution-go-pairing-ui.md`.
- Spec: `docs/superpowers/specs/2026-06-25-evolution-go-pairing-ui-design.md`.
