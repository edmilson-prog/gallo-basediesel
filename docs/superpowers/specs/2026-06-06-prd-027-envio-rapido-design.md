# PRD-027 — Envio Rápido & Biblioteca de Ativos — Design Spec

> **Fonte de requisitos:** `docs/prds/PRD-027-envio-rapido-biblioteca-ativos.md` (RF-001..RF-026, RNF-001..RNF-007).
> **Épico:** Central de Atendimento — Camada de Mídia. **Depende de:** PRD-026 (storage de mídia — `IMediaStorageProvider`), PRD-011 (composer), PRD-030 (catálogo), PRD-017 (temperatura do lead), PRD-006 (RBAC/auditoria), PRD-005 (Provider Pattern), PRD-002/004 (modelo/mocks — exigem DELTA).
> **Data:** 2026-06-06 · **Branch:** `feat/prd-027-envio-rapido-biblioteca-ativos` (empilhada sobre `feat/prd-026-gestao-midia`).
> **Release alvo:** MINOR → **v0.68.0** (codinome proposto **"Dispatch"**).

---

## 1. Resumo executivo

Camada `src/features/quick-send/` que **estende** o composer (PRD-011) com uma biblioteca de ativos curada e versionada, slash commands, respostas rápidas (snippets) com variáveis, card de produto, links rastreáveis que alimentam a temperatura do lead, pacotes/combos e agendamento simples — **sem regredir** nenhum comportamento existente do composer. Todo arquivo de ativo é lido/gravado via `IMediaStorageProvider` (PRD-026); nada acessa storage diretamente.

Princípio condutor de UX (validado no companion): o vendedor está sempre no meio de uma negociação; o ciclo é **digitar → olhar → Enter**. Otimizamos para achar-e-disparar sem perder a conversa de vista.

---

## 2. Decisões (D-1 … D-16)

**D-1 — Escopo: épico completo em 1 spec → 3 planos.** Entrega o PRD-027 inteiro neste ciclo, dividido em:
- **Plano A — Fundação** (PRD Fase 1 + engines puras + testes): tipos (DELTA PRD-002), providers, mocks (DELTA PRD-004), RBAC, e toda a lógica pura testável.
- **Plano B — Composer & Biblioteca** (PRD Fases 2–3): AssetPicker (3 modos), entrada no composer, slash, envio de ativo, snippets, card de produto.
- **Plano C — Inteligência & Governança** (PRD Fases 4–5): links rastreáveis + temperatura, combos, agendamento, publicação/versão/permissão, estatística de uso, gancho do Copiloto, auditoria e polish.

**D-2 — AssetPicker multi-modo coexistente.** Os 3 layouts coexistem e o usuário troca por **parâmetro na tela** (switcher), com preferência persistida — espelha o padrão do PRD-026 (`useMediaViewMode`/`MediaViewSwitcher`):
- `palette` (command-palette ancorado acima do composer) — **default**;
- `grid` (overlay em grade com thumbnails);
- `sheet` (gaveta lateral à direita, igual "Mídias").
- Hook `useAssetPickerMode()` persiste em `localStorage` (chave `gallo-assetpicker-mode`); componente `AssetPickerModeSwitcher` no header do picker. **Mobile (<768px):** `palette` e `sheet` caem para **bottom sheet**; `grid` vira 2 colunas.

**D-3 — Entrada no composer sem 4º botão.** Reestrutura o `DropdownMenu` existente do clipe (hoje "Anexar") em seções: **Biblioteca** (Abrir biblioteca `⌘K` · Resposta rápida · Enviar produto · Pacotes/combos) · **Arquivo avulso** (Imagem/Documento/Áudio — placeholders atuais permanecem) · **Agendar envio**. Mantém o ícone `mdi:paperclip` (mínima retreinamento; `mdi:plus` opcional). A barra de botões continua com **4 itens**. Atalho `⌘/Ctrl+K` (composer focado) abre o picker; `/` no textarea é a via teclado.

