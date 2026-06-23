# Gestão de Biblioteca de ativos e Respostas rápidas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as duas telas de gestão em Configurações — Biblioteca de ativos (DAM: grid, filtros, criar/upload/editar/versão/preview/RBAC/excluir/favoritar) e Respostas rápidas (camadas Minhas/Da loja, editor com prévia ao vivo) — sobre a camada de dados já existente.

**Architecture:** ~100% UI + wiring sobre os providers `assetLibrary`/`quickReply`/`media`/`roles` (mock + Supabase), engines (`assetFiltering`/`assetVersioning`/`assetSensitivity`/`placeholderResolver`) e RLS já prontos. Três fases sequenciais: **P0** (navegação/grupo de menu), **P1** (Tela A — Biblioteca), **P2** (Tela B — Respostas rápidas + remoção da aba snippets legada). Lógica testável vive em `engine/` (TDD com Vitest); componentes são verificados por `build` + revisão manual.

**Tech Stack:** React 19, Vite, TanStack Router (file-based) + TanStack Query, Tailwind v4 + shadcn/ui, Zustand (mock store), Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-22-gestao-ativos-respostas-rapidas-design.md`

## Global Constraints

- **Idioma:** comentários e identificadores em **inglês**; toda UI/copy em **português do Brasil com acentos corretos** (UTF-8). Nomes: `camelCase` (vars/fns), `PascalCase` (componentes/tipos), `kebab-case` (arquivos), `UPPER_SNAKE_CASE` (constantes).
- **Fronteira de dados (ESLint):** fora de `src/mocks/**` e `src/providers/data/**` é proibido importar `@/mocks`, `@/providers/data/impl/*`, contratos individuais ou `factory`. Tudo via o barrel `@/providers/data` e seus hooks `useXxxProvider()`.
- **Supabase create (armadilha verificada):** os providers Supabase **não** injetam `storeId` (o mock injeta via `withCreateStoreId`). Todo `create`/`upload` deve threadar `storeId = getCurrentContext().currentStoreId` (ou `useCurrentStore`). Para respostas, `ownerId` deve ser o **`sellerId` real** (`readCurrentUserSync().sellerId` / `useAuth().currentUser.sellerId`), **nunca** `getCurrentContext().user.id` (profile id).
- **`media.upload` tipagem:** `storeId` não está em `IMediaUploadInput`; passá-lo exige `as IMediaUploadInput & { storeId?: ID }` (padrão de `useAttachmentUpload`).
- **Tokens semânticos apenas** (`bg-background`, `text-foreground`, `border-border`, `severity-*`); nunca `--gallo-*`/hex direto. Cor de submarca discreta.
- **Telas de Configurações** rolam dentro do `<main>` do `SettingsLayout` (conteúdo `max-w-[1600px]`): **não** usam a faixa glass full-bleed nem `ScrollProgressBar` das listas. Reaproveitar apenas o **bloco de busca dinâmica** do `CatalogHeader` (largura `max-w-sm↔max-w-2xl` no foco, atalho `/`, `kbd`, `Escape`, debounce 300 ms).
- **TDD nos `engine/`** (Vitest, arquivos `*.test.ts` co-localizados). Componentes: verificação por `bun run build` + revisão manual do dono (NÃO abrir preview/devtools — o dono testa a UI manualmente).
- **Gate de CI:** `bun run build` (Vite, não faz type-check) **e** `bun run test`. Type-check por **delta** com `bunx tsc --noEmit` (há baseline de erros pré-existentes; avaliar só arquivos novos).
- **Dependências:** `bunfig.toml` impõe guarda de 24h; **não** adicionar pacote novo sem confirmar com o dono. Tudo aqui usa libs já presentes.
- **Commits:** Conventional Commits em inglês, atômicos.

---

## Fase P0 — Navegação base

### Task 1: Grupo "Conteúdo" no menu de Configurações

**Files:**
- Modify: `src/features/shell/layouts/SettingsLayout.tsx` (array `SETTINGS_GROUPS`)

**Interfaces:**
- Consumes: tipo `ISettingsGroup`/`ISettingsItem` já definidos no arquivo (`{ label, icon, to, roles?, permission?, upcoming?, demoOnly? }`).
- Produces: um grupo `"Conteúdo"` contendo "Biblioteca de ativos" e "Mídias (retenção)". O item "Respostas rápidas" é adicionado em P2 (Task 16), junto com sua rota, para não linkar rota inexistente.

- [ ] **Step 1: Mover os itens para um grupo novo**

No `SETTINGS_GROUPS`, **remover** os itens `Biblioteca de ativos` e `Mídias (retenção)` do grupo `"Avançado"` e **criar** um grupo `"Conteúdo"` (posicioná-lo logo após `"Operação"`):

```ts
{
  label: "Conteúdo",
  items: [
    {
      label: "Biblioteca de ativos",
      icon: "mdi:bookshelf",
      to: "/app/configuracoes/biblioteca",
      roles: ["Owner", "Gestor"],
    },
    {
      label: "Mídias (retenção)",
      icon: "mdi:database-clock-outline",
      to: "/app/configuracoes/midias",
      roles: ["Owner", "Gestor"],
    },
  ],
},
```

- [ ] **Step 2: Verificar build + lint**

Run: `bun run build && bun run lint`
Expected: build OK; sem erros novos de lint.

- [ ] **Step 3: Commit**

```bash
git add src/features/shell/layouts/SettingsLayout.tsx
git commit -m "feat(settings): group library and media under a Conteúdo section"
```

> Verificação manual (dono): o menu de Configurações mostra o grupo "Conteúdo" com "Biblioteca de ativos" e "Mídias (retenção)"; os links abrem as telas atuais.

---

## Fase P1 — Tela A: Biblioteca de ativos

### Task 2: Estender o engine `assetFiltering` com filtro de sensível

**Files:**
- Modify: `src/features/quick-send/engine/assetFiltering.ts`
- Test: `src/features/quick-send/engine/assetFiltering.test.ts`

**Interfaces:**
- Consumes: `isSensitiveAsset(item)` de `./assetSensitivity`.
- Produces: `IAssetFilter` ganha `sensitiveOnly?: boolean`; `filterAssets(items, filter)` passa a excluir itens não-sensíveis quando `sensitiveOnly` é `true`. (Categoria/marca/linha/status/busca seguem server-side via `provider.list`; o toggle "Sensível" é client-side pois não há filtro server de sensível.)

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `assetFiltering.test.ts`:

```ts
import { filterAssets } from "./assetFiltering";
import type { IAssetLibraryItem } from "@/shared/types";

const base: IAssetLibraryItem = {
  id: "a", storeId: "s", division: "parts", title: "Catálogo", category: "catalogo",
  kind: "document", version: 1, status: "published", sensitivity: "normal",
  createdBy: "u", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

it("sensitiveOnly keeps sensitive assets (flag or tabela_preco) and drops normal ones", () => {
  const normal = { ...base, id: "n", sensitivity: "normal" as const, category: "catalogo" as const };
  const flagged = { ...base, id: "f", sensitivity: "sensitive" as const };
  const priceTable = { ...base, id: "p", category: "tabela_preco" as const, sensitivity: "normal" as const };
  const out = filterAssets([normal, flagged, priceTable], { sensitiveOnly: true });
  expect(out.map((i) => i.id)).toEqual(["f", "p"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- assetFiltering`
Expected: FAIL (`sensitiveOnly` ainda não filtra).

- [ ] **Step 3: Implementar**

Em `assetFiltering.ts`, importar o engine de sensibilidade e estender:

```ts
import { isSensitiveAsset } from "./assetSensitivity";

export interface IAssetFilter {
  category?: AssetCategory;
  brand?: string;
  productLine?: string;
  query?: string;
  sensitiveOnly?: boolean;
}
```

Dentro do `items.filter`, antes do `return true`:

```ts
    if (filter.sensitiveOnly && !isSensitiveAsset(item)) return false;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test -- assetFiltering`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/features/quick-send/engine/assetFiltering.ts src/features/quick-send/engine/assetFiltering.test.ts
git commit -m "feat(quick-send): add sensitiveOnly to asset filter engine"
```

---

### Task 3: Migration de hardening RLS de `asset_library_items` (D2)

**Files:**
- Create: `supabase/migrations/20260622120000_tighten_asset_library_writes.sql`

**Interfaces:**
- Consumes: helpers `public.current_store_id()`, `public.is_staff()` (já existentes).
- Produces: write de `asset_library_items` exige `is_staff()` além do store-scope. SELECT inalterado (segue store-scoped).

> ⚠️ Apenas **versionar** o arquivo nesta task. O `apply_migration` em produção (via MCP/CLI) é confirmado com o dono **na hora** — não aplicar automaticamente (memória do projeto). Regra do CLAUDE.md: todo apply deve estar espelhado em `supabase/migrations/`.

- [ ] **Step 1: Criar a migration**

```sql
-- D2: tighten asset_library_items writes to is_staff() (Owner/Gestor only).
-- Before: writes were store-scoped only (any authenticated in-store user could
-- mutate). Mirrors the #48 media_assets pattern. SELECT stays store-scoped.

drop policy if exists asset_library_items_insert on public.asset_library_items;
create policy asset_library_items_insert on public.asset_library_items
  for insert to authenticated
  with check (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  );

drop policy if exists asset_library_items_update on public.asset_library_items;
create policy asset_library_items_update on public.asset_library_items
  for update to authenticated
  using (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  )
  with check (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  );

drop policy if exists asset_library_items_delete on public.asset_library_items;
create policy asset_library_items_delete on public.asset_library_items
  for delete to authenticated
  using (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  );
```

> Nota: confirmar os nomes exatos das policies de write em prod antes do apply (o store-direct loop de `20260608220448` pode tê-las nomeado `..._insert`/`_update`/`_delete`). O `drop policy if exists` cobre o caso comum; ajustar se diferirem.

- [ ] **Step 2: Validar o SQL (lint local opcional)**

Run: `bun run build`
Expected: build OK (a migration não afeta o bundle; só garante que nada quebrou no repo).

- [ ] **Step 3: Commit (sem aplicar em prod)**

```bash
git add supabase/migrations/20260622120000_tighten_asset_library_writes.sql
git commit -m "feat(db): tighten asset_library_items writes to staff (D2, versioned)"
```

> Verificação (dono): agendar o `apply_migration` em prod e validar via `pg_policies` que o write exige `is_staff()`.

---

### Task 4: i18n — strings de gestão de ativos

**Files:**
- Modify: `src/features/quick-send/i18n/pt-BR.ts` (grupo `library` existente — **append-only**)

**Interfaces:**
- Produces: chaves consumidas por todos os componentes da Tela A. Append ao grupo `library: {...}` (não renomear nada).

- [ ] **Step 1: Adicionar as chaves**

Acrescentar ao objeto `library` (manter as existentes):

```ts
    // Tela A — gestão de ativos (P1)
    newAsset: "Novo ativo",
    editAsset: "Editar ativo",
    newVersionTitle: "Nova versão",
    searchAssets: "Buscar catálogo, ficha, tabela…",
    filterCategory: "Categoria",
    filterBrand: "Marca",
    filterLine: "Linha",
    filterStatus: "Status",
    filterSensitive: "Sensível",
    clearFilters: "Limpar filtros",
    sourceFile: "Arquivo",
    sourceLink: "Link",
    dropHint: "Arraste um arquivo ou clique para selecionar",
    fieldTitle: "Título",
    fieldCategory: "Categoria",
    fieldBrand: "Marca",
    fieldLine: "Linha de produto",
    fieldDivision: "Divisão",
    fieldUrl: "URL do link",
    fieldRoles: "Papéis com acesso",
    rolesHint: "Vazio = visível a todos os papéis da loja (filtro de exibição).",
    sensitiveToggle: "Marcar como sensível",
    priceTableAlwaysSensitive: "Tabelas de preço são sempre sensíveis.",
    uploading: "Enviando…",
    preview: "Pré-visualizar",
    openLink: "Abrir link",
    deleteAssetTitle: "Excluir ativo",
    deleteAssetDesc: (title: string) => `Excluir “${title}”? Esta ação não pode ser desfeita.`,
    favorite: "Favoritar",
    unfavorite: "Remover dos favoritos",
    uploadTooLarge: (mb: number) => `Arquivo muito grande. Limite de ${mb} MB.`,
    saveError: "Não foi possível salvar. Tente de novo.",
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/quick-send/i18n/pt-BR.ts
git commit -m "feat(quick-send): add pt-BR strings for asset management screen"
```

---

### Task 5: Hook `useAssetLibraryAdmin` (mutations + upload)

**Files:**
- Create: `src/features/quick-send/hooks/useAssetLibraryAdmin.ts`

**Interfaces:**
- Consumes: `useAssetLibraryProvider()`, `useMediaStorageProvider()`, `getActiveDataSource()` (de `@/providers/data`); `getCurrentContext()` (storeId/sellerId); `useQueryClient`; tipos `IAssetLibraryItem`, `IMediaUploadInput`, `AssetCategory`, `AssetKind`.
- Produces:
  ```ts
  interface IAssetCreateInput {
    title: string; category: AssetCategory; brand?: string; productLine?: string;
    division: IAssetLibraryItem["division"]; kind: AssetKind;
    sensitivity: IAssetLibraryItem["sensitivity"]; allowedRoleIds?: string[];
    // exatamente um destes:
    file?: File; url?: string;
  }
  interface IUseAssetLibraryAdmin {
    createAsset(input: IAssetCreateInput): Promise<IAssetLibraryItem>;
    updateAsset(id: ID, patch: Partial<IAssetLibraryItem>): Promise<IAssetLibraryItem>;
    newVersion(id: ID, source: { file?: File; url?: string }): Promise<IAssetLibraryItem>;
    setPublished(id: ID, published: boolean): Promise<IAssetLibraryItem>;
    setSensitive(id: ID, sensitive: boolean): Promise<IAssetLibraryItem>;
    deleteAsset(id: ID): Promise<IAssetLibraryItem>;
    resolvePreviewUrl(item: IAssetLibraryItem): Promise<string | null>;
    isUploading: boolean;
  }
  ```
  Toda mutação invalida `queryKey: ["quick-send","assets"]` (prefixo) para sincronizar com `useAssetLibrary`.

- [ ] **Step 1: Implementar o hook**

```ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AssetCategory, AssetKind, ID, IAssetLibraryItem, IMediaUploadInput } from "@/shared/types";
import {
  getActiveDataSource,
  useAssetLibraryProvider,
  useMediaStorageProvider,
} from "@/providers/data";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // conservative cap below the bucket limit; confirmar o limite real do bucket

export interface IAssetCreateInput {
  title: string;
  category: AssetCategory;
  brand?: string;
  productLine?: string;
  division: IAssetLibraryItem["division"];
  kind: AssetKind;
  sensitivity: IAssetLibraryItem["sensitivity"];
  allowedRoleIds?: string[];
  file?: File;
  url?: string;
}

function kindToMediaKind(kind: AssetKind): IMediaUploadInput["kind"] {
  return kind === "link" ? "document" : kind; // link never uploads
}

export function useAssetLibraryAdmin() {
  const provider = useAssetLibraryProvider();
  const media = useMediaStorageProvider();
  const qc = useQueryClient();
  const [isUploading, setUploading] = useState(false);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["quick-send", "assets"] });
  }, [qc]);

  const uploadFile = useCallback(
    async (file: File): Promise<{ mediaAssetId: ID; storageRef: string }> => {
      const storeId = getCurrentContext().currentStoreId;
      if (!storeId) throw new Error("Loja ativa não resolvida");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("too-large");
      const kind: IMediaUploadInput["kind"] = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "document";
      const uploaded = await media.upload({
        kind,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        fileName: file.name,
        authorType: "seller",
        direction: "out",
        file,
        storeId,
      } as IMediaUploadInput);
      return { mediaAssetId: uploaded.id, storageRef: uploaded.storageRef };
    },
    [media],
  );

  const createAsset = useCallback(
    async (input: IAssetCreateInput): Promise<IAssetLibraryItem> => {
      const storeId = getCurrentContext().currentStoreId;
      if (!storeId) throw new Error("Loja ativa não resolvida");
      const sellerId = getCurrentContext().user?.id ?? "system";
      setUploading(!!input.file);
      try {
        let storageRef: string | undefined;
        let mediaAssetId: ID | undefined;
        if (input.file) {
          const up = await uploadFile(input.file);
          storageRef = up.storageRef;
          mediaAssetId = up.mediaAssetId;
        }
        const created = await provider.create({
          division: input.division,
          title: input.title,
          category: input.category,
          brand: input.brand,
          productLine: input.productLine,
          kind: input.kind,
          storageRef,
          mediaAssetId,
          url: input.url,
          version: 1,
          status: "draft",
          sensitivity: input.sensitivity,
          allowedRoleIds: input.allowedRoleIds,
          createdBy: sellerId,
          // store-scoped supabase create needs the active store threaded in
          storeId,
        } as Parameters<typeof provider.create>[0]);
        invalidate();
        return created;
      } finally {
        setUploading(false);
      }
    },
    [provider, uploadFile, invalidate],
  );

  const updateAsset = useCallback(
    async (id: ID, patch: Partial<IAssetLibraryItem>) => {
      const r = await provider.update(id, patch);
      invalidate();
      return r;
    },
    [provider, invalidate],
  );

  const newVersion = useCallback(
    async (id: ID, source: { file?: File; url?: string }) => {
      setUploading(!!source.file);
      try {
        let storageRef: string | undefined = source.url ? undefined : undefined;
        let url: string | undefined = source.url;
        if (source.file) {
          const up = await uploadFile(source.file);
          storageRef = up.storageRef;
        }
        const r = await provider.bumpVersion(id, { storageRef, url });
        invalidate();
        return r;
      } finally {
        setUploading(false);
      }
    },
    [provider, uploadFile, invalidate],
  );

  const setPublished = useCallback(
    async (id: ID, published: boolean) => {
      const r = published ? await provider.publish(id) : await provider.unpublish(id);
      invalidate();
      return r;
    },
    [provider, invalidate],
  );

  const setSensitive = useCallback(
    async (id: ID, sensitive: boolean) => {
      const r = await provider.update(id, { sensitivity: sensitive ? "sensitive" : "normal" });
      invalidate();
      return r;
    },
    [provider, invalidate],
  );

  const deleteAsset = useCallback(
    async (id: ID) => {
      const r = await provider.delete(id);
      invalidate();
      return r;
    },
    [provider, invalidate],
  );

  const resolvePreviewUrl = useCallback(
    async (item: IAssetLibraryItem): Promise<string | null> => {
      if (item.kind === "link") return item.url ?? null;
      if (!item.mediaAssetId) return null;
      if (getActiveDataSource() !== "supabase") return null; // mock: no real bytes
      try {
        return await media.getSignedUrl(item.mediaAssetId);
      } catch {
        return null;
      }
    },
    [media],
  );

  return {
    createAsset, updateAsset, newVersion, setPublished, setSensitive,
    deleteAsset, resolvePreviewUrl, isUploading,
  };
}
```

- [ ] **Step 2: Type-check do arquivo novo (delta)**

Run: `bunx tsc --noEmit 2>&1 | grep useAssetLibraryAdmin || echo "no new type errors in file"`
Expected: "no new type errors in file".

- [ ] **Step 3: Build + commit**

```bash
git add src/features/quick-send/hooks/useAssetLibraryAdmin.ts
git commit -m "feat(quick-send): add useAssetLibraryAdmin (mutations + upload + preview url)"
```

---

### Task 6: `RoleMultiSelect` (seletor de papéis para `allowedRoleIds`)

**Files:**
- Create: `src/features/quick-send/components/library-admin/RoleMultiSelect.tsx`

**Interfaces:**
- Consumes: `useRolesProvider().list(): Promise<IRole[]>` (de `@/providers/data`); `IRole` tem `{ id, slug, name, isSystem }`. shadcn `Command`/`Popover`/`Badge`.
- Produces:
  ```ts
  interface IRoleMultiSelectProps {
    value: string[];               // role ids (allowedRoleIds)
    onChange: (ids: string[]) => void;
    disabled?: boolean;
  }
  ```

- [ ] **Step 1: Implementar o componente**

Carregar os papéis com `useQuery(["roles","list"], () => useRolesProvider().list())`. Renderizar um `Popover` com `Command` (busca + lista de papéis com checkbox por `role.id`/`role.name`); os selecionados viram `Badge` removíveis acima do trigger. `value`/`onChange` controlados. Texto de ajuda: `QUICK_SEND_STRINGS.library.rolesHint`.

> Modelo: seguir o padrão de combobox `Command`+`Popover` já usado no projeto (ex.: qualquer multiselect existente sob `src/features/rbac/` ou `cmdk`). `allowedRoleIds` guarda **IDs de role** (`role.id`), não `RoleName`.

- [ ] **Step 2: Build (sem erros de tipo no arquivo)**

Run: `bun run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/quick-send/components/library-admin/RoleMultiSelect.tsx
git commit -m "feat(quick-send): add RoleMultiSelect for per-asset RBAC"
```

---

### Task 7: `AssetManageCard` (card de gestão)

**Files:**
- Create: `src/features/quick-send/components/library-admin/AssetManageCard.tsx`

**Interfaces:**
- Consumes: `IAssetLibraryItem`; `isSensitiveAsset` (de `../../engine/assetSensitivity`); `QUICK_SEND_STRINGS`; shadcn `DropdownMenu`, `Badge`, `Icon`.
- Produces:
  ```ts
  interface IAssetManageCardProps {
    item: IAssetLibraryItem;
    isFavorite: boolean;
    onPreview: () => void;
    onEdit: () => void;
    onNewVersion: () => void;
    onTogglePublish: () => void;
    onToggleSensitive: () => void;
    onDelete: () => void;
    onToggleFavorite: () => void;
    busy?: boolean;
  }
  ```

- [ ] **Step 1: Implementar o card**

Estrutura (NÃO reusar `AssetGridCard`, que bloqueia draft/archived por regra de envio):
- Thumbnail por tipo: `CATEGORY`/`kind` → ícone-fallback (`mdi:file-document-outline` documento, `mdi:play-circle-outline` vídeo, `mdi:image-outline` imagem, `mdi:link-variant` link). Clique no thumbnail/título → `onPreview()`.
- Badges sobre o thumbnail: status (`published`→`bg-success/...`, `draft`→`bg-warning/...`, `archived`→neutro), `🔒` quando `isSensitiveAsset(item)`, `v{item.version}` (mono).
- Rodapé: título (truncado) + `categoria · marca`.
- Botão favoritar (estrela) + menu `⋮` (`DropdownMenu`) com: Pré-visualizar, Editar, Nova versão, Publicar/Despublicar, Marcar/Desmarcar sensível, Excluir. Todas chamam os callbacks. `busy` desabilita as ações.
- `cursor-pointer`, foco visível, transições 150–300 ms em cor/opacidade. `aria-label` nos ícone-botões.

- [ ] **Step 2: Build + commit**

```bash
git add src/features/quick-send/components/library-admin/AssetManageCard.tsx
git commit -m "feat(quick-send): add AssetManageCard (management-mode card)"
```

---

### Task 8: `AssetFormSheet` (criar / editar / nova versão)

**Files:**
- Create: `src/features/quick-send/components/library-admin/AssetFormSheet.tsx`

**Interfaces:**
- Consumes: `useAssetLibraryAdmin` (Task 5), `RoleMultiSelect` (Task 6), `isSensitiveAsset`; shadcn `Sheet`, `Input`, `Textarea`, `Select`, `Toggle`/`Switch`, `Button`, `Progress`; `react-hook-form`+`zod`; `QUICK_SEND_STRINGS`; tipos `AssetCategory`/`AssetKind`.
- Produces:
  ```ts
  type AssetFormMode = "create" | "edit" | "newVersion";
  interface IAssetFormSheetProps {
    open: boolean;
    mode: AssetFormMode;
    asset?: IAssetLibraryItem;     // required for edit/newVersion
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;           // caller refetches/closes
  }
  ```

- [ ] **Step 1: Implementar o sheet**

- Segmented **Arquivo | Link** no topo (modos `create`/`newVersion`). Arquivo: `<input type=file hidden>` acionado por botão + área de drop opcional; `accept` por kind (`.pdf,.png,.jpg,.jpeg,.mp4,.webm`); mostrar nome + tamanho; barra de `Progress` enquanto `isUploading`. Link: `Input` URL (validar `https?://` via zod).
- `mode==='create'|'edit'`: campos título, categoria (`Select` de `AssetCategory`), marca, linha, divisão (`Select`, default `parts`), kind; toggle sensível (desabilitado e marcado quando `category==='tabela_preco'`, com texto `priceTableAlwaysSensitive`); `RoleMultiSelect` para `allowedRoleIds`.
- `mode==='newVersion'`: oculta metadados; só a fonte (Arquivo|Link) + botão "Salvar nova versão" → `newVersion(asset.id, { file | url })`.
- `mode==='create'` → `createAsset(input)`. `mode==='edit'` → `updateAsset(asset.id, patch)` (sem trocar arquivo). Toasts de sucesso/erro (`saveError`, `uploadTooLarge`); botão `disabled` durante async; ao concluir, `onSaved()` e fecha.
- Pré-preencher os campos a partir de `asset` em `edit`.

- [ ] **Step 2: Build + commit**

```bash
git add src/features/quick-send/components/library-admin/AssetFormSheet.tsx
git commit -m "feat(quick-send): add AssetFormSheet (create/edit/newVersion + upload)"
```

---

### Task 9: `AssetPreviewDialog` (lightbox de ativo)

**Files:**
- Create: `src/features/quick-send/components/library-admin/AssetPreviewDialog.tsx`

**Interfaces:**
- Consumes: `useAssetLibraryAdmin().resolvePreviewUrl` (Task 5); shadcn `Dialog`; `IAssetLibraryItem`.
- Produces:
  ```ts
  interface IAssetPreviewDialogProps {
    open: boolean;
    item: IAssetLibraryItem | null;
    onOpenChange: (open: boolean) => void;
  }
  ```

- [ ] **Step 1: Implementar**

`Dialog` quase-fullscreen. Ao abrir, `resolvePreviewUrl(item)` (signed URL 5 min — re-resolver a cada abertura, **não** cachear a URL). Render por `item.kind`:
- `image` → `<img src={url} alt={item.title} />` com `object-contain`.
- `video` → `<video src={url} controls />`.
- `document` (PDF) → `<iframe src={url} title={item.title} />` (embed; **construção nova, sem precedente** — usar `<iframe>` simples). Botão "Abrir" como fallback.
- `link` → card com a URL + botão "Abrir link" (`item.url`, target `_blank` `rel="noopener"`).
- Estado de carregando (skeleton) enquanto a URL resolve; estado de erro/`null` (mock ou falha) → mensagem "Pré-visualização indisponível neste modo" + (se houver) botão abrir.
- `Esc` fecha (default do `Dialog`); aside com metadados (categoria/marca/linha/`v{n}`/sensível).

> Não usar `useResolvedMediaUrl` (acoplado ao provider de mensagens). `MediaViewerDialog` serve só de referência visual de `<img>/<video>`.

- [ ] **Step 2: Build + commit**

```bash
git add src/features/quick-send/components/library-admin/AssetPreviewDialog.tsx
git commit -m "feat(quick-send): add AssetPreviewDialog (image/PDF/video/link preview)"
```

---

### Task 10: `AssetLibraryFilters` (barra de filtros)

**Files:**
- Create: `src/features/quick-send/components/library-admin/AssetLibraryFilters.tsx`

**Interfaces:**
- Consumes: `AssetCategory`/`AssetStatus`; lista de marcas/linhas (derivada dos itens carregados ou constantes); shadcn `Select`/`Toggle`/`Badge`; `QUICK_SEND_STRINGS`.
- Produces:
  ```ts
  interface IAssetLibraryFiltersValue {
    category?: AssetCategory;
    brand?: string;
    productLine?: string;
    status?: AssetStatus;
    sensitiveOnly?: boolean;
  }
  interface IAssetLibraryFiltersProps {
    value: IAssetLibraryFiltersValue;
    brands: string[];
    productLines: string[];
    onChange: (next: IAssetLibraryFiltersValue) => void;
  }
  ```

- [ ] **Step 1: Implementar**

Chips/Selects para Categoria · Marca · Linha · Status + `Toggle` "Sensível". Contador de filtros ativos + botão "Limpar filtros" (`clearFilters`). Modelo: `src/features/media/components/MediaFilters.tsx` (re-tipado).

- [ ] **Step 2: Build + commit**

```bash
git add src/features/quick-send/components/library-admin/AssetLibraryFilters.tsx
git commit -m "feat(quick-send): add AssetLibraryFilters bar"
```

---

### Task 11: `AssetLibraryManagerPage` (grid + busca + montagem)

**Files:**
- Create: `src/features/quick-send/components/library-admin/AssetLibraryManagerPage.tsx`
- Modify: `src/features/quick-send/components/library-admin/LibraryManagerPage.tsx` (aba "Ativos" passa a renderizar `AssetLibraryManagerPage`)

**Interfaces:**
- Consumes: `useAssetLibrary` (leitura/filtro/favoritos — Task ref existente), `useAssetLibraryAdmin` (Task 5), `AssetLibraryFilters` (10), `AssetManageCard` (7), `AssetFormSheet` (8), `AssetPreviewDialog` (9); shadcn `Input`/`AlertDialog`; `useDebounce`.
- Produces: a aba "Ativos" completa. `getCurrentContext().user?.id` como `sellerId` para favoritos (consistente com `useAssetLibrary`).

- [ ] **Step 1: Implementar a página**

- Cabeçalho de seção (`h1` + descrição) — **dentro** do conteúdo do `SettingsLayout` (sem faixa glass full).
- Barra sticky: busca dinâmica (replicar `CatalogHeader`: `max-w-sm↔max-w-2xl`, atalho `/`, `kbd`, `Escape`, debounce 300 ms via `useDebounce`) + botão **"Novo ativo"** (abre `AssetFormSheet` mode=create). **Sem** alternador grade⇄lista (Fase 2).
- `AssetLibraryFilters` ligado a `useAssetLibrary({ category, brand, productLine, query, sensitiveOnly })` — categoria/marca/linha/busca via provider; `sensitiveOnly` aplicado client-side com `filterAssets` (Task 2); `status` via `provider.list` (re-fetch ao mudar o chip).
- Grid de `AssetManageCard` (responsivo `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`). Callbacks ligados ao `useAssetLibraryAdmin`: editar/nova versão abrem `AssetFormSheet`; preview abre `AssetPreviewDialog`; publicar/sensível/favoritar/excluir chamam o hook (excluir via `AlertDialog` com `deleteAssetTitle`/`deleteAssetDesc`).
- Estados: vazio (CTA "Novo ativo"), carregando (skeleton de cards), erro (`role="alert"` + "Tentar de novo").

- [ ] **Step 2: Ligar na aba "Ativos"**

Em `LibraryManagerPage.tsx`, substituir o conteúdo atual da `TabsContent value="assets"` por `<AssetLibraryManagerPage />`. Manter as abas "Respostas rápidas" (snippets) e "Uso" por enquanto (a aba snippets é removida em P2 Task 17).

- [ ] **Step 3: Exportar no barrel**

Em `src/features/quick-send/index.ts`, exportar `AssetLibraryManagerPage` (e os componentes públicos que precisem ser referenciados pela rota).

- [ ] **Step 4: Build + type-check delta + commit**

Run: `bun run build && bun run test`
Expected: OK / testes verdes.

```bash
git add src/features/quick-send/components/library-admin/AssetLibraryManagerPage.tsx src/features/quick-send/components/library-admin/LibraryManagerPage.tsx src/features/quick-send/index.ts
git commit -m "feat(quick-send): asset library management screen (grid + filters + CRUD)"
```

> Verificação manual (dono): criar ativo por upload (preview real) e por link; editar; nova versão; publicar; sensível; papéis; excluir; favoritar; filtros + busca `/`.

---

## Fase P2 — Tela B: Respostas rápidas

### Task 12: Engine `placeholderVocabulary` (vocabulário + contexto de exemplo)

**Files:**
- Create: `src/features/quick-send/engine/placeholderVocabulary.ts`
- Test: `src/features/quick-send/engine/placeholderVocabulary.test.ts`

**Interfaces:**
- Consumes: `IPlaceholderContext` de `./placeholderResolver`.
- Produces:
  ```ts
  export const PLACEHOLDER_KEYS: readonly string[]; // ["nome","loja","vendedor","peca","prazo"]
  export function buildSampleContext(opts?: { loja?: string; vendedor?: string }): IPlaceholderContext;
  ```

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { PLACEHOLDER_KEYS, buildSampleContext } from "./placeholderVocabulary";
import { resolvePlaceholders } from "./placeholderResolver";

it("canonical vocabulary covers nome/loja/vendedor/peca/prazo", () => {
  expect([...PLACEHOLDER_KEYS]).toEqual(["nome", "loja", "vendedor", "peca", "prazo"]);
});

it("buildSampleContext resolves every canonical placeholder (no gaps)", () => {
  const ctx = buildSampleContext({ loja: "GALLO Matriz", vendedor: "Ana" });
  const body = "Olá {{nome}}, da {{loja}} fala {{vendedor}}: {{peca}} em {{prazo}}.";
  const { resolved, gaps } = resolvePlaceholders(body, ctx);
  expect(gaps).toEqual([]);
  expect(resolved).toContain("GALLO Matriz");
  expect(resolved).toContain("Ana");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- placeholderVocabulary`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
import type { IPlaceholderContext } from "./placeholderResolver";

/** Canonical placeholder vocabulary (D3). Order drives the chip row. */
export const PLACEHOLDER_KEYS = ["nome", "loja", "vendedor", "peca", "prazo"] as const;

