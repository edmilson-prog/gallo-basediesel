# Spec de design — Gestão de Biblioteca de ativos e Respostas rápidas

- **Data:** 2026-06-22
- **Autor:** Claude (brainstorming) + AILA / dono
- **Status:** Proposta (aguardando revisão do dono antes do plano de implementação)
- **Áreas:** `src/features/quick-send/`, `src/routes/app.configuracoes.*`, `src/features/shell/layouts/SettingsLayout.tsx`
- **Relacionados:** PRD-026 (Vault / mídia), PRD-027 (Dispatch / envio rápido + biblioteca de ativos), `docs/dev/ux-guidelines.md`

> Calibrada por um workflow de investigação (6 mapeadores + 4 verificadores adversariais, somente-leitura) que confirmou em produção (`pg_policies` ao vivo) o estado de RLS, storage e reuso de componentes; depois passou por **self-review adversarial** (3 lentes: completude, viabilidade técnica, escopo) que cravou as ambiguidades abaixo.

---

## 1. Contexto e objetivo

A plataforma já consome **ativos da biblioteca** (catálogos, fichas técnicas, tabelas de preço, vídeos, links) e **respostas rápidas** (snippets com atalho `/xxx`) no composer da conversa — via `SlashMenu` e `AssetPicker`. A **camada de dados está completa** (providers mock + Supabase, tipos, engines, RLS). O que falta é a **experiência de GESTÃO**, hoje resumida a:

- **Biblioteca de ativos** — `LibraryManagerPage` (Owner/Gestor): uma lista `<ul>` com apenas publicar/despublicar, bump de versão e toggle de sensível. Sem criar/upload, editar metadados, preview, RBAC por papel, excluir, favoritar, filtros ou grid.
- **Respostas rápidas** — `SharedSnippetsManager`: CRUD apenas das **compartilhadas**, dentro da Biblioteca (Owner/Gestor). Sem camada "Minhas" (privadas por vendedor), sem prévia, sem busca, sem chips de placeholder.

**Objetivo:** elevar essas duas telas a um acabamento de produto, distintas das mídias trocadas na conversa (`IMediaAsset` → tela "Mídias (retenção)"). O trabalho é **~100% UI + wiring**; a persistência já existe.

### Decisões de produto (brainstorming + review)

1. **Escopo:** as duas telas, com design coeso.
2. **Audiência (duas camadas):** Owner/Gestor curam o acervo da loja (biblioteca de ativos + respostas compartilhadas); **cada vendedor** gerencia suas respostas rápidas **privadas**. (O favoritar de ativos pelo vendedor acontece no `AssetPicker` do composer, **fora desta spec** — ver §12.)
3. **Navegação:** **dois itens separados** em Configurações, sob um grupo novo **"Conteúdo"** (decisão cravada — antiga D5).
4. **Funcionalidades da 1ª entrega:** upload + prévia visual; sensibilidade + RBAC por ativo; prévia de placeholders. **2ª fase:** combos de ativos, categorias/pastas de respostas, e modo lista (alternador grade⇄lista) da biblioteca.
5. **Storage (cravado — antiga D1):** Fase 1 reusa o bucket `whatsapp-media` (path `<storeId>/<uuid>`); bucket dedicado `asset-library` é **hardening pós-MVP**, não decisão de início.

---

## 2. Escopo

### Dentro (Fase 1)

**Tela A — Biblioteca de ativos (Owner/Gestor)**
- Grid de cards (somente **grade** na Fase 1) com thumbnail + busca (`/`) + filtros (categoria, marca, linha, status, sensível).
- Criar via `Sheet`: segmented **Arquivo | Link**, upload real de arquivo (PDF/imagem/vídeo) ou URL; metadados (título, categoria, marca, linha de produto, divisão, kind); sensibilidade; RBAC por papel (`allowedRoleIds`).
- Editar metadados; **nova versão** (substituir arquivo/URL preservando `previousVersion`); publicar/despublicar; marcar sensível; excluir (`AlertDialog`); favoritar (no contexto Owner/Gestor da gestão).
- **Preview/lightbox** por tipo: imagem (`<img>`), PDF (embed/`<iframe>`), vídeo (`<video>`), link (card "abrir"). Componente **novo** (ver §4.5).
- Aba "Uso" (`AssetUsageStatsPage` atual) preservada na mesma página.