**D-4 — Envio de ativo = `IMessage` outbound via fluxo existente.** Selecionar um ativo **não envia na hora**: vira um *chip staged* acima do textarea com mensagem de contexto editável (`Enter`); `⌘/Ctrl+Enter` envia direto. O envio usa `useMessageSend().send({ text, mediaType, mediaUrl })`. Arquivos (catálogo/ficha/vídeo/imagem) são materializados via `useMediaStorageProvider().upload({ direction: "out", ... })` → `IMediaAsset.storageRef`; `mediaUrl` resolvido por `getSignedUrl(assetId)`. **Respeita a janela 24h** (`canSendFreeText`): fora da janela, o envio de ativo segue o mesmo gate/hint de template, nunca o burla.

**D-5 — Slash como observador read-only.** Um parser puro lê `value`+`caret` do textarea e devolve `{ active, command, query }`. Dispara **só** quando `/` inicia a mensagem ou segue espaço; **não** dispara em `http://`, datas (`12/05`), frações (`3/4`) nem `//` (escape → barra literal). O `handleKey` existente **não muda** exceto por um gate condicional: *se o menu estiver aberto*, intercepta `↑↓/Enter/Esc`; senão, comportamento idêntico ao atual (Enter envia, Shift+Enter quebra linha).

**D-6 — Snippet por overlay-sync (não contentEditable).** Para proteger o `<textarea>` atual (auto-resize, paste, IME), as lacunas são renderizadas por um overlay sincronizado atrás do textarea. Resolve `{{nome}}`, `{{peca}}`, `{{prazo}}` do contexto da conversa/cliente; o que não resolve vira **pílula âmbar editável** (`severity-warning`), foco cai na primeira. **Trava de envio dupla:** UI desabilita "Enviar" + o handler **regex-rejeita** `{{...}}` e `[...]` — placeholder cru nunca chega ao envio.

**D-7 — Card de produto = bubble dedicado, snapshot no envio.** Novo `ProductCardBubble` reusando `BubbleChrome` (`unpadded`, irmão visual de `DocumentBubble`). Persistido como `IMessage` outbound com marcador `[produto]<json>` em `text` (espelha o padrão `[template]`); o JSON é um **snapshot no momento do envio** (id, nome, OE, equivalência, rótulo de estoque, preço, ref de imagem) — satisfaz RF-015. `MessageBubble` ganha um ramo que detecta o marcador e renderiza o card. **Degradação:** sem imagem → tile com ícone de categoria; sem preço → "Consultar valor" (nunca `R$ 0,00`); estoque em tokens `severity` (ok/warning/critical). **Não muda o schema de `IMessage`.**

**D-8 — Links rastreáveis.** Ao enviar um ativo `category: 'link'` ou link manual, cria `ITrackableLink` com `shortRef`+`utm` (simulados). Mensagem de link é `IMessage` outbound com marcador `[link]<json>` (linkId, label, shortRef). Um runner mock (`useTrackableLinkSimulation`) simula "aberturas": incrementa `opens`/`lastOpenedAt` e, se o link tem `leadId`, **eleva a temperatura** do lead.

**D-9 — Temperatura: escalonamento monotônico.** `nextTemperature(current)`: `frio→morno→quente`; **nunca rebaixa**; já `quente` não muda. Feedback ambiente (sem toast por abertura): (a) linha sob o bubble do link "👁 Aberto há 10 min · N vezes" (`severity-info`); (b) chip de temperatura no `ConversationHeader` faz cross-fade + **1 pulso** (respeita `prefers-reduced-motion`); (c) 1 `SystemBubble` ligando causa→efeito ("🔥 Temperatura subiu para Morno — cliente abriu o catálogo"). Atualização via `useLeadsProvider().update(leadId, { temperature })`.

