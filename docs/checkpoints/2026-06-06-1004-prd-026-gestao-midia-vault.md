# Checkpoint — PRD-026 Gestão de Mídia (DAM + Galeria) · v0.67.0 "Vault" — 2026-06-06T10:04:47-0300

> **Branch:** `feat/prd-026-gestao-midia` · **Último commit:** `f7e133a` chore(release): v0.67.0 Vault — media management (PRD-026)
> **Sessão anterior:** Claude Opus 4.8 (1M context) · **Gerado em:** 2026-06-06T10:04:47-0300

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo docs/checkpoints/2026-06-06-1004-prd-026-gestao-midia-vault.md na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.

PR relacionado: https://github.com/edmilson-prog/gallo-basediesel/pull/37
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial para distribuidora de peças pesadas (Volvo, Scania, MB, Ford Cargo, Iveco) em Frederico Westphalen/RS. Stack: React 19 + TS strict + Vite + TanStack Router (file-based; `routeTree.gen.ts` é **gerado**) + TanStack Query + Tailwind v4 + shadcn/ui (new-york) + bun. SPA estática (Vercel). **Fase 1 (Frontend First)** — tudo sobre mocks determinísticos com Provider Pattern drop-in para Supabase na Fase 2. Feature-based em `src/features/`. Módulo desta sessão: **camada de mídia (`src/features/media/`)**.

## 🎯 Objetivo da sessão

Implementar o **PRD-026 — Gestão de Mídia (DAM + Galeria)** por completo (5 fases), seguindo o fluxo superpowers: brainstorming → spec → planos → execução subagent-driven → revisão final → release. O PRD resolve três dores: mídia do WhatsApp é efêmera (precisa arquivar), mídia fica enterrada no scroll (precisa galeria/busca), e não há governança sobre dado sensível (LGPD: nota fiscal/comprovante com CPF/CNPJ). Foi pedido usar o **visual companion** + agente de design para o visual. **Resultado: épico 100% concluído e em PR aberto.**

## ✅ Progresso (o que foi feito)

- [x] Brainstorming com **visual companion** (3 telas interativas: galeria 3-modos, lightbox, estado sensível) + agente design-specialist. Decisão-chave do usuário: os 3 modos coexistem, alternados por switcher na tela.
- [x] Spec aprovado — commit `62033d6` — `docs/superpowers/specs/2026-06-05-prd-026-gestao-midia-design.md` (15 decisões D-1..D-15).
- [x] 2 planos (A fundação 15 tarefas, B superfícies 21) — commit `95a7242` — autorados + revisados adversarialmente (contrato canônico A↔B reconciliado).
- [x] **Plano A executado** (subagent-driven via workflow, sequencial): tipos, provider, mocks, engine puro, inbound. Gate ground-truth: 130 testes + build verdes.
- [x] **Plano B executado** (21 tarefas): galeria 3-modos + switcher, lightbox, aba cliente, classificação/vínculo, governança, anotação, integrações. Gate: 141 testes + build.
- [x] Correção a11y do retry (não-aninhado, teclado) — commit `53a1ab2`.
- [x] Revisão final adversarial em **5 dimensões** (wiring, governança, a11y, cobertura, tipos): a11y CLEAN, tipos CLEAN; 2 important corrigidos:
  - [x] RF-021 auto-sensível em runtime — commit `94841ba` (helper `isSensitiveClassification` em ensureFromMessage/upload/setClassification, sem downgrade).
  - [x] Wiring `useEnsureInboundMedia` no inbound — commit `abe5f25` (efeito não-bloqueante no ConversationPage + simulateIncoming emite mídia ~1/5).
  - [x] Re-revisão adversarial dos dois: ambos **RESOLVED**.
- [x] Varredura de minors — commits `12cbb5f` (toggle manual de sensibilidade no lightbox, gated `Can media edit` + auditado) e `774c0a8` (i18n morto removido, `aria-keyshortcuts`, export `link` morto removido).
- [x] **Release v0.67.0 "Vault"** — commit `f7e133a`: `package.json` 0.66.0→0.67.0, CHANGELOG `[0.67.0] Vault`, PRD renomeado `PRD-026-gestao-midia_DONE.md` + status atualizado.
- [x] Push + **PR #37** aberto (ready, não-mergeado).
- [x] Memória salva: `project_visual_companion_windows.md` (como subir o companion neste MSYS).