**Tela B — Respostas rápidas (Owner/Gestor/Vendedor/SDR)**
- Camadas **Minhas** (`scope='private'`, `ownerId = sellerId` real do usuário) e **Da loja** (`scope='shared'`).
- CRUD das "Minhas"; "Da loja" **read-only com cadeado** para quem não é Owner/Gestor + ação **"Duplicar para as minhas"**. A criação de respostas "Da loja" é oferecida **apenas** a Owner/Gestor.
- Busca (atalho/título/corpo).
- Editor com **chips de placeholder** clicáveis e **prévia ao vivo** num balão estilo WhatsApp (dados de exemplo).
- Validação de atalho (começa com `/`, sem espaço) e **aviso não-bloqueante de colisão** contra o conjunto visível ao usuário (Minhas + Da loja), espelhando o que `findByShortcut` resolve em runtime.

### Sequenciamento (sub-planos)

A Fase 1 é grande para um único plano; o `writing-plans` deve tratá-la como **três sub-planos**:

- **P0 — Navegação/RBAC compartilhada:** grupo "Conteúdo" no `SettingsLayout`, rota nova `respostas-rapidas`, remoção da aba snippets do `LibraryManagerPage`. Desbloqueia P1 e P2.
- **P1 — Tela A (Biblioteca de ativos).**
- **P2 — Tela B (Respostas rápidas).**

P1 e P2 são quase independentes (compartilham só padrões de UX e o chrome) e podem ser paralelos após P0.

### Fora (2ª fase / itens próprios) — ver §12.

---

## 3. Navegação e RBAC (P0)

### Itens de menu (`SettingsLayout.tsx` → `SETTINGS_GROUPS`)

Criar o grupo **"Conteúdo"** (cravado) agrupando os itens correlatos (`useVisibleGroups` já oculta grupos vazios):

| Item | Rota | Gate |
|---|---|---|
| Biblioteca de ativos | `/app/configuracoes/biblioteca` (existe) | `roles: ['Owner','Gestor']` (mantido) |
| Respostas rápidas | `/app/configuracoes/respostas-rapidas` (**nova**) | `roles: ['Owner','Gestor','Vendedor','SDR']` |
| Mídias (retenção) | `/app/configuracoes/midias` (existe) | mover de "Avançado" para "Conteúdo" |

- **Não incluir `VendedorExterno`** (usa o PWA próprio `/pwa/*`, que não renderiza `SettingsLayout`, e não tem `quick_reply` na matriz RBAC) nem **`Financeiro`** (sem permissão e sem caso de uso).
- Usar `roles: [...]` em vez de `permission: {resource:'quick_reply', action:'view'}` — mais legível e evita surpresa de `scope`.
- **Rota nova** espelha `app.configuracoes.biblioteca.tsx`. `requireAuth(pathname, roles)` confirmado em `src/features/auth/guards.ts`:
  ```ts
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ['Owner','Gestor','Vendedor','SDR'])
  ```

### Gate dentro da Tela B (Respostas rápidas)

- Edição da camada **Da loja** e **criação de shared** liberadas apenas a Owner/Gestor: gatear por `hasPermission(user, 'quick_reply', 'edit', 'store')`. Para os demais → cadeado + "Duplicar para as minhas", e a opção "criar Da loja" não aparece.
- A RLS de `quick_replies` **já garante isso no servidor** (UPDATE/DELETE exigem `is_staff() OR owner_id = self`) — o gate de UI evita o **403 silencioso** e comunica o estado; não é a única defesa.

### Aba "Respostas rápidas" dentro da Biblioteca (cravado — antiga D4)

A tela própria substitui essa aba. **Remover a aba `snippets`** do `LibraryManagerPage` (Owner/Gestor passam a gerir as compartilhadas pela camada "Da loja" da tela nova). Feito em P0.

---

## 4. Tela A — Biblioteca de ativos (P1)

### 4.1 Layout

Vive **dentro do `SettingsLayout`** (rola no `<main>`, conteúdo `max-w-[1600px]`). As outras telas de Configurações **não** usam a faixa glass full-bleed nem `ScrollProgressBar` das listas; seguir esse padrão:

- **Cabeçalho de seção:** `h1` "Biblioteca de ativos" + descrição.
- **Barra de ação sticky** (dentro do conteúdo): **busca dinâmica** replicando o padrão do `CatalogHeader` (largura `max-w-sm ↔ max-w-2xl` no foco, atalho `/`, `kbd`, `Escape`) com debounce de 300 ms — usar o hook `useDebounce` **ou** o debounce inline do próprio `CatalogHeader` (este usa `setTimeout`/`timerRef` inline, não o hook). Botão **"Novo ativo"** (primário). **Sem alternador grade⇄lista na Fase 1** (modo lista é 2ª fase — §12).
- **Faixa de filtros (chips):** Categoria · Marca · Linha · Status · Sensível. Adaptar de `MediaFilters` (re-tipar para campos de ativo). Mapeiam 1:1 com `assetLibrary.list({ category, brand, productLine, status, search })` (filtro server-side confirmado).
- **Grid de cards** responsivo (3–4 col desktop / 2 tablet / 1 mobile). Reaproveitar o container/teclado de `MediaGrid` generalizado para `IAssetLibraryItem`.

### 4.2 Card de gestão (componente novo: `AssetManageCard`)

**Não reusar `AssetGridCard`/`AssetRow` as-is** — embutem regras de **envio** (`blocked`/`sendable`) que desabilitam `draft`/`archived`/sensível, exatamente os itens que a gestão precisa manipular (§8.1). Card de gestão:

- Thumbnail por tipo (ícone-fallback quando sem bytes); badge de **status** (publicado=`success`, rascunho=`warning`, arquivado=neutro), badge **🔒 sensível**, `v{n}`.
- Ações no hover / menu `⋮`: editar · nova versão · publicar/despublicar · marcar sensível · RBAC · excluir · favoritar.
- Clique → **preview** (§4.5). **Não** desabilita draft/archived.
- Faixa de marca discreta. Reusar engines `isSensitiveAsset` (toggle/badge) e `assetVersioning` (bump).

### 4.3 Criar / editar / nova versão (componente novo: `AssetFormSheet`)

- **Um único `Sheet` com prop `mode: 'create' | 'edit' | 'newVersion'`** (cravado — sem "ou sheet próprio"). `newVersion` oculta os metadados e expõe apenas a substituição de arquivo/URL + a chamada `bumpVersion`.
- Segmented **Arquivo | Link** no topo (modos `create`/`newVersion`).
  - **Arquivo:** upload via `<input type=file hidden>` (padrão consolidado em `useAttachmentUpload`/`MediaAttachField`; **não há** Dropzone genérico — wrapper de drag-drop é opcional). Fluxo: `media.upload({ file, kind, mimeType, sizeBytes, fileName, authorType:'seller', direction:'out', storeId })` → recebe `IMediaAsset` → grava `mediaAssetId` (e/ou `storageRef`) em `assetLibrary.create({ ..., storeId })`.
    - ⚠️ **Tipagem:** `storeId` **não** está em `IMediaUploadInput`; passá-lo exige a augmentação que o resto do código usa — `input as IMediaUploadInput & { storeId?: ID }` — ou adicionar `storeId?: ID` opcional ao tipo. Sem isso o `tsc` acusa no código novo (gate de delta de tipos, §11).
    - Validar o tamanho contra o limite real do bucket (§8.3 — **a confirmar**, não hardcodar).
  - **Link:** campo URL → `assetLibrary.create({ kind:'link', url, ... })`.
- Metadados: título, categoria, marca, linha de produto, divisão (default `parts`), kind.
- **Sensibilidade:** toggle (com a regra de que `tabela_preco` é **sempre** sensível via `isSensitiveAsset` — refletir/explicar na UI, §8).
- **RBAC por papel:** multiselect de papéis (`useRolesProvider().list()`) → `allowedRoleIds` (IDs de role, não `RoleName`). É **filtro de visibilidade na UI**, não fronteira de servidor (Fase 1).
- **storeId obrigatório:** injetar a loja ativa via `useCurrentStore`/`getCurrentContext()` no `create` e no `upload` (Supabase não injeta — §8.2).

### 4.4 Preview / lightbox (componente novo: `AssetPreviewDialog`)

`MediaLightbox` **não serve** (tipado a `IMediaAsset`, sem ramo `link`, placeholder sem bytes — §8.4). Novo componente sobre `IAssetLibraryItem`:

