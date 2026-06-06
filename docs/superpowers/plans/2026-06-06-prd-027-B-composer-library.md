# PRD-027 — Plano B — Composer & Biblioteca de Ativos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Estender o composer da Central de Atendimento (PRD-011) com a Biblioteca de Ativos (AssetPicker em 3 modos coexistentes), slash commands read-only, envio de ativo via PRD-026, respostas rápidas (snippets) com variáveis e card de produto — **sem regredir** nada do composer existente (texto, emoji, anexo, HSM, sugestões IA, janela 24h, copilot strip). Consome integralmente a Fundação (Plano A): tipos, engines puras, providers, mocks, RBAC, i18n namespace e os hooks de dados `useAssetLibrary`/`useQuickReplies`.

**Architecture:** Feature `src/features/quick-send/`. Este plano OWNS os hooks de composição (`useAssetPickerMode`, `useSendAsset`, `useSendProductCard`, `useQuickSendBus`) e os componentes de superfície do composer (`AssetPicker`, `AssetPickerModeSwitcher`, `AssetRow`, `AssetGridCard`, `SlashMenu`, `ComposerStagedAsset`, `SnippetField`, `ProductCardBubble`, `ProductSearchDialog`). Integra em `MessageInput.tsx` (reestrutura o menu do clipe em seções, gate condicional de slash no `handleKey`, chip staged, overlay de snippet), `ConversationPage.tsx` (monta o picker + `QuickSendBusProvider`), `MessageBubble.tsx` (ramo `[produto]`) e `conversations/i18n/pt-BR.ts` (chaves de biblioteca/produto). O envio sempre usa `useMessageSend().send(...)` (PRD-011, sem mudar assinatura) e respeita o gate de 24h (`canSendFreeText`). Arquivos viram `IMediaAsset` via `useMediaStorageProvider().upload({ direction: "out", ... })` (PRD-026); card de produto é persistido como `IMessage` outbound com marcador `[produto]<json>` em `text` (espelha `[template]`, sem mudar o schema de `IMessage`).

**Tech Stack:** React 19 + TS strict, Vite, TanStack Router (file-based; `routeTree.gen.ts` é GERADO — nunca editar à mão) + TanStack Query, Tailwind v4 + shadcn/ui (new-york), `@iconify/react` (mdi:*), `cmdk` (componente `Command`), `sonner` (toasts), `bun`. Gate de teste: `bun run build` (vite) VERDE + `vitest run` VERDE. `tsc --noEmit` tem ~315 erros pré-existentes — avalie só o DELTA do código novo.

---

## Pré-requisitos consumidos do Plano A (NÃO recriar — referenciar pelos nomes do CONTRACT)

> Todos abaixo já existem quando o Plano B começa (Plano A é mergeado antes). Importe-os; nunca redefina.

- **Tipos** (`@/shared/types`): `AssetCategory`, `AssetKind`, `AssetStatus`, `AssetSensitivity`, `IAssetLibraryItem`, `IQuickReply`, `IAssetCombo`, `IProductCardSnapshot` (definido em `productCardPayload.ts`), `ID`, `ISO8601`, `IConversation`, `IWhatsAppAccount`, `IMessage`, `IPart`, `RoleName`, `LeadTemperature`, `MessageMediaType`.
- **Engines puras** (`@/features/quick-send/engine/*`):
  - `resolvePlaceholders(text, ctx): { resolved, gaps }`, `hasUnresolved(text): boolean` (`placeholderResolver.ts`).
  - `parseSlash(value, caret): ISlashState` com `ISlashState { active; command; query }` (`slashParser.ts`).
  - `isSensitiveAsset(item): boolean`, `canSendSensitiveAsset(viewer): boolean` (`assetSensitivity.ts`).
  - `pickSendableVersion(item): IAssetLibraryItem | null` (`assetVersioning.ts`).
  - `filterAssets(items, filter): IAssetLibraryItem[]` com `IAssetFilter { category?; brand?; productLine?; query? }` (`assetFiltering.ts`).
  - `encodeProductCard(s): string`, `decodeProductCard(text): IProductCardSnapshot | null`, `priceLabel(s): string`, `hasImage(s): boolean`, `PRODUCT_CARD_MARKER = "[produto]"` (`productCardPayload.ts`).
- **Hooks de dados** (`@/features/quick-send/hooks/*`): `useAssetLibrary(filter): { items; recents; favorites; isLoading; isError; search; toggleFavorite; refetch }` e `useQuickReplies(): { replies; isLoading; findByShortcut }`.
- **Provider hooks** (`@/providers/data`): `useMediaStorageProvider()` (`.upload`, `.getSignedUrl`), `useAssetLibraryProvider()` (`.recordSend`).
- **i18n** (`@/features/quick-send/i18n/pt-BR`): `QUICK_SEND_STRINGS` com os grupos `picker`, `slash`, `snippet`, `productCard`, `library`, `errors` já criados pelo Plano A. Este plano apenas LÊ esses grupos.
- **Barrel** (`@/features/quick-send`): `index.ts` já existe (criado pelo Plano A). Este plano faz APPEND (nunca reescreve) das exportações novas.

---

## TASK B0 — Hook `useAssetPickerMode` (modo do picker persistido)

Espelha `useMediaViewMode` (PRD-026). Persiste em `localStorage` chave `gallo-assetpicker-mode`, default `"palette"`. RF-002.

**Files:**
- Create: `src/features/quick-send/hooks/useAssetPickerMode.ts`
- Test: `src/features/quick-send/hooks/__tests__/useAssetPickerMode.test.ts` (testa só o normalizador puro — sem jsdom)

### Steps

- [ ] 1. Escreva o teste do normalizador puro em `src/features/quick-send/hooks/__tests__/useAssetPickerMode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeAssetPickerMode, ASSET_PICKER_MODES } from "../useAssetPickerMode";

describe("normalizeAssetPickerMode", () => {
  it("returns the value when it is a valid mode", () => {
    expect(normalizeAssetPickerMode("grid")).toBe("grid");
    expect(normalizeAssetPickerMode("sheet")).toBe("sheet");
    expect(normalizeAssetPickerMode("palette")).toBe("palette");
  });

  it("falls back to palette for null / undefined / unknown", () => {
    expect(normalizeAssetPickerMode(null)).toBe("palette");
    expect(normalizeAssetPickerMode(undefined)).toBe("palette");
    expect(normalizeAssetPickerMode("bogus")).toBe("palette");
    expect(normalizeAssetPickerMode("")).toBe("palette");
  });

  it("exposes exactly the three coexisting modes", () => {
    expect(ASSET_PICKER_MODES).toEqual(["palette", "grid", "sheet"]);
  });
});
```

- [ ] 2. Rode `bunx vitest run src/features/quick-send/hooks/__tests__/useAssetPickerMode.test.ts` — **esperado FAIL** (módulo não existe: `Cannot find module '../useAssetPickerMode'`).

- [ ] 3. Crie `src/features/quick-send/hooks/useAssetPickerMode.ts` com a implementação completa:

```ts
// src/features/quick-send/hooks/useAssetPickerMode.ts
import { useCallback, useEffect, useState } from "react";

export const ASSET_PICKER_MODES = ["palette", "grid", "sheet"] as const;
export type AssetPickerMode = (typeof ASSET_PICKER_MODES)[number];

const STORAGE_KEY = "gallo-assetpicker-mode";
const DEFAULT_MODE: AssetPickerMode = "palette";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeAssetPickerMode(raw: string | null | undefined): AssetPickerMode {
  return ASSET_PICKER_MODES.includes(raw as AssetPickerMode)
    ? (raw as AssetPickerMode)
    : DEFAULT_MODE;
}

function read(): AssetPickerMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return normalizeAssetPickerMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persisted AssetPicker layout preference (default "palette"). Mirrors useMediaViewMode (D-2). */
export function useAssetPickerMode(): [AssetPickerMode, (mode: AssetPickerMode) => void] {
  const [mode, setMode] = useState<AssetPickerMode>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore (private mode)
    }
  }, [mode]);

  const set = useCallback((next: AssetPickerMode) => setMode(next), []);
  return [mode, set];
}
```

- [ ] 4. Rode `bunx vitest run src/features/quick-send/hooks/__tests__/useAssetPickerMode.test.ts` — **esperado PASS** (3 testes verdes).

- [ ] 5. Commit:

```
git add src/features/quick-send/hooks/useAssetPickerMode.ts src/features/quick-send/hooks/__tests__/useAssetPickerMode.test.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add useAssetPickerMode persisted picker mode (PRD-027 RF-002)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B1 — `useQuickSendBus` (bus do picker pré-filtrado + canal de pacote/combo)

Contexto pub/sub com DOIS canais (CONTRACT §C): (a) o chip do Copiloto (deferido, PRD-025) abre o picker pré-filtrado — Plano B constrói só o RECEPTOR (D-14); (b) o **canal de pacote (combo)** mantém os ativos do "Modo pacote" multi-seleção, de modo que o `AssetPicker` (em `MessageInput`) alimente o `ComboTray` (em `ConversationPage`, Plano C) sem prop-drilling (D-10). Plano B OWNS o arquivo do bus e o canal de combo (re-pinado em CONTRACT §C 2026-06-06); Plano C consome `comboItems/reorderCombo/removeFromCombo/clearCombo`.

**Files:**
- Create: `src/features/quick-send/hooks/useQuickSendBus.tsx`

### Steps

- [ ] 1. Crie `src/features/quick-send/hooks/useQuickSendBus.tsx` (extensão `.tsx` porque exporta um Provider JSX). O valor do contexto expõe AMBOS os canais exatamente como CONTRACT §C pina — picker (`openAssetPicker`/`pickerRequest`/`clearRequest`) e combo (`comboItems`/`addToCombo`/`removeFromCombo`/`reorderCombo`/`clearCombo`); `addToCombo` é dedup por id e preserva ordem:

```tsx
// src/features/quick-send/hooks/useQuickSendBus.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AssetCategory, ID, IAssetLibraryItem } from "@/shared/types";

/** A pre-filter request the Copilot chip (deferred) can push to open the picker. */
export interface IPickerRequest {
  category?: AssetCategory;
  query?: string;
  brand?: string;
}

interface IQuickSendBusValue {
  // --- Picker channel (D-14) ---
  openAssetPicker: (filter?: IPickerRequest) => void;
  pickerRequest: IPickerRequest | null;
  clearRequest: () => void;
  // --- Combo channel (D-10) — staged "Modo pacote" items, order preserved ---
  comboItems: IAssetLibraryItem[];
  addToCombo: (item: IAssetLibraryItem) => void;
  removeFromCombo: (id: ID) => void;
  reorderCombo: (assetIds: ID[]) => void;
  clearCombo: () => void;
}

