# PRD-026 — Gestão de Mídia (DAM + Galeria) — Design

> **Codinome:** Vault · **Data:** 2026-06-05 · **Origem:** PRD-026 (`docs/prds/PRD-026-gestao-midia.md`)
> **Escopo deste ciclo:** PRD-026 **completo** (5 fases). O PRD-027 (Envio Rápido) é um ciclo próprio posterior que consome o `IMediaStorageProvider` entregue aqui.

---

## 1. Objetivo

Introduzir a camada embarcada de gestão de mídia: storage abstrato (Provider Pattern), persistência de mídia inbound, galeria unificada (por conversa e por cliente), classificação/vínculo assistido e governança LGPD. Resolve três dores reais: (a) mídia do WhatsApp é efêmera (URL Meta expira) e precisa ser arquivada; (b) mídia fica enterrada no scroll e não é localizável; (c) não há governança sobre dado sensível (nota fiscal/comprovante com CPF/CNPJ).

Estado do projeto: **Fase 1 (Frontend First)** — tudo sobre mocks determinísticos; providers Mock com contrato idêntico ao futuro Supabase Storage (Fase 2, drop-in).

---

## 2. Decisões ratificadas

| # | Decisão | Valor |
|---|---------|-------|
| D-1 | **Sequência** | PRD-026 completo agora; PRD-027 em ciclo separado depois. |
| D-2 | **Onde mora a engine** | Nova feature `src/features/media/` dona da engine (grid/tile/filters/lightbox/anotação), consumida por `conversations` e `customers`. "Uma engine, dois pontos de entrada." |
| D-3 | **Persistência inbound** | **Eager**: `bootstrap` gera `IMediaAsset[]` derivados das mensagens com mídia + assets avulsos; hook `useEnsureInboundMedia` cria/dedupe cada inbound novo. Provider é a fonte da verdade. |
| D-4 | **Mídia sensível (segurança)** | Gate na **camada de dados**, não só no CSS: `getSignedUrl` checa RBAC e devolve referência redigida/placeholder para sensível sem permissão (nunca os bytes reais). UI só borra o placeholder. |
| D-5 | **Retenção** | Placeholder configurável (sem expurgo real na Fase 1): **365 dias** normal / **1825 dias (5 anos)** sensível. Exibido em Configurações (PRD-019). |
| D-6 | **RBAC sensível** | **Owner + Gestor** veem/baixam mídia sensível. Vendedor/SDR veem thumbnail borrado + bloqueio de abertura, com a tentativa **auditada**. |
| D-7 | **Virtualização** | Adicionar **`@tanstack/react-virtual`** (consistente com TanStack já usado; respeita o guard de 24h do `bunfig.toml`, sem precisar de exclude). Drop-in p/ volumes reais da Fase 2. |
| D-8 | **Galeria multi-visualização** | A galeria entrega **3 modos** alternáveis por um **switcher na barra** (parâmetro na tela), preferência salva por usuário. Espelha o `useCopilotViewMode` existente. |
| D-9 | **Modos & nomes** | `Grade` (densa, grid puro 3 col) · `Cartões` (legendada, 2 col com badge+nome+meta) · `Por tipo` (imagens em grid; documentos e áudios em lista). |
| D-10 | **Modo padrão** | `Grade`. Persistência em `localStorage["gallo-media-viewmode"]`. |
| D-11 | **Switcher** | Fica na **barra de filtros** da galeria (à direita), via `ToggleGroup`. |
| D-12 | **Lightbox** | Painel de metadados/ações **à direita** (desktop); no mobile vira **folha inferior** (`Sheet`/`Drawer`). |
| D-13 | **Prioridade de chip por tile** | **falha (destructive) > sensível-lock (warning) > expirando (warning, urgência por valor) > saudável (sem chip)**. Um chip primário por tile; o resto vai para tooltip/lightbox. |
| D-14 | **Cor de status** | Sempre na escala **`severity-*`** (info/success/warning/critical) — invariante entre as 4 submarcas. `primary`/`accent` só para marca e seleção ativa. |
| D-15 | **Tipo dedicado** | `src/shared/types/media.ts` (coesão), exportado pelo barrel `index.ts`. |