**D-10 — Combos.** Picker em **multi-seleção** (toggle "Modo pacote") + **bandeja** revisável acima do composer (reordenável por drag e por teclado `Alt+↑/↓`). Combos salvos (`IAssetCombo`) aparecem no menu e no topo do picker. Envio **fan-out sequencial**: cada item vira sua `IMessage` na ordem; **falha de 1 item não aborta** os demais (marca o item como falho com retry); item sem permissão/sensível-bloqueado é **ignorado com aviso**, não trava o combo.

**D-11 — Agendamento: fila local simulada.** Entidade `IScheduledSend` (fila em memória). Entrada via **split do botão Enviar** (`Enviar ▾ → Agendar`) e via menu do clipe; popover com presets (Hoje 18:00 / Amanhã 09:00 / Seg 08:00) + data-hora custom. **Lista por conversa** (barra colapsável "Agendados (N)") com editar/cancelar (undo 5s). Runner mock (`useScheduledSendRunner`) dispara no horário simulado, **revalidando permissão/status `published` na hora**; falha vira status `failed` (nada quebrado é enviado). Contrato pronto para o scheduler dedicado da Fase 2 absorver. Janela 24h e recorrência ficam **fora**.

**D-12 — RBAC e sensibilidade.** Novos recursos no `resources.ts`: `asset_library`, `quick_reply` (governados) e `trackable_link`, `scheduled_send` (sobretudo para tipagem de auditoria e criação pelo vendedor). **Vocabulário de ações mantido** (`view`/`create`/`edit`/`delete` — sem inventar ação "send"). Matriz:
- **Owner:** CRUD `all` nos 4 recursos.
- **Gestor:** CRUD `store` em `asset_library`/`quick_reply` (publicar/despublicar, permissão por ativo, versão, gerir snippets `shared`); CRUD `store` em `trackable_link`/`scheduled_send`.
- **Vendedor/SDR:** `view` `own` em `asset_library`/`quick_reply`; `create` `own` em `trackable_link`/`scheduled_send` (ao enviar link / agendar).

**"Enviar um ativo"** = ter `view` sobre um ativo `published` permitido **+** passar no gate de sensibilidade (não é uma ação RBAC). **Envio de ativo sensível** (ex.: tabela de preços) restrito a **Owner+Gestor** (espelha PRD-026) — engine pura `canSendSensitiveAsset(viewer)`; vendedor vê o item bloqueado (🔒 + "Sem permissão") e a tentativa é auditada (`logMockMutation` em `asset_library`). `tabela_preco` nasce `sensitivity: 'sensitive'` por padrão; gestor ajusta por ativo via `allowedRoleIds`.

**D-13 — Estatística de uso (gestão).** Visão sob RBAC (Owner/Gestor) com **ativos mais enviados** no período e **ranking por vendedor**, alimentada por eventos de envio mockados (registrados no envio + `getRecent`). Materializa como uma página/seção em Configurações/Relatórios (rota `app.configuracoes.biblioteca` ou painel dedicado).

**D-14 — Gancho do Copiloto (PRD-025 pendente).** O **lado receptor** é construído agora: `AssetPicker` aceita um filtro inicial (`openAssetPicker({ category?, query?, brand? })`) exposto por um pequeno contexto/bus (`useQuickSendBus`). A wiring do **chip** do Copiloto fica **stub/deferida** (PRD-025 ainda ⏳). Documentado como ponto de extensão; não bloqueia o PRD-027.

**D-15 — Granularidade de providers (4 slices).** Seguindo um-domínio-por-provider do projeto: `IAssetLibraryProvider` (ativos + recentes + favoritos + publicar/despublicar/versão + combos salvos), `IQuickReplyProvider` (snippets), `ITrackableLinkProvider` (links + opens), `IScheduledSendProvider` (fila de agendados). Cada um com impl Mock + stub Supabase (`NotImplementedError`), registrado no `factory.ts`/`contracts/index.ts`/`index.ts` e exposto por hook `useXProvider`.

