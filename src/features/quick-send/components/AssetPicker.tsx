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