---

## 3. Arquitetura

### 3.1 Camada de provider (segue o padrão do projeto — PRD-005)

```
src/providers/data/
├── contracts/mediaStorage.ts        IMediaStorageProvider + IListMediaParams + IMediaUploadInput
├── impl/mock/media.ts               mock: scopedListParams, getSignedUrl RBAC-gated, logMockMutation, ensureFromMessage(dedup)
├── impl/supabase/media.ts           stub → NotImplementedError ("Fase 1")
├── hooks/useMediaStorageProvider.ts useDataProviderSlice("media", …)
└── factory.ts / contracts/index.ts / index.ts   registrar `media` em IDataProviders
src/mocks/api/media.ts               latência/erro via runApi
src/mocks/generators/mediaAsset.ts   gerador determinístico + entrada no bootstrap + VOLUMES em config.ts
```

O contrato tem dois grupos:
- **5 ops "storage" (RF-001) — superfície substituível por Supabase Storage (RNF-007):** `upload(input)`, `get(id)`, `getSignedUrl(id)` *(RBAC-gated, D-4)*, `delete(id)` *(auditado)*, `list(filter)` *(store-scoped)*.
- **Ops de catálogo (Fase 1 mock; na Fase 2 batem na tabela, não no Storage):** `ensureFromMessage(message)` (dedup por `messageId`/`contentHash`, D-3) e `update(id, patch)` (classificação/vínculo/sensibilidade/`persisted`/annotations — auditado).

### 3.2 Feature `src/features/media/`

```
media/
├── components/
│   ├── MediaGallery.tsx          casca compartilhada (header + counters + filtros + switcher + corpo por modo)
│   ├── MediaGrid.tsx             grid virtualizado (@tanstack/react-virtual; role=grid, roving tabindex)
│   ├── MediaTile.tsx             thumb + ícone de tipo + 1 chip por prioridade (D-13) + estado bloqueado
│   ├── MediaCardTile.tsx         tile do modo "Cartões" (thumb + rodapé badge/nome/meta)
│   ├── MediaTypeGroups.tsx       modo "Por tipo" (imagens em grid; docs/áudios em lista)
│   ├── MediaFilters.tsx          busca + tipo (ToggleGroup) + autor/período/classificação (Select)
│   ├── MediaViewSwitcher.tsx     o parâmetro de visualização (ToggleGroup Grade/Cartões/Por tipo) (D-8..D-11)
│   ├── MediaLightbox.tsx         Dialog full-screen; imagem/áudio/documento + aside + ações RBAC (D-12)
│   ├── MediaAudioPlayer.tsx      player 1x/1.5x/2x (Slider), transcrição com realce
│   ├── MediaAnnotator.tsx        overlay SVG (ponto/seta/texto), coords normalizadas, lista a11y
│   ├── SensitiveLock.tsx         placeholder borrado + cadeado + diálogo "Solicitar acesso"
│   ├── ConversationMediaGallery.tsx   Sheet lateral (scope=conversation)
│   └── CustomerMediaGallery.tsx       painel da aba Mídias (scope=customer)
├── engine/   (puro, testável em Vitest)
│   ├── classifyMedia.ts          heurística determinística → IMediaClassification
│   ├── contentHash.ts            hash simulado p/ dedup
│   ├── sourceExpiry.ts           sourceExpiresAt + label "expira em Nd" + tier de urgência (>14d/≤7d/≤2d)
│   ├── mediaFiltering.ts         aplica filtros + busca textual c/ realce (fileName/ocrText/transcription)
│   ├── sensitiveAccess.ts        canViewSensitive(user, asset) + statusChipPriority(asset)
│   └── annotationCoords.ts       normalize/denormalize (0..1)
├── hooks/
│   ├── useMediaViewMode.ts       normalizeViewMode, MEDIA_VIEW_MODES, MediaViewMode + persistência (D-10)
│   ├── useMediaFilters.ts        estado de filtro ciente do scope (conversation|customer)
│   ├── useConversationMedia.ts   lista assets por conversationId (via provider)
│   ├── useCustomerMedia.ts       agrega por customerId entre conversas
│   ├── useEnsureInboundMedia.ts  cria/dedupe inbound + expiração + retry sem bloquear a conversa (RF-006/007/008)
│   └── useMediaActions.ts        classificar/vincular/sensibilidade/excluir/anotar + auditoria
├── utils/mediaDisplay.ts         contadores ("12 imagens · 3 documentos"), ícones por kind, formatBytes
├── i18n/pt-BR.ts
└── index.ts                      barrel (superfície pública: ConversationMediaGallery, CustomerMediaGallery, tipos de view-mode)
```

