# Copiloto Analítico — Página Dedicada Multi-Modo — Design

> **Data:** 2026-06-05 · **Status:** Aprovado (defaults recomendados) · **PRD-fonte:** PRD-057 (evolução de superfície)
> **Branch:** `feat/copiloto-pagina-multimodo` · **Fase:** Frontend-First (mock/localStorage)

---

## 1. Contexto

O Copiloto Analítico (PRD-057) foi entregue como um **botão na TopBar + atalho `Ctrl/Cmd+K`** que abre um **`Sheet` lateral** (largura ~448–512px) com o chat. O usuário pediu para **transformá-lo numa página dedicada acessível pelo menu lateral (sidebar)**, aproveitando a largura/altura de uma página inteira, e com **salto visual** ("premium").

Duas rodadas de consultoria com o agente `design-specialist` embasaram este design (sketches e justificativas no Apêndice A).

## 2. Objetivo

Mover o Copiloto da superfície "Sheet apertado" para uma **página dedicada em `/app/gestao/copiloto`** com:

- **Seletor de 3 modos de visualização** alternáveis e persistidos: **Foco** (coluna única), **Histórico** (lista de sessões + conversa) e **Split** (conversa + painel de detalhe).
- **Tratamento visual premium:** empty-state hero com sugestões agrupadas + answer card turbinado.
- **Persistência de sessões em `localStorage`** (Fase 1; Supabase fica para Fase 2).
- **Reorganização da entrada:** item no sidebar (grupo Gestão), botão da TopBar e `Ctrl/Cmd+K` passam a **navegar** para a página; o `Sheet` é aposentado.

Restrição inviolável herdada do PRD-057 — **RNF-001:** todo número exibido vem do motor determinístico (`runCopilotQuery` → `executeQuery` → `IAnalyticsDataAccess` + funções puras de BI). Nenhuma camada de UI fabrica, estima ou opina sobre valores.

## 3. Decisões (com justificativa)

| # | Decisão | Justificativa |
|---|---------|---------------|
| **D-1** | Rota `/app/gestao/copiloto`, grupo de menu **Gestão** | Coerente com `/app/gestao/forecast`, `/app/gestao/vendas`; é uma ferramenta transversal de BI. |
| **D-2** | **Núcleo de conversa único** + duas "asas" acopláveis (lista/detalhe) | Elimina fork de 3 layouts; espelha a arquitetura de slots do `ConversationLayout`. |
| **D-3** | Seletor = `ToggleGroup type="single"` de **ícones + Tooltip**, na posição do `MetricToggle` | Mostra os 3 modos e o ativo o tempo todo; ícones economizam espaço; tooltip dá o rótulo. |
| **D-4** | **Modo padrão = Foco**; escolha persistida em `gallo-copilot-viewmode` | Menor sobrecarga; evita expor Histórico vazio / Split sem resposta no 1º acesso. |
| **D-5** | Sessões persistidas em **`localStorage`**, **histórico global** (não por-loja) | Fase Frontend-First; o escopo já vive por-resposta (`answer.query.scope`). |
| **D-6** | **Excluir** sessão (kebab → `AlertDialog`); **renomear adiado** | Título auto-derivado da 1ª pergunta resolve a maioria dos casos. |
| **D-7** | Painel Split = **ficha rotulada** da última resposta **resolvida**, distinta do card | Card = resumo escaneável; painel = ficha fixada (Período/Escopo/Filtros/Fonte) + drill-down. |
| **D-8** | Entrada: botão TopBar + `Ctrl+K` **navegam**; `Sheet` removido | Pedido do usuário ("ao invés de colocar na barra"); uma única fonte de verdade de UX. |
| **D-9** | Item de menu **escondido** quando `analyticsCopilotEnabled === false` | Espelha o gating já existente na TopBar; Sidebar passa a ler a setting. |
| **D-10** | Incluir **fix `metricCatalog.ts:57`** `PRD-043` → `PRD-044` (positivação) | Correção de citação conhecida (pendência do checkpoint), arquivo já em escopo. |
| **D-11** | Mobile: conversa full-width; Histórico/Detalhe viram **`Sheet`** (drawers) | Padrão já ensinado pelo `ConversationLayout` (ficha). |
| **D-12** | Composer com **`<textarea>` auto-resize (1→4 linhas)**, Enter envia / Shift+Enter quebra | Perguntas analíticas podem ser longas; melhor que `<Input>` de 1 linha numa página. |

