// src/features/quotes/components/new/items/QuoteItemsPanel.tsx
import { useRef } from "react";
import type { ID, IPart, IQuoteItem, IVehicleModelKit, IOrder, IVehicle } from "@/shared/types";
import type { QuoteAddMode, QuoteDensity } from "../../../types/editor";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { ItemAdder } from "./ItemAdder";
import { KitPicker } from "./KitPicker";
import { QuoteItemsTable } from "./QuoteItemsTable";

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
  onAddFreeItemClick: () => void;
  /** Remounts the adder when it changes — clears the search on customer swap. */
  adderResetKey?: string;

  kits: IVehicleModelKit[];
  onPickKit: (kit: IVehicleModelKit) => void;
  /** Automatic kit suggestion, rendered between the adder and the table. */
  kitBanner?: React.ReactNode;

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
 * the adder bar, the kit suggestion and the table, which owns whatever height
 * is left over.
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
  onAddFreeItemClick,
  adderResetKey,
  kits,
  onPickKit,
  kitBanner,
  onPatch,
  onRemove,
  onSwapEquivalent,
  highlightId,
  partsById,
  allParts,
  showMargin,
}: IQuoteItemsPanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const unitCount = items.reduce((sum, it) => sum + it.quantity, 0);

  const focusSearch = () => {
    onModeChange("continuous");
    setTimeout(() => searchInputRef.current?.focus(), 20);
  };

  return (
    <section
      className={`flex flex-col overflow-hidden rounded-lg border border-border bg-card ${
        grow ? "min-h-0 flex-1" : ""
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
          <Button type="button" variant="ghost" size="sm" onClick={onAddFreeItemClick}>
            <Icon icon="mdi:plus-box-outline" size={15} />
            Item avulso
          </Button>
          <KitPicker kits={kits} onPickKit={onPickKit} />
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
          onAddFreeItemClick={onAddFreeItemClick}
        />
      </div>

      {kitBanner && <div className="shrink-0 px-3 pt-3">{kitBanner}</div>}

      <div className={`mt-3 flex flex-col ${grow ? "min-h-0 flex-1" : ""}`}>
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
        />
      </div>
    </section>
  );
}