### 3.3 Pontos de integração (extensão de features existentes)

- **`conversations/components/ConversationHeader.tsx`** → botão "Mídias" (`mdi:image-multiple-outline`) + prop `onToggleMedia`; **`conversations/pages/ConversationPage.tsx`** monta o `ConversationMediaGallery` (Sheet). Estado de abertura via um pequeno hook análogo ao `useConversationFiche`.
- **`customers/components/ProfileTabs.tsx`** (`TAB_ORDER`) + **`customers/i18n/pt-BR.ts`** (`tabs`) → aba "Mídias" (key `midias`, após `conversations`) renderizando `CustomerMediaGallery`.
- **`conversations/components/MessageInput.tsx`** → fora de escopo deste PRD (o anexo "coming soon" e o envio outbound são do PRD-027). Não tocar o composer aqui além do necessário.
- **`features/rbac/permissions/resources.ts`** + **`matrix.ts`** → recurso `media` (Owner/Gestor `view` em escopo amplo; Vendedor/SDR sem `view` de sensível). Helper `canViewSensitive` em `engine/sensitiveAccess.ts` encapsula a regra D-6.
- **Configurações (PRD-019)** → 2 parâmetros de retenção (placeholder, D-5).

---

## 4. Modelo de dados — `src/shared/types/media.ts` (DELTA PRD-002)

```ts
export type IMediaClassification =
  | 'nota_fiscal' | 'peca' | 'chassi_placa' | 'comprovante' | 'catalogo' | 'outro';

export interface IMediaAnnotation {
  id: ID;
  type: 'point' | 'arrow' | 'text';
  x: number; y: number;            // normalizados 0..1 (sobrevivem a resize/zoom/DPR)
  x2?: number; y2?: number;        // ponta da seta (type === 'arrow')
  label?: string;                  // texto da anotação (a11y: marca tem rótulo)
  color: string;                   // token semântico (severity-*), não hex cru
  createdBy: ID; createdAt: ISO8601;
}

export interface IMediaAsset {
  id: ID;
  storeId: ID;                     // Multi-Loja desde o modelo
  conversationId?: ID; customerId?: ID; messageId?: ID;
  kind: 'image' | 'audio' | 'document' | 'video';
  mimeType: string; sizeBytes: number; fileName?: string;
  authorType: 'customer' | 'seller' | 'sdr' | 'system';
  direction: 'in' | 'out';
  createdAt: ISO8601;
  storageRef: string;              // ofuscado — nunca URL/credencial real (RNF-008)
  persisted: boolean;              // false enquanto não arquivado
  sourceExpiresAt?: ISO8601;       // simulação da expiração Meta (D-3)
  contentHash?: string;            // dedup
  classification?: IMediaClassification;
  linkedVehicleId?: ID; linkedOrderId?: ID; linkedPartId?: ID;
  ocrText?: string; transcription?: string;   // mock na Fase 1 (busca já funciona)
  sensitivity: 'normal' | 'sensitive';
  annotations?: IMediaAnnotation[];
  version?: number;                // original=1; anotação salva → 2 (histórico mínimo)
}
```

