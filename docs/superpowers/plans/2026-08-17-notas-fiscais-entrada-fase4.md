# Notas Fiscais de Entrada — Fase 4 (Análise e origens) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os seis cards da Análise aparecem depois de importar, e os switches das quatro origens mostram — inclusive — por que duas nascem desligadas.

**Architecture:** O motor de análise já existe desde a Fase 1 e é puro; esta fase monta o `IAnalysisInput` a partir das notas lançadas e do catálogo, e liga a tela. O fallback de LLM reusa a `AiFeatureKey` `part_identification` e a Edge Function `ai-generate` que já existem — sem chave configurada, o item simplesmente fica `pend` e a feature segue utilizável.

**Tech Stack:** React 19 · TanStack Query · Supabase Edge Functions (Deno) · Vitest

**Spec:** `docs/prds/PRD-216-notas-fiscais-entrada.md` (Fase 4: RS-02, RS-03, RS-04 e as origens 2–4)

## Global Constraints

- **Branch:** `claude/fiscal-notes-fase4`, de `claude/fiscal-notes-fase3`. PR com base nela. Pilha de quatro: #510 → #511 → #515 → este.
- **Reusar `part_identification` como `AiFeatureKey`.** Identificar peça a partir de descrição de fornecedor é identificação de peça — chave nova exigiria seed, orçamento e roteamento próprios sem ganho.
- **A IA sugere, nunca aplica** (RS-04). O fallback preenche `linkMode: "ia"` com evidência e confiança; quem confirma é o humano na gaveta.
- **E-mail e SEFAZ nascem desligados** e a tela diz o porquê: falta credencial e certificado A1 no Vault. Switch desabilitado com motivo visível vale mais que switch ausente.
- **Migrations NÃO são aplicadas.** Duas nesta fase (settings e o recurso RBAC), somando **7** no PRD-216.
- **Edge Functions não são deployadas.** `npx supabase functions deploy` exige OK explícito do dono.
- Tokens semânticos · `ux-guidelines.md` · pt-BR acentuado · `noUncheckedIndexedAccess` · commits em inglês.
- **Gate:** `bun run test` · `bun run build` · `tsc` sem erro em arquivo novo ou editado · `eslint` limpo nos arquivos da fase.

---

### Task 1: Montagem do input da análise

**Files:**
- Create: `src/features/fiscal-notes/engine/analysisInput.ts`
- Test: `src/features/fiscal-notes/engine/analysisInput.test.ts`
- Modify: `src/features/fiscal-notes/engine/index.ts`

**Interfaces:**
- Consumes: `IAnalysisInput`, `IAnalysisItem`, `IPurchaseHistoryEntry` (Fase 1) · `computeItemEffect` (Fase 3)
- Produces: `buildAnalysisInput(args): IAnalysisInput` · `buildPurchaseHistory(notes, partsById): Record<ID, IPurchaseHistoryEntry[]>`

> O card de preço precisa da série histórica de compra por peça. Ela não existe como tabela — é derivada das notas **lançadas**, exatamente como a movimentação. Mesma decisão da Fase 3, mesmo motivo.

