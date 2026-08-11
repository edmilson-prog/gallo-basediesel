// src/features/quotes/components/new/items/QuoteItemsPanel.tsx
import { useRef, useState } from "react";
import type { ID, IPart, IQuoteItem, IVehicleModelKit, IOrder, IVehicle } from "@/shared/types";
import type { IApplyKitSelection } from "@/features/model-kits";
import type { QuoteAddMode, QuoteDensity } from "../../../types/editor";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { parseDecimalBR } from "../../../utils/numberInput";
import type { IRankedKit } from "../../../utils/kitRanking";
import { ItemAdder } from "./ItemAdder";
import { KitSheet } from "./KitSheet";
import { QuoteItemsTable } from "./QuoteItemsTable";
import type { IFreeItemDraft } from "./FreeItemDraftRow";

const EMPTY_DRAFT: IFreeItemDraft = { name: "", unitPrice: "0", quantity: 1 };

export interface IQuoteItemsPanelProps {
  items: IQuoteItem[];
  subtotal: number;
  mode: QuoteAddMode;
  onModeChange: (mode: QuoteAddMode) => void;
  density: QuoteDensity;
  /** The table takes the remaining height and scrolls internally. */
  grow: boolean;

  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart, quantity?: number) => void;
  /** Commits an off-catalog line built in the draft row. */
  onAddFreeItem: (input: { name: string; unitPrice: number; quantity: number }) => void;
  /** Remounts the adder when it changes — clears the search on customer swap. */
  adderResetKey?: string;

  /** Store kits ranked by the customer's fleet. */
  rankedKits: IRankedKit[];
  kitsLoading?: boolean;
  onApplyKit: (kit: IVehicleModelKit, selection: IApplyKitSelection[]) => void;
  /** Automatic kit suggestion, rendered when the sheet is closed. */
  kitBanner?: React.ReactNode;
  /** Kit to open the sheet on — set by the suggestion banner. */
  openKitId?: ID | null;
  onOpenKitIdChange: (id: ID | null | undefined) => void;

  onPatch: (id: ID, patch: Partial<IQuoteItem>) => void;
  onRemove: (id: ID) => void;
  onSwapEquivalent: (itemId: ID, equivalent: IPart) => void;
  highlightId?: ID | null;
  partsById: Map<ID, IPart>;
  allParts: IPart[];
  showMargin: boolean;
}

/**
 * The items card — the editor's work surface. Header with the running count,
 * the adder bar, the kit sheet or its suggestion, and the table, which owns
 * whatever height is left over.
 */
export function QuoteItemsPanel({
  items,
  subtotal,
  mode,
  onModeChange,
  density,
  grow,
  vehicles,
  orders,
  inQuoteQtyByPart,
  onAddPart,
  onAddFreeItem,
  adderResetKey,
  rankedKits,
  kitsLoading,
  onApplyKit,
  kitBanner,
  openKitId,
  onOpenKitIdChange,
  onPatch,
  onRemove,
  onSwapEquivalent,
  highlightId,
  partsById,
  allParts,
  showMargin,
}: IQuoteItemsPanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [freeDraft, setFreeDraft] = useState<IFreeItemDraft | null>(null);
  const unitCount = items.reduce((sum, it) => sum + it.quantity, 0);
  // `undefined` = closed; `null` = open on the first kit; an id = open on that kit.
  const sheetOpen = openKitId !== undefined;

  const focusSearch = () => {
    onModeChange("continuous");
    setTimeout(() => searchInputRef.current?.focus(), 20);
  };

  /** Opening a draft closes the kit sheet — one decision surface at a time. */
  const startFreeDraft = (name = "") => {
    onOpenKitIdChange(undefined);
    setFreeDraft({ ...EMPTY_DRAFT, name });
  };

  const commitFreeDraft = () => {
    if (!freeDraft) return;
    const unitPrice = parseDecimalBR(freeDraft.unitPrice);
    if (!freeDraft.name.trim() || unitPrice <= 0) return;
    onAddFreeItem({ name: freeDraft.name, unitPrice, quantity: freeDraft.quantity });
    setFreeDraft(null);
  };

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-lg border border-border bg-card ${
        // Only lg+ pins the page height (see quoteLayoutClasses); below it the
        // card must size to its content or the table collapses.
        grow ? "lg:min-h-0 lg:flex-1" : ""
      }`}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Icon icon="mdi:package-variant-closed" size={15} className="text-muted-foreground" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Itens
        </h2>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {items.length} {items.length === 1 ? "item" : "itens"} · {unitCount} un
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => startFreeDraft()}>
            <Icon icon="mdi:plus-box-outline" size={15} />
            Item avulso
          </Button>
          <Button
            type="button"
            variant={sheetOpen ? "secondary" : "ghost"}
            size="sm"
            aria-expanded={sheetOpen}
            onClick={() => onOpenKitIdChange(sheetOpen ? undefined : null)}
          >
            <Icon icon="mdi:air-filter" size={15} />
            Kits
            {rankedKits.length > 0 && (
              <span className="ml-0.5 rounded bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {rankedKits.length}
              </span>
            )}
          </Button>
        </div>
      </header>

      <div className="shrink-0 px-3 pt-3">
        <ItemAdder
          key={adderResetKey}
          mode={mode}
          onModeChange={onModeChange}
          searchInputRef={searchInputRef}
          vehicles={vehicles}
          orders={orders}
          inQuoteQtyByPart={inQuoteQtyByPart}
          onAddPart={onAddPart}
          onAddFreeItemClick={startFreeDraft}
        />
      </div>

      {sheetOpen && (
        <div className="shrink-0 px-3 pt-3">
          <KitSheet
            ranked={rankedKits}
            initialKitId={openKitId ?? null}
            partsById={partsById}
            inQuoteQtyByPart={inQuoteQtyByPart}
            loading={kitsLoading}
            onApply={onApplyKit}
            onClose={() => onOpenKitIdChange(undefined)}
          />
        </div>
      )}

      {!sheetOpen && kitBanner && <div className="shrink-0 px-3 pt-3">{kitBanner}</div>}

      <div className={`mt-3 flex flex-col ${grow ? "lg:min-h-0 lg:flex-1" : ""}`}>
        <QuoteItemsTable
          items={items}
          subtotal={subtotal}
          onPatch={onPatch}
          onRemove={onRemove}
          highlightId={highlightId}
          partsById={partsById}
          allParts={allParts}
          showMargin={showMargin}
          onSwapEquivalent={onSwapEquivalent}
          density={density}
          onFocusSearch={focusSearch}
          grow={grow}
          freeDraft={freeDraft}
          onFreeDraft={setFreeDraft}
          onCommitFreeDraft={commitFreeDraft}
          onCancelFreeDraft={() => setFreeDraft(null)}
          onStartFreeDraft={() => startFreeDraft()}
        />
      </div>
    </section>
  );
}