- Resolve URL real: arquivos → `media.getSignedUrl(mediaAssetId)` (`createSignedUrl(path, 300)` — 5 min; guardar **path/id** e re-assinar sob demanda, não a URL). Links → `item.url`. **Não** usar `useResolvedMediaUrl` (acoplado ao provider de mensagens, tipado a `IMessage.mediaUrl`).
- Renderiza bytes de verdade: `<img>` (imagem), **`<iframe>`/embed (PDF — construção nova, sem precedente no projeto)**, `<video>` (vídeo), card "abrir" (link). `MediaViewerDialog` serve de referência apenas para `<img>`/`<video>` (ele **não** tem ramo de PDF).
- Navegação por teclado (←/→ entre ativos, `Esc`), aside com metadados + versão.
- Em mock: `objectURL`/placeholder (sem bytes reais).

### 4.5 Dados / hook

Criar **`useAssetLibraryAdmin`** (hook novo, separado) com mutations (create/update/publish/unpublish/bumpVersion/delete/upload) + invalidação **TanStack Query** por `queryKey ['quick-send','assets', filtro]`. **Não** estender `useAssetLibrary` (de leitura) para evitar regressão nos consumidores do composer (`AssetPicker`/`SlashMenu`); compartilhar a `queryKey` para invalidação cruzada. Acesso a dados **só** via `@/providers/data` (fronteira ESLint).

---

## 5. Tela B — Respostas rápidas (P2)

### 5.1 Layout

- Dentro do `SettingsLayout`. `h1` "Respostas rápidas" + descrição.
- **Segmented "Minhas · Da loja"** + busca (mesmo padrão de busca dinâmica).
- **Duas colunas** (desktop): lista à esquerda; **editor + prévia** à direita. No mobile o editor vira `Sheet`.
- Partição a partir de `useQuickReplies` (já entrega Minhas + Da loja): `scope==='private' && ownerId===sellerId` vs `scope==='shared'`.

### 5.2 Camadas e gates

- **Minhas:** CRUD livre. `create({ scope:'private', ownerId: <sellerId real>, storeId: <loja ativa> })`.
- **Da loja:** lista sempre visível; **editável e criável só por Owner/Gestor**. Para os demais: cadeado, ações de editar/excluir/criar ocultas, e **"Duplicar para as minhas"** → `create({ ...shared, scope:'private', ownerId: self, storeId })`.
- ⚠️ **Identidade:** usar o **`sellerId` real** (`currentUser.sellerId` / mirror `gallo-auth-sync`), **não** `getCurrentContext().user?.id` (profile id) — senão "Minhas" fica vazio e o INSERT falha em produção (§8.2). `SharedSnippetsManager` já usa `currentUser?.sellerId`; replicar.

### 5.3 Editor + prévia

- Campos: atalho `/xxx` (mono; validação de início/espaço; **aviso não-bloqueante de colisão** contra o conjunto visível Minhas+Da loja — não há unique constraint, §8.8), título, corpo.
- **Chips de placeholder** clicáveis que inserem no cursor. Reaproveitar o destaque visual de `SnippetField` (pílulas) no corpo; os chips de inserção são UI nova.
- **Prévia ao vivo** num balão estilo WhatsApp (referência visual `TextBubble`/`MessageBubble`): chama `resolvePlaceholders(body, sampleCtx)` com **dados de exemplo**. É **ilustrativa** (o composer real passa contexto `undefined`).
- **Vocabulário canônico de placeholders** (engine novo, testado): conjunto + builder de contexto de exemplo. → decisão **D3**, §10 (a confirmar).

### 5.4 Dados / hook

Criar **`useQuickReplyAdmin`** (hook novo, separado) com mutations + invalidação (`queryKey ['quick-send','replies', sellerId]`), threading de `storeId` e `sellerId` real. **Não** tocar `useQuickReplies` (leitura, usado no composer). Reaproveitar `SharedSnippetsManager` como base do editor (já trata erro/skeleton/empty/AlertDialog).

---

## 6. Modelo de dados e backend

**Nenhuma migration é obrigatória na Fase 1.** Estado verificado em `pg_policies` ao vivo **e** nas migrations versionadas (sem drift):