## 🔧 Estado do código

- **Branch:** `feat/prd-026-gestao-midia` — **81 commits ahead** da `main` (merge-base `5506943`).
- **Último commit:** `f7e133a` — chore(release): v0.67.0 Vault.
- **Build/testes (verificados por mim, ground truth):** ✅ `bun run test` = **152 passed** (26 arquivos) · ✅ `bun run build` exit 0 (~20s). lint sem novos problemas (só baseline CRLF/triple-slash).
- **Working tree:** `M src/routeTree.gen.ts` (gerado — NÃO commitar) + 3 untracked pré-existentes (`docs/prds/PRD-027-…md`, `docs/relatorio-codigo-morto-2026-06-04.md`, `knip.json` — deixar intactos).
- **82 arquivos** na branch. Núcleo novo em `src/features/media/` (14 componentes, 6 engines + testes, 9 hooks + testes, utils, i18n, barrel). Integração: `conversations/{ConversationHeader,ConversationPage,useRealtimeConversations,i18n}`, `customers/{ProfileTabs,i18n}`, `providers/data/{contracts,impl,hooks,factory,index}`, `mocks/{api/media,api/messages,generators/mediaAsset,bootstrap,config,store}`, `shared/types/{media,common,index}`, `rbac/permissions/{resources,matrix}`, `admin-settings/MediaRetentionSettingsPage` + rota `routes/app.configuracoes.midias.tsx`.
- **PRs abertos relacionados:** **#37** — feat(media): PRD-026 Gestão de Mídia (DAM + Galeria) — v0.67.0 Vault.

## ⏳ Pendências (próximos passos, em ordem)

1. **Usuário revisa e mergeia o PR #37.** Critério de feito: PR mergeado na `main`. ⚠️ Antes do `gh pr merge`, rodar `git checkout -- src/routeTree.gen.ts` (o gerado trava o fast-forward local — padrão conhecido, ver memória [[project_routetree_merge_block]]). Não mergear sem OK do usuário.
2. **Tag de release após o merge:** no commit de merge na `main`, `git tag -a v0.67.0 -m "v0.67.0 Vault" && git push origin v0.67.0` (convenção do projeto: tag acompanha cada bump, criada pós-merge). Dependência: passo 1.
3. **PRD-027 (Envio Rápido & Biblioteca de Ativos)** — próximo ciclo. Consome o `IMediaStorageProvider` entregue aqui. Começar pelo brainstorming (`/superpowers:brainstorming`). PRD fonte: `docs/prds/PRD-027-envio-rapido-biblioteca-ativos.md` (untracked). Atenção: o PRD-027 depende também do **PRD-025 (Copiloto de Vendas, ainda pendente)** só para o chip de sugestão de ativo (RF-024) — diferente do PRD-057 Copiloto Analítico já entregue.

## ❓ Decisões pendentes

- **Mergear o PR #37 agora ou continuar iterando?** Inclinação: usuário revisa o test plan manual (no corpo do PR) e mergeia quando aprovar. Sem merge da minha parte sem autorização.
- **Iniciar o PRD-027 nesta nova sessão?** Opção A: sim, brainstorming do 027. Opção B: pausar. Inclinação: aguardar o usuário.

## 🚧 Bloqueios / Riscos

- Nenhum bloqueio técnico. Build/testes verdes.
- Minor não-bloqueantes documentados (deixados para polish futuro / PRD-027): arquivamento de inbound novo é **lazy-per-open** (só cria asset ao abrir a conversa; bootstrap já popula o demo); listas doc/áudio do modo "Por tipo" sem `role=list`; faixa 8–14d do tier de expiração tratada como "soft"; `fileName` sem realce `<mark>` nos tiles; célula de falha ativa expõe 2 tab-stops.
- `upload` do provider ainda não recebe `classification` de chamadores (default normal) — irrelevante na Fase 1 (outbound é PRD-027).

## ⚠️ Avisos do usuário (regras desta sessão / projeto)