`IMediaStorageProvider` (contrato):

```ts
export interface IMediaUploadInput {
  kind: IMediaAsset['kind']; mimeType: string; sizeBytes: number; fileName?: string;
  conversationId?: ID; customerId?: ID; messageId?: ID;
  authorType: IMediaAsset['authorType']; direction: 'in' | 'out';
  sourceExpiresAt?: ISO8601; contentHash?: string;
  ocrText?: string; transcription?: string;
  // storeId é injetado pelo provider (withCreateStoreId), não vem do chamador.
}
export interface IListMediaParams {
  storeId?: ID; conversationId?: ID; customerId?: ID;
  kind?: IMediaAsset['kind']; classification?: IMediaClassification;
  authorType?: IMediaAsset['authorType']; from?: ISO8601; to?: ISO8601;
  search?: string;
}
export interface IMediaStorageProvider {
  // 5 ops "storage" (substituíveis por Supabase Storage — RNF-007)
  upload(input: IMediaUploadInput): Promise<IMediaAsset>;
  get(assetId: ID): Promise<IMediaAsset | null>;
  getSignedUrl(assetId: ID): Promise<string>;       // RBAC-gated (D-4)
  delete(assetId: ID): Promise<IMediaAsset>;        // auditado
  list(filter: IListMediaParams): Promise<IPaginatedResult<IMediaAsset>>;  // store-scoped
  // catálogo (Fase 1 mock)
  ensureFromMessage(message: IMessage): Promise<IMediaAsset>;   // dedup (D-3)
  update(assetId: ID, patch: Partial<IMediaAsset>): Promise<IMediaAsset>;  // auditado
}
```

`RNF-003`: zero `any`; todos os tipos derivados de `IMediaAsset`/`IMediaClassification`.

---

## 5. Superfícies (validadas no visual companion)

### 5.1 Galeria — multi-visualização (D-8..D-11)
`MediaGallery` é a casca compartilhada por conversa e cliente. Estrutura: **header** (título + contexto) → **counters** (`12 imagens · 3 documentos · 5 áudios`, `aria-live`) → **barra** (busca + filtro de tipo `ToggleGroup` + `MediaViewSwitcher` à direita; no scope=customer entra também o filtro de classificação) → **corpo** que troca conforme o modo:

- **Grade** — `MediaGrid` 3 colunas (drawer) / 2→6 responsivo (cliente), tiles quadrados, só thumbnail. Virtualizado >60 itens (D-7).
- **Cartões** — `MediaCardTile` 2 colunas, thumb + rodapé (badge de classificação + nome + meta).
- **Por tipo** — `MediaTypeGroups`: seção Imagens em grid; Documentos e Áudios em lista (ícone/nome/meta; áudio com play + snippet da transcrição).

O switcher persiste em `localStorage["gallo-media-viewmode"]`; default `grade`. Os três modos compartilham dados, filtros, busca e lightbox — muda só o layout do corpo.

### 5.2 Galeria por conversa
`ConversationMediaGallery` = `Sheet side=right` aberto pelo botão "Mídias" do header (PRD-011). Lista assets da conversa (`useConversationMedia`).

### 5.3 Aba Mídias do cliente
`CustomerMediaGallery` na Ficha (PRD-012), agregando assets de **todas** as conversas do cliente (`useCustomerMedia`), respeitando RBAC/Multi-Loja. Cada item indica a conversa de origem; o atalho "Abrir conversa" fica **dentro do lightbox** (menos paradas de foco por tile). Filtro extra por classificação.