const QuickSendBusContext = createContext<IQuickSendBusValue | null>(null);

/**
 * Pub/sub bus with two channels (CONTRACT §C):
 *  - picker channel (D-14): future producers (Copilot chip, PRD-025) open the
 *    AssetPicker pre-filtered; the consumer (ConversationPage) reads
 *    `pickerRequest` to open + seed the picker, then calls `clearRequest`.
 *  - combo channel (D-10): the "Modo pacote" multi-select staged items, so the
 *    AssetPicker (in MessageInput) feeds the ComboTray (in ConversationPage,
 *    Plan C) without prop-drilling. `addToCombo` dedups by id and preserves
 *    insertion order; `reorderCombo` reorders by id list.
 */
export function QuickSendBusProvider({ children }: { children: ReactNode }) {
  const [pickerRequest, setPickerRequest] = useState<IPickerRequest | null>(null);
  const [comboItems, setComboItems] = useState<IAssetLibraryItem[]>([]);

  const openAssetPicker = useCallback((filter?: IPickerRequest) => {
    setPickerRequest(filter ?? {});
  }, []);

  const clearRequest = useCallback(() => setPickerRequest(null), []);

  const addToCombo = useCallback((item: IAssetLibraryItem) => {
    setComboItems((prev) =>
      prev.some((i) => i.id === item.id) ? prev : [...prev, item],
    );
  }, []);

  const removeFromCombo = useCallback((id: ID) => {
    setComboItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const reorderCombo = useCallback((assetIds: ID[]) => {
    setComboItems((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      const next = assetIds
        .map((id) => byId.get(id))
        .filter((i): i is IAssetLibraryItem => i !== undefined);
      // Keep any items not referenced in the new order at the end (defensive).
      for (const item of prev) {
        if (!assetIds.includes(item.id)) next.push(item);
      }
      return next;
    });
  }, []);

  const clearCombo = useCallback(() => setComboItems([]), []);

  const value = useMemo<IQuickSendBusValue>(
    () => ({
      openAssetPicker,
      pickerRequest,
      clearRequest,
      comboItems,
      addToCombo,
      removeFromCombo,
      reorderCombo,
      clearCombo,
    }),
    [
      openAssetPicker,
      pickerRequest,
      clearRequest,
      comboItems,
      addToCombo,
      removeFromCombo,
      reorderCombo,
      clearCombo,
    ],
  );

  return <QuickSendBusContext.Provider value={value}>{children}</QuickSendBusContext.Provider>;
}

/**
 * Access the quick-send bus. Returns a no-op safe value when used outside the
 * provider so non-conversation surfaces don't crash.
 */
export function useQuickSendBus(): IQuickSendBusValue {
  const ctx = useContext(QuickSendBusContext);
  if (!ctx) {
    return {
      openAssetPicker: () => {},
      pickerRequest: null,
      clearRequest: () => {},
      comboItems: [],
      addToCombo: () => {},
      removeFromCombo: () => {},
      reorderCombo: () => {},
      clearCombo: () => {},
    };
  }
  return ctx;
}
```

- [ ] 2. Rode `bun run build` — **esperado: build VERDE** (nenhum consumidor ainda; arquivo só compila).

- [ ] 3. Commit:

```
git add src/features/quick-send/hooks/useQuickSendBus.tsx
git commit -m "$(cat <<'EOF'
feat(quick-send): add useQuickSendBus context for pre-filtered picker (PRD-027 D-14)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B2 — `useSendAsset` (upload PRD-026 → envio via PRD-011)

Selecionar um ativo não envia na hora; este hook é chamado quando o usuário confirma o chip staged. Faz upload do arquivo via `useMediaStorageProvider().upload({ direction: "out", ... })`, resolve `getSignedUrl`, envia via `useMessageSend().send({ text, mediaType, mediaUrl })` e registra `recordSend`. Respeita a versão publicada (`pickSendableVersion`) e o gate de sensibilidade (`canSendSensitiveAsset`). RF-005, RF-008, RF-021, D-4.

**Files:**
- Create: `src/features/quick-send/hooks/useSendAsset.ts`

### Steps

- [ ] 1. Crie `src/features/quick-send/hooks/useSendAsset.ts` com a implementação completa:

```ts
// src/features/quick-send/hooks/useSendAsset.ts
import { useCallback } from "react";
import { toast } from "sonner";
import type {
  IAssetLibraryItem,
  IConversation,
  IWhatsAppAccount,
  MessageMediaType,
} from "@/shared/types";
import { useMediaStorageProvider, useAssetLibraryProvider } from "@/providers/data";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { useAuth } from "@/features/auth/useAuth";
import { pickSendableVersion } from "../engine/assetVersioning";
import { isSensitiveAsset, canSendSensitiveAsset } from "../engine/assetSensitivity";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

/** Map an AssetKind to the media message kind accepted by useMessageSend. */
function assetKindToMediaType(item: IAssetLibraryItem): MessageMediaType {
  switch (item.kind) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "document":
    default:
      return "document";
  }
}

export interface IUseSendAssetResult {
  sendAsset: (item: IAssetLibraryItem, contextMessage?: string) => Promise<void>;
}

/**
 * Materializes an asset send (D-4):
 *  1. version gate — only `published` (pickSendableVersion) is sendable;
 *  2. sensitivity gate — sensitive asset requires Owner/Gestor;
 *  3. upload bytes via PRD-026 (direction "out") → getSignedUrl;
 *  4. dispatch via PRD-011 useMessageSend (respects the 24h window upstream);
 *  5. recordSend for recents + usage stats.
 */
export function useSendAsset(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IUseSendAssetResult {
  const media = useMediaStorageProvider();
  const library = useAssetLibraryProvider();
  const { send } = useMessageSend(conversation, whatsappAccount);
  const { currentUser } = useAuth();

  const sendAsset = useCallback(
    async (item: IAssetLibraryItem, contextMessage?: string) => {
      const sendable = pickSendableVersion(item);
      if (!sendable) {
        toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
        return;
      }
      const viewer = currentUser ? { role: currentUser.role } : null;
      if (isSensitiveAsset(sendable) && !canSendSensitiveAsset(viewer)) {
        toast.error(QUICK_SEND_STRINGS.library.noPermission);
        return;
      }

      try {
        const text = (contextMessage ?? "").trim();

        if (sendable.kind === "link") {
          // Links are sent as plain text in Plan B; rich [link] tracking lands in Plan C.
          const linkText = [text, sendable.url].filter(Boolean).join("\n");
          await send({ text: linkText || (sendable.url ?? sendable.title) });
        } else {
          // Materialize the file as an outbound media asset (PRD-026).
          const uploaded = await media.upload({
            kind: assetKindToMediaType(sendable) === "image" ? "image" : sendable.kind === "video" ? "video" : "document",
            mimeType:
              sendable.kind === "image"
                ? "image/jpeg"
                : sendable.kind === "video"
                  ? "video/mp4"
                  : "application/pdf",
            sizeBytes: 256_000,
            fileName: sendable.title,
            conversationId: conversation.id,
            authorType: "seller",
            direction: "out",
          });
          const mediaUrl = await media.getSignedUrl(uploaded.id);
          await send({
            text,
            mediaType: assetKindToMediaType(sendable),
            mediaUrl,
          });
        }

        if (currentUser?.id) {
          await library.recordSend(currentUser.id, sendable.id);
        }
      } catch {
        toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
      }
    },
    [conversation.id, currentUser, library, media, send],
  );

  return { sendAsset };
}
```

- [ ] 2. Rode `bun run build` — **esperado VERDE**. Se a build acusar que `QUICK_SEND_STRINGS.errors.sendFailed` / `.library.noPermission` não existem, **PARE**: isso significa que o Plano A não foi mergeado ainda — não invente as chaves, garanta o pré-requisito.

- [ ] 3. Commit:

```
git add src/features/quick-send/hooks/useSendAsset.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add useSendAsset (PRD-026 upload -> PRD-011 send) (PRD-027 RF-005)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B3 — `useSendProductCard` (snapshot + marcador `[produto]`)

Constrói `IProductCardSnapshot` a partir de um `IPart`, codifica com `encodeProductCard` e envia como `IMessage` outbound via `useMessageSend().send({ text: "[produto]<json>" })`. Snapshot no momento do envio (RF-015, D-7).

**Files:**
- Create: `src/features/quick-send/hooks/useSendProductCard.ts`

### Steps

- [ ] 1. Crie `src/features/quick-send/hooks/useSendProductCard.ts`:

```ts
// src/features/quick-send/hooks/useSendProductCard.ts
import { useCallback } from "react";
import { toast } from "sonner";
import type { IConversation, IPart, IWhatsAppAccount } from "@/shared/types";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { encodeProductCard, type IProductCardSnapshot } from "../engine/productCardPayload";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

/** Stock label + severity token derived from availability vs minimum (D-7). */
function stockOf(part: IPart): { label: string; severity: IProductCardSnapshot["stockSeverity"] } {
  if (part.stockAvailable <= 0) {
    return { label: QUICK_SEND_STRINGS.productCard.stockCritical, severity: "critical" };
  }
  if (part.stockAvailable <= part.stockMinimum) {
    return { label: QUICK_SEND_STRINGS.productCard.stockWarning, severity: "warning" };
  }
  return { label: QUICK_SEND_STRINGS.productCard.stockOk, severity: "ok" };
}

/** Build a point-in-time snapshot of a part for the product card bubble (RF-015). */
export function buildProductSnapshot(part: IPart): IProductCardSnapshot {
  const stock = stockOf(part);
  return {
    id: part.id,
    name: part.name,
    oem: part.oemCodes[0],
    equivalence: part.crossReferences?.[0]
      ? `${part.crossReferences[0].brand} ${part.crossReferences[0].code}`
      : undefined,
    stockLabel: stock.label,
    stockSeverity: stock.severity,
    price: part.unitPrice > 0 ? part.unitPrice : undefined,
    imageRef: part.imageUrl,
  };
}

export interface IUseSendProductCardResult {
  sendProductCard: (part: IPart, contextMessage?: string) => Promise<void>;
}

export function useSendProductCard(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IUseSendProductCardResult {
  const { send } = useMessageSend(conversation, whatsappAccount);

  const sendProductCard = useCallback(
    async (part: IPart, contextMessage?: string) => {
      try {
        const snapshot = buildProductSnapshot(part);
        const marker = encodeProductCard(snapshot);
        const context = (contextMessage ?? "").trim();
        // The card marker is the payload; an optional context note precedes it
        // as a separate plain message so the marker text stays parseable.
        if (context) {
          await send({ text: context });
        }
        await send({ text: marker });
      } catch {
        toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
      }
    },
    [send],
  );

  return { sendProductCard };
}
```

- [ ] 2. Rode `bun run build` — **esperado VERDE**. Se `QUICK_SEND_STRINGS.productCard.stockOk/Warning/Critical` não existirem, o Plano A não está mergeado — pare e garanta o pré-requisito.

- [ ] 3. Commit:

```
git add src/features/quick-send/hooks/useSendProductCard.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add useSendProductCard with [produto] marker snapshot (PRD-027 RF-015)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B4 — `AssetPickerModeSwitcher` (switcher palette/grid/sheet)

Segmented control espelhando `MediaViewSwitcher`. RF-002, D-2.

**Files:**
- Create: `src/features/quick-send/components/AssetPickerModeSwitcher.tsx`

### Steps

- [ ] 1. Crie `src/features/quick-send/components/AssetPickerModeSwitcher.tsx`:

```tsx
// src/features/quick-send/components/AssetPickerModeSwitcher.tsx
import { Icon } from "@/components/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AssetPickerMode } from "../hooks/useAssetPickerMode";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IAssetPickerModeSwitcherProps {
  mode: AssetPickerMode;
  onChange: (m: AssetPickerMode) => void;
  className?: string;
}

const MODES: { value: AssetPickerMode; icon: string; label: string }[] = [
  { value: "palette", icon: "mdi:console-line", label: QUICK_SEND_STRINGS.picker.modePalette },
  { value: "grid", icon: "mdi:view-grid-outline", label: QUICK_SEND_STRINGS.picker.modeGrid },
  { value: "sheet", icon: "mdi:dock-right", label: QUICK_SEND_STRINGS.picker.modeSheet },
];

/** Segmented control switching the AssetPicker layout. Preference persisted upstream (D-2). */
export function AssetPickerModeSwitcher({ mode, onChange, className }: IAssetPickerModeSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onChange(v as AssetPickerMode)}
      className={cn("rounded-lg bg-muted/40 p-1", className)}
      aria-label={QUICK_SEND_STRINGS.picker.title}
    >
      {MODES.map((m) => (
        <Tooltip key={m.value}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value={m.value}
              aria-label={m.label}
              className={cn(
                "h-8 w-8 rounded-md text-muted-foreground",
                "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Icon icon={m.icon} size={18} />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{m.label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] 2. Rode `bun run build` — **esperado VERDE**.

- [ ] 3. Commit:

```
git add src/features/quick-send/components/AssetPickerModeSwitcher.tsx
git commit -m "$(cat <<'EOF'
feat(quick-send): add AssetPickerModeSwitcher (palette/grid/sheet) (PRD-027 D-2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B5 — `AssetRow` e `AssetGridCard` (linha e card escaneáveis)

Linhas para palette/sheet (ícone · título · marca · `vN` · ★) e cards com thumbnail para grid. Linguagem de status (draft = pílula, archived = opaco, sensível = 🔒 + borda âmbar, sem permissão = bloqueado). RF-009, D-2.

**Files:**
- Create: `src/features/quick-send/components/AssetRow.tsx`
- Create: `src/features/quick-send/components/AssetGridCard.tsx`

### Steps

- [ ] 1. Crie `src/features/quick-send/components/AssetRow.tsx`:

```tsx
// src/features/quick-send/components/AssetRow.tsx
import type { IAssetLibraryItem, RoleName } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSensitiveAsset, canSendSensitiveAsset } from "../engine/assetSensitivity";
import { pickSendableVersion } from "../engine/assetVersioning";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IAssetRowProps {
  item: IAssetLibraryItem;
  viewer: { role: RoleName } | null;
  isFavorite: boolean;
  onSelect: () => void;
  onSendNow?: () => void;
  onToggleFavorite: () => void;
}

const CATEGORY_ICON: Record<IAssetLibraryItem["category"], string> = {
  catalogo: "mdi:book-open-variant",
  ficha_tecnica: "mdi:file-document-outline",
  tabela_preco: "mdi:cash-multiple",
  garantia: "mdi:shield-check-outline",
  video: "mdi:play-circle-outline",
  link: "mdi:link-variant",
};

/** Scannable row for palette/sheet modes: icon · title · brand · vN · ★ (D-2). */
export function AssetRow({
  item,
  viewer,
  isFavorite,
  onSelect,
  onSendNow,
  onToggleFavorite,
}: IAssetRowProps) {
  const blocked = isSensitiveAsset(item) && !canSendSensitiveAsset(viewer);
  const sendable = pickSendableVersion(item) !== null;
  const isArchived = item.status === "archived";
  const isDraft = item.status === "draft";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-md px-2 py-2 text-sm",
        !blocked && sendable && "cursor-pointer hover:bg-muted/60",
        (blocked || isArchived) && "opacity-60",
      )}
      role="option"
      aria-selected={false}
      aria-disabled={blocked || !sendable}
      onClick={() => {
        if (blocked || !sendable) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (blocked || !sendable) return;
        // ⌘/Ctrl+Enter sends immediately (spec §6.2 "envia já"); plain Enter/Space stages.
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSendNow) {
          e.preventDefault();
          onSendNow();
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={blocked || !sendable ? -1 : 0}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground",
          isSensitiveAsset(item) ? "bg-amber-500/10 ring-1 ring-amber-500/40" : "bg-muted",
        )}
      >
        <Icon icon={blocked ? "mdi:lock-outline" : CATEGORY_ICON[item.category]} size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{item.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {[item.brand, item.productLine, `v${item.version}`].filter(Boolean).join(" · ")}
        </p>
      </div>

      {isDraft && (
        <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {QUICK_SEND_STRINGS.library.draft}
        </span>
      )}
      {blocked && (
        <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
          {QUICK_SEND_STRINGS.library.noPermission}
        </span>
      )}

      {!blocked && sendable && onSendNow && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden h-7 w-7 shrink-0 p-0 group-hover:inline-flex"
          aria-label={QUICK_SEND_STRINGS.productCard.sendProduct}
          onClick={(e) => {
            e.stopPropagation();
            onSendNow();
          }}
        >
          <Icon icon="mdi:send" size={14} />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0"
        aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        aria-pressed={isFavorite}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
      >
        <Icon
          icon={isFavorite ? "mdi:star" : "mdi:star-outline"}
          size={14}
          className={cn(isFavorite && "text-amber-500")}
        />
      </Button>
    </div>
  );
}
```

- [ ] 2. Crie `src/features/quick-send/components/AssetGridCard.tsx`:

```tsx
// src/features/quick-send/components/AssetGridCard.tsx
import type { IAssetLibraryItem, RoleName } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSensitiveAsset, canSendSensitiveAsset } from "../engine/assetSensitivity";
import { pickSendableVersion } from "../engine/assetVersioning";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IAssetGridCardProps {
  item: IAssetLibraryItem;
  viewer: { role: RoleName } | null;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

const CATEGORY_ICON: Record<IAssetLibraryItem["category"], string> = {
  catalogo: "mdi:book-open-variant",
  ficha_tecnica: "mdi:file-document-outline",
  tabela_preco: "mdi:cash-multiple",
  garantia: "mdi:shield-check-outline",
  video: "mdi:play-circle-outline",
  link: "mdi:link-variant",
};

/** Thumbnail card for grid mode (D-2). Falls back to a category tile (no real bytes). */
export function AssetGridCard({
  item,
  viewer,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: IAssetGridCardProps) {
  const blocked = isSensitiveAsset(item) && !canSendSensitiveAsset(viewer);
  const sendable = pickSendableVersion(item) !== null;
  const isArchived = item.status === "archived";

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border border-border bg-card",
        !blocked && sendable && "cursor-pointer hover:border-primary/40 hover:shadow-sm",
        (blocked || isArchived) && "opacity-60",
        isSensitiveAsset(item) && "ring-1 ring-amber-500/40",
      )}
      role="option"
      aria-selected={false}
      aria-disabled={blocked || !sendable}
      tabIndex={blocked || !sendable ? -1 : 0}
      onClick={() => {
        if (blocked || !sendable) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !blocked && sendable) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
        <Icon icon={blocked ? "mdi:lock-outline" : CATEGORY_ICON[item.category]} size={32} />
      </div>
      <div className="flex items-start gap-1 p-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {[item.brand, `v${item.version}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={isFavorite}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          <Icon
            icon={isFavorite ? "mdi:star" : "mdi:star-outline"}
            size={13}
            className={cn(isFavorite && "text-amber-500")}
          />
        </Button>
      </div>
      {blocked && (
        <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-medium text-white">
          {QUICK_SEND_STRINGS.library.noPermission}
        </span>
      )}
    </div>
  );
}
```

- [ ] 3. Rode `bun run build` — **esperado VERDE**.

- [ ] 4. Commit:

```
git add src/features/quick-send/components/AssetRow.tsx src/features/quick-send/components/AssetGridCard.tsx
git commit -m "$(cat <<'EOF'
feat(quick-send): add AssetRow and AssetGridCard scannable items (PRD-027 RF-009)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B6 — `AssetPicker` (3 modos coexistentes + busca + abas + filtros)

Componente central. Lê `useAssetPickerMode`, monta header com `AssetPickerModeSwitcher`, busca com debounce 300ms, abas Recentes(default)/Favoritos/Tudo, filtros categoria/marca, e renderiza linhas (palette/sheet) ou cards (grid). `Enter`/click = stage (`onStage`); **`⌘/Ctrl+Enter` numa linha + o botão inline de envio = envia já** (via `useSendAsset`, sem passar pelo chip staged — spec §6.2 "envia já" / §8 affordance inline); `Esc` = fecha. Mobile (<768px): palette/sheet → bottom sheet; grid → 2 colunas. RF-002, RF-005, RF-006, RF-009, RNF-001, RNF-004, RNF-005, D-2, D-4.

> **Send-now vs stage (não degradar):** `onSelect` → stage; `onSendNow` → envio imediato. NÃO faça `onSendNow` chamar `handleStage` (isso degradaria "envia já" para mero staging, perdendo o caminho que o spec atribui ao Plano B). O grid mantém só `onSelect` (stage) por enquanto — o affordance inline de envio vive nas linhas (palette/sheet), conforme §8; `IAssetGridCardProps` permanece sem `onSendNow` (sem divergir do CONTRACT §D).

**Files:**
- Create: `src/features/quick-send/components/AssetPicker.tsx`

### Steps

- [ ] 1. Crie `src/features/quick-send/components/AssetPicker.tsx`:

```tsx
// src/features/quick-send/components/AssetPicker.tsx
import { useEffect, useMemo, useState } from "react";
import type {
  AssetCategory,
  IAssetLibraryItem,
  IConversation,
  IWhatsAppAccount,
} from "@/shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { useAssetLibrary } from "../hooks/useAssetLibrary";
import { useAssetPickerMode } from "../hooks/useAssetPickerMode";
import { useSendAsset } from "../hooks/useSendAsset";
import { filterAssets } from "../engine/assetFiltering";
import { useQuickSendBus, type IPickerRequest } from "../hooks/useQuickSendBus";
import { Toggle } from "@/components/ui/toggle";
import { AssetPickerModeSwitcher } from "./AssetPickerModeSwitcher";
import { AssetRow } from "./AssetRow";
import { AssetGridCard } from "./AssetGridCard";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IAssetPickerProps {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFilter?: IPickerRequest;
  onStage: (item: IAssetLibraryItem) => void;
}

type PickerTab = "recents" | "favorites" | "all";

/** Debounce a string value (RNF-001: 300ms search debounce). */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

/** The Asset Library picker — 3 coexisting modes, search, tabs, filters (D-2). */
export function AssetPicker({
  conversation,
  whatsappAccount,
  open,
  onOpenChange,
  initialFilter,
  onStage,
}: IAssetPickerProps) {
  const [mode, setMode] = useAssetPickerMode();
  const { currentUser } = useAuth();
  const viewer = currentUser ? { role: currentUser.role } : null;
  // Send-now path (D-4 / spec §6.2 "⌘Enter = envia já", §8 inline send affordance):
  // the inline row button skips staging and dispatches immediately via useSendAsset.
  const { sendAsset } = useSendAsset(conversation, whatsappAccount);
  // Combo channel (D-10, CONTRACT §C/§H.2): when "Modo pacote" is on, selecting
  // an item stages it into the bus combo channel (→ ComboTray in ConversationPage,
  // Plan C) instead of the single-staged chip. Plan B OWNS this wiring.
  const { addToCombo } = useQuickSendBus();
  const [packageMode, setPackageMode] = useState(false);

  const [query, setQuery] = useState(initialFilter?.query ?? "");
  const [tab, setTab] = useState<PickerTab>("recents");
  const [category, setCategory] = useState<AssetCategory | undefined>(initialFilter?.category);
  const [brand, setBrand] = useState<string | undefined>(initialFilter?.brand);
  const debouncedQuery = useDebounced(query);

  // Seed the picker from a bus request whenever it opens with a filter.
  useEffect(() => {
    if (!open) return;
    setQuery(initialFilter?.query ?? "");
    setCategory(initialFilter?.category);
    setBrand(initialFilter?.brand);
    setTab(initialFilter?.query || initialFilter?.category || initialFilter?.brand ? "all" : "recents");
  }, [open, initialFilter]);

  const lib = useAssetLibrary({ category, brand, query: debouncedQuery });

  const source = useMemo(() => {
    if (tab === "recents") return lib.recents;
    if (tab === "favorites") return lib.favorites;
    return lib.items;
  }, [tab, lib.recents, lib.favorites, lib.items]);

  const visible = useMemo(
    () => filterAssets(source, { category, brand, query: debouncedQuery }),
    [source, category, brand, debouncedQuery],
  );

  const favoriteIds = useMemo(() => new Set(lib.favorites.map((f) => f.id)), [lib.favorites]);

  const handleStage = (item: IAssetLibraryItem) => {
    // Combo mode (D-10): accumulate into the bus combo channel and KEEP the
    // picker open for further multi-select. Single mode: stage one + close.
    if (packageMode) {
      addToCombo(item);
      return;
    }
    onStage(item);
    onOpenChange(false);
  };

  // Send-now: dispatch immediately (no staging) and close. Fires from the inline
  // row affordance and from ⌘/Ctrl+Enter on a highlighted row (spec §6.2/§8).
  const handleSendNow = (item: IAssetLibraryItem) => {
    onOpenChange(false);
    void sendAsset(item);
  };

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onOpenChange(false);
            }}
            placeholder={QUICK_SEND_STRINGS.picker.searchPlaceholder}
            className="h-9 pl-8"
            aria-label={QUICK_SEND_STRINGS.picker.searchPlaceholder}
          />
        </div>
        <Toggle
          size="sm"
          pressed={packageMode}
          onPressedChange={setPackageMode}
          aria-label={QUICK_SEND_STRINGS.combo.packageMode}
          className="h-8 gap-1.5 px-2 text-xs data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
        >
          <Icon icon="mdi:package-variant-closed" size={15} />
          <span className="hidden sm:inline">{QUICK_SEND_STRINGS.combo.packageMode}</span>
        </Toggle>
        <AssetPickerModeSwitcher mode={mode} onChange={setMode} />
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as PickerTab)}>
          <TabsList className="h-8">
            <TabsTrigger value="recents" className="text-xs">
              {QUICK_SEND_STRINGS.picker.tabRecents}
            </TabsTrigger>
            <TabsTrigger value="favorites" className="text-xs">
              {QUICK_SEND_STRINGS.picker.tabFavorites}
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              {QUICK_SEND_STRINGS.picker.tabAll}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {category && (
          <button
            type="button"
            onClick={() => setCategory(undefined)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            {category}
            <Icon icon="mdi:close" size={12} />
          </button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {lib.isError ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {QUICK_SEND_STRINGS.errors.loadAssetFailed}
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {QUICK_SEND_STRINGS.picker.emptyState}
          </p>
        ) : mode === "grid" ? (
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3" role="listbox">
            {visible.map((item) => (
              <AssetGridCard
                key={item.id}
                item={item}
                viewer={viewer}
                isFavorite={favoriteIds.has(item.id)}
                onSelect={() => handleStage(item)}
                onToggleFavorite={() => lib.toggleFavorite(item.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-1.5" role="listbox">
            {visible.map((item) => (
              <AssetRow
                key={item.id}
                item={item}
                viewer={viewer}
                isFavorite={favoriteIds.has(item.id)}
                onSelect={() => handleStage(item)}
                onSendNow={() => handleSendNow(item)}
                onToggleFavorite={() => lib.toggleFavorite(item.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  // Sheet mode (and mobile fallback for palette) → side/bottom sheet.
  if (mode === "sheet" || (mode === "palette" && isMobile())) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile() ? "bottom" : "right"}
          className={cn(
            "overflow-hidden p-0",
            isMobile() ? "h-[70vh]" : "w-full sm:max-w-md",
          )}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{QUICK_SEND_STRINGS.picker.title}</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  // palette (default) + grid → centered dialog overlay.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{QUICK_SEND_STRINGS.picker.title}</DialogTitle>
        </DialogHeader>
        <div className="h-[60vh]">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] 2. Rode `bun run build` — **esperado VERDE**. Se a build acusar `Input`/`Tabs`/`ScrollArea` ausentes, verifique os imports (`@/components/ui/input`, `@/components/ui/tabs`, `@/components/ui/scroll-area` — todos existem no projeto).

- [ ] 3. Commit:

```
git add src/features/quick-send/components/AssetPicker.tsx
git commit -m "$(cat <<'EOF'
feat(quick-send): add AssetPicker (palette/grid/sheet, tabs, filters) (PRD-027 RF-002 RF-006 RF-009)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B7 — `SlashMenu` (popover de comandos no caret)

Popover renderizado quando `parseSlash` retorna `active`. Lista comandos `/catalogo /tabela /garantia /loja` (ativos filtrados) + snippets que casam pelo shortcut. Estados vazios amigáveis + dica de barra literal. Navegação por teclado é gerida pelo `MessageInput` (Task B13), que detém o `activeIndex` e o passa como prop; aqui o componente só renderiza o highlight e expõe callbacks. RF-007, D-5.

> **Amendment de contrato (obrigatório antes de divergir):** o CONTRACT §D pinava `ISlashMenuProps` sem `activeIndex`. Como o highlight de teclado é dirigido pelo `MessageInput` que detém o índice, este plano adiciona o prop `activeIndex: number`. Conforme a regra dura do CONTRACT ("If a plan needs a different name/signature, it edits THIS file first and re-pins, never diverges silently"), o §D já foi re-pinado (linha do `SlashMenu`, marcada "re-pinned 2026-06-06 by Plan B"). Não diverja silenciosamente — o passo 1 abaixo verifica essa amendment.

**Files:**
- Modify (amendment): `docs/superpowers/plans/2026-06-06-prd-027-CONTRACT.md` (§D — re-pin de `ISlashMenuProps` com `activeIndex: number`)
- Create: `src/features/quick-send/components/SlashMenu.tsx`

### Steps

- [ ] 1. Confirme que o CONTRACT §D foi re-pinado para incluir `activeIndex: number` em `ISlashMenuProps`: rode `Grep` por `activeIndex` em `docs/superpowers/plans/2026-06-06-prd-027-CONTRACT.md` — **esperado:** a linha do `SlashMenu` contém `activeIndex: number` e a nota "re-pinned 2026-06-06 by Plan B". Se ausente, edite o §D primeiro (adicione `activeIndex: number;` ao `ISlashMenuProps` na tabela de componentes) — NUNCA diverja do contrato sem re-pinar.

- [ ] 2. Crie `src/features/quick-send/components/SlashMenu.tsx`:

```tsx
// src/features/quick-send/components/SlashMenu.tsx
import type { IAssetLibraryItem, IQuickReply } from "@/shared/types";
import type { ISlashState } from "../engine/slashParser";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface ISlashMenuProps {
  state: ISlashState;
  items: IAssetLibraryItem[];
  replies: IQuickReply[];
  /** Index of the currently highlighted entry (assets first, then replies). */
  activeIndex: number;
  onPickAsset: (item: IAssetLibraryItem) => void;
  onPickReply: (reply: IQuickReply) => void;
  onClose: () => void;
}

/**
 * Popover anchored above the textarea while a slash command is being typed.
 * Read-only: the parser owns activeness; keyboard nav is driven by MessageInput
 * (the parent updates `activeIndex` and calls the right onPick on Enter).
 */
export function SlashMenu({
  state,
  items,
  replies,
  activeIndex,
  onPickAsset,
  onPickReply,
  onClose,
}: ISlashMenuProps) {
  if (!state.active) return null;

  const total = items.length + replies.length;

  return (
    <div
      className="absolute bottom-full left-0 z-30 mb-1 max-h-64 w-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
      role="listbox"
      aria-label={QUICK_SEND_STRINGS.slash.menuLabel}
    >
      {total === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          <p>{QUICK_SEND_STRINGS.slash.emptyState}</p>
          <p className="mt-1 opacity-70">{QUICK_SEND_STRINGS.slash.literalSlashHint}</p>
        </div>
      ) : (
        <>
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={activeIndex === i}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                activeIndex === i ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                onPickAsset(item);
              }}
            >
              <Icon icon="mdi:file-send-outline" size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{item.title}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{item.brand}</span>
            </button>
          ))}
          {replies.map((reply, j) => {
            const idx = items.length + j;
            return (
              <button
                key={reply.id}
                type="button"
                role="option"
                aria-selected={activeIndex === idx}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  activeIndex === idx ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPickReply(reply);
                }}
              >
                <Icon icon="mdi:lightning-bolt-outline" size={15} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{reply.title}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {reply.shortcut}
                </span>
              </button>
            );
          })}
        </>
      )}
      <button type="button" className="sr-only" onClick={onClose}>
        {QUICK_SEND_STRINGS.slash.close}
      </button>
    </div>
  );
}
```

- [ ] 3. Adicione AGORA (no mesmo task que introduz o consumidor) as chaves i18n novas que o `SlashMenu` usa, para que o `bun run build` deste task seja genuinamente VERDE no boundary do commit. As chaves `slash.menuLabel` e `slash.close` **não** constam dos grupos enumerados em CONTRACT §J (o Plano A NÃO as garante), então este plano as cria — via APPEND, dentro do grupo `slash` já existente. Primeiro confirme que não existem (Grep `menuLabel|"close"` em `src/features/quick-send/i18n/pt-BR.ts`); se ausentes, adicione dentro do grupo `slash: { ... }` do `QUICK_SEND_STRINGS`:

```ts
  // dentro do grupo slash: {...} — chaves novas do Plano B (não enumeradas em CONTRACT §J)
  menuLabel: "Comandos rápidos",
  close: "Fechar",
```

> Se por acaso o Plano A já tiver criado uma dessas chaves com o MESMO nome, NÃO redeclare (duplicar chave no objeto literal é erro). Adicione apenas as ausentes.

- [ ] 4. Rode `bun run build` — **esperado VERDE** (o `SlashMenu` e suas chaves `slash.menuLabel`/`slash.close` existem agora).

- [ ] 5. Commit (componente + chaves no MESMO commit, mantendo o boundary verde):

```
git add src/features/quick-send/components/SlashMenu.tsx src/features/quick-send/i18n/pt-BR.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add SlashMenu popover for slash commands (PRD-027 RF-007)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B8 — `ComposerStagedAsset` (chip staged acima do textarea)

Chip do ativo selecionado com mensagem de contexto editável. `Enter` confirma (envia), `Esc`/X cancela. Espelha o ciclo digitar→olhar→Enter. RF-004, D-4.

**Files:**
- Create: `src/features/quick-send/components/ComposerStagedAsset.tsx`

### Steps

- [ ] 1. Crie `src/features/quick-send/components/ComposerStagedAsset.tsx`:

```tsx
// src/features/quick-send/components/ComposerStagedAsset.tsx
import type { IAssetLibraryItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IComposerStagedAssetProps {
  item: IAssetLibraryItem;
  contextMessage: string;
  onContextChange: (text: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

const CATEGORY_ICON: Record<IAssetLibraryItem["category"], string> = {
  catalogo: "mdi:book-open-variant",
  ficha_tecnica: "mdi:file-document-outline",
  tabela_preco: "mdi:cash-multiple",
  garantia: "mdi:shield-check-outline",
  video: "mdi:play-circle-outline",
  link: "mdi:link-variant",
};

/** Staged-asset chip above the textarea. Enter sends, Esc cancels (D-4). */
export function ComposerStagedAsset({
  item,
  contextMessage,
  onContextChange,
  onSend,
  onCancel,
}: IComposerStagedAssetProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        <Icon icon={CATEGORY_ICON[item.category]} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
        <input
          type="text"
          value={contextMessage}
          onChange={(e) => onContextChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends the staged asset; ⌘/Ctrl+Enter is an explicit "send now"
            // alias (spec §6.2/§8); Esc cancels the staging (D-4).
            if (e.key === "Enter") {
              e.preventDefault();
              onSend();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={QUICK_SEND_STRINGS.picker.contextPlaceholder}
          className="mt-0.5 w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          aria-label={QUICK_SEND_STRINGS.picker.contextPlaceholder}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1 px-2.5"
        onClick={onSend}
        aria-label={QUICK_SEND_STRINGS.picker.sendStaged}
      >
        <Icon icon="mdi:send" size={14} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onCancel}
        aria-label={QUICK_SEND_STRINGS.picker.cancelStaged}
      >
        <Icon icon="mdi:close" size={14} />
      </Button>
    </div>
  );
}
```

- [ ] 2. Adicione AGORA (no mesmo task) as chaves i18n que o `ComposerStagedAsset` usa, para que o `bun run build` deste boundary seja VERDE. As chaves `picker.contextPlaceholder`, `picker.sendStaged` e `picker.cancelStaged` **não** constam dos grupos enumerados em CONTRACT §J (o Plano A só garante `picker: title/searchPlaceholder/tabRecents/tabFavorites/tabAll/emptyState/modePalette/modeGrid/modeSheet`), então este plano as cria — via APPEND, dentro do grupo `picker` já existente. Confirme ausência (Grep `contextPlaceholder|sendStaged|cancelStaged` em `src/features/quick-send/i18n/pt-BR.ts`) e adicione as ausentes dentro de `picker: { ... }`:

```ts
  // dentro do grupo picker: {...} — chaves novas do Plano B (não enumeradas em CONTRACT §J)
  contextPlaceholder: "Adicionar uma mensagem (opcional)…",
  sendStaged: "Enviar ativo",
  cancelStaged: "Cancelar",
```

> Não redeclare nenhuma chave que o Plano A já tenha criado com o mesmo nome.

- [ ] 3. Rode `bun run build` — **esperado VERDE** (componente + chaves `picker.contextPlaceholder`/`sendStaged`/`cancelStaged` presentes).

- [ ] 4. Commit (componente + chaves no MESMO commit):

```
git add src/features/quick-send/components/ComposerStagedAsset.tsx src/features/quick-send/i18n/pt-BR.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add ComposerStagedAsset chip with editable context (PRD-027 RF-004)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B9 — `SnippetField` (overlay-sync sobre o textarea + pílulas âmbar)

Overlay posicionado atrás do textarea que destaca lacunas `{{...}}`/`[...]` não resolvidas como pílulas âmbar, com contador "N campos a preencher". A trava de envio dupla (regex no handler + botão desabilitado) vive no `MessageInput` (Task B13); aqui só renderizamos o overlay e o contador. RF-011, RF-012, D-6.

> **Alinhamento pixel-perfect (risco #1 do spec §10):** o overlay e o `<textarea>` real precisam compartilhar EXATAMENTE `padding`, `font-size` e `line-height`. Os defaults do `src/components/ui/textarea.tsx` são `px-3 py-2 text-base ... md:text-sm` (confirmado — linha 10). Tanto o overlay (aqui) quanto o `<textarea>` em `MessageInput` (Task B13 step 10) usam `px-3 py-2 text-base leading-normal md:text-sm`. Se um mudar, o outro DEVE mudar junto — qualquer divergência de padding horizontal/line-height desloca as pílulas âmbar do texto. Verificação visual em light/dark e com texto multilinha (wrap) está na checklist do B16.

**Files:**
- Create: `src/features/quick-send/components/SnippetField.tsx`

### Steps

- [ ] 1. Crie `src/features/quick-send/components/SnippetField.tsx`:

```tsx
// src/features/quick-send/components/SnippetField.tsx
import { useMemo, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface ISnippetFieldProps {
  value: string;
  gaps: string[];
  onChange: (text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

const GAP_RE = /(\{\{[^}]*\}\}|\[[^\]]*\])/g;

/**
 * Overlay-sync layer that mirrors the textarea content and renders unresolved
 * placeholders (`{{...}}` / `[...]`) as amber pills (severity-warning), without
 * replacing the native <textarea> (preserves auto-resize/paste/IME, D-6).
 *
 * The actual <textarea> is owned by MessageInput; this component renders only
 * the highlight overlay + the "N fields to fill" counter and is positioned
 * absolutely BEHIND the (transparent-text) textarea by the parent.
 */
export function SnippetField({ value, gaps, textareaRef: _textareaRef, onChange: _onChange }: ISnippetFieldProps) {
  const segments = useMemo(() => {
    const parts: { text: string; gap: boolean }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    GAP_RE.lastIndex = 0;
    while ((m = GAP_RE.exec(value)) !== null) {
      if (m.index > last) parts.push({ text: value.slice(last, m.index), gap: false });
      parts.push({ text: m[0], gap: true });
      last = m.index + m[0].length;
    }
    if (last < value.length) parts.push({ text: value.slice(last), gap: false });
    return parts;
  }, [value]);

  return (
    <>
      <div
        aria-hidden="true"
        // Padding / font-size / line-height MUST match the <textarea> in MessageInput
        // exactly (ui/textarea defaults: px-3 py-2 text-base md:text-sm) or the amber
        // pills drift off the real glyphs. Keep these classes in lock-step with the
        // textarea className in MessageInput step 10 (D-6, spec §10 top risk).
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-base leading-normal text-transparent md:text-sm"
      >
        {segments.map((seg, i) =>
          seg.gap ? (
            <mark
              key={i}
              className="rounded bg-amber-500/25 text-transparent ring-1 ring-amber-500/50"
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </div>
      {gaps.length > 0 && (
        <div
          className={cn(
            "pointer-events-none absolute -top-5 left-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300",
          )}
          role="status"
        >
          {QUICK_SEND_STRINGS.snippet.fieldsToFill(gaps.length)}
        </div>
      )}
    </>
  );
}
```

- [ ] 2. Rode `bun run build` — **esperado VERDE**. (`QUICK_SEND_STRINGS.snippet.fieldsToFill(n)` é fornecida pelo Plano A.)

- [ ] 3. Commit:

```
git add src/features/quick-send/components/SnippetField.tsx
git commit -m "$(cat <<'EOF'
feat(quick-send): add SnippetField overlay with amber gap pills (PRD-027 RF-011)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B10 — `ProductCardBubble` (bubble dedicado reusando BubbleChrome)

Detecta o marcador `[produto]` (já no `MessageBubble` na Task B14), decodifica com `decodeProductCard` e renderiza um card rico reusando `BubbleChrome unpadded`. Degradação: sem imagem → tile com ícone; sem preço → "Consultar valor"; estoque em tokens `severity`. Se o parse falhar, retorna `TextBubble`. RF-015, D-7.

**Files:**
- Create: `src/features/quick-send/components/ProductCardBubble.tsx`

### Steps

- [ ] 1. Crie `src/features/quick-send/components/ProductCardBubble.tsx`:

```tsx
// src/features/quick-send/components/ProductCardBubble.tsx
import type { IMessage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { BubbleChrome } from "@/features/conversations/components/bubbles/bubbleChrome";
import { TextBubble } from "@/features/conversations/components/bubbles/TextBubble";
import { decodeProductCard, priceLabel, hasImage } from "../engine/productCardPayload";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IProductCardBubbleProps {
  message: IMessage;
  onRetry?: () => void;
}

const SEVERITY_CLASS: Record<"ok" | "warning" | "critical", string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-destructive",
};

/** Rich product card bubble; degrades gracefully and falls back to text on parse fail (D-7). */
export function ProductCardBubble({ message, onRetry }: IProductCardBubbleProps) {
  const snapshot = decodeProductCard(message.text);
  if (!snapshot) {
    // Parse failed → degrade to a plain text bubble (RNF / risk mitigation §10).
    return <TextBubble message={message} onRetry={onRetry} />;
  }

  return (
    <BubbleChrome message={message} onRetry={onRetry} unpadded>
      <div className="w-64">
        <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
          {hasImage(snapshot) ? (
            <img
              src={snapshot.imageRef}
              alt={snapshot.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <Icon icon="mdi:cog-outline" size={36} />
          )}
        </div>
        <div className="space-y-1 px-3 py-2">
          <p className="text-sm font-semibold leading-tight text-foreground">{snapshot.name}</p>
          {snapshot.oem && (
            <p className="text-[11px] text-muted-foreground">OEM {snapshot.oem}</p>
          )}
          {snapshot.equivalence && (
            <p className="text-[11px] text-muted-foreground">≈ {snapshot.equivalence}</p>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold text-foreground">{priceLabel(snapshot)}</span>
            <span className={cn("text-[11px] font-medium", SEVERITY_CLASS[snapshot.stockSeverity])}>
              {snapshot.stockLabel}
            </span>
          </div>
          <p className="pt-0.5 text-[10px] text-muted-foreground">
            {QUICK_SEND_STRINGS.productCard.cardFooter}
          </p>
        </div>
      </div>
    </BubbleChrome>
  );
}
```

- [ ] 2. Adicione AGORA (no mesmo task) a chave i18n que o `ProductCardBubble` usa, para o boundary verde. A chave `productCard.cardFooter` **não** consta dos grupos enumerados em CONTRACT §J (o Plano A só garante `productCard: sendProduct/consultPrice/noImage/searchPlaceholder/stockOk/stockWarning/stockCritical`), então este plano a cria — via APPEND, dentro do grupo `productCard` já existente. Confirme ausência (Grep `cardFooter` em `src/features/quick-send/i18n/pt-BR.ts`) e, se ausente, adicione dentro de `productCard: { ... }`:

```ts
  // dentro do grupo productCard: {...} — chave nova do Plano B (não enumerada em CONTRACT §J)
  cardFooter: "Valores sujeitos a confirmação.",
```

> Não redeclare se o Plano A já tiver criado `productCard.cardFooter` com o mesmo nome.

- [ ] 3. Rode `bun run build` — **esperado VERDE** (componente + chave `productCard.cardFooter` presente).

- [ ] 4. Commit (componente + chave no MESMO commit):

```
git add src/features/quick-send/components/ProductCardBubble.tsx src/features/quick-send/i18n/pt-BR.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add ProductCardBubble with graceful degradation (PRD-027 RF-015)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B11 — `ProductSearchDialog` (busca no catálogo p/ enviar produto)

Dialog que busca no catálogo (`useCatalogList`) e devolve um `IPart` selecionado via `onSelect`. RF-014, D-7.

**Files:**
- Create: `src/features/quick-send/components/ProductSearchDialog.tsx`

### Steps

- [ ] 1. Crie `src/features/quick-send/components/ProductSearchDialog.tsx`:

```tsx
// src/features/quick-send/components/ProductSearchDialog.tsx
import { useMemo, useState, useEffect } from "react";
import type { IPart } from "@/shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Icon } from "@/components/Icon";
import { useCatalogList } from "@/features/catalog/hooks/useCatalogList";
import { EMPTY_FILTERS, DEFAULT_SORT, DEFAULT_PAGE_SIZE } from "@/features/catalog/utils/listFilters";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IProductSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (part: IPart) => void;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setD(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return d;
}

/** Catalog search dialog to pick a part for the product card (D-7). */
export function ProductSearchDialog({ open, onOpenChange, onSelect }: IProductSearchDialogProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const filters = useMemo(
    () => ({ ...EMPTY_FILTERS, search: debounced }),
    [debounced],
  );
  // pageSize MUST be a CatalogPageSize (25 | 50 | 100) — passing a raw literal
  // like `20` is TS2345 under strict and breaks the `bun run build` delta gate.
  const list = useCatalogList(filters, DEFAULT_SORT, 1, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-3">
          <DialogTitle className="text-sm">{QUICK_SEND_STRINGS.productCard.sendProduct}</DialogTitle>
        </DialogHeader>
        <div className="border-b border-border p-3">
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={QUICK_SEND_STRINGS.productCard.searchPlaceholder}
              className="h-9 pl-8"
              aria-label={QUICK_SEND_STRINGS.productCard.searchPlaceholder}
            />
          </div>
        </div>
        <ScrollArea className="h-72">
          {list.isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground" aria-busy="true">
              <Icon icon="mdi:loading" size={16} className="mr-1 inline animate-spin" />
            </p>
          ) : list.data.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {QUICK_SEND_STRINGS.picker.emptyState}
            </p>
          ) : (
            <div className="p-1.5">
              {list.data.map((part) => (
                <button
                  key={part.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    onSelect(part);
                    onOpenChange(false);
                  }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon icon="mdi:cog-outline" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{part.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[part.oemCodes[0], part.brand].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] 2. Os defaults do catálogo são `EMPTY_FILTERS` (`ICatalogListFilters`), `DEFAULT_SORT` (`ICatalogListSort`) e `DEFAULT_PAGE_SIZE` (`CatalogPageSize`), todos exportados de `src/features/catalog/utils/listFilters.ts` (confirmados — `EMPTY_FILTERS` linha 24, `DEFAULT_SORT` linha 59, `DEFAULT_PAGE_SIZE = 50` linha 63). A assinatura real é `useCatalogList(filters, sort, page, pageSize: CatalogPageSize)` onde `CatalogPageSize = (typeof PAGE_SIZES)[number] = 25 | 50 | 100` (linhas 61-62). **NUNCA** passe um literal fora desse conjunto (ex.: `20`) — é `TS2345` em strict e quebra o gate `bun run build`. Use `DEFAULT_PAGE_SIZE` (ou um dos literais válidos `25`/`50`/`100`). Caso a build acuse `search` não ser campo de `ICatalogListFilters`, troque por o campo de busca real do tipo (Grep `search` em `listFilters.ts`) — NÃO invente um campo novo. (`search` é campo de `ICatalogListFilters`, linha 21 — confirmado.)

- [ ] 3. Rode `bun run build` — **esperado VERDE**.

- [ ] 4. Commit:

```
git add src/features/quick-send/components/ProductSearchDialog.tsx
git commit -m "$(cat <<'EOF'
feat(quick-send): add ProductSearchDialog catalog picker (PRD-027 RF-014)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B12 — barrel append + chaves do menu de biblioteca em `conversations/i18n`

As chaves novas do namespace `QUICK_SEND_STRINGS` (`slash.menuLabel`/`.close`, `picker.contextPlaceholder`/`.sendStaged`/`.cancelStaged`, `productCard.cardFooter`) **já foram adicionadas nos tasks que as consomem** (B7, B8, B10) — cada uma no mesmo commit do seu consumidor, garantindo boundary verde. Este task NÃO as readiciona. Aqui apenas: (a) estende o barrel `quick-send/index.ts` com as exportações novas; (b) estende `conversations/i18n/pt-BR.ts` com as chaves do menu de biblioteca (consumidas em B13, que roda depois — ordenação correta).

> **REGRA:** Se uma chave já existe no namespace do Plano A, NÃO redeclare (duplicar chave no objeto literal é erro). Confirme com Grep antes de adicionar.

**Files:**
- Modify: `src/features/quick-send/index.ts`
- Modify: `src/features/conversations/i18n/pt-BR.ts`

### Steps

- [ ] 1. (Sanidade) Confirme que as chaves de `QUICK_SEND_STRINGS` introduzidas pelo Plano B já existem (foram adicionadas em B7/B8/B10): rode `Grep` por `contextPlaceholder|sendStaged|cancelStaged|menuLabel|cardFooter` em `src/features/quick-send/i18n/pt-BR.ts` — **esperado:** todas presentes. Se alguma faltar, é porque o task que a introduz não foi concluído; volte e complete-o (NÃO adicione aqui, para não duplicar).

- [ ] 2. Append no barrel `src/features/quick-send/index.ts` (APENAS adicionar; não remover linhas do Plano A):

```ts
// Composer & Library surfaces (Plano B — PRD-027)
export { useAssetPickerMode, ASSET_PICKER_MODES, normalizeAssetPickerMode } from "./hooks/useAssetPickerMode";
export type { AssetPickerMode } from "./hooks/useAssetPickerMode";
export { QuickSendBusProvider, useQuickSendBus } from "./hooks/useQuickSendBus";
export type { IPickerRequest } from "./hooks/useQuickSendBus";
export { useSendAsset } from "./hooks/useSendAsset";
export { useSendProductCard, buildProductSnapshot } from "./hooks/useSendProductCard";
export { AssetPicker } from "./components/AssetPicker";
export type { IAssetPickerProps } from "./components/AssetPicker";
export { AssetPickerModeSwitcher } from "./components/AssetPickerModeSwitcher";
export { AssetRow } from "./components/AssetRow";
export { AssetGridCard } from "./components/AssetGridCard";
export { SlashMenu } from "./components/SlashMenu";
export { ComposerStagedAsset } from "./components/ComposerStagedAsset";
export { SnippetField } from "./components/SnippetField";
export { ProductCardBubble } from "./components/ProductCardBubble";
export { ProductSearchDialog } from "./components/ProductSearchDialog";
```

- [ ] 3. Estenda `CONVERSATION_STRINGS` em `src/features/conversations/i18n/pt-BR.ts` com as chaves do menu de biblioteca (Plano B). Adicione **antes** do fechamento `} as const;`, logo após as chaves `attach*`:

```ts
  // Library / quick-send menu sections (PRD-027 Plano B)
  attachSectionLibrary: "Biblioteca",
  attachSectionFile: "Arquivo avulso",
  openLibrary: "Abrir biblioteca",
  openLibraryShortcut: "⌘K",
  quickReply: "Resposta rápida",
  sendProduct: "Enviar produto",
```

- [ ] 4. Rode `bun run build` — **esperado VERDE**.

- [ ] 5. Commit:

```
git add src/features/quick-send/index.ts src/features/conversations/i18n/pt-BR.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): barrel exports + conversations library menu i18n (PRD-027 Plano B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B13 — Integração no `MessageInput`: menu do clipe + slash gate + chip staged + snippet overlay

Reestrutura o `DropdownMenu` do clipe em seções (Biblioteca / Arquivo avulso) mantendo os placeholders atuais; adiciona o gate CONDICIONAL de slash no `handleKey` (intercepta `↑↓/Enter/Esc` **só quando o menu está aberto**); adiciona `Ctrl/Cmd+K`; monta o chip staged e o overlay de snippet. **Não toca** em emoji/HSM/AI strip/janela 24h/copilot. RF-001, RF-003, RF-007, RF-010, RF-012, D-3, D-5, D-6.

> Este task é a maior superfície de não-regressão. O `handleKey` PERMANECE idêntico quando nenhum menu está aberto (Enter envia / Shift+Enter quebra). O Plano C adicionará o split do botão Enviar (região distinta); não conflite.

**Files:**
- Modify: `src/features/conversations/components/MessageInput.tsx`

### Steps

- [ ] 1. Leia o arquivo atual inteiro antes de editar (já foi lido durante o planejamento; releia para pegar o estado pós-merge do Plano A/C).

- [ ] 2. Substitua o bloco de imports do topo (linhas 1-20) para incluir os novos imports do quick-send. Edite o `import` existente adicionando, após a linha `import { TemplateDialog } from "./dialogs/TemplateDialog";`:

```ts
import {
  AssetPicker,
  ComposerStagedAsset,
  ProductSearchDialog,
  SlashMenu,
  SnippetField,
  useSendAsset,
  useSendProductCard,
  useQuickSendBus,
  useQuickReplies,
} from "@/features/quick-send";
import { parseSlash } from "@/features/quick-send/engine/slashParser";
import { filterAssets } from "@/features/quick-send/engine/assetFiltering";
import { resolvePlaceholders, hasUnresolved } from "@/features/quick-send/engine/placeholderResolver";
import { useAssetLibrary } from "@/features/quick-send/hooks/useAssetLibrary";
import type { IAssetLibraryItem, IPart } from "@/shared/types";
import {
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { QUICK_SEND_STRINGS } from "@/features/quick-send/i18n/pt-BR";
```

- [ ] 3. Dentro do corpo de `MessageInput`, logo após a linha `const sendHook = useMessageSend(conversation, whatsappAccount);` (≈ linha 104), adicione os hooks e estados do quick-send:

```ts
  const bus = useQuickSendBus();
  const { sendAsset } = useSendAsset(conversation, whatsappAccount);
  const { sendProductCard } = useSendProductCard(conversation, whatsappAccount);
  const quickReplies = useQuickReplies();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [stagedAsset, setStagedAsset] = useState<IAssetLibraryItem | null>(null);
  const [stagedContext, setStagedContext] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  // Caret position tracked in STATE (not read from the ref during render) so the
  // slash parser reacts to cursor moves (arrow keys/click), not only to value
  // changes — D-5 non-regression. Updated by the textarea's select/keyup/click.
  const [caret, setCaret] = useState(0);
```

- [ ] 4. Adicione, após o bloco `suggestions` (≈ linha 131), a derivação do estado de slash e das lacunas de snippet (usando o caret atual do textarea):

```ts
  // --- Slash (read-only observer over value + caret) ---
  // `caret` comes from state (updated by select/keyup/click handlers below), so
  // parseSlash refreshes when the cursor moves into/out of a "/token" even if the
  // value didn't change (e.g. arrow keys). Clamp to the current value length.
  const safeCaret = Math.min(caret, value.length);
  const slash = parseSlash(value, safeCaret);
  const slashLib = useAssetLibrary(
    slash.active ? { query: slash.query } : { query: "" },
  );
  const slashAssets = slash.active
    ? filterAssets(slashLib.items, { query: slash.query }).slice(0, 5)
    : [];
  const slashReplies =
    slash.active && quickReplies.replies.length > 0
      ? quickReplies.replies
          .filter((r) =>
            `${r.shortcut} ${r.title}`.toLowerCase().includes(slash.query.toLowerCase()),
          )
          .slice(0, 5)
      : [];
  const slashTotal = slashAssets.length + slashReplies.length;
  const slashOpen = slash.active && slashTotal > 0;

  // --- Snippet gaps (double send-lock) ---
  const placeholderCtx = useMemo(
    () => ({ nome: undefined, peca: undefined, prazo: undefined }),
    [],
  );
  const snippetGaps = resolvePlaceholders(value, placeholderCtx).gaps;
  const hasUnresolvedPlaceholders = hasUnresolved(value);

  // Reset slash highlight when the candidate list changes.
  useEffect(() => {
    setSlashIndex(0);
  }, [slash.query, slashTotal]);
```

> **NOTA:** `placeholderCtx` é estático e vazio aqui (sem resolução automática de `nome/peca/prazo` no Plano B — o contexto real da conversa/cliente é um follow-up explícito, fora do escopo deste plano). Por ser estático, NÃO é necessário `useAuth`/`currentUser` neste componente — não adicione hook morto. Isso garante que qualquer snippet inserido com placeholders apareça como lacuna âmbar e dispare a trava de envio (RF-012).

- [ ] 5. Adicione, antes do `handleSend` existente, os handlers do quick-send. NÃO altere `handleSend` em si exceto pela trava de placeholder (próximo passo):

```ts
  // Keep the caret state in sync with the textarea selection on every cursor move.
  const syncCaret = () => {
    const pos = textareaRef.current?.selectionStart;
    if (typeof pos === "number") setCaret(pos);
  };

  const stageAsset = (item: IAssetLibraryItem) => {
    setStagedAsset(item);
    setStagedContext("");
  };

  const handleStagedSend = async () => {
    if (!stagedAsset) return;
    const item = stagedAsset;
    setStagedAsset(null);
    setStagedContext("");
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    await sendAsset(item, stagedContext);
    onSent?.();
  };

  const handleProductSelected = async (part: IPart) => {
    if (!canSendFreeText) {
      toast.info(CONVERSATION_STRINGS.windowDisabledHint);
      setTemplateOpen(true);
      return;
    }
    await sendProductCard(part);
    onSent?.();
  };

  const insertSnippetBody = (body: string) => {
    // Replace the active "/shortcut..." token with the snippet body.
    setValue(body);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const pickSlashAsset = (item: IAssetLibraryItem) => {
    // Picking an asset via slash clears the slash token and stages the asset.
    setValue("");
    stageAsset(item);
  };
```

- [ ] 6. Atualize o `handleSend` existente para a TRAVA de placeholder cru (RF-012). Localize:

```ts
  const handleSend = async () => {
    const text = value.trim();
    if (!text) return;
    if (!canSendFreeText) {
```

e insira, **imediatamente após** `if (!text) return;`:

```ts
    if (hasUnresolved(value)) {
      toast.warning(QUICK_SEND_STRINGS.snippet.sendBlockedHint);
      return;
    }
```

- [ ] 7. Atualize o `handleKey` para o GATE CONDICIONAL de slash. Substitua a função inteira:

```ts
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash menu navigation — intercept ONLY while the menu is open (D-5).
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashTotal - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Soft-close: append a space so parseSlash no longer matches the token.
        setValue(value + " ");
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (slashIndex < slashAssets.length) {
          pickSlashAsset(slashAssets[slashIndex]);
        } else {
          insertSnippetBody(slashReplies[slashIndex - slashAssets.length].body);
        }
        return;
      }
    }
    // Default behaviour — UNCHANGED when no menu is open (Enter sends / Shift+Enter newline).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };
```

- [ ] 8. Adicione o atalho `Ctrl/Cmd+K` para abrir o picker. Localize o `<Textarea ...>` e adicione um handler de teclado a nível do footer OU encapsule o textarea com `onKeyDownCapture`. Adicione, dentro do JSX do `<footer>`, logo após a abertura `<footer className="border-t border-border bg-card">`, um efeito de teclado global escopado ao composer. Em vez de um listener global, adicione ao `onKeyDown` do textarea o atalho — substitua a primeira linha de `handleKey` adicionando antes do bloco `if (slashOpen)`:

```ts
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      setPickerOpen(true);
      return;
    }
```

- [ ] 9. Reestruture o `DropdownMenuContent` do clipe em seções. Substitua o `<DropdownMenuContent align="start"> ... </DropdownMenuContent>` inteiro por:

```tsx
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">
              {CONVERSATION_STRINGS.attachSectionLibrary}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
              <Icon icon="mdi:bookshelf" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.openLibrary}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {CONVERSATION_STRINGS.openLibraryShortcut}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                // Resposta rápida: open the library focused on the all tab; snippets
                // are also reachable via the "/" slash. (Reuses the same picker.)
                setPickerOpen(true);
              }}
            >
              <Icon icon="mdi:lightning-bolt-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.quickReply}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setProductSearchOpen(true)}>
              <Icon icon="mdi:cog-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.sendProduct}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">
              {CONVERSATION_STRINGS.attachSectionFile}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => toast.info(CONVERSATION_STRINGS.attachComingSoon)}>
              <Icon icon="mdi:image-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.attachImage}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toast.info(CONVERSATION_STRINGS.attachComingSoon)}>
              <Icon icon="mdi:file-document-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.attachDocument}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toast.info(CONVERSATION_STRINGS.attachComingSoon)}>
              <Icon icon="mdi:microphone-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.attachAudio}
            </DropdownMenuItem>
          </DropdownMenuContent>
```

- [ ] 10. Monte o chip staged, o overlay de snippet e o `SlashMenu`. O bloco `<div className="flex items-end gap-2 px-3 py-2">` precisa: (a) o chip staged renderizado ACIMA dele (substitui o textarea quando há staged); (b) o `SlashMenu` e o `SnippetField` posicionados relativamente ao wrapper do textarea. Envolva o `<Textarea>` num wrapper `relative` e insira os overlays. Substitua o bloco `{/* Textarea */}` por:

```tsx
        {/* Textarea + overlays */}
        <div className="relative flex-1">
          {slashOpen && (
            <SlashMenu
              state={slash}
              items={slashAssets}
              replies={slashReplies}
              activeIndex={slashIndex}
              onPickAsset={pickSlashAsset}
              onPickReply={(r) => insertSnippetBody(r.body)}
              onClose={() => setValue(value + " ")}
            />
          )}
          <SnippetField
            value={value}
            gaps={snippetGaps}
            onChange={setValue}
            textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement>}
          />
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={handleKey}
            onKeyUp={syncCaret}
            onSelect={syncCaret}
            onClick={syncCaret}
            placeholder={placeholder}
            rows={1}
            disabled={!canSendFreeText}
            className={cn(
              // Mirror ui/textarea defaults (px-3 py-2, text-base md:text-sm) so the
              // SnippetField overlay aligns pixel-for-pixel with the real text (D-6).
              "relative min-h-[40px] w-full resize-none bg-transparent px-3 py-2 text-base leading-normal md:text-sm",
              snippetGaps.length > 0 && "caret-foreground",
              !canSendFreeText && "cursor-not-allowed bg-muted/40",
            )}
            aria-label="Mensagem"
          />
        </div>
```

- [ ] 11. Adicione o chip staged ACIMA do bloco de botões. Imediatamente antes de `<div className="flex items-end gap-2 px-3 py-2">`, adicione:

```tsx
      {stagedAsset && (
        <ComposerStagedAsset
          item={stagedAsset}
          contextMessage={stagedContext}
          onContextChange={setStagedContext}
          onSend={handleStagedSend}
          onCancel={() => {
            setStagedAsset(null);
            setStagedContext("");
          }}
        />
      )}
```

- [ ] 12. Atualize a TRAVA do botão Enviar para também respeitar placeholders crus. Localize o `<Button ... onClick={handleSend} disabled={!value.trim() || !canSendFreeText}>` e altere o `disabled` para:

```tsx
          disabled={!value.trim() || !canSendFreeText || hasUnresolvedPlaceholders}
```

- [ ] 13. Monte o `AssetPicker` e o `ProductSearchDialog` no fim do componente, junto ao `<TemplateDialog ...>`:

```tsx
      <AssetPicker
        conversation={conversation}
        whatsappAccount={whatsappAccount}
        open={pickerOpen || bus.pickerRequest !== null}
        onOpenChange={(o) => {
          setPickerOpen(o);
          if (!o) bus.clearRequest();
        }}
        initialFilter={bus.pickerRequest ?? undefined}
        onStage={stageAsset}
      />
      <ProductSearchDialog
        open={productSearchOpen}
        onOpenChange={setProductSearchOpen}
        onSelect={handleProductSelected}
      />
```

- [ ] 14. Garanta que `useMemo`/`useEffect` estão importados (já estão no topo: `import { useEffect, useMemo, useRef, useState } from "react";`). Confirme que NÃO há `useAuth`/`currentUser` neste arquivo (foram deliberadamente omitidos — `placeholderCtx` é estático). Confirme também que cada símbolo novo importado em B13 step 2 é de fato usado (`AssetPicker`, `ComposerStagedAsset`, `ProductSearchDialog`, `SlashMenu`, `SnippetField`, `useSendAsset`, `useSendProductCard`, `useQuickSendBus`, `useQuickReplies`, `parseSlash`, `filterAssets`, `resolvePlaceholders`, `hasUnresolved`, `useAssetLibrary`, `IAssetLibraryItem`, `IPart`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `QUICK_SEND_STRINGS`) — nenhum import morto.

- [ ] 15. Rode `bun run build` — **esperado VERDE**. Resolva qualquer erro de tipo do DELTA (nomes de chaves i18n, props). NÃO toque em código não relacionado.

- [ ] 16. Commit:

```
git add src/features/conversations/components/MessageInput.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): wire library menu, slash gate, staged chip, snippet overlay (PRD-027 RF-001 RF-007 RF-012)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B14 — `MessageBubble`: ramo `[produto]` → `ProductCardBubble`

Adiciona o ramo de detecção do marcador `[produto]`, ANTES das checagens de `mediaType` e DEPOIS do ramo `[template]` existente. RF-015, D-7, H.2.

**Files:**
- Modify: `src/features/conversations/components/bubbles/MessageBubble.tsx`

### Steps

- [ ] 1. Adicione o import no topo de `MessageBubble.tsx`, após `import { TemplateBubble } from "./TemplateBubble";`:

```ts
import { ProductCardBubble } from "@/features/quick-send/components/ProductCardBubble";
import { PRODUCT_CARD_MARKER } from "@/features/quick-send/engine/productCardPayload";
```

- [ ] 2. Adicione o ramo de produto. Logo APÓS o bloco `if (message.text.startsWith(TEMPLATE_PREFIX) || ...) { return <TemplateBubble .../>; }` e ANTES de `if (message.mediaType === "image" ...)`, insira:

```ts
  if (message.text.startsWith(PRODUCT_CARD_MARKER)) {
    return <ProductCardBubble message={message} onRetry={onRetry} />;
  }
```

> NÃO adicione o ramo `[link]` aqui — ele é OWNED pelo Plano C (H.2). Deixe esse espaço para o Plano C.

- [ ] 3. Rode `bun run build` — **esperado VERDE**.

- [ ] 4. Commit:

```
git add src/features/conversations/components/bubbles/MessageBubble.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): render [produto] marker as ProductCardBubble (PRD-027 RF-015)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B15 — `ConversationPage`: envolver com `QuickSendBusProvider`

O `MessageInput` lê `useQuickSendBus()`; o provider precisa envolver a árvore da conversa. Plano B monta SÓ o provider; o Plano C adiciona tray/list/runners na mesma região (coordenar merge). H.2.

**Files:**
- Modify: `src/features/conversations/pages/ConversationPage.tsx`

### Steps

- [ ] 1. Adicione o import, junto aos imports de `@/features/media` (≈ linha 26):

```ts
import { QuickSendBusProvider } from "@/features/quick-send";
```

- [ ] 2. Envolva o conteúdo retornado com `<QuickSendBusProvider>`. Localize `<ConversationProvider value={{ messages }}>` e envolva-o (por dentro do `<TooltipProvider>`):

Substitua:

```tsx
    <TooltipProvider delayDuration={200}>
      <ConversationProvider value={{ messages }}>
```

por:

```tsx
    <TooltipProvider delayDuration={200}>
      <QuickSendBusProvider>
        <ConversationProvider value={{ messages }}>
```

e o fechamento correspondente. Localize:

```tsx
      </ConversationProvider>
    </TooltipProvider>
```

e substitua por:

```tsx
        </ConversationProvider>
      </QuickSendBusProvider>
    </TooltipProvider>
```

- [ ] 3. Rode `bun run build` — **esperado VERDE**.

- [ ] 4. Commit:

```
git add src/features/conversations/pages/ConversationPage.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): wrap conversation tree with QuickSendBusProvider (PRD-027 D-14)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK B16 — Validation (Plano B)

Verificação final do Plano B. Roda os gates reais e a checklist manual (sem jsdom/RTL — componentes React são validados por build verde + checklist).

**Files:** none (verification only)

### Steps

- [ ] 1. Rode os engine tests novos do Plano B (apenas o normalizador deste plano; as engines são do Plano A):

```
bunx vitest run src/features/quick-send/hooks/__tests__/useAssetPickerMode.test.ts
```

**Esperado:** `Test Files  1 passed` · `Tests  3 passed`.

- [ ] 2. Rode a suíte completa de testes para garantir zero regressão:

```
bunx vitest run
```

**Esperado:** todos os arquivos verdes (inclui as 10 engines do Plano A + este normalizador). Se algum teste do Plano A falhar, é regressão de merge — investigue antes de prosseguir.

- [ ] 3. Rode o gate real de build:

```
bun run build
```

**Esperado:** `vite build` conclui sem erros de TypeScript no DELTA (saída termina com `✓ built in ...`). `tsc` baseline (~315 erros) NÃO é o gate — confirme que nenhum erro NOVO foi introduzido pelos arquivos do Plano B.

- [ ] 4. Rode o lint:

```
bun run lint
```

**Esperado:** zero erros novos nos arquivos do Plano B (warnings pré-existentes em outros arquivos são aceitáveis).

- [ ] 5. **Checklist manual** (o usuário testa a UI; documente o que conferir, não abra browser):
  - `/catalogo freio` no textarea abre o `SlashMenu`, filtra ativos por "freio" e, ao `Enter`, faz stage do ativo (chip aparece); confirmar com `Enter` no chip envia.
  - `⌘/Ctrl+K` com o composer focado abre o `AssetPicker` no modo persistido.
  - **Send-now (não degradado):** no `AssetPicker` em modo palette/sheet, o botão inline de envio numa linha (hover) e `⌘/Ctrl+Enter` sobre uma linha focada **enviam o ativo imediatamente** (sem criar chip staged) e fecham o picker; o ativo aparece como `IMessage` na conversa. (Confirma que `onSendNow` dispara `useSendAsset`, não apenas staging.)
  - **Stage path:** click/`Enter` numa linha (ou card no grid) faz stage (chip acima do textarea); `Enter` ou `⌘/Ctrl+Enter` no chip envia; `Esc`/X cancela o stage.
  - Trocar o modo no `AssetPickerModeSwitcher` (palette↔grid↔sheet) persiste em `localStorage` (`gallo-assetpicker-mode`) e sobrevive a reload.
  - Ativo `status: draft` ou `archived` NÃO é selecionável (linha opaca/sem clique); ativo sensível (`tabela_preco`) para Vendedor aparece bloqueado (🔒 + "Sem permissão") e não envia.
  - Inserir um snippet com `{{nome}}` não resolvido pinta pílula âmbar, mostra "N campos a preencher", desabilita "Enviar" e o handler rejeita o envio (toast `sendBlockedHint`).
  - **Alinhamento do overlay (risco #1):** as pílulas âmbar do `SnippetField` ficam EXATAMENTE sobre o texto `{{...}}`/`[...]` real, tanto em light quanto em dark, e também com texto multilinha que quebra (wrap). Sem deslocamento horizontal/vertical entre pílula e glifo (validar que overlay e `<textarea>` têm o mesmo `px-3 py-2 text-base/md:text-sm leading-normal`).
  - **Caret reativo (D-5):** mover o cursor (setas/click) para DENTRO de um `/token` já digitado abre o `SlashMenu`; mover para FORA dele o fecha — sem precisar digitar/alterar o texto (confirma que `parseSlash` reage ao caret em estado, não só a mudanças de valor).
  - "Enviar produto" abre o `ProductSearchDialog`; selecionar uma peça envia `[produto]<json>` e o `MessageBubble` renderiza o `ProductCardBubble`. Peça sem `imageUrl` → tile com ícone; peça com `unitPrice <= 0` → "Consultar valor"; estoque colore por severidade.
  - **Não-regressão:** digitar texto normal + `Enter` envia; `Shift+Enter` quebra linha; emoji, Templates HSM (provider Meta), barra de Sugestões IA, indicador de janela 24h e copilot strip continuam idênticos. Fora da janela 24h, tentar enviar ativo/produto cai no gate de template (não burla).
  - `http://`, `12/05`, `3/4` e `//` no textarea NÃO abrem o SlashMenu (proteção de barra literal).

- [ ] 6. Se TODOS os gates passarem, o Plano B está completo. Não faça version bump (isso é do ciclo do épico, após Plano C). Reporte o status final.

---

**AILA Sistemas Inteligentes — PRD-027 Plano B (Composer & Biblioteca), 2026-06-06.**