- `IAssetLibraryItem` e `IQuickReply` já modelam todos os campos (incl. `allowedRoleIds`, `previousVersion`, `mediaAssetId`, `url`, `scope`, `ownerId`).
- Providers mock + Supabase completos (CRUD, publish, bumpVersion, favoritos, combos, recents, usageStats, findByShortcut).
- **RLS `quick_replies`:** SELECT = `store AND (is_staff() OR scope='shared' OR owner_id=self)`; INSERT/UPDATE/DELETE = `store AND (is_staff() OR owner_id=self)`. Mapeia Minhas/Da loja 1:1.
- **RLS `asset_library_items`:** SELECT/INSERT/UPDATE/DELETE **store-scoped** (`store_id = current_store_id()`). A policy POC `using(true)` de `20260608154323_create_asset_library_tables_v2.sql` foi **dropada e substituída** pelo store-scoping em `20260608220448_rls_policies_store_direct.sql` (já versionado no Git — não há migration de correção a aplicar). Não há gate de papel no banco — o "Owner/Gestor only" é só UI/rota.
- `asset_combos` / `asset_favorites` / `asset_send_log`: RLS per-seller já aplicada.

**Migrations futuras:**
- (Opcional — D2) Hardening: `AND (SELECT public.is_staff())` no INSERT/UPDATE/DELETE de `asset_library_items` (defense-in-depth, espelha o padrão `#48` de `media_assets`). **Requer confirmação do dono** e exportar para `supabase/migrations/`.
- (2ª fase) `quick_replies.category` (coluna + índice + tipo + provider) para pastas/categorias.

---

## 7. Reuso vs construção nova

| Reaproveitar as-is | Evoluir / generalizar | Construir novo |
|---|---|---|
| Engines `assetFiltering` (estender p/ status+sensível), `assetVersioning`, `assetSensitivity` | `MediaFilters` → barra de filtros de ativo | `AssetManageCard` |
| `placeholderResolver` (função pura) | `MediaGrid` → grid de cards de ativo | `AssetFormSheet` (modes create/edit/newVersion) |
| Providers (`useAssetLibraryProvider`/`useQuickReplyProvider`/`useMediaStorageProvider`/`useRolesProvider`) | `SharedSnippetsManager` → base do editor de respostas | `AssetPreviewDialog` (resolve via `media.getSignedUrl`; PDF `<iframe>` novo) |
| `useDebounce`; padrão de busca de `CatalogHeader` (debounce inline) | `LibraryManagerPage` → DAM (remover aba snippets) | `QuickRepliesPage`, `QuickReplyEditor`, `QuickReplyPreviewBubble` |
| `AlertDialog`, `Sheet`, `Tabs`, `Toggle`, `Command` (shadcn) | `SnippetField` (destaque) → editor com chips | `RoleMultiSelect`; `useAssetLibraryAdmin`/`useQuickReplyAdmin`; engine de vocabulário/contexto de placeholder (TDD) |

Render de bytes: `MediaViewerDialog` é referência só de `<img>`/`<video>` (sem PDF). `AssetPickerModeSwitcher` **não** entra na Fase 1 (modo lista diferido).

---

## 8. Riscos e pontos de atenção (verificados)

1. **Acoplamento ao envio (principal):** `AssetGridCard`/`AssetRow` desabilitam draft/archived/sensível → **card de gestão dedicado**.
2. **`storeId` + `sellerId` no create (Supabase):** providers Supabase **não** injetam `storeId` (mock injeta via `withCreateStoreId`). Threadar `storeId` ativo e `ownerId = sellerId real`; senão 403 / "Minhas" vazio. `storeId` no `upload` é via augmentação de tipo (§4.3).
3. **Storage (upload):** reuso de `whatsapp-media` é viável e roda em produção (agendador) — path `<storeId>/<uuid>`. Ressalvas: **limite de tamanho do bucket a confirmar** (é config do bucket, não policy; não hardcodar — o plano lê o valor real); `direction`/`authorType` artificiais; sensibilidade/RBAC **não** impostos pelo storage.
4. **Preview:** `MediaLightbox` é Fase-1 placeholder, tipado a `IMediaAsset`, sem ramo `link` → componente novo; PDF embed sem precedente.
5. **Placeholders:** o composer real passa contexto `undefined`; a prévia é **ilustrativa**.
6. **`allowedRoleIds`/sensibilidade não enforced no banco:** Fase 1 = filtro/badge de UI (não segurança).
7. **Cache:** hooks Admin separados + invalidação por `queryKey`; não misturar com `refresh` manual.
8. **`quick_replies`:** sem unique constraint em `shortcut` (aviso de colisão na UI, não bloqueante); RLS permite vendedor criar shared própria → controlar na UI (criar "Da loja" só Owner/Gestor).
9. **`bumpVersion` Supabase:** read-modify-write (TOCTOU) — desabilitar bumps repetidos rápidos.

