// src/features/quotes/components/new/items/ItemAdder.tsx
import type { QuoteAddMode } from "../../../types/editor";
import { ContinuousAdder, type IAdderProps } from "./ContinuousAdder";
import { ImportPanel } from "./ImportPanel";
import { CatalogGrid } from "./CatalogGrid";
import { ModeSwitcher } from "./ModeSwitcher";

export interface IItemAdderProps extends IAdderProps {
  mode: QuoteAddMode;
  onModeChange: (mode: QuoteAddMode) => void;
  /** Focus target for the ghost "Adicionar item" row of the table. */
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Mode switcher on the left, where the action starts — in continuous mode the
 * search sits right next to it on the same row; catalog and quick modes open
 * their surface below.
 */
export function ItemAdder({ mode, onModeChange, searchInputRef, ...adder }: IItemAdderProps) {
  const { onImport, ...pickers } = adder;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <ModeSwitcher value={mode} onChange={onModeChange} />
        {mode === "continuous" && <ContinuousAdder {...adder} inputRef={searchInputRef} />}
      </div>
      {mode === "catalog" && <CatalogGrid {...pickers} onImport={onImport} />}
      {mode === "import" && <ImportPanel onImport={onImport} />}
    </div>
  );
}