### 5.4 Lightbox (D-12)
`Dialog` full-screen. Centro: imagem `object-contain` + zoom + navegação `‹ ›`; **áudio** com `MediaAudioPlayer` (Slider + velocidade 1x/1.5x/2x que **persiste entre itens** + transcrição com termo da busca destacado); **documento** "Abrir/Baixar" (sem preview inline). Aside direito: chip de classificação (`severity-warning` se sensível), metadados (autor/data/tamanho), vínculos (Pedido/Peça/Veículo + "vincular") e ações **Anotar / Classificar / Vincular / Baixar / Excluir** (Excluir → `AlertDialog`), filtradas por RBAC. Teclado: `←/→` (prev/next), `Esc` (fechar), `Space` (play/pause áudio), `+/-` (zoom). O handler global ignora eventos vindos de inputs/sliders/textarea. No mobile o aside vira folha inferior.

### 5.5 Governança de mídia sensível (D-4, D-6)
Assets `nota_fiscal`/`comprovante` recebem `sensitivity: 'sensitive'` automaticamente; marcação manual permitida. Para Vendedor/SDR: thumbnail **borrado** (placeholder redigido vindo do provider — não os bytes reais) + cadeado `mdi:lock` `severity-warning` + caption "conteúdo sensível — acesso restrito"; clicar abre **explicação** com "Solicitar acesso ao gestor", nunca o asset. No lightbox bloqueado: sem preview, sem download, metadados de faturamento ocultos. Toda tentativa de visualização/abertura sensível é **auditada** (PRD-006).

### 5.6 Indicadores de persistência (RF-007/008)
Chip canto inferior-direito do tile, por prioridade (D-13): **expirando** `mdi:clock-alert-outline` "29d" (urgência por valor: `>14d` warning suave, `≤7d` warning sólido, `≤2d` escala p/ critical); **falha** `mdi:alert-circle` "Falha" + retry (botão focável real, alcançável sem hover); **saudável** sem chip. Persistência nunca bloqueia a conversa.

### 5.7 Anotação de imagem (RF-020)
`MediaAnnotator` no lightbox em modo "Anotar": overlay **SVG** com ferramentas ponto/seta/texto; coords **normalizadas 0..1**; salvar gera **nova versão** (`version: 2`) referenciando o original imutável (são notas fiscais — legal). Caminho acessível: **lista textual** paralela de anotações (cada uma focável, rotulada, editável, removível; setas nudge ±1px/±10px). Excluído da Fase 1: histórico de N versões (guarda só original + 1 anotada).

---

## 6. Mocks & dados (DELTA PRD-004)

`generators/mediaAsset.ts` usa a seed determinística (`createSeededContext`) para gerar um conjunto realista distribuído entre conversas/clientes: fotos de peça e de chassi/placa, **notas fiscais (sensíveis)**, comprovantes, áudios com `transcription` mockada, documentos e vídeos — incluindo alguns `persisted: false` e alguns com `sourceExpiresAt` próximo para demonstrar o fluxo de expiração e o retry. Entrada no `bootstrap.ts` e `VOLUMES.mediaAssets` em `config.ts`. Latência/erro via `runApi`.

---

## 7. Acessibilidade (RNF-004)

WCAG 2.1 AA. Grid = widget `role="grid"`/`row`/`gridcell` com **roving tabindex** (Tab entra/sai uma vez; setas navegam). Tiles com `aria-label` que dobra o status no texto ("…conteúdo sensível"). Counters `aria-live="polite"`. Lightbox `role="dialog" aria-modal`, mapa de teclas, foco retorna ao tile de origem ao fechar. Cor nunca é o único sinal (ícone + texto + ARIA em todo estado). Anotação tem caminho de lista acessível. `prefers-reduced-motion` respeitado (já há regra global em `styles.css`): sem pulse/scale, troca instantânea; nunca animar o blur do tile bloqueado.

---

## 8. Testes

Vitest (ambiente node) sobre o `engine/` puro:
- `classifyMedia` — heurística por kind/mime/fileName/marcador mock → classificação correta.
- `contentHash` / dedup — mesma mídia (mesmo hash/messageId) não duplica.
- `sourceExpiry` — cálculo de `sourceExpiresAt`, label "expira em Nd" e tiers de urgência.
- `mediaFiltering` — filtros combinados (AND) + busca textual sobre fileName/ocrText/transcription + realce.
- `sensitiveAccess` — `canViewSensitive`: Owner/Gestor ✓, Vendedor/SDR ✗; `statusChipPriority` na ordem D-13.
- `annotationCoords` — normalize/denormalize idempotente.

