# Checkpoint — PRD-027 Envio Rápido & Biblioteca de Ativos (Dispatch) — 2026-06-07T14:12:47-0300

> **Branch:** `feat/prd-027-envio-rapido-biblioteca-ativos` · **Último commit:** `ef6c147` style(conversations): re-indent ConversationProvider children
> **Sessão anterior:** Claude Opus 4.8 (1M) · **Gerado em:** 2026-06-07T14:12:47-0300 · **Atualizado em:** 2026-06-07 (sessão de varredura de regressão)

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo docs/checkpoints/2026-06-07-1412-prd-027-envio-rapido-dispatch.md na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.

PR relacionado: https://github.com/edmilson-prog/gallo-basediesel/pull/38
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial para distribuidora de peças diesel pesado. Stack: React 19 + TS strict + Vite + TanStack Router (file-based; `routeTree.gen.ts` GERADO) + TanStack Query + Tailwind v4 + shadcn/ui (new-york) + bun. SPA na Vercel, Fase 1 (Frontend First) sobre mocks determinísticos; Provider Pattern pronto para Supabase na Fase 2. Módulo desta sessão: **PRD-027 — Envio Rápido & Biblioteca de Ativos** (feature `src/features/quick-send/`), que estende o composer (PRD-011) e consome o storage do PRD-026.

## 🎯 Objetivo da sessão

