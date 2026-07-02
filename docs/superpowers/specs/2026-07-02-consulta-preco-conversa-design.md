# Consultor de peças na conversa — Design / Spec

- **Data:** 2026-07-02
- **Autor:** AILA Sistemas Inteligentes (via Claude Code)
- **Status:** Aprovado no brainstorming — pronto para plano de implementação
- **Worktree / branch:** `.claude/worktrees/feat+inline-price-lookup` (`worktree-feat+inline-price-lookup`, a partir de `origin/main`)
- **Codinome sugerido:** _Ledger_ (a definir no version bump)

---

## 1. Problema & contexto

No Atendimento (tela de conversa de WhatsApp), quando o cliente pergunta preço/disponibilidade de uma peça, o vendedor precisa **sair da conversa** e ir ao Catálogo para consultar valor, referência, aplicação e estoque — perdendo o fio do atendimento e o contexto do que o cliente mandou (ex.: o código exato da peça).

Hoje já existe um fluxo **parcial** de "peça → conversa": o menu de anexo do composer tem **"Enviar produto"** (`ProductSearchDialog` → `useSendProductCard` → card `[produto]` com preço), que **envia** um card ao cliente. O que **falta** é o **consultar/ver** para o próprio vendedor — olhar os dados, comparar, e só então decidir o que responder.

Dados disponíveis (produção, schema `public.parts`): **351 peças ativas, todas com preço**, 340 com referência de fabricante, 333 com aplicação por veículo, todas com estoque e **5 tabelas de preço por canal** (`price_tables`: padrão/e-commerce/oficina/varejo/atacado). Cada peça tem SKU, nome, marca, referência, `oem_codes[]`, `cross_references` (concorrentes), equivalências, aplicação (veículo/ano/motor), `unit_price`/`unit_cost`/`margin_percent`, estoque e localização.

## 2. Objetivo & não-objetivos

**Objetivo:** dar ao atendente/vendedor um **consultor de peças embutido na conversa** — buscar uma peça e **ver** preço, referências, equivalências, aplicação e estoque **sem sair do atendimento**, e então **agir** (inserir texto no composer, enviar o card, ou copiar dados).

**Não-objetivos (fora de escopo desta entrega):**
- Editar/cadastrar peças (isso é o Catálogo).
- Cotação/orçamento multi-item, carrinho, cálculo de frete.
- Novo backend: **não** há migration nem Edge Function — a feature consome providers e fluxos existentes.
- Consumidores de IA (sugestão automática de peça) — futuro.
- Preço por cliente/negociado — o modelo é por **canal**, não por cliente.

## 3. Decisões de design (travadas no brainstorming)

| # | Decisão | Escolha | Porquê |
|---|---------|---------|--------|
| D1 | Intenção | **Consultar + agir** | Só ver obriga a re-digitar tudo; agir (inserir/enviar/copiar) fecha o ciclo. |
| D2 | Superfície primária | **Rail lateral direito não-modal** | Convive com o thread visível (sem backdrop) — o vendedor lê o código do cliente enquanto pesquisa. Palette central foi rejeitada por escurecer a conversa. |
| D3 | Rail | **Mutuamente exclusivo** com ficha/mídias | O lado direito já é disputado; consultor é um 3º "modo" do rail, não um painel empilhado. |
| D4 | Atalho secundário | **`/preco <busca>` inline** no composer | Peek de 1s reusando o SlashMenu existente; Enter insere. |
| D5 | Layout do detalhe | **3 modelos** (Headline · Densa · Hero+abas) | Preferências de densidade diferentes entre vendedores. |
| D6 | Escolha do modelo | Pelo **vendedor**, via **S1** (ícone no header → menu radio) | "Set-and-forget"; discreto, devolve espaço ao rail estreito. |
| D7 | Persistência da preferência | **`localStorage`** por navegador | Preferência de conforto visual, não dado de negócio; segue o padrão do projeto (larguras de coluna, tema). |
| D8 | Texto do "Inserir" | **T1 · Completo** (nome em negrito, código, ref., valor, estoque) | Dá ao cliente tudo p/ decidir; sempre editável antes de enviar. |
| D9 | Custo & margem | Visível só a **Dono + Gestor**, **mascarado + revelar** | Dado interno; tela de WhatsApp tem risco de print/olhar de terceiro. Vendedor comum não vê nem o cadeado. |