## 4. Arquitetura

### 4.1 Árvore de componentes

```
src/features/analytics-copilot/
  pages/
    AnalyticsCopilotPage.tsx        # route component: dono de viewMode + chat; escolhe o shell
  components/
    CopilotHeader.tsx               # <h1> + badge Beta + CopilotViewSwitcher + botão "Nova conversa"
    CopilotViewSwitcher.tsx         # ToggleGroup (foco|historico|split) + Tooltip
    CopilotConversation.tsx         # log (aria-live) + EmptyState hero + Composer  [NÚCLEO compartilhado]
    CopilotEmptyState.tsx           # hero: saudação + sugestões agrupadas por categoria
    CopilotComposer.tsx             # textarea auto-resize + botão enviar + hint
    CopilotSessionList.tsx          # asa esquerda (modo Histórico) + conteúdo do Sheet mobile
    CopilotDetailPanel.tsx          # asa direita (modo Split) + conteúdo do Sheet mobile
    AnalyticsAnswerCard.tsx         # [EXISTENTE — turbinar]
  hooks/
    useCopilotChat.ts               # compõe sessões + runCopilotQuery + dataAccess + role/store/user
    useCopilotSessions.ts           # store localStorage (lista, ativa, criar/selecionar/excluir)
    useCopilotViewMode.ts           # gallo-copilot-viewmode (foco|historico|split), default foco
  engine/
    runCopilotQuery.ts              # [NOVO] orquestração pura: resolveQuery→scopeClamp→executeQuery
    sessionStore.ts                 # [NOVO] reducers puros + (de)serialização localStorage
  utils/
    sessionGrouping.ts              # [NOVO] agrupa sessões por Hoje/Ontem/Anteriores
    answerFormatting.ts             # [NOVO] período/escopo/filtros para card e painel
    # tempo relativo: reusar formatRelativeTimeBR de @/shared/utils/format (DRY)
  i18n/
    suggestions.ts                  # [EXISTENTE — reestruturar p/ {category, question, icon} por papel]
  catalog/
    metricCatalog.ts                # [EXISTENTE — fix PRD-044 + mapa de categoria/ícone de UI]
```

> O atual `useAnalyticsCopilot.ts` é **substituído** por `useCopilotChat` (que reusa a orquestração via `runCopilotQuery`). O `AnalyticsCopilotPanel.tsx` (Sheet) é **removido**.

### 4.2 Fluxo de dados (RNF-001)

```
usuário digita → useCopilotChat.ask(question)
  → runCopilotQuery(question, ctx, { dataAccess, catalog })
       → resolveQuery (escolhe métrica + filtros; NUNCA valor)
       → scopeClamp   (aplica RBAC; pode recusar)
       → executeQuery (chama IAnalyticsDataAccess → número do motor)
  → { answer, errorText? }
  → useCopilotChat anexa {user, assistant} à sessão ATIVA → persiste em localStorage
  → CopilotConversation renderiza; CopilotDetailPanel reflete a última resposta resolvida
```

`ctx` = `{ role, storeId, sellerId, period }` (período = mês corrente, via `monthBounds(now)`); `auditLog` em consulta resolvida (mantido do hook atual).

### 4.3 Shell por modo (desktop, `h-[calc(100vh-4rem)]`)

```
foco       →  [        CopilotConversation (trilho max-w-3xl mx-auto)        ]
historico  →  [ CopilotSessionList w-72 | CopilotConversation               ]
split      →  [ CopilotConversation        | CopilotDetailPanel xl:w-[360px] ]
```

Trocar de modo **não remonta** a conversa (mesmo `useCopilotChat`): só o chrome ao redor muda. Transição apenas de `opacity` (nunca `width`).

## 5. Os 3 modos + seletor

