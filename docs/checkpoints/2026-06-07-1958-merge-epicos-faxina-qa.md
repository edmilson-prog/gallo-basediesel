# Checkpoint — Merge PRD-026/027 + varredura de regressão + faxina + QA — 2026-06-07T19:58:45-0300

> **Branch:** `main` · **Último commit:** `9b9c2a4` docs(claude): refresh CLAUDE.md — comprehensive structure + current state
> **Sessão anterior:** Claude Opus 4.8 (1M) · **Gerado em:** 2026-06-07T19:58:45-0300

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo docs/checkpoints/2026-06-07-1958-merge-epicos-faxina-qa.md na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do
código, 3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial para distribuidora de peças diesel pesado. Stack: React 19 + TS strict + Vite + TanStack Router (file-based; `routeTree.gen.ts` GERADO) + TanStack Query + Tailwind v4 + shadcn/ui (new-york) + Vitest + bun. SPA na Vercel, Fase 1 (Frontend First) sobre mocks determinísticos; Provider Pattern pronto para Supabase (Fase 2). Esta sessão consolidou os dois épicos da "Central de Atendimento — Camada de Mídia": **PRD-026 (Gestão de Mídia / Vault)** e **PRD-027 (Envio Rápido & Biblioteca de Ativos / Dispatch)** — agora **mergeados na `main`**.

## 🎯 Objetivo da sessão

Começou como investigação de uma suposta regressão (o seletor de loja parecia ter sumido) e evoluiu para: varredura completa de regressão, correção de débitos de type-safety, **merge dos 2 épicos na `main`**, faxina de branches/worktrees do repositório, atualização do `CLAUDE.md`, e início do **QA manual**. Objetivo macro: deixar a `main` íntegra, versionada/tagueada e o repo limpo, com o QA pronto para rodar.

## ✅ Progresso (o que foi feito)

- [x] **Falso alarme do StoreSwitcher** — investigado: não era regressão (estado transiente do dev server; código/dados/build íntegros). Sem mudança.
- [x] **Varredura de regressão em 2 camadas** — Camada 1 (gates: build/Vitest verdes; ESLint sem regressão real, ~46k "erros" = CRLF). Camada 2 (workflow multi-agente, 14 agentes, 8 dimensões, verificação adversarial) → **0 regressões funcionais/runtime**.
- [x] **19 erros de type-safety corrigidos** (mascarados porque o build da Vite/esbuild não checa tipos), commit `7c744e1`; **indentação** do `ConversationProvider`, commit `ef6c147`. Verificado: build verde, 244 testes, tsc 344→325 (0 em arquivos novos).
- [x] **Checkpoint anterior atualizado** (`216276a`) com a varredura+fixes.
- [x] **PR #37 (PRD-026, Vault) mergeado** na `main` (merge commit `a8b4164`) → tag **`v0.67.0`**.
- [x] **PR #38 (PRD-027, Dispatch) mergeado** na `main` (merge commit `c4dc703`) → tag **`v0.68.0`**. Sequência empilhada limpa (#37 antes do #38).
- [x] **Build + 244 testes verificados verdes na `main`** pós-merge (em `c4dc703`).
- [x] **Faxina de branches** — 22+ refs removidas com checagem de segurança individual: `feat/prd-026`/`feat/prd-027` (4), 9 locais + 8 remotas `feat/*`/`fix/*`, `backup/main-pre-reset` (local-only), 4 worktrees estagnadas + 2 worktrees local-only. Sobrou só `main` + PR #9.
- [x] **`CLAUDE.md` atualizado na `main`** (`9b9c2a4`) — merge da versão rica da branch `worktree-update-claude-md` (`fbe5be8`) + aviso de worktrees preservado + fatos corrigidos para v0.68.0 (Vitest, 33 providers, árvore de providers atual, gotcha do build-sem-type-check). Commit direto na main **autorizado pelo usuário**.
- [x] **QA manual iniciado** — dev server confirmado em **http://localhost:5173** (PID 5964); roteiro pronto.