---

## 9. Estados, acessibilidade e microinterações

- **Vazio:** ícone + frase + CTA. **Carregando:** skeleton (não spinner solto). **Erro:** inline com `role="alert"` + "Tentar de novo".
- **Async:** botão `disabled` + spinner; toasts (`sonner`).
- **A11y:** foco visível (`focus-visible:ring-2`), `aria-label` em ícone-botões, alt/aria nos thumbnails, teclado no grid e no lightbox, `prefers-reduced-motion`. Transições 150–300 ms em cor/opacidade.
- **Tokens semânticos** apenas; cor de submarca discreta.

---

## 10. Decisões em aberto (a confirmar na revisão)

> D1, D4 e D5 foram **cravadas** (§1.5, §3) e saíram desta lista.

- **D2 — RLS defense-in-depth em `asset_library_items`:** aplicar migration de `is_staff()` no write (alinha backend à intenção "Owner/Gestor curam") ou aceitar gate só de UI (padrão do projeto). Recomendação: aplicar (barato e correto), **com confirmação do dono** para o apply em prod. Isolada — não bloqueia o início (a Tela A já é Owner/Gestor por rota).
- **D3 — Vocabulário de placeholders:** confirmar o conjunto canônico (proposta: `{{nome}}` cliente, `{{loja}}`, `{{vendedor}}`, `{{peca}}`, `{{prazo}}`) e os dados de exemplo da prévia. Hoje o resolver documenta `{{nome}}/{{peca}}/{{prazo}}` mas aceita qualquer chave.

---

## 11. Critérios de aceite (Fase 1)

**P0:** grupo "Conteúdo" no menu; item "Respostas rápidas" visível a Owner/Gestor/Vendedor/SDR e oculto a VendedorExterno/Financeiro; rota nova com gate correto; aba snippets removida da Biblioteca sem perder o CRUD de compartilhadas (migrado para a Tela B).

**Tela A:** Owner/Gestor cria um ativo por **upload** (arquivo aparece no preview real) e por **link**; edita metadados; sobe **nova versão**; publica/despublica; marca sensível; define papéis; exclui; favorita — refletido no grid sem reload manual, com auditoria via provider. Filtros (categoria/marca/linha/status/sensível) + busca `/` funcionam (server-side). Preview renderiza imagem, PDF (embed), vídeo e link.

**Tela B:** Vendedor cria/edita/exclui as **suas**; vê as **Da loja** com cadeado e **duplica** uma para as suas; **não vê** a opção de criar "Da loja". Owner/Gestor cria/edita as **Da loja**. O editor mostra **prévia ao vivo** com placeholders resolvidos por dados de exemplo; aviso de colisão de atalho aparece contra o conjunto visível.

**Transversal:** funciona em **mock e Supabase**; em produção, `storeId`/`sellerId` corretos (sem 403). `bun run build` + `bun run test` verdes; sem novos erros de tipo no código novo (delta). *Nota: se D2 for aplicada, validar que o gate de rota Owner/Gestor da Tela A já impede o write de não-staff (a migration vira redundância de segurança, não regressão funcional).*

---

## 12. Fora de escopo (explícito)

- **Combos de ativos (UI)** — backend pronto (`asset_combos` + provider); 2ª fase.
- **Categorias/pastas de respostas rápidas** — exige migration (`quick_replies.category`); 2ª fase.
- **Modo lista da biblioteca** (alternador grade⇄lista via `AssetPickerModeSwitcher`) — 2ª fase; Fase 1 entrega só grade.
- **Favoritar de ativos pelo vendedor** — acontece no `AssetPicker` do composer (já existe); esta entrega cobre favoritar só na Tela A (Owner/Gestor).
- **Enforcement server-side de RBAC/sensibilidade por ativo** — policy nova lendo `allowed_role_ids` contra o papel do JWT; item próprio.
- **Resolução real de placeholders no envio** (ligar o composer aos dados de cliente/loja) — item próprio.
- **Dropzone genérico reutilizável** — a menos que trivial.
