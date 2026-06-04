# Checkpoint — Épico de Kits concluído (PRD-016 + DELTAS v1.3) — 2026-06-04T00:28

> **Branch:** `main` · **Último commit:** `7f8ecb4` docs(deltas): merge divergent deltas into canonical v1.3 (Copilot + Kits)
> **Sessão anterior:** Claude Opus 4.8 (1M) · **Gerado em:** 2026-06-04 00:28 (America/Sao_Paulo)

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-04-0028-epico-kits-concluido-prd016-deltas-v1.3.md` na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial para distribuidora de peças pesadas (Volvo/Scania/Mercedes-Benz/Ford Cargo/Iveco) em Frederico Westphalen/RS. **Fase 1 (Frontend First)**: mockup navegável com dados fictícios (provider mock; Supabase planejado p/ Fase 2). Stack: React 19 + TS strict, Vite, TanStack Router (file-based, `routeTree.gen.ts` GERADO pelo dev server) + TanStack Query, Tailwind v4 + shadcn/ui (new-york), Iconify `mdi:*` via `@/components/Icon`, zod + react-hook-form, sonner, Bun. Provider Pattern em `src/providers/data/`. Esta sessão fechou o **épico "Composição por Modelo (Kits)"** (PRD-034 → PRD-035 → Delta PRD-016) e consolidou os DELTAS.

## 🎯 Objetivo da sessão

Concluir o épico de Kits: (1) mergear os PRs pendentes do épico (PRD-034 #25, PRD-035 #26/#27); (2) implementar o **Delta PRD-016** (ligar `IVehicle` ao modelo canônico via `modelId`, matching de kits por id, seção "Peças compatíveis" com 3 modos, estado "modelo não catalogado" + diálogo vincular/criar); (3) validar no browser; (4) versionar; (5) consolidar os dois DELTAS divergentes num documento canônico v1.3. **Tudo isso foi concluído e está na `main`.**

## ✅ Progresso (o que foi feito) — TUDO MERGEADO NA MAIN

- [x] **Merge PRs do épico** — `65e22e1` (PR #27, PRD-035) sobre `fa381d6` (PR #25, PRD-034). Obs.: o GitHub fechou o #26 ao deletar a branch base; foi substituído pelo #27. Tags `v0.63.0`/`v0.64.0` publicadas.
- [x] **Spec + Plano do Delta PRD-016** — `2727ffe` (spec), `e33638c` (plano de 16 tasks). Via ritual superpowers (brainstorm → spec → plano), com consultoria do design-specialist.
- [x] **Execução subagent-driven (16 tasks)** — commits `e447209`→`ac232b1`: slug export, seed exótico, `IVehicle.modelId` + linking determinístico (~6/60 órfãos), swap de `findKitsForVehicle` p/ modelId, lógica pura `compatibleParts`, config/hooks UX-pref, hook de dados, i18n, subcomponentes (row/callout/toggle), 3 views + empty, orquestrador, badge + mutation, `LinkModelDialog`, wiring no detalhe, troca nos 3 layouts, cutover do placeholder.
- [x] **Limpeza i18n** — `49cd697` (strings órfãs removidas).
- [x] **Release v0.65.0 "Fitment"** — `0b5e1ec` (package.json + CHANGELOG + CLAUDE.md). Tag `v0.65.0` publicada (re-apontada ao merge commit `affcd12` p/ incluir a correção).
- [x] **Validação no browser** (Chrome DevTools MCP, dev server reiniciado) — estado órfão, vincular existente, criar novo (create→link), 2 empty states distintos, matching no card "Filtros", persistência da preferência, tema dark, console limpo. Detalhes na descrição/comentário do PR #28.
- [x] **Correção do matching** (achada na validação) — `33ebba4`: `findCompatibleParts` agora casa por **marca+modelo+ano** (engine-agnostic) e as views curadas mostram as **peças resolvidas do kit** (Scania R 450 DC13 passou de 1 peça → "No Kit oficial (4)" + "Drift (6)"; callout com nomes reais).
- [x] **Merge PR #28** — `affcd12` na `main`. Branch `feat/delta-prd016-veiculos-kits` removida (local + remota).
- [x] **DELTAS canônico v1.3** — `7f8ecb4`: fundidos os dois arquivos divergentes (Copiloto/PRD-025 + Kits/PRD-034/035) em `docs/prds/DELTAS-PRDs-Gallo-Base-Diesel.md`; duplicado `(1)` removido.

## 🔧 Estado do código

- **Branch:** `main` (sincronizada com `origin/main`), HEAD `7f8ecb4`. **Não está ahead** — tudo mergeado.
- **Versão:** `0.65.0` "Fitment".
- **Working tree:** limpo de conteúdo real. Os ~12 arquivos que aparecem como `M` são **falso-positivo de CRLF** (`git diff --ignore-all-space` = vazio) — **NÃO commitar**. Há 1 untracked: `docs/prds/PRD-056-forecast-fechamento.md` (doc de input — **NÃO commitar**).
- **Build/tipos:** `bunx tsc --noEmit` = **315 erros** (baseline pré-existente, zero regressões). `bun run build` = exit 0. Sem test runner no projeto.
- **PRs abertos relacionados:** nenhum do épico. (Só `#9` "página em breve" — antigo, não relacionado.)
- **Dev server:** rodando na 5173 (pid 5964, reiniciado nesta sessão), servindo `main`. O rodapé pode mostrar nome de branch defasado (queimado no start do Vite) — só cosmético; rode `/dev-servers` se quiser reiniciar.