## 🔧 Estado do código

- **Branch:** `main` · **== `origin/main`** (em dia)
- **Último commit:** `9b9c2a4` — docs(claude): refresh CLAUDE.md
- **Working tree:** limpo — apenas `M src/routeTree.gen.ts` (gerado, NÃO commitar) + untracked `knip.json` e `docs/relatorio-codigo-morto-2026-06-04.md` (deixar)
- **Build/testes:** `bun run build` (Vite) VERDE · `vitest run` **244 testes VERDES** (verificados como ground truth no merge `c4dc703`; desde então só mudou doc, não afeta) · `tsc --noEmit` 325 (baseline pré-existente; **0 em código novo**)
- **Tags:** `v0.67.0` (Vault) e `v0.68.0` (Dispatch) criadas e pushadas
- **PRs:** #37 **MERGED** · #38 **MERGED** · #9 **OPEN** (não-relacionado, preservar)

## ⏳ Pendências (próximos passos, em ordem)

1. **QA manual (EM ANDAMENTO)** — rodar `docs/qa/PRD-027-checklist.md` (Seção A=PRD-026 Vault, Seção B=PRD-027 Dispatch B1–B12). Dev server: `http://localhost:5173` (hard refresh). Trocar papéis: Owner `fernando@gallobasediesel.com.br` (FG), Gestor `marina@gallobasediesel.com.br` (MC), Vendedor `lucas@gallobasediesel.com.br` (LC). Critério: itens marcados; **divergências reportadas pelo código do item** (ex.: `B6 — temperatura não subiu`). **Papel do Claude:** investigar no CÓDIGO o item reportado (NÃO abrir browser — teste visual é do usuário) e propor fix.
2. **Chip do Copiloto (RF-024/RF-026):** o **receptor** está pronto (`useCopilotAssetHandoff`/`openAssetPicker`); o **chip** só quando o **PRD-025** for implementado.
3. **(Opcional) Baseline do `tsc`:** 325 erros pré-existentes na `main` — fora de escopo; atacar só se solicitado, por delta.
4. **(Opcional) INDEX de PRDs:** marcar PRD-026/027 como concluídos — pendente decidir qual `docs/prds/INDEX-*.md` é canônico.

## ❓ Decisões pendentes

- **Qual INDEX de PRDs é o canônico?** Há múltiplos snapshots versionados. Inclinação: nenhuma — aguardar o usuário apontar antes de editar.
- **PR #9** (`feat: pagina em breve...`, branch `claude/confident-stonebraker-c6d008`): segue aberto, é do usuário; **não mexer** sem ordem explícita.

## 🚧 Bloqueios / Riscos

- **`routeTree.gen.ts`** aparece como `M` o tempo todo (gerado) — nunca commitar; descartar com `git checkout -- src/routeTree.gen.ts` antes de operações que reclamem de working tree sujo.
- **Dev server:** gallo na **5173**; a **5174** é outro projeto (lexa-juridico) — não confundir.
- Nenhum bloqueio funcional: `main` íntegra, build/testes verdes.

## ⚠️ Avisos do usuário (regras desta sessão)