**Seletor (`CopilotViewSwitcher`)** — `ToggleGroup type="single"`, trilho `bg-muted/40 p-1 rounded-lg`, item ativo `bg-background text-foreground shadow-sm`, inativo `text-muted-foreground hover:text-foreground`, `focus-visible:ring-2 focus-visible:ring-ring`. Cada `ToggleGroupItem` com `aria-label` + `Tooltip`.

| Modo | valor | Ícone | Tooltip / aria-label |
|---|---|---|---|
| Foco | `foco` | `mdi:card-text-outline` | "Modo Foco — coluna única" |
| Histórico | `historico` | `mdi:history` | "Modo Histórico — conversas salvas" |
| Split | `split` | `mdi:view-split-vertical` | "Modo Split — conversa e detalhe" |

**"Nova conversa"** = botão **separado** à direita (`Button variant="ghost" size="sm"` com `mdi:plus`; `size="icon"` no mobile). É ação, não modo.

## 6. Núcleo de conversa (`CopilotConversation`)

- **Header glass** (`CopilotHeader`): `bg-background/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65 border-b border-border/60`. `<h1>` "Copiloto analítico" + badge "Beta · baseado em regras" (`rounded-full border bg-muted/50 text-[10px] uppercase`). Subtítulo `text-muted-foreground`.
- **Log:** `role="log" aria-live="polite"` num trilho **`max-w-3xl mx-auto`**. Bolha do usuário `bg-primary text-primary-foreground rounded-2xl rounded-tr-sm`; resposta em `bg-card border border-border rounded-2xl rounded-tl-sm` contendo `AnalyticsAnswerCard`. `TypingIndicator` enquanto `isThinking`.
- **Auto-scroll:** `scrollIntoView({ behavior })` com `behavior = prefers-reduced-motion ? "auto" : "smooth"`. Foco **permanece no composer** após enviar.

## 7. Composer (`CopilotComposer`)

- `<textarea>` auto-resize 1→4 linhas (`rounded-xl`), **Enter envia / Shift+Enter quebra**; `disabled` quando vazio ou `isThinking`.
- Botão `Button size="icon"` (`h-11 w-11`) com `mdi:send`, `aria-label="Enviar pergunta"`.
- Placeholder: `"Pergunte sobre faturamento, margem, clientes…"`. Hint `text-xs text-muted-foreground`: "Respostas vêm sempre com a fonte oficial · Enter envia · ⌘K" (oculto se faltar espaço no mobile).
- Sticky no rodapé do trilho, glass igual ao header, `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`. Largura `max-w-3xl mx-auto` para alinhar com as bolhas.
- Chips de atalho (3 sugestões) **acima** do composer **apenas quando já há mensagens** (no vazio, o hero cumpre esse papel).

## 8. Empty state premium (`CopilotEmptyState`)

Renderizado quando a sessão ativa não tem mensagens.

- **Hero:** ícone do robô (`mdi:robot-happy-outline`) em círculo `bg-primary/10 text-primary` com gradiente radial leve via token (**desligado** sob `prefers-reduced-motion`). Saudação contextual `<h1 class="text-3xl font-semibold tracking-tight">` "Bom dia/Boa tarde/Boa noite, {displayName}" (de `useAuth`; horário = texto, sem RNF-001) + subtítulo.
- **Sugestões agrupadas por categoria** (cards clicáveis `rounded-xl border bg-card p-4 text-left hover:bg-accent/50`, grid `grid-cols-1 sm:grid-cols-2 gap-3`, cada um `<button>` que preenche e dispara `ask()`):

| Categoria | Métricas | Ícone do card |
|---|---|---|
| **Faturamento & Margem** | faturamento, margem, ticket médio, pedidos | `mdi:cash-multiple` / `mdi:scale-balance` |
| **Clientes & Positivação** | positivação, carteira (em risco), curva ABC | `mdi:account-check` / `mdi:account-alert` |
| **Projeção** | forecast | `mdi:chart-timeline` |

- Rótulo de grupo: `text-xs font-semibold uppercase tracking-wider text-muted-foreground` (mesmo estilo dos grupos da Sidebar).
- **RBAC:** Vendedor recebe frasing "minha/meu" (estender `suggestionsForRole` → retorna `{ category, question, icon }[]`); não exibir card de métrica cujo `requiredRole` o usuário não tenha.
- **Nenhum número de demonstração** nos cards.