**D-16 — Transversais.** Tema light/dark obrigatório (Diesel Heavy, tokens semânticos apenas); responsividade 360–1920px; WCAG 2.1 AA com combobox/listbox e navegação por teclado; i18n em `quick-send/i18n/pt-BR.ts` (`QUICK_SEND_STRINGS`); auditoria (PRD-006) nas ações sensíveis (D-12); `division: 'parts'` default nas entidades comerciais novas (convenção do projeto).

---

## 3. Modelo de dados (DELTA no PRD-002)

Novos tipos em `src/shared/types/quickSend.ts` (re-exportados pelo barrel `index.ts`). `ID`/`ISO8601`/`IPaginatedResult` de `./common` (lembrete: paginação usa **`.data`**, não `.items`).

```ts
// Categoria e tipo do ativo
export type AssetCategory =
  | "catalogo" | "ficha_tecnica" | "tabela_preco" | "garantia" | "video" | "link";
export type AssetKind = "document" | "image" | "video" | "link";
export type AssetStatus = "published" | "draft" | "archived";
export type AssetSensitivity = "normal" | "sensitive";

export interface IAssetVersionSnapshot {
  version: number;
  storageRef?: string;   // arquivo via PRD-026
  url?: string;          // links
  updatedAt: ISO8601;
}

export interface IAssetLibraryItem {
  id: ID;
  storeId: ID;
  division: "parts" | "service" | "industrial"; // default "parts"
  title: string;
  category: AssetCategory;
  brand?: string;          // Volvo | Scania | Mercedes-Benz | Ford Cargo | Iveco
  productLine?: string;
  kind: AssetKind;
  storageRef?: string;     // arquivos (PRD-026); obfuscado, nunca URL real
  mediaAssetId?: ID;       // referência ao IMediaAsset arquivado (quando upload)
  url?: string;            // links
  version: number;         // corrente
  previousVersion?: IAssetVersionSnapshot; // histórico mínimo (atual + anterior)
  status: AssetStatus;
  sensitivity: AssetSensitivity;           // tabela_preco default "sensitive"
  allowedRoleIds?: ID[];   // RBAC por ativo (vazio = regra padrão por papel)
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface IQuickReply {
  id: ID;
  storeId: ID;
  shortcut: string;        // ex.: "/garantia"
  title: string;
  body: string;            // texto com placeholders {{...}}
  scope: "private" | "shared";
  ownerId: ID;
  allowedRoleIds?: ID[];
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface ITrackableLink {
  id: ID;
  storeId: ID;
  assetId?: ID;            // IAssetLibraryItem (quando origem é ativo "link")
  conversationId?: ID;
  leadId?: ID;             // alvo da elevação de temperatura
  targetUrl: string;
  shortRef: string;        // simulado
  utm?: { source: string; medium: string; campaign: string };
  createdBy: ID;
  opens: number;           // simulado na Fase 1
  lastOpenedAt?: ISO8601;
  createdAt: ISO8601;
}

export interface IAssetCombo {
  id: ID;
  storeId: ID;
  title: string;
  assetIds: ID[];          // ordem preservada
  ownerId: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export type ScheduledSendStatus = "pending" | "sent" | "cancelled" | "failed";
export interface IScheduledSend {
  id: ID;
  storeId: ID;
  conversationId: ID;
  scheduledFor: ISO8601;
  payload: {
    type: "asset" | "snippet" | "combo" | "product";
    assetIds?: ID[];
    quickReplyId?: ID;
    productId?: ID;
    contextMessage?: string;
  };
  status: ScheduledSendStatus;
  failureReason?: string;
  createdBy: ID;
  createdAt: ISO8601;
}
```

### Contratos de provider (`src/providers/data/contracts/*`)