/** Illustrative example context for the live preview (NOT real send data). */
export function buildSampleContext(opts?: { loja?: string; vendedor?: string }): IPlaceholderContext {
  return {
    nome: "Carlos",
    loja: opts?.loja ?? "GALLO Matriz",
    vendedor: opts?.vendedor ?? "Vendedor",
    peca: "pastilha de freio",
    prazo: "3 dias úteis",
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test -- placeholderVocabulary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/quick-send/engine/placeholderVocabulary.ts src/features/quick-send/engine/placeholderVocabulary.test.ts
git commit -m "feat(quick-send): add canonical placeholder vocabulary + sample context"
```

---

### Task 13: i18n — strings de respostas rápidas

**Files:**
- Modify: `src/features/quick-send/i18n/pt-BR.ts` (novo grupo `quickReplies` — **append-only**)

- [ ] **Step 1: Adicionar o grupo**

```ts
  quickReplies: {
    pageTitle: "Respostas rápidas",
    pageDesc: "Crie respostas com atalho /xxx para usar no atendimento.",
    tabMine: "Minhas",
    tabStore: "Da loja",
    search: "Buscar por atalho, título ou texto…",
    newReply: "Nova resposta",
    shortcut: "Atalho",
    title: "Título",
    body: "Mensagem",
    save: "Salvar",
    create: "Criar",
    cancel: "Cancelar",
    edit: "Editar",
    delete: "Excluir",
    duplicate: "Duplicar para as minhas",
    lockedHint: "Respostas da loja são editadas por Owner/Gestor.",
    previewTitle: "Prévia",
    insertPlaceholder: "Inserir variável",
    shortcutInvalid: "O atalho deve começar com / e não pode ter espaços.",
    shortcutCollision: (sc: string) => `Já existe uma resposta com o atalho ${sc}.`,
    missingFields: "Preencha atalho, título e mensagem.",
    saved: "Resposta salva.",
    deleted: "Resposta excluída.",
    duplicated: "Resposta duplicada para as suas.",
    saveError: "Não foi possível salvar. Tente de novo.",
    deleteTitle: "Excluir resposta",
    deleteDesc: (title: string) => `Excluir “${title}”? Esta ação não pode ser desfeita.`,
    emptyMine: "Você ainda não tem respostas. Crie a primeira.",
    emptyStore: "Nenhuma resposta compartilhada da loja.",
  },
```

- [ ] **Step 2: Build + commit**

```bash
git add src/features/quick-send/i18n/pt-BR.ts
git commit -m "feat(quick-send): add pt-BR strings for quick replies screen"
```

---

### Task 14: Hook `useQuickReplyAdmin` (partição + mutations)

**Files:**
- Create: `src/features/quick-send/hooks/useQuickReplyAdmin.ts`

**Interfaces:**
- Consumes: `useQuickReplyProvider()`; `useAuth()` (`currentUser.sellerId`, `userRole`/`hasRole`); `getCurrentContext().currentStoreId`; `useQuery`/`useQueryClient`; `IQuickReply`.
- Produces:
  ```ts
  interface IUseQuickReplyAdmin {
    mine: IQuickReply[];
    store: IQuickReply[];
    isLoading: boolean;
    isError: boolean;
    canEditStore: boolean;            // Owner/Gestor
    create(input: { shortcut: string; title: string; body: string; scope: "private" | "shared" }): Promise<void>;
    update(id: ID, patch: Partial<IQuickReply>): Promise<void>;
    remove(id: ID): Promise<void>;
    duplicateToMine(source: IQuickReply): Promise<void>;
  }
  ```

- [ ] **Step 1: Implementar**

```ts
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IQuickReply } from "@/shared/types";
import { useQuickReplyProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";

export function useQuickReplyAdmin() {
  const provider = useQuickReplyProvider();
  const qc = useQueryClient();
  const { currentUser, userRole } = useAuth();
  const sellerId = currentUser?.sellerId ?? "";          // REAL sellerId, not profile id
  const canEditStore = userRole === "Owner" || userRole === "Gestor";

  const key = ["quick-send", "replies-admin", sellerId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => provider.list({ sellerId }),
  });
  const all = q.data ?? [];
  const mine = all.filter((r) => r.scope === "private" && r.ownerId === sellerId);
  const store = all.filter((r) => r.scope === "shared");

  const invalidate = useCallback(() => void qc.invalidateQueries({ queryKey: key }), [qc, key]);

  const create = useCallback(
    async (input: { shortcut: string; title: string; body: string; scope: "private" | "shared" }) => {
      const storeId = getCurrentContext().currentStoreId;
      await provider.create({
        shortcut: input.shortcut, title: input.title, body: input.body,
        scope: input.scope, ownerId: sellerId, storeId,
      } as Parameters<typeof provider.create>[0]);
      invalidate();
    },
    [provider, sellerId, invalidate],
  );

  const update = useCallback(async (id: ID, patch: Partial<IQuickReply>) => {
    await provider.update(id, patch); invalidate();
  }, [provider, invalidate]);

  const remove = useCallback(async (id: ID) => {
    await provider.delete(id); invalidate();
  }, [provider, invalidate]);

  const duplicateToMine = useCallback(async (source: IQuickReply) => {
    const storeId = getCurrentContext().currentStoreId;
    await provider.create({
      shortcut: source.shortcut, title: source.title, body: source.body,
      scope: "private", ownerId: sellerId, storeId,
    } as Parameters<typeof provider.create>[0]);
    invalidate();
  }, [provider, sellerId, invalidate]);

  return {
    mine, store, isLoading: q.isLoading, isError: q.isError, canEditStore,
    create, update, remove, duplicateToMine,
  };
}
```

- [ ] **Step 2: Type-check delta + commit**

Run: `bunx tsc --noEmit 2>&1 | grep useQuickReplyAdmin || echo ok`
Expected: ok.

```bash
git add src/features/quick-send/hooks/useQuickReplyAdmin.ts
git commit -m "feat(quick-send): add useQuickReplyAdmin (mine/store partition + mutations)"
```

---

### Task 15: `QuickReplyPreviewBubble` + `QuickReplyEditor`

**Files:**
- Create: `src/features/quick-send/components/library-admin/QuickReplyPreviewBubble.tsx`
- Create: `src/features/quick-send/components/library-admin/QuickReplyEditor.tsx`

**Interfaces:**
- Consumes: `resolvePlaceholders` (`../../engine/placeholderResolver`), `PLACEHOLDER_KEYS`/`buildSampleContext` (Task 12), `SnippetField` (destaque); shadcn `Input`/`Textarea`/`Button`/`Badge`; `useAuth` (nome do vendedor / loja para o sample); `QUICK_SEND_STRINGS.quickReplies`.
- Produces:
  ```ts
  interface IQuickReplyPreviewBubbleProps { body: string; }   // renders resolvePlaceholders(body, buildSampleContext())
  interface IQuickReplyEditorProps {
    initial?: { shortcut: string; title: string; body: string };
    onSubmit: (v: { shortcut: string; title: string; body: string }) => Promise<void> | void;
    onCancel?: () => void;
    existingShortcuts: string[];   // visible set (mine + store) for collision warning
    submitLabel: string;
  }
  ```

- [ ] **Step 1: `QuickReplyPreviewBubble`**

Renderiza um balão estilo WhatsApp (outbound): `bg-success/...`, alinhado à direita, `resolvePlaceholders(body, buildSampleContext({ loja, vendedor }))`. Sublinhar (dotted) os trechos que vieram de placeholder (opcional). Hora fictícia + check duplo. Texto "Prévia" acima (`previewTitle`). Nota de que os valores são exemplos.

- [ ] **Step 2: `QuickReplyEditor`**

- Campos: atalho (mono; validação: começa com `/`, sem espaço → `shortcutInvalid`), título, corpo (`Textarea` com `SnippetField` por baixo para pintar `{{...}}`).
- **Chips de placeholder**: `PLACEHOLDER_KEYS.map(...)` → `Badge` clicável que insere `{{key}}` na posição do cursor do corpo.
- **Aviso de colisão (não bloqueante):** se `existingShortcuts` (Minhas + Da loja, normalizado) contém o atalho digitado, mostrar `shortcutCollision(sc)` em tom de aviso.
- Prévia ao vivo: `<QuickReplyPreviewBubble body={body} />` ao lado/abaixo.
- Botão submit (`submitLabel`) desabilitado se faltar atalho/título/corpo (`missingFields`); chama `onSubmit`. `onCancel` opcional.

- [ ] **Step 3: Build + commit**

```bash
git add src/features/quick-send/components/library-admin/QuickReplyPreviewBubble.tsx src/features/quick-send/components/library-admin/QuickReplyEditor.tsx
git commit -m "feat(quick-send): add quick reply editor with chips + live preview bubble"
```

---

### Task 16: `QuickRepliesPage` + rota + item de menu

**Files:**
- Create: `src/features/quick-send/components/library-admin/QuickRepliesPage.tsx`
- Create: `src/routes/app.configuracoes.respostas-rapidas.tsx`
- Modify: `src/features/shell/layouts/SettingsLayout.tsx` (item no grupo "Conteúdo")
- Modify: `src/features/quick-send/index.ts` (export)

**Interfaces:**
- Consumes: `useQuickReplyAdmin` (14), `QuickReplyEditor`/`QuickReplyPreviewBubble` (15); shadcn `Tabs`/`Input`/`AlertDialog`/`Sheet`/`Badge`/`Icon`; `useDebounce`; `requireAuth`; `SettingsLayout`.
- Produces: rota `/app/configuracoes/respostas-rapidas`.

- [ ] **Step 1: `QuickRepliesPage`**

- `h1` "Respostas rápidas" + descrição. Segmented/`Tabs` **Minhas · Da loja** + busca dinâmica (`useDebounce`, filtra por atalho/título/corpo client-side sobre `mine`/`store`).
- Duas colunas (desktop): lista à esquerda (`QuickReplyList` inline — atalho mono + título + 1ª linha do corpo; ações por papel), editor à direita. Mobile: editor em `Sheet`.
- **Minhas:** botão "Nova resposta" (`newReply`) + editar/excluir (`AlertDialog`); `create({ ..., scope:'private' })`.
- **Da loja:** se `canEditStore` → criar/editar/excluir como shared (`scope:'shared'`); senão → itens com cadeado (`mdi:lock-outline`), sem editar/excluir, e botão **"Duplicar para as minhas"** (`duplicateToMine`). A opção "Nova resposta (Da loja)" só aparece se `canEditStore`.
- `existingShortcuts` passado ao editor = `[...mine, ...store].map(r => r.shortcut)`.
- Estados vazio/carregando/erro (`emptyMine`/`emptyStore`, skeleton, `role="alert"`).

- [ ] **Step 2: Rota**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { QuickRepliesPage } from "@/features/quick-send";

export const Route = createFileRoute("/app/configuracoes/respostas-rapidas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "SDR"]),
  component: () => (
    <SettingsLayout>
      <QuickRepliesPage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 3: Item de menu**

No grupo "Conteúdo" do `SETTINGS_GROUPS` (Task 1), adicionar após "Biblioteca de ativos":

```ts
{
  label: "Respostas rápidas",
  icon: "mdi:message-flash-outline",
  to: "/app/configuracoes/respostas-rapidas",
  roles: ["Owner", "Gestor", "Vendedor", "SDR"],
},
```

- [ ] **Step 4: Export + build**

Exportar `QuickRepliesPage` no barrel `src/features/quick-send/index.ts`. O `routeTree.gen.ts` é regenerado pelo plugin no `bun run dev`/`build` — **não** editar à mão.

Run: `bun run build && bun run test`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/features/quick-send/components/library-admin/QuickRepliesPage.tsx src/routes/app.configuracoes.respostas-rapidas.tsx src/features/shell/layouts/SettingsLayout.tsx src/features/quick-send/index.ts
git commit -m "feat(quick-send): quick replies management screen (mine/store, route, menu)"
```

> Verificação manual (dono): como vendedor — cria/edita/exclui as suas, vê Da loja com cadeado, duplica; não vê "Nova (Da loja)". Como Owner — cria/edita Da loja. Editor mostra prévia ao vivo; aviso de colisão aparece.

---

### Task 17: Remover a aba "Respostas rápidas" legada da Biblioteca

**Files:**
- Modify: `src/features/quick-send/components/library-admin/LibraryManagerPage.tsx`

**Interfaces:**
- Produces: `LibraryManagerPage` com abas apenas "Ativos" e "Uso" (a gestão de shared migrou para a Tela B). `SharedSnippetsManager` deixa de ser montado aqui (pode permanecer no repo se ainda exportado, mas sem consumidor — opcionalmente removê-lo num passo futuro).

- [ ] **Step 1: Remover a aba snippets**

Em `LibraryManagerPage.tsx`: remover o `TabsTrigger value="snippets"` e o `TabsContent value="snippets"` (que renderiza `<SharedSnippetsManager/>`) e o import correspondente. Ajustar o `defaultValue` se necessário (manter "assets").

- [ ] **Step 2: Build + lint + commit**

Run: `bun run build && bun run lint`
Expected: OK (sem import não usado).

```bash
git add src/features/quick-send/components/library-admin/LibraryManagerPage.tsx
git commit -m "refactor(quick-send): drop legacy shared-snippets tab from library (moved to quick replies screen)"
```

---

## Verificação final (após P0+P1+P2)

- [ ] `bun run test` — todos verdes (engines novos: `assetFiltering`, `placeholderVocabulary`).
- [ ] `bun run build` — OK.
- [ ] `bunx tsc --noEmit` — sem erros **novos** nos arquivos criados (cruzar com `git diff --name-status main...HEAD --diff-filter=A`).
- [ ] Revisão manual do dono (mock + supabase): critérios de aceite §11 da spec.
- [ ] Migration D2 (Task 3) aplicada em prod **após confirmação** e validada em `pg_policies`.

## Self-review (autor)

- **Cobertura da spec:** P0=§3 (grupo Conteúdo); P1=§4 (grid/filtros T11+T2+T10, card T7, criar/editar/versão T8, preview T9, RBAC T6, hook T5, i18n T4, migration D2 T3); P2=§5 (página/rota/menu T16, editor+prévia T15, hook T14, vocabulário D3 T12, i18n T13, remoção da aba T17). Critérios §11 cobertos pelas verificações manuais por task.
- **Sem placeholders:** engines e migration têm código completo + TDD; hooks têm corpo completo; componentes têm contrato de props + modelo + verificação (não "TODO").
- **Consistência de tipos:** `IAssetCreateInput`, `IUseQuickReplyAdmin`, props de `AssetFormSheet`/`AssetPreviewDialog`/`QuickReplyEditor` referenciadas de forma idêntica entre tasks; `sellerId` real em P2; `storeId` threadado em todo create/upload.