## 9. Answer card turbinado (`AnalyticsAnswerCard`)

Evolução do componente existente — **só renderiza o que há em `IAnalyticsAnswer`**.

- **Resolvido:** número herói `text-4xl font-mono font-semibold tracking-tight` (`formattedValue ?? "—"`); badge de delta **tonal** (`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400` / `bg-red-500/10 text-red-600 dark:text-red-400`) com ícone direcional, **mantendo o `aria-label` consolidado** ("Faturamento R$ 487.200, em alta 12,4% versus período anterior"); linha "vs {previousValue} no período anterior".
- **Sparkline:** renderizar **apenas se** `visual === "sparkline"` **e** `series?.length`. Linha `stroke-primary`, área `fill-primary/10`, sem eixos/tooltip. `aria-hidden` (o valor já é lido) ou `role="img"` com label textual.
- **Contexto:** linha `Métrica · Período · Escopo` (`text-xs text-muted-foreground`) derivada de `answer.query` (`findMetricById`, `period`, `scope`).
- **Ações:** "Ver no painel {label}" via `<Link to={citation.drillDownUrl}>` (TanStack, navegação SPA) + "perguntar de novo" (`mdi:refresh`, ghost) que re-dispara a mesma pergunta.
- **Estados preservados intactos:** "não resolvido" (ícone `mdi:help-circle-outline` + chips, **sem número**) e "recusado por escopo" (`mdi:shield-lock-outline` + "Você não tem acesso a esse dado.", **sem número**). Apenas mais respiro (padding) numa página.

## 10. Modo Histórico (`CopilotSessionList` + store)

### 10.1 Store de sessões (`useCopilotSessions` + `sessionStore.ts`)

Tipo de superfície (estende o mínimo `IAnalyticsSession`):

```ts
interface ICopilotSessionRecord {
  id: string;            // crypto.randomUUID()
  title: string;         // derivado da 1ª pergunta (truncado ~40 chars) ou "Nova conversa"
  messages: IAnalyticsMessage[];
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
}
```

- Persistência: `localStorage["gallo-copilot-sessions"]` (array) + `localStorage["gallo-copilot-active"]` (id). Leitura defensiva (try/catch + validação de shape), como `Sidebar.readCollapsedGroups`.
- **Reducers puros** (em `sessionStore.ts`, testáveis): `createSession`, `selectSession`, `deleteSession`, `appendMessages(sessionId, msgs)`, `deriveTitle(messages)`, `touch(updatedAt)`. O hook só faz I/O (ler/escrever) + estado React.
- Limite de retenção: manter as **últimas 50** sessões (descarta as mais antigas) — evita crescer `localStorage` sem limite. `log`/silencioso (sem UI).

### 10.2 UI da lista

- Coluna `md:w-72 border-r border-border bg-card`, `ScrollArea`.
- **"Nova conversa"** no topo: `Button variant="outline" className="w-full justify-start gap-2"` (`mdi:plus`). Cria sessão, marca ativa, foca composer, mostra hero.
- **Agrupamento por data** (`sessionGrouping.ts`): cabeçalhos **Hoje / Ontem / Anteriores** (`text-xs font-semibold uppercase tracking-wider text-muted-foreground`).
- **Item:** `<button>` com título `truncate text-sm font-medium`, tempo relativo (`relativeTime.ts`, `text-xs text-muted-foreground`) e preview opcional do último número resolvido ("R$ 487k · Faturamento" — número já vindo do motor, não invenção). Ativo: `bg-accent text-accent-foreground` + `border-l-2 border-primary`; inativo `hover:bg-accent/50`.
- **Excluir:** kebab (`mdi:dots-vertical`, `DropdownMenu`) visível no hover/focus → "Excluir conversa" → `AlertDialog` ("Excluir esta conversa? Esta ação não pode ser desfeita."). **Renomear: fora de escopo.**
- **Estado vazio:** ícone `mdi:history` em `bg-muted text-muted-foreground` + "Nenhuma conversa ainda" + "Suas perguntas ficam salvas aqui." (com o botão "Nova conversa" ainda presente no topo).

