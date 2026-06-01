# Checkpoint — PRD-025 Copiloto de Vendas — 2026-05-31T21:30-0300

> **Branch:** `claude/confident-roentgen-be734d` · **Último commit:** `45fb3b4` docs(copilot): document VITE_COPILOT_PLACEMENT in .env.example
> **Sessão anterior:** Claude (Claude Code CLI) · **Gerado em:** 2026-05-31T21:30-0300

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-05-31-2130-prd-025-copiloto-vendas.md` na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do
código, 3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial para distribuidora de peças pesadas (React + Vite + TypeScript strict + Tailwind v4 + shadcn/ui + Iconify; gerenciador `bun`). Fase 1 = mockup navegável com dados fictícios via **Provider Pattern** (`VITE_DATA_SOURCE=mock|supabase`). Esta sessão trabalhou o **PRD-025 — Copiloto de Vendas**: uma camada de orientação **privada ao vendedor** na tela de atendimento (briefing + resumo + sugestões acionáveis), distinta do SDR autônomo.

## 🎯 Objetivo da sessão

Implementar o PRD-025 (Fase 1, sem LLM): superfície do Copiloto em **3 variantes alternáveis por `VITE_COPILOT_PLACEMENT`** (`strip` default, `tab`, `card`), briefing reaproveitando a Ficha, resumo reaproveitando o escalonamento SDR, e **sugestões por regra determinística** (R1/R2/R3). O desafio central de design era "muita informação na mesma tela" — resolvido com a faixa em **repouso colapsado** (1 linha) + progressive disclosure.

## ✅ Progresso (o que foi feito)

Fluxo completo: brainstorming → spec de design → plano → execução subagent-driven (13 tarefas) → revisões por bloco → **revisão final: READY**.

- [x] Brainstorming + insights de design (skill `ui-ux-pro-max`) + protótipo no visual companion (validado).
- [x] Spec de design, commit `0f9fc09` — `docs/superpowers/specs/2026-05-31-prd-025-copiloto-design.md`.
- [x] Plano de implementação, commit `0f9fc09` — `docs/superpowers/plans/2026-05-31-prd-025-copiloto-vendas.md`.
- [x] T1 tipos do domínio, `00557ab`.
- [x] T2 contrato `ICopilotProvider` + `IDataProviders`, `75e18da`.
- [x] T3 regras R1/R2/R3 (puras), `f2587a6` + fix narrowing `3d49695`.
- [x] T4 `mockCopilotProvider` (composição), `0b5301e`.
- [x] T5 stub Supabase + factory + hook + barrel, `55d8bda`. **Revisão do bloco provider (T2–T5): APROVADA.**
- [x] T6 `resolvePlacement`/`useCopilotPlacement`, `2cc9ab2`.
- [x] T7 `useCopilotPanel`, `d6aad2c`.
- [x] T8 strings pt-BR, `12a9620`.
- [x] T9 componentes compartilhados, `d029426`.
- [x] T10 `CopilotStrip` (default), `7b3e415`.
- [x] T11 `CopilotCard` + `CopilotFicheTab` + barrel, `d13578b`. **Revisão do bloco UI (T6–T11): APROVADA.**
- [x] T12 integração (`ConversationPage`, `MessageInput`, `CustomerProfile*`, `ProfileTabs`), `7edf0ed`. **Revisão dedicada (regressão): APROVADA.**
- [x] T13a DELTAs (PRD-002/004 + DELTAS) + a11y do card, `03a93c2` + `4a29a15`.
- [x] `.env.example` documentando a variável, `45fb3b4`. `.env.local` criado (gitignored) como "interruptor" de variante.
- [x] **Revisão final de toda a feature: READY** (tabela RF/RNF completa, gate verde).

## 🔧 Estado do código

- **Branch:** `claude/confident-roentgen-be734d` (17 commits desde `1db0f2c`, o último merge da `main`). **A branch remota AINDA NÃO existe** — precisa `git push -u origin claude/confident-roentgen-be734d` (o upstream atual aponta erroneamente para `origin/main`).
- **Último commit:** `45fb3b4`.
- **Build/gate:** ✅ `bunx tsc --noEmit | grep copilot` → **limpo** (0 erros nos arquivos do copiloto/tocados); `bun run build` (vite) → **passa**; `bun run lint` → **0 erros**.
  - ⚠️ O projeto tem **~300 erros de `tsc` pré-existentes** em OUTROS módulos e builda via `vite build` (esbuild, sem type-check estrito). O gate REAL de tipo é `tsc --noEmit` **filtrado pelos arquivos da feature**, não o build inteiro.
- **Dev server:** rodando em **http://localhost:5173/** (a 5175 mencionada antes era de um processo antigo que caiu).
- **Arquivos novos (A) / modificados (M) desta linha de trabalho:**
  - Tipos: `src/shared/types/copilot.ts` (A), `src/shared/types/index.ts` (M).
  - Provider: `src/providers/data/contracts/copilot.ts` (A), `contracts/index.ts` (M), `impl/mock/copilot.ts` (A), `impl/mock/copilotRules.ts` (A), `impl/supabase/copilot.ts` (A), `hooks/useCopilotProvider.ts` (A), `factory.ts` (M), `index.ts` (M).
  - Feature UI: `src/features/copilot/` — `config.ts`, `hooks/useCopilotPlacement.ts`, `hooks/useCopilotPanel.ts`, `i18n/pt-BR.ts`, `components/{CopilotHeader,CopilotSuggestionItem,CopilotSummary,CopilotReply,CopilotStrip,CopilotCard,CopilotFicheTab}.tsx`, `index.ts` (todos A).
  - Integração (M): `src/features/conversations/pages/ConversationPage.tsx`, `components/MessageInput.tsx`, `src/features/customers/components/{CustomerProfile,CustomerProfileFiche,ProfileTabs}.tsx`.
  - Docs (M/A): `docs/prds/PRD-002-*_DONE.md`, `PRD-004-*_DONE.md`, `DELTAS-*.md`, `PRD-025-copiloto-vendas.md`, `docs/superpowers/specs|plans/...`, `docs/html/gallo-copiloto-mockup*.html`, `.env.example`.
- **PRs abertos relacionados:** nenhum (será criado no checkpoint, em modo draft).

## ⏳ Pendências (próximos passos, em ordem)

1. **Validação manual do usuário** (ele testa UI manualmente). No dev server 5173, abrir `/app/atendimento` numa conversa com cliente (ex.: **Beatriz Moraes** — dispara as 3 regras). Conferir faixa repouso↔expandida, "Inserir ↑", botão "Gerar resposta" inerte, e as variantes via `.env.local`. **Feito quando:** usuário aprovar o visual ou pedir ajustes.
2. **Selagem da entrega (T13b)** — só após validação: bump **MINOR → v0.56.0 codinome "Copilot"** (achar o arquivo de versão do app — provável `src/config/` ou constantes do `/sobre`), atualizar `CHANGELOG.md` (Keep a Changelog, seção Added), atualizar `docs/prds/INDEX-PRDs-Gallo-Base-Diesel.md` (registrar PRD-025 no Bloco 2 + contagens + histórico de versões), renomear `docs/prds/PRD-025-copiloto-vendas.md` → `_DONE.md` e preencher o "Status de Implementação". **Feito quando:** versão/changelog/índice atualizados e PRD renomeado, commitado.
3. **Corrigir imprecisão no doc PRD-004** — a nota diz que `copilotRules` está em `src/features/copilot/lib/copilotRules.ts`, mas o path real é `src/providers/data/impl/mock/copilotRules.ts`. Arquivo: `docs/prds/PRD-004-mocks-geradores-dados_DONE.md`. **Feito quando:** path corrigido.
4. **`finishing-a-development-branch`** — abrir/finalizar PR e decidir merge para `main`. **Feito quando:** PR pronto/mergeado conforme o usuário.

## ❓ Decisões pendentes

- **Toggle de variante na UI?** Hoje a troca é só por `VITE_COPILOT_PLACEMENT` (decisão do PRD — não é um toggle de usuário final). O usuário perguntou "onde alterno" e foi orientado a usar o `.env.local`. Se ele quiser um seletor visível em DEV, seria escopo extra (não pedido) — **inclinação: não implementar** salvo pedido explícito.
- **Variante default:** já decidida = `strip` (aprovada pelo usuário no companion). Sem pendência.

## 🚧 Bloqueios / Riscos

- **EOL phantom (CRÍTICO para commits):** `core.autocrlf=true` e **não há `.gitattributes`** → `git status` lista **~1570 arquivos "modificados"** que são só conversão LF↔CRLF, sem conteúdo real. **NUNCA usar `git add -A`** nesta branch — fazer add **seletivo** dos arquivos realmente tocados. (Possível melhoria futura: adicionar `.gitattributes` com `* text=auto eol=lf` e normalizar num commit dedicado — mas confirmar com o usuário, é mudança ampla.)
- `src/routeTree.gen.ts` aparece como modificado (gerado pelo plugin TanStack Router, de rotas não-relacionadas) — **não commitar** junto da feature.

## ⚠️ Avisos do usuário (regras desta sessão)

- **O usuário testa a UI manualmente.** NÃO abrir browser/preview (devtools/computer-use) para "validar" a interface — apenas subir o dev server e apontar a URL. (Memória: `feedback_manual_testing.md`.)
- **Commitar só quando o usuário pede** (CLAUDE.md global) — exceto os commits do plano de implementação já autorizados ao escolher executar.
- Conteúdo de UI em **português do Brasil com acentos corretos**; código/identificadores em inglês.
- `bunfig.toml` impõe guarda de supply-chain de 24h — **não adicionar pacotes sem confirmar** (por isso a feature NÃO introduziu test runner; verificação via build/lint/tsc + teste manual).

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Envio de mensagens** no `MessageInput` (Enter-to-send, janela 24h/template fallback, `onSent`), **emoji** (a inserção foi ajustada para setter controlado — não usar updater form), **templates** e **anexos**.
- **Abas da Ficha** (`ProfileTabs`): a aba "Copiloto" é condicional (`copilotTab`); a rota standalone `/app/clientes/:id` (sem copilotTab) deve permanecer idêntica.
- **Inbox / lista de conversas / Ficha** inalterados além de hospedar a superfície do copiloto (RNF-006).
- A faixa só renderiza quando há `customerId` e o provider não falhou — **falha do provider degrada graciosamente** (conversa permanece utilizável, RNF-002).

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/prds/PRD-025-copiloto-vendas.md` — o PRD (requisitos RF-001..012, RNF-001..007).
- `docs/superpowers/specs/2026-05-31-prd-025-copiloto-design.md` — decisões de design (variante default, densidade, cores, arquitetura).
- `docs/superpowers/plans/2026-05-31-prd-025-copiloto-vendas.md` — plano de implementação (13 tarefas, código completo).
- `src/providers/data/impl/mock/copilot.ts` + `copilotRules.ts` — composição do painel + regras R1/R2/R3.
- `src/features/copilot/components/CopilotStrip.tsx` — variante default (repouso/expandida/auto-expand).
- `src/features/copilot/hooks/useCopilotPanel.ts` — orquestração + dismiss local + loading/erro.
- `src/features/conversations/pages/ConversationPage.tsx` — onde as variantes são montadas.
- `CLAUDE.md` (raiz) — convenções do projeto.

## 🧠 Memórias relacionadas

- `feedback_manual_testing.md` — usuário testa UI manualmente; não abrir browser/devtools para validar.

## 📊 Atividade recente (telemetria)

Telemetria não ativa neste projeto (`.claude-metrics/annotations.jsonl` ausente).

## 📚 Referências

- PRD: `docs/prds/PRD-025-copiloto-vendas.md`
- Spec de design: `docs/superpowers/specs/2026-05-31-prd-025-copiloto-design.md`
- Plano: `docs/superpowers/plans/2026-05-31-prd-025-copiloto-vendas.md`
- Protótipos visuais: `docs/html/gallo-copiloto-mockup.html`, `gallo-copiloto-mockup2.html`
- Dev server: http://localhost:5173/