```ts
export interface IAssetLibraryListParams {
  storeId?: ID; category?: AssetCategory; brand?: string; productLine?: string;
  status?: AssetStatus; search?: string; page?: number; pageSize?: number;
}
export interface IAssetLibraryProvider {
  list(filter: IAssetLibraryListParams): Promise<IPaginatedResult<IAssetLibraryItem>>;
  get(id: ID): Promise<IAssetLibraryItem | null>;
  search(query: string): Promise<IAssetLibraryItem[]>;
  getRecent(sellerId: ID): Promise<IAssetLibraryItem[]>;
  getFavorites(sellerId: ID): Promise<IAssetLibraryItem[]>;
  toggleFavorite(sellerId: ID, id: ID): Promise<boolean>; // novo estado
  create(input: Omit<IAssetLibraryItem, "id"|"storeId"|"createdAt"|"updatedAt">): Promise<IAssetLibraryItem>;
  update(id: ID, patch: Partial<IAssetLibraryItem>): Promise<IAssetLibraryItem>;
  publish(id: ID): Promise<IAssetLibraryItem>;
  unpublish(id: ID): Promise<IAssetLibraryItem>;
  bumpVersion(id: ID, patch: Pick<IAssetLibraryItem, "storageRef"|"url">): Promise<IAssetLibraryItem>;
  delete(id: ID): Promise<IAssetLibraryItem>;
  // combos
  listCombos(storeId?: ID): Promise<IAssetCombo[]>;
  saveCombo(input: Omit<IAssetCombo, "id"|"storeId"|"createdAt"|"updatedAt">): Promise<IAssetCombo>;
  deleteCombo(id: ID): Promise<IAssetCombo>;
  recordSend(sellerId: ID, assetId: ID): Promise<void>; // alimenta recentes + estatística
}

export interface IQuickReplyProvider {
  list(params: { storeId?: ID; sellerId?: ID; scope?: "private"|"shared" }): Promise<IQuickReply[]>;
  get(id: ID): Promise<IQuickReply | null>;
  findByShortcut(shortcut: string, sellerId: ID): Promise<IQuickReply | null>;
  create(input: Omit<IQuickReply,"id"|"storeId"|"createdAt"|"updatedAt">): Promise<IQuickReply>;
  update(id: ID, patch: Partial<IQuickReply>): Promise<IQuickReply>;
  delete(id: ID): Promise<IQuickReply>;
}

export interface ITrackableLinkProvider {
  create(input: Omit<ITrackableLink,"id"|"storeId"|"createdAt"|"opens">): Promise<ITrackableLink>;
  get(id: ID): Promise<ITrackableLink | null>;
  listByConversation(conversationId: ID): Promise<ITrackableLink[]>;
  registerOpen(id: ID): Promise<ITrackableLink>; // incrementa opens/lastOpenedAt
}

export interface IScheduledSendProvider {
  list(conversationId: ID): Promise<IScheduledSend[]>;
  listDue(now: ISO8601): Promise<IScheduledSend[]>;
  create(input: Omit<IScheduledSend,"id"|"storeId"|"status"|"createdAt">): Promise<IScheduledSend>;
  update(id: ID, patch: Partial<IScheduledSend>): Promise<IScheduledSend>;
  cancel(id: ID): Promise<IScheduledSend>;
  markSent(id: ID): Promise<IScheduledSend>;
  markFailed(id: ID, reason: string): Promise<IScheduledSend>;
}
```

---

## 4. Arquitetura

