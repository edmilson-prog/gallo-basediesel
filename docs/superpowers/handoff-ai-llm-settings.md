# Handoff — Área de Inteligência Artificial (Provedores LLM, Roteamento & Consumo)

> **Propósito deste documento:** entregar a um agente executor (contexto zero) tudo o que foi decidido no brainstorming desta feature, com apontamentos para o spec e o plano. Leia este documento primeiro; ele é o índice + contexto + instruções de execução.

- **Data do brainstorming:** 2026-06-13
- **Status:** Planejado e aprovado pelo dono · **NÃO implementado**
- **Feature alvo:** `src/features/ai-settings/` + provider `ai` (37º) + rota `app.configuracoes.ia`

---

## 0. Documentos desta feature (ponteiros)

| Documento | Caminho | Conteúdo |
|-----------|---------|----------|
| **Spec (design)** | [`docs/superpowers/specs/2026-06-13-ai-llm-settings-design.md`](specs/2026-06-13-ai-llm-settings-design.md) | Arquitetura, modelo de dados, contrato, telas, RBAC, escopo MVP×deferido. |
| **Plano (execução)** | [`docs/superpowers/plans/2026-06-13-ai-llm-settings.md`](plans/2026-06-13-ai-llm-settings.md) | 20 tasks TDD bite-sized, com código completo, caminhos e commits. **É o que o executor segue.** |
| **Handoff (este)** | `docs/superpowers/handoff-ai-llm-settings.md` | Contexto consolidado + instruções de execução. |
| **Mockups (alta fidelidade)** | [`docs/superpowers/mockups/`](mockups/) — principal `ia-area-hub-v1.html` | Referência visual fiel da estrutura B aprovada (+ `estrutura-nav-opcoes-v1.html` comparando A/B/C e `ia-area-v1.html` variante A). Abrir no navegador. Layout descrito por escrito em §4.1. |

> **Para o executor:** o **plano** é a fonte de verdade da implementação (código por task). O **spec** explica o "porquê" das decisões. Este handoff dá o caminho mais curto para começar.

---

## 1. Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial para distribuidora de peças pesadas (Frederico Westphalen/RS), em produção (`crm.gallobasediesel.com.br`). Stack: React 19 + TanStack Router (file-based) + Tailwind v4 + shadcn/ui + recharts; **Provider Pattern** (`@/providers/data`, switch `VITE_DATA_SOURCE=mock|supabase`); Vitest; Zustand para o mock store.

**Por que esta feature:** hoje o GALLO **não tem** onde configurar LLMs. O "cérebro" de IA (copiloto de conversa, copiloto analítico, SDR, identificação de peça, insights) roda em **regras/heurística local** — não há integração real com nenhum provedor de LLM. Esta feature entrega o **painel de gestão + a fundação de dados** (mock-first), deixando a chamada real de LLM para uma fase posterior.

---

## 2. A jornada do brainstorming (resumo do que conversamos)

1. **Pergunta inicial do dono:** "já existe lugar para configurar LLMs nas configurações?" → Resposta: não (só placement do copiloto e um toggle do copiloto analítico, que roda por regras).
2. **Inspiração:** o dono trouxe prints de dois projetos (um painel "Provedores LLM" com chave/modelo/consumo, e um dashboard "Assistente IA" com KPIs). Pediu para combinar o melhor dos dois, redesenhar e acrescentar KPIs avançados.
3. **Design intelligence:** rodada da skill `ui-ux-pro-max` para direção visual (adaptada aos tokens semânticos do GALLO e ao recharts — sem hex hardcoded nem troca de fonte).
4. **Mockups:** wireframes inline → mockup de alta fidelidade → **visual companion navegável** (com a cara real diesel-dark/dourado). O dono comparou as estruturas e escolheu a **B (hub com abas)**.
5. **Decisões de produto** (ver §3) tomadas via perguntas objetivas.
6. **Arquitetura** (ver §4) escolhida: provider novo + Vault + engine puro testável.
7. **Spec** escrito, auto-revisado e **aprovado**. **Plano** escrito (20 tasks TDD) e auto-revisado.
8. O dono pediu para **não mexer no git** ainda (só o plano) → nada commitado. Depois pediu este handoff + issue.

---

## 3. Decisões de produto (consolidadas)

| Tema | Decisão | Observação |
|------|---------|------------|
| Escopo | Painel + fundação **mock-first** | Sem chamada real de LLM nesta rodada. |
| Estrutura de navegação | **Hub com abas** (opção B) | Um item na sidebar abre página com abas; abas por `?aba=`. Recomendação original era A (subtelas), mas o dono escolheu B. |
| Acesso (RBAC) | **Owner-only** | Rota + item de sidebar restritos a `Owner`. |
| Multi-loja | **Global** | Sem `storeId` na config nem no usage (MVP). |
| Provedores | **Anthropic, OpenAI, OpenRouter, Google** | Catálogo de modelos curado no mock. |
| **Recurso central** | **Roteamento de modelo por funcionalidade + fallback** | Cada cérebro de IA aponta para um provedor/modelo; cai para fallback se indisponível/estourar budget. |
| Abas | Visão geral · Provedores & chaves · Funcionalidades · Playground | Prompts de sistema **embutidos na aba Funcionalidades** (não há aba própria). |
| Câmbio | Preços em **USD/1k** + `usdToBrl` configurável | Conversão para R$ no engine de pricing. |