## 4. Experiência / fluxos

### 4.1 Abrir o consultor
- **No header da conversa:** um switcher de rail passa a ter 3 modos — **Ficha · Mídias · 🔍 Consultor** (mutuamente exclusivos; abrir um fecha os outros).
- **No composer:** item **"Consultar peça"** no menu de anexo (`＋`), ao lado de "Biblioteca"/"Resposta rápida"/"Enviar produto".
- **Atalho:** `/preco <busca>` no campo de digitação (ver 4.6).

### 4.2 Busca (topo do rail)
- Campo de busca com **autofoco**, placeholder `"Buscar peça: nome, código, OEM, referência…"`, hint `kbd` de `/`, `Escape` limpa/fecha, **debounce ~250ms**.
- **Escopo do match:** nome, SKU, referência do fabricante, **OEM e cross-references** — para o vendedor **colar o código que o cliente mandou** e achar na hora. Quando o match veio de um código, exibir o token casado como subtítulo (`OEM 1774715 ✓`).
- **Filtros rápidos** (chips `ToggleGroup`): por **Marca** (Volvo/Scania/MB/Ford/Iveco) e **"Em estoque"**; **Veículo/Aplicação** como filtro adicional.
- **Linha de resultado:** thumb + nome (truncate) + SKU/marca à esquerda; **preço (canal padrão) + badge de estoque à direita** (`tabular-nums`).
- **Query vazia:** "Consultadas recentemente" (persistidas em `localStorage`) — o painel nunca nasce em branco.
- **Escopo de loja:** a busca respeita a loja ativa (`MultistoreProvider`) — herdado do provider, sem lógica nova.

### 4.3 Detalhe da peça (drill-down)
Clique numa linha promove para o **detalhe** (com "← voltar aos resultados"). Hierarquia (a mesma nos 3 modelos): **identidade → PREÇO + ESTOQUE (dominam) → canais de preço → aplicação → referências/equivalências → custo & margem (gated)**.

Três **modelos de visualização** selecionáveis (D5/D6):
- **V1 · Headline** — preço/estoque grandes no topo; "Canais de preço" e "Referências" recolhidos, expandem sob demanda. Menos ruído.
- **V2 · Densa** — tudo à vista: 5 canais em mini-grade, aplicação e referências abertas. Zero cliques, mais scroll.
- **V3 · Hero + abas** — hero com preço/estoque fixos; corpo em abas **Preço · Aplicação · Refs** (sem scroll, tudo a 1 toque).

### 4.4 Seletor de modelo (D6)
- Ícone discreto no **header do rail** → menu (radio) com as 3 opções + descrição curta; marca a atual.
- Escolha persiste em `localStorage` (chave `gallo-part-lookup-layout`); default **V1 · Headline**.

### 4.5 Agir (ver → agir)
- **Primárias** (rodapé sticky, tap targets ≥44px):
  - **`✚ Inserir no texto`** — insere no **cursor** do composer, sem sobrescrever o rascunho, formato **T1**:
    ```
    *Filtro de óleo Scania DC13*
    Código: 21707133 · Ref.: 5805541
    Valor: R$ 189,90 · Disp.: 42 un
    ```
    (negrito no padrão WhatsApp `*…*`; sempre editável antes de enviar).
  - **`➤ Enviar card`** (`bg-primary`) — **reusa** `useSendProductCard` (card `[produto]` existente).
- **Overflow `⋯`** (`DropdownMenu`): Copiar valor · Copiar código/OEM · Copiar ficha completa · Abrir no catálogo · Enviar só a foto · **(gestor) Mostrar custo & margem**.
- **Nas linhas da lista:** em repouso mostram só dados; ícones de ação (inserir/enviar) aparecem no **hover/focus**. **Enter** na lista = abrir detalhe.

### 4.6 `/preco` inline (atalho secundário)
- Reusa o `parseSlash` (`command="preco"`, `query=<texto>`); resultados compactos ancorados acima do textarea (nome + preço + estoque).
- **Enter** = inserir (formato T1); **→** = "ver ficha" (abre o rail no detalhe); **Esc** = fechar.