Implementar o **PRD-027 inteiro** (épico completo) seguindo o fluxo Superpowers, com apoio de especialista de design e companion visual, sem regredir o composer existente. Decisões travadas no início: épico completo (1 spec → 3 planos); ativo sensível (tabela de preços) só Owner+Gestor enviam; card de produto = bubble dedicado; agendamento = fila local simulada; AssetPicker com **3 modos coexistentes** (Painel/Grade/Lateral) via parâmetro na tela, persistido. Branch **empilhada** sobre `feat/prd-026-gestao-midia` (PR #37) porque o 027 consome o `IMediaStorageProvider` do 026.

## ✅ Progresso (o que foi feito) — PRD-027 COMPLETO E LANÇADO

- [x] **Brainstorming** com companion visual + agente de design → spec aprovado (`2b5fffa`) — `docs/superpowers/specs/2026-06-06-prd-027-envio-rapido-design.md` (16 decisões D-1..D-16)
- [x] **3 planos + contrato canônico** (workflow multi-agente, revisão adversarial + reconciliação) — commit `000966d`. 63 tarefas (A 24 · B 17 · C 22). Plano A revisado por mim (pegou 1 HIGH: `getUsageStats` no provider p/ boundary ESLint); gap do `[link]` encoder fechado.
- [x] **Plano A — Fundação** (subagent-driven): tipos, 10 engines (TDD), 4 providers (mock+stub), mocks (DELTA), RBAC, i18n, hooks. Verificado: 241 testes, build verde.
- [x] **Plano B — Composer & Biblioteca** (subagent-driven): AssetPicker 3 modos, slash, envio de ativo, snippets, card de produto, integração no MessageInput. Verificado: 244 testes, build verde, sem regressão (29 marcadores do composer presentes).
- [x] **Plano C — Inteligência & Governança** (subagent-driven): links rastreáveis + temperatura, combos, agendamento, governança/estatística, receptor Copiloto, auditoria, rota. Verificado: build verde, 244 testes, fiação de runtime toda montada/alcançável.
- [x] **Revisão final 5-dimensões** (adversarial): 14 achados → 6 confirmados (0 critical) → **6 fixes** aplicados (`2bed16e` severity tokens · `2d3e413` ComboTray live region · `f2ea533` combobox a11y · `cc087e5` Send disabled reason · `68a96de` runner ctx · `6831550` useMemo). Verificado verde.
- [x] **Release v0.68.0 "Dispatch"** (`5c16107`): bump `package.json`, `CHANGELOG.md`, PRD renomeado para `_DONE` com Status/Histórico. Pushado. **PR #38 aberto** contra `main`.
- [x] **Checklist de QA** (`4e3b526`) — `docs/qa/PRD-027-checklist.md` (PRD-026 + PRD-027 em seções separadas).

## 🔄 Atualização — Varredura de regressão + fixes de type-safety (2026-06-07, sessão seguinte)

Disparada por um falso alarme: o seletor de loja (`StoreSwitcher`) pareceu sumir do header. **Não era regressão** — estado transiente do dev server (voltou ao recarregar). Código/dados/build estavam íntegros: `StoreSwitcher` é idêntico desde o PRD-007, o data layer retorna a matriz (confirmado por sonda Vitest), data source = `mock`.

A pedido do usuário, varredura completa em 2 camadas:
- **Camada 1 (gates automáticos):** build verde · 244 testes verdes · ESLint sem regressão real (os ~46k "erros" são `Delete ␍`/CRLF do autocrlf — falso-positivo conhecido; sinal real = 34 warnings + 1 trivial em `vitest.config.ts`).
- **Camada 2 (workflow multi-agente — 14 agentes, 8 dimensões, verificação adversarial):** **0 regressões funcionais/runtime**. Composer, MessageBubble, galeria de mídia, fiação de providers, rotas/nav e RBAC — todos limpos. 6 achados brutos → 1 confirmado (apenas indentação) → 5 refutados (type-safety de código novo, runtime-seguro por guardas existentes).

**Único débito real:** 19 erros de type-safety no código novo do PRD-026/027 — mascarados porque o build da Vite/esbuild **não checa tipos**. **Todos corrigidos** (guardas defensivas, sem mudança de comportamento):
- `providers/data/impl/mock/_storeScope.ts` — `withCreateStoreId` agora retorna `T & { storeId: ID }` (resolve 5 erros dos providers assetLibrary/quickReply/trackableLink/scheduledSend)
- `quick-send/components/ComboTray.tsx` — bound-check em `reorder`/`move`
- `quick-send/hooks/useTrackableLinkSimulation.ts` — `if (!target) return`
- `media/components/MediaAudioPlayer.tsx` — `setPos(v ?? 0)`
- `media/components/AnnotationLayer.tsx` — constante `FALLBACK_TONE`
- `mocks/generators/quickSend.ts` — 6 asserções em acessos já garantidos pelos loops
- `conversations/pages/ConversationPage.tsx` — re-indentação dos filhos do `ConversationProvider` (cosmético; `style:` separado)

**Commits (pushados — PR #38 atualizado):**
- `7c744e1` fix(quick-send,media): close type-safety gaps in new PRD-026/027 code
- `ef6c147` style(conversations): re-indent ConversationProvider children

**Revalidado como ground truth:** build verde · 244 testes verdes · `tsc`: **344 → 325** total, **0 erros em arquivos novos** (o restante é baseline pré-existente).

> 🧰 Técnica registrada: o gate de build (esbuild) **não** faz type-check. Para isolar erro de tipo de código NOVO sem ruído do baseline, rode `bunx tsc --noEmit` e cruze com `git diff --name-status main...HEAD --diff-filter=A` (erros em arquivos criados nesta branch = delta inequívoco).

## 🔧 Estado do código

- **Branch:** `feat/prd-027-envio-rapido-biblioteca-ativos` (ahead da `main` por **173 commits** — inclui PRD-026, pois empilhada; +2 commits de fixes de type-safety nesta sessão)
- **Último commit:** `ef6c147` · **Pushado:** sim (`origin/feat/prd-027-...`)
- **Build/testes:** `bun run build` (vite) **VERDE** · `vitest run` **244 testes VERDES** · `tsc --noEmit` 325 (baseline; **0 em arquivos novos** após os fixes desta sessão) — verificado como ground truth
- **Working tree:** apenas `M src/routeTree.gen.ts` (gerado — NÃO commitar) + untracked `knip.json`, `docs/relatorio-codigo-morto-2026-06-04.md` (deixar)
- **PRs abertos relacionados:** **#38** (PRD-027, esta branch) · **#37** (PRD-026, base do empilhamento) · (#9 não relacionado)

## ⏳ Pendências (próximos passos, em ordem)

1. **QA manual** — rodar `docs/qa/PRD-027-checklist.md` (seções A=PRD-026, B=PRD-027). `bun run dev`, trocar papéis (Owner/Gestor/Vendedor), testar claro/escuro e 360px. Critério: itens marcados; divergências reportadas pelo código do item (ex.: `B6 — temperatura não subiu`).
2. **Ordem de merge (do usuário):** mergear o **#37 (PRD-026) PRIMEIRO**, depois o **#38 (PRD-027)**. Em ambos, se o ff local travar: `git checkout -- src/routeTree.gen.ts` antes do `gh pr merge` (caso conhecido do arquivo gerado — ver memória [[project_routetree_merge_block]]).
3. **Tags git pós-merge:** `v0.67.0` (no merge do #37) e `v0.68.0` (no merge do #38).
4. **Chip do Copiloto (RF-024):** o **receptor** está pronto (`useCopilotAssetHandoff`/`openAssetPicker`); o **chip** em si só quando o **PRD-025** for implementado.
5. **(Opcional) INDEX de PRDs:** marcar PRD-027 como concluído — pendente decidir qual dos vários `docs/prds/INDEX-*.md` é o canônico (não atualizei por ambiguidade).

## ❓ Decisões pendentes

- **Qual INDEX de PRDs é o canônico?** Há 6+ snapshots versionados (`INDEX-...-v1.3/v2/v3/...`). Inclinação: nenhuma — aguardar o usuário apontar antes de editar.
- **Timing do merge** é do usuário (não mergear `main` sem confirmação).

## 🚧 Bloqueios / Riscos

- **PR empilhado:** #38 tem base `main`, então mostra PRD-026 + PRD-027 até o #37 ser mergeado (depois reflete só o 027). Não é bug — é o empilhamento escolhido.
- **`routeTree.gen.ts`** aparece como `M` o tempo todo (gerado); pode travar o ff local de `gh pr merge` — descartar antes (ver pendência 2).

## ⚠️ Avisos do usuário (regras desta sessão)

- **NÃO commitar na `main`/`master` sem confirmação.** Não mergear PRs (é do usuário).
- **Ignorar completamente** caminhos com `worktrees` e `.superpowers`.
- **Usuário testa a UI manualmente** — NÃO abrir browser/devtools para validar (o companion visual foi exceção só para comparar design no brainstorming).
- **Nunca trocar acentos por ASCII**; responder em português do Brasil.
- **NÃO commitar:** `src/routeTree.gen.ts` (sozinho/gerado), `knip.json`, `docs/relatorio-codigo-morto-2026-06-04.md`.
- **CRLF em `git add`** = falso-positivo conhecido (autocrlf) — NÃO rodar prettier para "corrigir".
- **`tsc --noEmit`** tem ~315 erros pré-existentes — o gate real é `bun run build` (vite) + `vitest run`; avaliar por DELTA.
- **24h supply-chain guard** (`bunfig.toml minimumReleaseAge`) — confirmar antes de adicionar pacote aos excludes.
- Subagentes **não trocam de branch**.
- Commits terminam com: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Composer (PRD-011):** texto (Enter envia / Shift+Enter quebra), emoji, menu de anexo (Imagem/Documento/Áudio), templates HSM, sugestões IA, janela 24h (`canSendFreeText`), copilot strip. O clique **primário** do Enviar envia agora (agendar é secundário).
- **Galeria de mídia (PRD-026):** botão Mídias, aba Mídias do cliente, lightbox, arquivamento inbound (`useEnsureInboundMedia`), governança sensível.
- **MessageBubble:** ramos system/[template]/imagem/áudio/documento/texto + os novos `[produto]`/`[link]` (sem sombrear os existentes).

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/superpowers/specs/2026-06-06-prd-027-envio-rapido-design.md` — spec (16 decisões, modelo, faseamento)
- `docs/superpowers/plans/2026-06-06-prd-027-CONTRACT.md` — contrato canônico cross-plan (fonte de verdade de nomes/assinaturas)
- `docs/superpowers/plans/2026-06-06-prd-027-{A-foundation,B-composer-library,C-intelligence-governance}.md` — os 3 planos
- `src/features/quick-send/` — a feature (engine/, hooks/, components/, components/library-admin/, i18n/, index.ts)
- Integração: `src/features/conversations/components/{MessageInput,ConversationHeader}.tsx`, `pages/ConversationPage.tsx`, `components/bubbles/MessageBubble.tsx`
- Providers: `src/providers/data/{contracts,impl/mock,impl/supabase,hooks}/*` (assetLibrary/quickReply/trackableLink/scheduledSend)
- `docs/qa/PRD-027-checklist.md` — checklist de QA (PRD-026 + PRD-027)
- `docs/prds/PRD-027-envio-rapido-biblioteca-ativos_DONE.md` — PRD concluído
- `CLAUDE.md` — convenções do projeto

## 🧠 Memórias relacionadas

- [[project_routetree_merge_block]] — descartar `routeTree.gen.ts` antes de mergear
- [[project_tsc_baseline_errors]] — gate é `bun run build`/`vitest`, não `tsc`
- [[feedback_manual_testing]] — usuário testa a UI manualmente
- [[project_git_autocrlf_subagents]] — CRLF falso-positivo; subagentes não trocam de branch
- [[project_visual_companion_windows]] — como subir o companion visual (já encerrou nesta sessão)

## 📊 Atividade recente (telemetria)

Sem telemetria (`.claude-metrics/annotations.jsonl` ausente).

## 📚 Referências

- PR #38 (PRD-027): https://github.com/edmilson-prog/gallo-basediesel/pull/38
- PR #37 (PRD-026, base do empilhamento): https://github.com/edmilson-prog/gallo-basediesel/pull/37
- Spec: `docs/superpowers/specs/2026-06-06-prd-027-envio-rapido-design.md`
- Release: commit `5c16107` (v0.68.0 Dispatch) · CHANGELOG entrada "Dispatch · 2026-06-07"