## ⏳ Pendências (próximos passos, em ordem)

**O épico de Kits está 100% concluído.** Não há tarefa obrigatória pendente. Itens opcionais/futuros:

1. **(Opcional) Precisão de motor nas peças compatíveis** — o matching foi afrouxado para marca+modelo+ano (engine-agnostic) porque exigir motor exato deixava a lista vazia. Quando o catálogo ganhar `IApplication.modelId` (delta futuro do catálogo, fora do épico de kits), dá pra restaurar precisão por motor. Arquivo: `src/features/vehicles/utils/compatibleParts.ts` (`findCompatibleParts`). Critério de "feito": match por `modelId` com fallback. **Não iniciar sem pedido.**
2. **(Opcional) Testar RBAC com Vendedor ao vivo** — a ação "Vincular modelo" é gated por `vehicle:edit` (confirmado no código/revisão), mas não foi testada trocando para sessão de Vendedor no browser. Critério: badge "não catalogado" aparece sem o botão/CTA para Vendedor.
3. **(Externo) Decidir destino do `PRD-056-forecast-fechamento.md`** — doc de input untracked; o usuário decide se vira um épico futuro.

## ❓ Decisões pendentes

- **Nenhuma decisão em aberto no épico de Kits.** Todas as decisões foram tomadas e implementadas (recomeço limpo na consolidação do IServiceKit, página dedicada do editor de kit, 3 modos de visualização escolhidos pelo usuário, fluxo completo vincular/criar, matching engine-agnostic).

## 🚧 Bloqueios / Riscos

- Nenhum bloqueio. Risco residual: o matching engine-agnostic pode, em teoria, mostrar peças de uma variante de motor diferente do mesmo modelo — aceito intencionalmente (documentado na spec e no CHANGELOG; aplicações são string-based até o delta futuro do catálogo).

## ⚠️ Avisos do usuário (regras desta sessão)