**Consumidores de IA modelados:** `conversation_copilot`, `analytics_copilot`, `sdr`, `part_identification`, `insights`.

**KPIs/métricas (aba Visão geral):** chamadas, tokens, custo (R$), budget % + barra, projeção de gasto (run-rate), alerta de budget, custo por funcionalidade, consumo por provedor (donut), série temporal 30d, tokens médios/chamada, taxa de erro, taxa de fallback, latência média, top funcionalidade por crescimento. Filtro de período + tabela alternativa (a11y).

---

## 4. Arquitetura (resumo — detalhes no spec §3–§10)

- **Feature** `src/features/ai-settings/` com `pages/` (uma por aba + hub), `components/`, `hooks/`, `engine/` (puro, testado), `i18n/`, `index.ts`.
- **Provider `ai` (37º)** no Provider Pattern: `contracts/ai.ts` (`IAiProvider`), `impl/mock/ai.ts` (determinístico, usa os engines), `impl/supabase/ai.ts` (stub `NotImplementedError`), `hooks/useAiProvider.ts`, registrado no `factory.ts` e no barrel `index.ts`. Agregado em `IDataProviders` (`contracts/index.ts`).
- **Chaves no Vault:** estende [`src/features/admin-settings/engine/integrationKeys.ts`](../../src/features/admin-settings/engine/integrationKeys.ts) com o grupo "Provedores LLM" (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_AI_API_KEY`). Reusa a Edge `integration-secrets` (write-only). **As chaves NÃO passam pelo provider `ai`.**
- **Engines puros (TDD):** `aiPricing` (custo USD→BRL), `aiUsage` (agrega eventos → summary), `aiBudget` (projeção + nível de alerta), `aiRouting` (resolve modelo efetivo + fallback). Todos com `*.test.ts`.
- **Tipos** em `src/shared/types/ai.ts` (re-exportado no barrel). Os tipos auxiliares de playground/test connection vivem em `shared/types` (não em `contracts`) por causa da fronteira ESLint.

---

## 4.1. Layouts definidos (detalhe por aba)

> **Fonte visual fiel:** `docs/superpowers/mockups/ia-area-hub-v1.html` (estrutura B aprovada). O mockup usa tema diesel-dark (fundo `#0e0e0e`, cards `#1a1a1a`, accent dourado `#c9a24a`, verde p/ positivos) — mas na implementação use **sempre tokens semânticos** (`bg-background`, `bg-card`, `text-primary`, `text-foreground`, `border-border`, `text-severity-*`), **nunca** hex/`--gallo-*`. O código real desses layouts está no plano (T12–T17).

**Cabeçalho da área (acima das abas):** título "Inteligência artificial" + subtítulo; à direita o **master switch** global (pill "IA ativa" com toggle). Abaixo, a barra de **abas**: Visão geral · Provedores & chaves · Funcionalidades · Playground (sincronizadas com `?aba=`).

**Aba Visão geral:**
- Filtro de período (select: mês atual / 7d / 30d) alinhado à direita.
- **4 KPI cards** (grid 4 col; 2 col no mobile): Chamadas · Tokens · Custo est. (R$) · Budget (% + barra). Cada card: ícone + label + valor grande + delta vs. período anterior.
- Linha de 2 cards: **"Consumo nos últimos 30 dias"** (área chart, ~2/3 da largura) + **"Por provedor"** (donut + legenda com %).
- Linha de 2 cards: **"Custo por funcionalidade"** (barras horizontais ordenadas) + **"Confiabilidade & projeção"** (projeção do mês, tokens/chamada, taxa de erro, taxa de fallback, latência média).
- Tabela `sr-only` com os dados (acessibilidade). Empty state quando sem consumo.

**Aba Provedores & chaves:**
- Card "Provedor padrão" (select + botão Salvar).
- Banner "modo demonstração" quando `dataSource != supabase` (edição de chave desabilitada).
- **Grid 2 col de cards de provedor** (Anthropic/OpenAI/OpenRouter = Configurado; Google = Não configurado, esmaecido). Cada card: avatar com iniciais, nome + descrição, badge de status, **chave de API mascarada** (botão Definir/Substituir → input password no fluxo Vault), **select de modelo padrão** (com preço por 1k), rodapé com **"Testar conexão"** + "último teste".

**Aba Funcionalidades (coração):**
- Nota explicativa (roteamento + fallback).
- **Uma linha por funcionalidade** (Copiloto de conversa, Copiloto analítico, SDR, Identificação de peça, Insights): ícone + nome/descrição · **select de provedor** · **select de modelo** · **toggle on/off** · custo do mês · botão expandir → painel com **fallback** (provedor), **temperatura** e **prompt de sistema** (textarea).

**Aba Playground:**
- Linha de selects: Provedor · Modelo · Temperatura.
- **Textarea** de prompt + botão **Executar** (à direita).
- **Card de resposta**: texto + métricas (tokens entrada/saída, custo R$, latência). Simulado no MVP.

## 5. Escopo MVP × Deferido (decisão importante)

**Entra agora (MVP):** as 4 abas 100% funcionais sobre o **mock**; config persistida via provider; **chaves reais no Vault** (fluxo já real); engine + testes; "Testar conexão" e Playground **simulados** (mock).

**Deferido (fase seguinte, gated por decisão do dono):** Edge Function proxy `ai-generate` (lê chave do Vault → chama LLM real → grava `IAiUsageEvent`); tabelas Supabase reais (`ai_provider_config`, `ai_feature_routing`, `ai_usage_events`) + RPCs agregadas + RLS; plugar os consumidores reais ao `resolveEffectiveModel`; "Testar conexão"/Playground reais.

---

## 6. Estado do git e pré-requisito de execução

- O brainstorming foi feito na branch **`chore/release-v0.93.0`** (release em andamento, working tree sujo). **Nada foi commitado** a pedido do dono.
- **Ao iniciar a execução**, isole o trabalho (NÃO trabalhar na branch de release):

```bash
# a partir de main (ou use a skill superpowers:using-git-worktrees)
git checkout main && git checkout -b feat/ai-llm-settings
git add docs/superpowers/specs/2026-06-13-ai-llm-settings-design.md \
        docs/superpowers/plans/2026-06-13-ai-llm-settings.md \
        docs/superpowers/handoff-ai-llm-settings.md
git commit -m "docs: spec, plan and handoff for AI/LLM settings area"
```

> Se o working tree da release atrapalhar o checkout, `git stash` antes e `git stash pop` ao voltar — preservando a release.

---

## 7. Instruções para o agente executor

1. **Leia** este handoff → o spec → o plano.
2. **Crie a branch** `feat/ai-llm-settings` (§6) e commite os 3 docs como 1º commit.
3. **Execute o plano task a task** (T1→T20). Recomenda-se a skill `superpowers:executing-plans` (lotes com checkpoints) ou `superpowers:subagent-driven-development` (um subagente por task). Cada task tem TDD (teste → falha → impl → passa → commit).
4. **Verifique antes de assumir** (notas no fim do plano): confirme no código real o nome do helper de hook (`_useDataProviderSlice`), a assinatura de `NotImplementedError` (`src/providers/data/errors.ts`) e a existência dos utilitários `text-severity-*` (senão use `text-emerald-600`/`text-red-600`).
5. **Gate final (T20):** `bun run test` (todos passam, incl. 4 engines + integrationKeys), `bun run build` (sem erro), `bunx tsc --noEmit` (sem erro **novo** atribuível à feature — há baseline pré-existente; avalie por delta), `bun run lint`/`format`.

### Convenções do projeto a respeitar (obrigatório)
- **Fronteiras ESLint:** features acessam dados só via `@/providers/data` e tipos via `@/shared/types`. Proibido importar de `@/mocks`, de `impl/*` ou de `contracts/*` individuais fora de `providers/data`.
- **Provider Pattern:** mutações via `useAiProvider()`. Switch mock/supabase por `VITE_DATA_SOURCE`.
- **Código** em inglês (camelCase/PascalCase, tipos com prefixo `I`); **UI** em pt-BR com acentos corretos; **colunas DB** snake_case (fase supabase).
- **Tema:** componentes consomem **apenas tokens semânticos** (`bg-background`, `text-foreground`, `text-primary`, `border-border`, severidades `text-severity-*`). Nunca hex direto nem `--gallo-*`.
- **UX:** seguir `docs/dev/ux-guidelines.md` em telas novas.
- **Commits:** Conventional Commits em inglês, atômicos. **Não commitar na `main`/release sem ok.**
- **Supply-chain guard:** `bunfig.toml` impõe 24h; confirmar com o dono antes de adicionar pacote a `minimumReleaseAgeExcludes`. (Esta feature **não** precisa de dependência nova — usa recharts/shadcn/seedrandom já presentes.)

---

## 8. Pós-implementação (fora do escopo do plano de código)
- Bump **MINOR** + codinome + `CHANGELOG.md` (seguir skill `versionamento`).
- Atualizar `CLAUDE.md`: contador de providers **36 → 37** e descrição da nova área.
- Abrir PR para revisão.
- A **integração real de LLM** (§5 deferido) é a próxima fase, condicionada a decisão do dono (contratar/configurar provedores, custos).
