// src/features/quotes/components/new/items/ItemAdder.tsx
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import type { QuoteAddMode } from "../../../types/editor";
import { ContinuousAdder } from "./ContinuousAdder";
import { QuickAddBar } from "./QuickAddBar";
import { CatalogDrawer } from "./CatalogDrawer";
import { ModeSwitcher } from "./ModeSwitcher";

export interface IItemAdderProps {
  mode: QuoteAddMode;
  onModeChange: (mode: QuoteAddMode) => void;
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}

export function ItemAdder({ mode, onModeChange, ...adder }: IItemAdderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ModeSwitcher value={mode} onChange={onModeChange} />
      </div>
      {mode === "continuous" && <ContinuousAdder {...adder} />}
      {mode === "quick" && <QuickAddBar {...adder} />}
      {mode === "catalog" && <CatalogDrawer {...adder} />}
    </div>
  );
}