### 4.1 Estrutura da feature (`src/features/quick-send/`)
```
quick-send/
  engine/            # lógica pura + testes (TDD)
    placeholderResolver.ts (+.test)
    slashParser.ts (+.test)
    assetSensitivity.ts (+.test)
    assetVersioning.ts (+.test)
    assetFiltering.ts (+.test)
    temperatureEscalation.ts (+.test)
    trackableLink.ts (+.test)
    scheduledSend.ts (+.test)
    comboSend.ts (+.test)
    productCardPayload.ts (+.test)
  hooks/
    useAssetPickerMode.ts   # palette|grid|sheet persistido
    useAssetLibrary.ts      # list/search/recents/favoritos
    useQuickReplies.ts
    useSendAsset.ts         # upload (PRD-026) -> useMessageSend
    useSendProductCard.ts
    useTrackableLinkSimulation.ts
    useScheduledSendRunner.ts
    useConversationScheduled.ts
    useQuickSendBus.ts      # abre picker pré-filtrado (gancho Copiloto)
    useAssetUsageStats.ts
  components/
    AssetPicker.tsx  AssetPickerModeSwitcher.tsx  AssetRow.tsx  AssetGridCard.tsx
    SlashMenu.tsx  ComposerStagedAsset.tsx  SnippetField.tsx
    ProductCardBubble.tsx  ProductSearchDialog.tsx
    ComboTray.tsx  ScheduleSendMenu.tsx  ScheduledList.tsx
    LinkOpenIndicator.tsx  TemperatureChip.tsx
    library-admin/ (LibraryManagerPage, SharedSnippetsManager, AssetUsageStatsPage)
  i18n/pt-BR.ts      # QUICK_SEND_STRINGS
  index.ts           # barrel
```

### 4.2 Wiring Provider Pattern
- `contracts/assetLibrary.ts`, `quickReply.ts`, `trackableLink.ts`, `scheduledSend.ts` (re-export de `@/shared/types`).
- `contracts/index.ts`: 4 chaves novas em `IDataProviders`.
- `factory.ts`: registrar mock + supabase stub para cada slice.
- `hooks/useAssetLibraryProvider.ts` etc. (via `useDataProviderSlice`).
- `index.ts`: exportar tipos + hooks.
- Impl mock em `impl/mock/*` (usa `assetLibraryApi` etc., `scopedListParams`, `withCreateStoreId`, `logMockMutation`); stub Supabase em `impl/supabase/*`.

### 4.3 Mocks (DELTA no PRD-004)
- `mocks/config.ts`: `VOLUMES` + `MockEntityName` para `assetLibraryItems` (~30), `quickReplies` (~20 incl. `shared` padrão), `trackableLinks` (~10), `assetCombos` (~5), `scheduledSends` (0 inicial).
- `mocks/generators/quickSend.ts`: gera biblioteca realista por marca (Volvo/Scania/MB/Ford/Iveco) e categoria — catálogos, fichas, **tabela de preços (sensível)**, garantia, vídeos, links (loja/localização); snippets `shared` (garantia, frete, prazo, faturamento); `ITrackableLink` com `opens` simulados. Seed determinística (`createSeededContext`).
- `bootstrap.ts`: campos no `IBootstrappedDataset` + geração + retorno.
- `store/mutations.ts` + `store/selectors.ts`: novas coleções e selectors.
- `mocks/api/quickSend.ts` (ou arquivos por entidade) + `api/index.ts`.

### 4.4 RBAC (PRD-006)
- `resources.ts`: `asset_library`, `quick_reply`, `trackable_link`, `scheduled_send`.
- `matrix.ts`: entradas para Owner/Gestor/Vendedor/SDR conforme D-12.
- Auditoria via `logMockMutation`/`auditLog`: publicar/despublicar, mudar permissão/versão, criar/editar snippet `shared`, **enviar ativo sensível**, agendar/cancelar.

### 4.5 Pontos de integração (conversas) — superfície de não-regressão
| Arquivo | Mudança |
|--------|---------|
| `conversations/components/MessageInput.tsx` | Reestrutura `DropdownMenu` do clipe (D-3); gate condicional no `handleKey` p/ slash (D-5); chip staged + `SnippetField` overlay; split do botão Enviar (D-11). **Sem tocar** em emoji/HSM/AI strip/24h/copilot. |
| `conversations/pages/ConversationPage.tsx` | Estado `pickerOpen`/modo; monta `AssetPicker`, `ComboTray`, `ScheduledList`; runners (`useScheduledSendRunner`, `useTrackableLinkSimulation`). |
| `conversations/components/ConversationHeader.tsx` | `TemperatureChip` (lê lead.temperature); "Agendados (N)". |
| `conversations/components/bubbles/MessageBubble.tsx` | Ramos novos: marcador `[produto]` → `ProductCardBubble`; `[link]` → bubble de link + `LinkOpenIndicator`. |
| `conversations/hooks/useMessageSend.ts` | **Sem mudança de assinatura** (já suporta `mediaType`/`mediaUrl`); envio de card/link usa marcador em `text`. |
| `conversations/i18n/pt-BR.ts` | Chaves novas do menu (biblioteca/agendar/produto). |

