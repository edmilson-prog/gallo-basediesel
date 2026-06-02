// src/features/quotes/components/new/items/EquivalentsPanel.tsx
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { getEquivalents } from "@/features/catalog";
import { stockBadge } from "../../../utils/quoteItemDisplay";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IEquivalentsPanelProps {
  /** The part whose equivalents to show. */
  part: IPart;
  /** Full catalog, to resolve equivalent ids. */
  allParts: IPart[];
  /** Swap the current line for the chosen equivalent. */
  onSwap: (equivalent: IPart) => void;
}

export function EquivalentsPanel({ part, allParts, onSwap }: IEquivalentsPanelProps) {
  const equivalents = getEquivalents(allParts, part.id);

  if (equivalents.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Sem equivalentes cadastrados para esta peça.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {equivalents.map((eq) => {
        const stock = stockBadge(eq);
        return (
          <li key={eq.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">
                {eq.name}
                <span className="ml-1.5 text-[10px] text-muted-foreground">· {eq.brand}</span>
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                SKU {eq.sku} · <span className={stock.textClassName}>{stock.label}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold tabular-nums">
                {moneyFormatter.format(eq.unitPrice)}
              </span>
              <button
                type="button"
                onClick={() => onSwap(eq)}
                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground hover:bg-muted"
                aria-label={`Trocar por ${eq.name}`}
              >
                <Icon icon="mdi:swap-horizontal" size={13} />
                Trocar
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Re-export the swap id type alias for callers that thread item ids.
export type SwapTargetId = ID;