## 11. Modo Split (`CopilotDetailPanel`)

- Painel `xl:w-[360px] border-l border-border bg-card`, scroll próprio. Reflete a **última resposta resolvida** da sessão ativa (micro-rótulo "Última resposta").
- **Conteúdo (estritamente de `IAnalyticsAnswer`):**
  1. Cabeçalho: ícone de categoria + `findMetricById(query.metricId)?.label`.
  2. Número herói `text-4xl font-mono` (`formattedValue`).
  3. Delta tonal + "vs {previousValue} no período anterior".
  4. Sparkline `h-16` **só se** `visual === "sparkline"` e `series?.length`.
  5. Campos rotulados (`dl`): **Período** (de `query.period`), **Escopo** (de `query.scope` → "Matriz · Owner"), **Filtros** (de `query.filters`, só presentes; ex.: "Marca: Volvo"), **Comparação** (`comparison` mode em PT-BR).
  6. **Fonte + drill-down:** "✔ Fonte: {label} ({prd})" + **botão primário** "Ver no painel {label} →" (`<Link to={citation.drillDownUrl}>`).
- **Estado vazio** (sem resposta resolvida): ícone `mdi:chart-box-outline` + "Sem detalhe ainda" + "Faça uma pergunta com resposta numérica para ver a ficha aqui."
- **Sem dado avaliativo, sem gráfico completo, sem nada fora do tipo.** Se a última resposta foi "não sei"/"recusada", painel mostra o estado vazio (não exibe número).

## 12. Responsivo

| Modo | `< md` (mobile) | `md`–`xl` | `xl+` |
|---|---|---|---|
| **Foco** | coluna única full-width | coluna única (`max-w-3xl`) | idem |
| **Histórico** | conversa full-width; lista vira **`Sheet` à esquerda** (botão `mdi:history` "Conversas") | lista inline `w-72` + conversa | idem |
| **Split** | conversa full-width; detalhe vira **`Sheet` à direita** (botão `mdi:dock-right` "Detalhe") | conversa + detalhe como **`Sheet`** (não cabe inline) | conversa + painel inline `xl:w-[360px]` |

- Seletor permanece visível no mobile e controla **qual drawer fica disponível** (Foco = nenhum). Botões de drawer no header (`Button size="icon" variant="ghost"`). "Nova" → `size="icon"`.
- Altura: `h-[calc(100vh-4rem)]` (desktop); `100dvh` considerado no mobile pela barra de URL dinâmica.
- **Empilhamento composer × BottomNav:** composer `bottom-16 md:bottom-0` (o `<main>` tem `pb-16 md:pb-0`).

## 13. Acessibilidade (WCAG 2.2 AA)

- **Um `<h1>`** por página ("Copiloto analítico"; no vazio, a saudação pode ser o `<h1>` ou `<p>` com `<h1>` discreto).
- `role="log" aria-live="polite"` no histórico (não `assertive`); a resposta é anunciada, a bolha do usuário não precisa.
- **Foco** no composer ao montar / ao chegar via Ctrl+K; **permanece** no composer após enviar.
- Chips e cards são `<button>` reais (Tab/Enter/Space), `focus-visible:ring-2 focus-visible:ring-ring`.
- Delta **não depende só de cor** (ícone direcional + `aria-label`); valor+delta numa região anunciada coerente.
- Drill-down e "Ver no painel" como `<Link>` com texto descritivo (não "clique aqui").
- `prefers-reduced-motion`: `scrollIntoView` instantâneo; sem animação de gradiente/entrada de bolha (o reset global do `styles.css` já zera transições).
- Seletor: `ToggleGroupItem` com `aria-label` (não depender do tooltip).

## 14. Entrada da feature