---

## 5. Engines puras (TDD — testáveis com Vitest node)

| Engine | Responsabilidade | Casos-chave de teste |
|--------|------------------|----------------------|
| `placeholderResolver` | resolve `{{...}}` do contexto; lista lacunas; `hasUnresolved(text)` | resolvido vs lacuna; rejeita `{{}}`/`[ ]` cru; sem contexto = tudo lacuna |
| `slashParser` | `(value, caret) → {active, command, query}` | início de linha vs meio (`http://`, `12/05`, `//`); `/catalogo freio`; pós-Enter |
| `assetSensitivity` | `isSensitiveAsset(item)`, `canSendSensitiveAsset(viewer)` | tabela_preco sensível; vendedor bloqueado; Owner/Gestor ok |
| `assetVersioning` | `pickSendableVersion(item)` (só published), `bump(item, patch)` | draft/archived não enviável; bump move corrente→previousVersion |
| `assetFiltering` | filtra por categoria/marca/linha/query; recents/favoritos | match por título; filtro composto; vazio |
| `temperatureEscalation` | `nextTemperature(current)` monotônico | frio→morno→quente; quente estável; nunca rebaixa |
| `trackableLink` | `buildShortRef(seed)`, `buildUtm(...)` | determinístico por seed; utm bem formado |
| `scheduledSend` | `isDue(scheduledFor, now)`, `validateFuture(dt, now)` | passado inválido; due no horário |
| `comboSend` | `planComboSend(items, viewer)` → ordem + ignorados | preserva ordem; ignora sem permissão; falha parcial não aborta |
| `productCardPayload` | `encode(snapshot)`/`decode(text)`; `priceLabel`, `hasImage` | round-trip; sem preço→"Consultar valor"; sem imagem→tile |

---

## 6. Superfícies de UI (designs aprovados no companion)

1. **Entrada no composer** (D-3): menu do clipe reorganizado em seções; `⌘K` e `/` como vias rápidas.
2. **AssetPicker 3 modos** (D-2): switcher persistido; busca focada com debounce 300ms; abas Recentes(default)/Favoritos/Tudo; filtros categoria/marca/linha; linhas escaneáveis (ícone·título·marca·`vN`·★) no palette/sheet, cards com thumbnail no grid; linguagem de status/sensibilidade (draft=pílula, archived=opaco, sensível=🔒+borda âmbar, sem permissão=bloqueado). Combobox a11y; `Enter`=stage, `⌘Enter`=envia já, `Esc`=fecha.
3. **SlashMenu** (D-5): popover no caret; comandos `/catalogo /tabela /garantia /loja` + snippets; estados vazios amigáveis; proteção de barra literal.
4. **SnippetField** (D-6): overlay com pílulas âmbar; contador "N campos a preencher"; trava de envio.
5. **ProductCardBubble + ProductSearchDialog** (D-7): card rico + degradado; busca no catálogo (`usePartsProvider`/`useCatalogList`).
6. **ComboTray** (D-10): multi-seleção + bandeja reordenável + combos salvos; progresso "Enviando 2/3".
7. **ScheduleSendMenu + ScheduledList** (D-11): split do Enviar + presets + lista por conversa (editar/cancelar/undo).
8. **LinkOpenIndicator + TemperatureChip** (D-8/D-9): linha ambiente + chip com pulso + system bubble.
9. **library-admin** (D-12/D-13): publicação/versão/permissão por ativo; gestão de snippets `shared`; estatística de uso (mais enviados + ranking por vendedor).