UI verificada por `bun run build` (vite — gate real) + **teste manual** do usuário. Sem jsdom/RTL/browser, como nos ciclos anteriores. `tsc --noEmit` tem ~315 erros pré-existentes; avaliar apenas o delta do código novo.

---

## 9. Fasamento (espelha as 5 fases do PRD)

| Fase | Objetivo | Entregáveis principais |
|------|----------|------------------------|
| **1 — Fundação** | contrato + dados + lógica pura | DELTA `media.ts`; `IMediaStorageProvider` (mock + stub + factory + hook); `generators/mediaAsset` + bootstrap + VOLUMES; `engine/` completo com testes; add dep `@tanstack/react-virtual`. |
| **2 — Inbound** | todo inbound vira asset sem duplicar | `useEnsureInboundMedia` (dedup, `sourceExpiresAt`, transição `persisted false→true`, retry sem bloquear a conversa). |
| **3 — Galeria + lightbox** | ver/manipular mídia da conversa | `MediaGallery` (3 modos + switcher + `useMediaViewMode`), `MediaGrid` virtualizado, `MediaFilters`, `ConversationMediaGallery` (Sheet do header), `MediaLightbox` + `MediaAudioPlayer` + ações. |
| **4 — Cliente + busca + classificação/vínculo** | visão agregada e inteligência assistida | aba Mídias na Ficha (`CustomerMediaGallery`, `useCustomerMedia`), filtro de classificação, busca textual com realce, `classifyMedia` aplicado na criação + sugestão de vínculo (PRD-016/021/Order) com confirmação e auditoria. |
| **5 — Governança + anotação + polish** | segurança, conformidade, acabamento | sensibilidade auto/manual + `SensitiveLock` (gate no provider, D-4) + RBAC (D-6); retenção em Configurações (D-5); `MediaAnnotator` (nova versão); auditoria das ações sensíveis; light/dark; responsividade 360–1920; estados vazios/erro. |

A granularidade fina (tarefas TDD bite-sized) sai no plano (writing-plans).

---

## 10. Fora de escopo (Fase 2 / outros PRDs)

Storage real Supabase; OCR/transcrição reais; classificação por IA; **biblioteca de envio outbound (PRD-027)**; edição avançada de imagem; export ZIP da galeria; thumbnail server-side; versionamento de N versões; compartilhamento entre clientes. O composer (PRD-011) **não** é alterado aqui (anexo/envio é PRD-027).

---

## 11. Dependências e flags

- **Nova dependência:** `@tanstack/react-virtual` (D-7) — instalação normal respeita o guard de 24h do `bunfig.toml`; sem exclude.
- **DELTAs:** PRD-002 (`media.ts`) e PRD-004 (geradores) — registrar nota no doc canônico de DELTAS.
- **Consome (já prontos):** PRD-005 (Provider Pattern), PRD-006 (RBAC/Auditoria), PRD-010/011 (Inbox/Conversa), PRD-012 (Ficha), PRD-016 (Veículos), PRD-021 (Identificação de Peça), PRD-019 (Configurações).
- **Entrega para:** PRD-027 (Envio Rápido) — o `IMediaStorageProvider`.

---

## 12. Referência de design (consultoria UI/UX)

Princípios transversais aplicados: uma engine reusada nos dois pontos de entrada (D-2); status na escala severity invariante (D-14); prioridade estrita de 1 chip por tile (D-13); governança ≠ falha (cadeado/warning vs alerta/destructive); cor nunca é o único sinal; teclado é fluxo de primeira classe (grid roving-tabindex, mapa de teclas do lightbox); segurança real no gate de sensível (D-4, bytes nunca trafegam sem permissão); densidade B2B com alvos ≥44px no toque; motion sutil e reduced-motion-safe.