### 4.7 Estados
| Estado | Tratamento |
|--------|-----------|
| Loading | `Skeleton` de 3–5 linhas (reserva de altura). No detalhe, skeleton da headline + blocos. |
| Query vazia | "Consultadas recentemente" / sugestões. |
| Sem resultado | "Nenhuma peça para '…'" + dica ("confira o código" / "buscar por aplicação") + CTA "Abrir no catálogo". Tom `severity-info`. |
| Erro | Card `border-severity-critical` + "Tentar novamente". |
| Sem preço (`unit_price` nulo) | **Nunca "R$ 0,00"** → chip **"Sob consulta"** (`border-severity-warning`) + botão "Consultar valor". Reusa `priceLabel`. |
| Estoque | `● Em estoque` = `severity-success`; `▲ Últimas N` = `severity-warning`; `✕ Sem estoque` = `severity-critical`. **Nunca** usar o dourado da marca para sinal de estoque. |

## 5. Dados & regras

- **Busca/lista:** `useCatalogList(filters, sort, page, pageSize)` + helpers de `catalog/api/search.ts` (`searchPartsByText`, `findByOemCode`, `findByAlternativeCode`, `searchPartsByApplication`, `getEquivalents`).
- **Peça:** `usePartsProvider().get(id)` / o item já vindo da lista (`IPart`).
- **Preço por canal:** `resolvePriceTables(part)` (`catalog/utils/pricing.ts`) → 5 canais; headline usa `unit_price` (canal padrão). "Sob consulta" via `priceLabel`.
- **Gating de custo/margem (D9):** **novo** comportamento (o Catálogo hoje não restringe). Checar papel via o helper RBAC `hasPermission` (`src/features/auth/guards.ts`) / `base_role` — visível apenas a **Dono + Gestor**, **mascarado por padrão** com botão "mostrar". Custo/margem **nunca** entra no texto inserido nem no card enviado.

## 6. Arquitetura

**Feature nova:** `src/features/part-lookup/` (nome pt-BR na UI: "Consultor de peças"), com barrel `index.ts`.

```
src/features/part-lookup/
├── components/
│   ├── PartLookupPanel.tsx        # container do rail (busca ↔ detalhe)
│   ├── PartSearchBar.tsx          # campo + chips de filtro
│   ├── PartResultList.tsx         # lista de resultados (linha com preço/estoque)
│   ├── PartResultRow.tsx
│   ├── detail/
│   │   ├── PartDetail.tsx         # roteia pelo modelo escolhido
│   │   ├── PartDetailHeadline.tsx # V1
│   │   ├── PartDetailDense.tsx    # V2
│   │   ├── PartDetailTabs.tsx     # V3
│   │   ├── PartDetailActions.tsx  # rodapé sticky + overflow
│   │   ├── PriceChannelsTable.tsx
│   │   └── CostMarginGate.tsx     # bloco gated (Dono/Gestor, mascarado)
│   ├── LayoutModePicker.tsx       # ícone header → menu radio (S1)
│   └── SlashPriceResults.tsx      # peek do /preco inline
├── hooks/
│   ├── usePartLookup.ts           # estado busca/seleção; reusa useCatalogList
│   ├── usePartLookupLayout.ts     # preferência de modelo (localStorage)
│   └── useRecentParts.ts          # "consultadas recentemente" (localStorage)
├── engine/
│   ├── partInsertText.ts          # constrói o texto T1 (TESTADO)
│   └── partCopy.ts                # strings de "copiar valor/código/ficha" (TESTADO)
├── i18n/pt-BR.ts
└── index.ts
```

**Pontos de integração (código existente):**
- `conversations/pages/ConversationPage.tsx` — adicionar o modo "consultor" ao rail, coordenado com `useConversationFiche` + `useMediaGallery` (mutuamente exclusivo). Reaproveitar `useQuickSendBus` para abrir com filtro pré-preenchido, se útil.
- `conversations/components/ConversationHeader.tsx` — switcher de 3 modos (Ficha/Mídias/Consultor).
- `conversations/components/MessageInput.tsx` — item "Consultar peça" no menu de anexo; injeção de texto no cursor via o padrão existente (`draft`/`onDraftChange`, como `insertSnippetBody`/`insertEmoji`); `/preco` via `parseSlash` + `SlashPriceResults`.
- **Envio do card:** `quick-send/hooks/useSendProductCard.ts` (reuso direto).