- [ ] **Step 1: Escrever o teste (vai falhar)** — cobrindo: série ordenada da mais antiga para a mais recente, custo por unidade de estoque (não o `vUnCom`), rótulo curto de mês, exclusão de nota não lançada, e o `IAnalysisInput` montado com `knownAccessKeys` e `catalogNcm`.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/analysisInput.test.ts
```

- [ ] **Step 3: Implementar** `buildPurchaseHistory` (percorre notas lançadas em ordem de `postedAt`, usa `computeItemEffect` para o custo por unidade de estoque, agrupa por peça de destino) e `buildAnalysisInput` (junta nota corrente, catálogo, histórico, chaves conhecidas e o flag de fornecedor novo).

- [ ] **Step 4: Rodar, exportar no barrel e commitar**

---

### Task 2: Tela Análise IA

**Files:**
- Create: `src/features/fiscal-notes/hooks/useFiscalAnalysis.ts`
- Create: `src/features/fiscal-notes/components/analysis/AnalysisCard.tsx`
- Create: `src/features/fiscal-notes/components/analysis/PriceSeries.tsx`
- Create: `src/features/fiscal-notes/pages/FiscalAnalysisPage.tsx`
- Create: `src/routes/app.suprimentos.analise.tsx`
- Modify: `i18n/pt-BR.ts` · `shell/config/{routes,navigation}.ts` · `fiscal-notes/index.ts`

**Interfaces:**
- Produces: `useFiscalAnalysis()` → `{ cards, rules, isLoading }` · `FiscalAnalysisPage`

> A série de preço é desenhada em `div`s com altura proporcional, como no kit — sem biblioteca de gráfico para seis pontos.

- [ ] **Step 1: Hook** — busca notas (conferência + lançadas) e catálogo, monta o input com a Task 1, chama `analyzeNote` por nota em conferência e concatena os cards.
- [ ] **Step 2: `AnalysisCard`** — ícone e chip por `severity` (`danger`/`warning`/`success`/`info` → `severity-critical`/`severity-warning`/`severity-success`/`severity-info`), título, descrição e a série quando houver.
- [ ] **Step 3: `PriceSeries`** — barras em `div`, último ponto em `primary`.
- [ ] **Step 4: Página** — grade de dois cards por linha, lateral com "o que a análise lê" e **"o que ela nunca faz"** (RS-04), mais as regras de conversão aprendidas.
- [ ] **Step 5: Rota, navegação e barrel** — item "Análise IA" no grupo SUPRIMENTOS, guard por `supplies`.
- [ ] **Step 6: Verificar e commitar**

---

### Task 3: Fallback de LLM na sugestão de vínculo

**Files:**
- Create: `src/features/fiscal-notes/api/suggestPartLink.ts`
- Modify: `src/features/fiscal-notes/hooks/useImportNfe.ts`

**Interfaces:**
- Consumes: `useAiProvider().isAiFeatureEnabled("part_identification")` · `getSupabaseClient().functions.invoke("ai-generate", …)`
- Produces: `suggestPartLinkWithLlm(input): Promise<IMatchResult | null>`

> RS-02: **só** o item que a cascata determinística deixou em `pend` vai ao modelo. Sem chave no Vault, `isAiFeatureEnabled` devolve `false`, a função devolve `null` e o item continua `pend` — a feature degrada, não quebra (CA-11).

- [ ] **Step 1: Implementar `suggestPartLinkWithLlm`** — monta o prompt com a descrição, NCM e um recorte do catálogo; pede `{partId, confidence, evidence}`; valida que o `partId` devolvido existe entre os candidatos antes de aceitar. **Modelo que alucina SKU é recusado, não corrigido.**
- [ ] **Step 2: Ligar no `useImportNfe`** — depois de `buildNoteFromNfe`, para cada item `pend`, tentar o fallback e aplicar quando vier. Falha de rede não derruba a importação: o item fica `pend`.
- [ ] **Step 3: Verificar e commitar**

---

### Task 4: Configuração das origens

**Files:**
- Create: `supabase/migrations/20260817150000_fiscal_note_settings.sql`
- Create: `supabase/migrations/20260817150100_rbac_settings_supplies.sql`
- Create: `src/features/fiscal-notes/pages/FiscalNotesSettingsPage.tsx`
- Create: `src/routes/app.configuracoes.notas-fiscais.tsx`
- Modify: `rbac/permissions/{resources,matrix,seed}.ts` · `shell/layouts/SettingsLayout.tsx` · `i18n/pt-BR.ts`

> A tela mostra as quatro origens. Upload e upload-na-Edge ligáveis; **e-mail e SEFAZ desabilitados com o motivo escrito** — falta credencial e certificado A1 no Vault. Switch travado com explicação ensina; switch ausente esconde.

- [ ] **Step 1: Migration `fiscal_note_settings`** — uma linha por loja, um booleano por origem, RLS espelhando `nps_settings` (staff lê, Owner escreve). `email_enabled` e `sefaz_enabled` nascem `false`.
- [ ] **Step 2: Recurso `settings_supplies`** — em `resources.ts`, `matrix.ts` (Owner `view`+`edit`, Gestor `view`), `seed.ts` (rótulo e grupo) e a migration de seed.
- [ ] **Step 3: Entrada no `SettingsLayout`** com `permission: { resource: "settings_supplies", action: "view" }`.
- [ ] **Step 4: Página** com os quatro switches e, nas duas desligadas, o motivo e o que falta.
- [ ] **Step 5: Rodar `SettingsLayout.routeParity.test.ts`** — ele cobre menu ↔ arquivo de rota; entrada nova sem rota o derruba.
- [ ] **Step 6: Verificar e commitar**

---

### Task 5: Edge Functions das origens

**Files:**
- Create: `supabase/functions/fiscal-note-import/index.ts`
- Create: `supabase/functions/fiscal-note-inbox/index.ts`
- Create: `supabase/functions/fiscal-note-sefaz/index.ts`

> As três importam o parser espelhado de `_shared/fiscal/` — é para isso que ele existe. `inbox` e `sefaz` verificam o switch da loja e **retornam 503 com motivo** enquanto estiverem desligadas, em vez de falhar obscuro.

- [ ] **Step 1: `fiscal-note-import`** — recebe o XML no corpo, parseia com `_shared/fiscal/nfeParser.ts`, confere a chave contra o banco e devolve a nota criada.
- [ ] **Step 2: `fiscal-note-inbox`** — lê o switch; desligada, responde 503 `{ reason: "email_credentials_missing" }`.
- [ ] **Step 3: `fiscal-note-sefaz`** — mesma forma, `{ reason: "a1_certificate_missing" }`.
- [ ] **Step 4: Commitar. NÃO deployar.**

---

### Task 6: Gate da fase

- [ ] `bunx tsc --noEmit` sem erro nos arquivos da fase
- [ ] `bun run test` e `bun run build` verdes
- [ ] `eslint` sem erro real nos arquivos da fase
- [ ] `grep` por hex e `--gallo-` na feature devolve vazio
- [ ] `bun run sync:fiscal` sem diff pendente
- [ ] Diff sem ruído de fim de linha (`git diff --ignore-cr-at-eol --name-only` bate com `git diff --name-only`)
- [ ] Push e PR com base em `claude/fiscal-notes-fase3`

---

## Self-Review

**Cobertura:** RS-02 → Task 3. RS-03 (seis cards) → Tasks 1 e 2, sobre o motor da Fase 1. RS-04 ("o que ela nunca faz") → Task 2 Step 4, na lateral da tela. Origens 2–4 → Tasks 4 e 5. Entregável declarado ("cards aparecem após importar; switches mostram o motivo") → Tasks 2 e 4.

**Riscos com antídoto:** `SettingsLayout.routeParity.test.ts` derruba entrada de menu sem rota (Task 4 Step 5). Recurso RBAC sem seed no banco esconde a tela de todos (Task 4 Step 2). O LLM pode devolver SKU inexistente — a Task 3 valida contra os candidatos antes de aceitar.

**Fora desta fase:** contas a pagar segue fora do PRD-216 inteiro; `manual` (nota digitada) segue reservado sem produtor.