- **Usuário valida UI manualmente** — NÃO abrir browser/devtools/preview por padrão. (Exceção pontual nesta sessão: o usuário pediu explicitamente para eu validar no browser; foi um override one-off.)
- **Subagentes não trocam de branch** (nem `git checkout`/`stash` de branch).
- **Ignorar completamente** qualquer pasta contendo `worktrees` (`.claude/worktrees/`).
- **Antes de remover/sobrescrever arquivos**, confirmar que são o esperado/idênticos.
- **Commits na `main` exigem confirmação** (regra global). O usuário autorizou os commits desta sessão explicitamente.
- **NÃO commitar docs de input**: DELTAS originais, PDFs em `docs/reports/`, `docs/export/`, `PRD-056-forecast-fechamento.md`, `delta-escopo-erp-gallo.md`. (Exceção autorizada nesta sessão: o **canônico v1.3** dos DELTAS foi commitado a pedido do usuário, já que os arquivos já eram tracked.)
- **`routeTree.gen.ts`** é regenerado pelo dev server — não commitar (aparece como CRLF).
- **CRLF aparente é falso-positivo** — validar com `git diff --ignore-all-space` antes de tratar como mudança real.
- Conventional Commits em inglês, terminando com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. UI/conteúdo em português do Brasil com acentos corretos.
- **Gates do repo:** `bun run build` NÃO faz type-check (esbuild); gate real = `bunx tsc --noEmit` filtrado por arquivo (deve ficar vazio p/ arquivos tocados; 315 erros pré-existentes ignorados). `bun run lint` global inutilizável (CRLF) → `bunx prettier --check` por arquivo. Sem test runner → scripts `bun` descartáveis (`scripts/_check_*.ts`), deletados no mesmo commit.

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Detalhe do veículo** (`/app/veiculos/$id`): seção "Peças compatíveis" com 3 modos (Curadoria/Catálogo/Só o Kit), callout do kit, drift, estado "modelo não catalogado" + `LinkModelDialog` (vincular/criar). 3 layouts (Bento/Health/Rails).
- **Matching de kits por `modelId`** (`findKitsForVehicle`): card "Filtros" das recomendações → "Criar orçamento com Kit"; sugestão automática no editor de orçamento.
- **Editor de orçamento** (PRD-035): aplicar kit via modal de preview, snapshot de preço, desfazer.
- **Kits por modelo** (`/app/kits`): listagem, editor em página dedicada, curadoria rascunho→oficial.
- **Catálogo de modelos** (PRD-034) e **catálogo de peças** (PRD-030).
- **`IVehicle.modelId`**: gerador mock produz ~6/60 órfãos exóticos (VW/MAN/DAF); criação manual seta `modelId: null`.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/superpowers/specs/2026-06-03-delta-prd016-veiculos-kits-design.md` — spec do delta (decisões + limitações).
- `docs/superpowers/plans/2026-06-03-delta-prd016-veiculos-kits.md` — plano de 16 tasks (gates do repo no topo).
- `src/features/vehicles/utils/compatibleParts.ts` — `findCompatibleParts` (engine-agnostic) + `splitByKitMembership`.
- `src/features/vehicles/hooks/useCompatibleParts.ts` — hook de dados (parts + kitParts + drift).
- `src/features/vehicles/components/detail/compatible-parts/` — orquestrador `CompatibleParts.tsx` + views + callout + row + toggle + empty.
- `src/features/vehicles/components/detail/LinkModelDialog.tsx` + `ModelNotCataloguedBadge.tsx` + hook `useLinkVehicleModel.ts`.
- `src/features/model-kits/utils/modelKitMatching.ts` — `findKitsForVehicle` por `modelId`.
- `docs/prds/DELTAS-PRDs-Gallo-Base-Diesel.md` — **canônico v1.3** (Copiloto + Kits).
- `CLAUDE.md` — convenções do projeto (codinome atual `Fitment` v0.65.0).

## 🧠 Memórias relacionadas

- `feedback_manual_testing.md` — usuário testa UI manualmente (não abrir browser por padrão).
- `project_git_autocrlf_subagents.md` — CRLF aparente é falso-positivo; subagentes não trocam de branch.
- `project_goals_autostatus_bug.md` — bug pré-existente fora de escopo.

## 📊 Atividade recente (telemetria)

Sem `.claude-metrics/annotations.jsonl` no projeto — sem telemetria a listar.

## 📚 Referências

- PRs do épico (todos MERGED): #25 (PRD-034), #27 (PRD-035, sucessor do #26 fechado), #28 (Delta PRD-016).
- Comentário de validação no PR #28: registro do teste no browser + correção `33ebba4`.
- Tags: `v0.63.0` Catalog, `v0.64.0` Kit, `v0.65.0` Fitment.
- Checkpoint anterior: `docs/checkpoints/2026-06-03-1758-prd035-kits-entregue-pr26.md`.