---

## 7. Não-regressão (RNF-002)

O composer existente permanece 100% funcional: texto, emoji, **anexo (placeholders atuais preservados)**, templates HSM, sugestões IA, janela 24h (`canSendFreeText`), copilot strip (`draft`/`onDraftChange`/`hideAiSuggestions`). Regras:
- `handleKey`: Enter envia / Shift+Enter quebra — inalterado quando nenhum menu está aberto.
- Envio de ativo/snippet/card também respeita a janela 24h (não burla o gate).
- Galeria de mídia (PRD-026) e arquivamento inbound (`useEnsureInboundMedia`) intactos.
- Gate real = `bun run build` (vite) verde + `vitest` verde; `tsc --noEmit` tem ~315 erros pré-existentes (avaliar por **delta** do código novo).

---

## 8. Faseamento → 3 planos

- **Plano A — Fundação:** tipos (DELTA PRD-002) + 4 providers (mock+stub) + mocks (DELTA PRD-004) + RBAC + **10 engines puras com testes**. Validação: providers listam dados determinísticos; `vitest` verde; `bun run build` verde.
- **Plano B — Composer & Biblioteca:** AssetPicker (3 modos) + entrada no composer + slash + envio de ativo (via PRD-026) + snippets + card de produto. Validação: `/catalogo freio` filtra e envia; não-publicado/sem permissão não aparece; snippet trava placeholder cru; card degrada; composer original intacto.
- **Plano C — Inteligência & Governança:** links rastreáveis + temperatura + combos + agendamento + publicar/versão/permissão + estatística + gancho Copiloto (receptor) + auditoria + polish (tema/responsivo/estados vazios/erro). Validação: abertura sobe temperatura; combo envia múltiplos com falha parcial tolerada; agendado dispara no horário simulado; só versão publicada envia; ações sensíveis auditadas.

---

## 9. Requisitos não-funcionais

- **RNF-001:** AssetPicker abre e busca <500ms p/ até 300 ativos; debounce 300ms; virtualização (`@tanstack/react-virtual`, já presente) se a lista crescer.
- **RNF-003:** zero `any`; tipos derivados do DELTA do PRD-002.
- **RNF-004:** WCAG 2.1 AA — combobox/listbox, `↑↓ Enter Esc`, foco gerenciado, `role="status"` p/ mudanças.
- **RNF-005:** 360–1920px; mobile = bottom sheet (palette/sheet) / 2 colunas (grid).
- **RNF-006:** light + dark (Diesel Heavy), só tokens semânticos.
- **RNF-007:** trocar Mock→real (storage/short-link) na Fase 2 não altera as features consumidoras.

---

## 10. Riscos & mitigações

- **Não-regressão do textarea (slash/snippet)** — maior risco. Mitigação: parser/overlay são observadores read-only; gate condicional só com menu aberto; matriz de testes de digitação no review.
- **Encoding de card/link em `IMessage.text`** — evita DELTA no schema de mensagem, mas exige marcador robusto. Mitigação: `productCardPayload` testado (round-trip) + fallback se o parse falhar (degrada para texto simples).
- **Copiloto (PRD-025) pendente** — só o receptor é construído; chip fica deferido e marcado.
- **4 providers novos** — superfície grande de wiring. Mitigação: espelhar exatamente o PRD-026; Plano A concentra o boilerplate.

---

## 11. Fora de escopo (Fase 2 / outros PRDs)

Short-link/redirect e métrica real; disparo real via WhatsApp; storage real (Supabase) dos ativos; editor de catálogos/PDFs; aprovação multi-nível de publicação; tradução de snippets; templates HSM (já do PRD-011); scheduler genérico completo (recorrência/janela 24h).

---

**AILA Sistemas Inteligentes — Design Spec PRD-027 (v1, 2026-06-06).**