- **Sidebar** (`navigation.ts`): item "Copiloto" (`mdi:robot-happy-outline`) no grupo **Gestão** (sugestão: topo do grupo), `roles: ["Owner","Gestor","Vendedor","Financeiro"]`. **Gating por `analyticsCopilotEnabled`**: a `Sidebar` passa a ler `usePlatformSettings(storeId)` e **filtra o item** quando a setting for `false` (default = visível). Detalhe de implementação: filtrar após `filterGroupsByRole`, via predicado por `to === ROUTES.GESTAO_COPILOTO`.
- **`routes.ts`:** `GESTAO_COPILOTO: "/app/gestao/copiloto"`.
- **Arquivo de rota** `src/routes/app.gestao.copiloto.tsx`: `beforeLoad: requireAuth(pathname, ["Owner","Gestor","Vendedor","Financeiro"])`, `component: AnalyticsCopilotPage`.
- **TopBar:** botão do robô **mantido** mas `onClick` → `navigate({ to: ROUTES.GESTAO_COPILOTO })`; `Ctrl/Cmd+K` → mesma navegação; **remover** o estado `copilotOpen` e o `<AnalyticsCopilotPanel/>`. `title/aria-label` "Copiloto (Ctrl+K)". Gating `copilotEnabled` mantido para exibir o botão.

## 15. Cleanups inclusos

- **`metricCatalog.ts:57`**: `source.prd` da positivação `"PRD-043"` → **`"PRD-044"`**.
- **Remover** `AnalyticsCopilotPanel.tsx` (Sheet) e seu export no barrel; remover `useAnalyticsCopilot.ts` se totalmente substituído por `useCopilotChat` (ou mantê-lo apenas se algum outro consumidor existir — verificar no grep antes de remover).

## 16. Estratégia de testes

**Vitest (node)** cobre o núcleo determinístico/puro:

- `runCopilotQuery.test.ts` — resolve→clamp→execute com `dataAccess` mock: caso resolvido (número do mock), ambíguo, não-resolvido, recusado por escopo, erro (não lança). RNF-001: o valor vem do mock, nunca do resolver.
- `sessionStore.test.ts` — `createSession`/`selectSession`/`deleteSession`/`appendMessages`/`deriveTitle`/retenção-50.
- `relativeTime.test.ts` — "agora"/"há 2h"/"ontem"/"12 mai" (datas fixas injetadas).
- `sessionGrouping.test.ts` — Hoje/Ontem/Anteriores (datas fixas injetadas).

**Gate real:** `bun run build` (vite) verde + verificação por **delta** no `tsc --noEmit` (o repo tem ~315 erros pré-existentes; novos arquivos devem contribuir zero). **UI** verificada por build + **teste manual do usuário** (sem browser/RTL/jsdom).

## 17. Tokens & marca

- **Apenas tokens semânticos** (`bg-background/card/muted/accent/primary`, `text-foreground/muted-foreground/primary`, `border-border`, `ring`). Zero `--gallo-*` cru, zero hex.
- Bolha do usuário `bg-primary` (troca por tema/modo). Glass (header/composer) = fórmula da TopBar.
- **Exceção documentada:** deltas verde/vermelho (`emerald`/`red`) são cores **funcionais** (alta/queda), constantes nos 4 temas — igual à escala de severidade do DS.

## 18. Fora de escopo (YAGNI)

Persistência Supabase; renomear sessões; gráfico completo (eixos/tooltip) no painel; histórico por-loja; NLU por LLM; sincronização de view-mode entre dispositivos; busca dentro do histórico.

## 19. Inventário de arquivos

**Criar:**
- `src/features/analytics-copilot/pages/AnalyticsCopilotPage.tsx`
- `src/features/analytics-copilot/components/{CopilotHeader,CopilotViewSwitcher,CopilotConversation,CopilotEmptyState,CopilotComposer,CopilotSessionList,CopilotDetailPanel}.tsx`
- `src/features/analytics-copilot/hooks/{useCopilotChat,useCopilotSessions,useCopilotViewMode}.ts`
- `src/features/analytics-copilot/engine/{runCopilotQuery,sessionStore}.ts` + `__tests__/{runCopilotQuery,sessionStore}.test.ts`
- `src/features/analytics-copilot/utils/{sessionGrouping,answerFormatting}.ts` + `__tests__/{sessionGrouping,answerFormatting}.test.ts` (tempo relativo reusa `formatRelativeTimeBR`)
- `src/routes/app.gestao.copiloto.tsx`