**Providers reusados (sem novo contrato):** `usePartsProvider` / `useCatalogList`. **Sem migration, sem Edge Function.**

## 7. Persistência (localStorage)

- `gallo-part-lookup-layout` → `"headline" | "dense" | "tabs"` (default `headline`).
- `gallo-part-lookup-recent` → lista curta de IDs consultados recentemente (cap ~8).
- Chaves registradas junto às demais `LOCALSTORAGE_KEYS` (padrão do projeto).

## 8. Acessibilidade & responsividade

- **Teclado:** abre com item do menu, switcher ou `/preco`; `↑/↓` navegam a lista (`aria-activedescendant`), `Enter` = ação default, `Esc` recua (detalhe → lista → fecha). No detalhe, `Cmd/Ctrl+Enter` = enviar.
- **Foco:** painel **não-modal** ⇒ não prende foco; foco inicial no campo de busca; **devolver o foco ao composer ao fechar**. `focus-visible:ring-2 ring-ring`; distinguir highlight de teclado (`bg-accent`) de hover (`bg-muted`).
- **Header glass + `ScrollProgressBar`** na divisa do bloco fixo (guideline do projeto). `prefers-reduced-motion` ⇒ slide vira fade.
- **PWA / < 768px:** o rail vira **bottom-sheet** (`Drawer`/vaul) full-width; busca no topo, lista rola, detalhe é view empurrada com "voltar", rodapé sticky de ações grandes. Preço+estoque na linha valem ainda mais no mobile.

## 9. Invariantes & restrições

- **NÃO tocar no cache do atendimento** (assinatura de mídia em lote, Realtime, query keys de mensagens/conversas, RPC gated-once) — o consultor consome apenas queries de **catálogo** e o fluxo de **envio** existente; abrir/fechar o rail não altera o cache de mensagens.
- **Tokens semânticos apenas** (`bg-background/card`, `text-foreground/muted-foreground`, `border-border`, `*-severity-{info|success|warning|critical}`) — nunca hex ou `--gallo-*` cru; estoque por severidade, não pela cor da marca.
- **Fronteiras ESLint:** features acessam dados só via `@/providers/data`.
- **Funciona em mock e supabase** (Provider Pattern) — `useCatalogList` já cobre ambos.
- **TypeScript strict**; avaliar tipos por delta (`bun run build` + `bun run test` como gate).

## 10. Testes (Vitest, co-localizados)

- `engine/partInsertText.test.ts` — formato T1: negrito, código/ref, preço, estoque; **sem preço** → "Sob consulta"; **nunca** inclui custo/margem.
- `engine/partCopy.test.ts` — strings de cópia (valor/código/ficha).
- `hooks/usePartLookupLayout.test.ts` — leitura/escrita do localStorage + fallback default.
- Gating de custo/margem: teste de que o bloco/opção não é renderizado para papel não-autorizado.

## 11. Riscos & questões em aberto

- **Rail mutuamente exclusivo:** exige coordenar 3 estados (ficha/mídias/consultor). Preferir um "modo do rail" único a três booleanos soltos — decidir no plano se refatora para um `railMode` ou apenas encadeia os toggles.
- **`/preco` no SlashMenu:** o menu inline hoje serve ativos/respostas rápidas; adicionar a fonte "peças" sem quebrar os comandos existentes. Se o custo/UX ficar alto, o `/preco` pode ser **fase 2** (o rail já entrega o valor principal).
- **Preços possivelmente semeados:** parte do catálogo em produção é seed (`GAL-*`); os valores exibidos podem não ser 100% reais até a importação assistida avançar. Não afeta o design (consome o que houver).
- **Papel "Gestor":** confirmar o `base_role` exato usado para gestor no gating (owner + manager).

## 12. Fora de escopo / futuro

- Sugestão automática de peça por IA a partir da mensagem do cliente.
- Comparador lado a lado de equivalências.
- Histórico "peças mais consultadas" com analytics.
- Inserir **aplicação** no texto (hoje T1 não inclui; o vendedor adiciona se quiser).
```