- **Não commitar na `main`/`master` sem confirmação.** Trabalhar sempre em branch de feature.
- **Ignorar completamente** qualquer caminho com `worktrees` e o diretório `.superpowers/` (gitignored).
- **Usuário testa a UI manualmente** — NÃO abrir browser/devtools para *validar*. (O visual companion no brainstorming é para *comparar* design, não validar — exceção explícita pedida pelo usuário.)
- **Nunca** substituir acentos do português por ASCII. Responder sempre em **português do Brasil**.
- **Guard de supply-chain 24h** (`bunfig.toml minimumReleaseAge`) — confirmar antes de adicionar pacote aos excludes. (Adicionamos `@tanstack/react-virtual` normalmente, sem exclude.)
- **Subagentes não trocam de branch.**
- **CRLF nos `git add` é falso positivo** — NÃO rodar `prettier --write` para "corrigir".
- **`tsc --noEmit` tem ~315 erros pré-existentes** — o gate real é `bun run build` (vite); avaliar só o delta.
- **Não commitar** `src/routeTree.gen.ts` sozinho, nem `PRD-027-…md`, `knip.json`, `docs/relatorio-codigo-morto-2026-06-04.md`.
- **Trailer de commit:** terminar mensagens com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## 🛡️ Não regredir (features que devem continuar funcionando)

- **PRD-011 Conversa/Composer** — texto, emoji, anexo, templates HSM, janela 24h, realtime sim (agora emite mídia ~1/5, comportamento aditivo via `mediaType`), bubbles image/audio/document.
- **PRD-012 Ficha do Cliente** — abas existentes (visão geral, pedidos, orçamentos, veículos, conversas, notas, recomendações, copiloto) + a nova aba **Mídias**.
- **PRD-057 Copiloto Analítico** (Gestão → Copiloto, 3 modos) e **PRD-056 Forecast** (v0.66.0 Oracle).
- **Provider Pattern / `VITE_DATA_SOURCE`** — factory mock/supabase; novo slice `media` registrado em `IDataProviders`.
- **RBAC matrix** (PRD-006) — recurso `media` adicionado (Owner CRUD/all; Gestor view/edit/delete/store; Vendedor/SDR/VendedorExterno view/own); sensível restrito a Owner/Gestor via `canViewSensitive`.
- **A própria feature de mídia** — galeria 3-modos, lightbox, governança LGPD (gate de sensível na camada de dados — bytes nunca vazam), inbound, anotação.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/superpowers/specs/2026-06-05-prd-026-gestao-midia-design.md` — spec aprovado (15 decisões, modelo de dados, fasamento).
- `docs/superpowers/plans/2026-06-05-prd-026-media-A-foundation.md` e `…-B-surfaces.md` — planos executados (referência da arquitetura + contrato canônico A↔B).
- `docs/prds/PRD-026-gestao-midia_DONE.md` — PRD fonte (concluído).
- `src/features/media/index.ts` — barrel (superfície pública da feature).
- `src/features/media/components/MediaGallery.tsx` — casca compartilhada (engine única; conversa + cliente).
- `src/providers/data/contracts/mediaStorage.ts` + `src/providers/data/impl/mock/media.ts` — contrato + mock (gate de sensível em `getSignedUrl`).
- `src/features/media/engine/sensitiveAccess.ts` — `canViewSensitive`, `statusChipPriority`, `isSensitiveClassification`.
- `docs/prds/PRD-027-envio-rapido-biblioteca-ativos.md` — próximo ciclo.
- `CLAUDE.md` — convenções do projeto.

## 🧠 Memórias relacionadas

- `project_visual_companion_windows.md` — como subir o visual companion neste MSYS (run_in_background, path `D:/...`, ler `server-info`).
- `project_routetree_merge_block.md` — `routeTree.gen.ts` trava o ff local do `gh pr merge`; descartar antes.
- `project_tsc_baseline_errors.md` — ~315 erros pré-existentes; gate é `bun run build`.
- `project_git_autocrlf_subagents.md` — CRLF falso positivo; subagentes não trocam de branch.
- `feedback_manual_testing.md` — usuário valida UI manualmente.

## 📊 Atividade recente (telemetria)

`.claude-metrics/annotations.jsonl` não existe nesta sessão (telemetria inativa).

## 📚 Referências

- Spec: `docs/superpowers/specs/2026-06-05-prd-026-gestao-midia-design.md`
- Planos: `docs/superpowers/plans/2026-06-05-prd-026-media-A-foundation.md`, `…-B-surfaces.md`
- PR: https://github.com/edmilson-prog/gallo-basediesel/pull/37
- Release: CHANGELOG `[0.67.0] — Vault · 2026-06-06`