- **Usuário testa a UI manualmente** — NÃO abrir browser/devtools para validar. No QA, o Claude investiga o item reportado **no código**, não na tela.
- **Mergear PR é tarefa do usuário** — exigiu **autorização explícita** ("autorizo você a mergear os PRs #37 e #38"). Não mergear/abrir/fechar PR sem ordem clara. **PR #9 deve ficar intocado.**
- **Commit direto na `main`** exige confirmação explícita (foi dada para o CLAUDE.md nesta sessão; não é blanket).
- **Ignorar worktrees** por padrão (regra do CLAUDE.md) — exceto quando o usuário pedir explicitamente para limpá-las (como nesta sessão).
- **Nunca trocar acentos por ASCII**; responder em português do Brasil.
- **NÃO commitar:** `src/routeTree.gen.ts` (gerado), `knip.json`, `docs/relatorio-codigo-morto-2026-06-04.md`.
- **CRLF em `git add`/ESLint** = falso-positivo conhecido (autocrlf) — NÃO rodar prettier para "corrigir".
- **`tsc --noEmit`** tem baseline (~325) — gate real é `bun run build` (Vite) + `vitest run`; o build **não** faz type-check; avaliar código novo por **delta** (cruzar com `git diff --name-status main...HEAD --diff-filter=A`).
- **24h supply-chain guard** (`bunfig.toml minimumReleaseAge`) — confirmar antes de adicionar pacote aos excludes.
- Commits terminam com: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Composer (PRD-011):** texto (Enter envia / Shift+Enter quebra), emoji, menu de anexo (Imagem/Documento/Áudio), templates HSM, sugestões IA, janela 24h (`canSendFreeText`), copilot strip. Clique **primário** do Enviar envia agora (agendar é secundário).
- **Galeria de mídia (PRD-026):** botão Mídias, aba Mídias do cliente, lightbox, arquivamento inbound (`useEnsureInboundMedia`), governança sensível.
- **MessageBubble:** ramos system/[template]/imagem/áudio/documento/texto + os novos `[produto]`/`[link]`.
- **Quick-send (PRD-027):** AssetPicker 3 modos, slash, snippets, card de produto, links rastreáveis + temperatura, combos, agendamento, governança.
- **Fixes de type-safety desta sessão** (`_storeScope.withCreateStoreId`, `ComboTray`, `useTrackableLinkSimulation`, `MediaAudioPlayer`, `AnnotationLayer`, `quickSend` generator) — guardas defensivas; não reverter.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/qa/PRD-027-checklist.md` — roteiro do QA em andamento (Seção A=PRD-026, B=PRD-027)
- `docs/superpowers/specs/2026-06-06-prd-027-envio-rapido-design.md` — spec do PRD-027
- `docs/superpowers/plans/2026-06-06-prd-027-{CONTRACT,A-foundation,B-composer-library,C-intelligence-governance}.md` — contrato + 3 planos
- `src/features/quick-send/` — feature do PRD-027 (engine/, hooks/, components/, components/library-admin/)
- `src/features/media/` — feature do PRD-026
- Integração: `src/features/conversations/{components/MessageInput.tsx,components/ConversationHeader.tsx,pages/ConversationPage.tsx,components/bubbles/MessageBubble.tsx}`
- `src/providers/data/` — Provider Pattern (33 slices; novos: media/assetLibrary/quickReply/trackableLink/scheduledSend)
- `CLAUDE.md` — convenções (atualizado nesta sessão)

## 🧠 Memórias relacionadas

- [[feedback_manual_testing]] — usuário testa a UI manualmente; não abrir browser para validar
- [[project_routetree_merge_block]] — descartar `routeTree.gen.ts` antes de mergear
- [[project_tsc_baseline_errors]] — gate é `bun run build`/`vitest`, não `tsc`; avaliar por delta
- [[project_git_autocrlf_subagents]] — CRLF falso-positivo; subagentes não trocam de branch
- [[project_visual_companion_windows]] — como subir o companion visual do brainstorming

## 📊 Atividade recente (telemetria)

Sem telemetria (`.claude-metrics/annotations.jsonl` ausente).

## 📚 Referências

- PR #37 (PRD-026, Vault): https://github.com/edmilson-prog/gallo-basediesel/pull/37 — MERGED, tag v0.67.0
- PR #38 (PRD-027, Dispatch): https://github.com/edmilson-prog/gallo-basediesel/pull/38 — MERGED, tag v0.68.0
- Dev server (QA): http://localhost:5173
- Checkpoint anterior: `docs/checkpoints/2026-06-07-1412-prd-027-envio-rapido-dispatch.md`