**Modificar:**
- `src/features/analytics-copilot/components/AnalyticsAnswerCard.tsx` (turbinar)
- `src/features/analytics-copilot/i18n/suggestions.ts` (categorizar)
- `src/features/analytics-copilot/catalog/metricCatalog.ts` (fix PRD-044 + mapa categoria/ícone de UI)
- `src/features/analytics-copilot/index.ts` (barrel: novos exports; remover Sheet/hook antigo)
- `src/features/shell/config/{routes.ts,navigation.ts}` (rota + item de menu)
- `src/features/shell/components/{Sidebar.tsx,TopBar.tsx}` (gating do item + navegação)

**Remover:**
- `src/features/analytics-copilot/components/AnalyticsCopilotPanel.tsx`
- `src/features/analytics-copilot/hooks/useAnalyticsCopilot.ts` (se sem outros consumidores — confirmar via grep)

---

## Apêndice A — Sketches do design-specialist

### Modo Foco (coluna única)
```
┌─ Copiloto analítico ───────[Beta]─[▤ 🕘 ⬓] [+Nova]─┐
│            ┌──── max-w-3xl ────┐                    │
│            │ você: Quanto faturei?                  │
│      ┌──── answer card ─────┐                       │
│      │ 🤖 R$ 487.200 ▲+12,4%│                       │
│      │    ✔ Fonte: Vendas → │                       │
│      └──────────────────────┘                       │
├──────────────────────────────────────────────────────┤
│  Pergunte sobre faturamento, margem…   [➤]  ⌘K       │
└──────────────────────────────────────────────────────┘
```

### Modo Histórico
```
┌ [+ Nova conv.] ┬───────── conversa (max-w-3xl) ──────────┐
│ HOJE           │  você: Quanto faturei?                  │
│ ┃● Margem Volvo │  ┌── 🤖 R$ 487k ▲+12,4% ✔Fonte→ ──┐     │
│ ┃  há 2h R$132k │  └─────────────────────────────────┘    │
│ │  Forecast ⋮   │                                         │
│ ANTERIORES     ├─────────────────────────────────────────┤
│ │  Positivação  │  Composer …………………………  [➤]  ⌘K          │
└ (w-72,ScrollArea)─────────────────────────────────────────┘
  ┃ = border-l-2 border-primary (ativa) · ⋮ = kebab excluir
```

### Modo Split
```
┌───── conversa (1fr, max-w-3xl) ─────┬── detalhe (xl:w-360) ──┐
│ você: Faturamento Volvo mês          │ 📈 Faturamento         │
│ 🤖 R$132.480 ▲+8,1% ✔Fonte→          │ R$ 132.480             │
│ você: e a margem?                    │ ▲ +8,1% vs R$122.500   │
│ 🤖 23,4% ▼-1,2% ✔Fonte→              │ ┄╱▔╲╱▔▔╲ (série h-16)  │
├──────────────────────────────────────┤ Período  mai/2026      │
│ Composer ……………………  [➤]  ⌘K          │ Escopo   Matriz·Owner  │
│                                      │ Filtro   Marca: Volvo  │
│                                      │ [Ver no painel Vendas →]│
└──────────────────────────────────────┴────────────────────────┘
  painel segue SEMPRE a última resposta RESOLVIDA
```

## Apêndice B — Riscos de UX e mitigação

1. **Lista de sessões "morta"** → estado vazio acolhedor + "Nova conversa" destacada + título auto-derivado + preview com número já resolvido + **Foco como modo padrão** (só entra em Histórico quem tem o que ver).
2. **Painel de detalhe redundante** → diferenciar por **estrutura** (ficha rotulada Período/Escopo/Filtros/Fonte + drill-down) e por **persistência** (fixa a última resposta enquanto a conversa rola).
3. **Seletor poluindo o header** → ícones + tooltip na posição do `MetricToggle`; "Nova" separado.
4. **Sobrecarga cognitiva** → default Foco, descoberta progressiva, escolha persistida, tooltips ensinam.
5. **Fork de layout / divergência** → núcleo de conversa único com asas acopláveis (sem fork).
