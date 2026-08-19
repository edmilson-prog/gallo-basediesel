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
        // What swapping actually costs or saves — the reason this panel exists.
        const delta = eq.unitPrice - part.unitPrice;
        return (
          <li key={eq.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
                <span className="truncate">{eq.name}</span>
                {eq.isOriginal ? (
                  <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                    Original
                  </span>
                ) : (
                  <span className="shrink-0 rounded border border-border px-1 text-[10px] font-medium text-muted-foreground">
                    Equivalente
                  </span>
                )}
              </p>
              <p className="truncate font-semicond text-[11px] text-muted-foreground">
                OEM {eq.oemCodes[0] ?? "—"} · {eq.brand} · SKU {eq.sku}
              </p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1 text-[11px] ${stock.textClassName}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stock.dotClassName}`} />
              {stock.label}
            </span>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-semibold tabular-nums text-foreground">
                  {moneyFormatter.format(eq.unitPrice)}
                </p>
                <p
                  className={`text-[11px] tabular-nums ${
                    delta < 0 ? "text-severity-success" : "text-severity-warning"
                  }`}
                >
                  {delta < 0 ? "−" : "+"}
                  {moneyFormatter.format(Math.abs(delta))}
                </p>
              </div>
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
