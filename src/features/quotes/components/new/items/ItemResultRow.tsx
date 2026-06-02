// src/features/quotes/components/new/items/ItemResultRow.tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { getCategoryIcon } from "@/features/catalog";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function stockTone(part: IPart): { label: string; className: string } {
  if (part.stockAvailable <= 0) return { label: "sem estoque", className: "text-destructive" };
  if (part.stockAvailable <= part.stockMinimum)
    return { label: `estoque ${part.stockAvailable} (baixo)`, className: "text-amber-500" };
  return { label: `estoque ${part.stockAvailable}`, className: "text-muted-foreground" };
}

export interface IItemResultRowProps {
  part: IPart;
  /** Quantity already in the quote for this part (0 when absent). */
  inQuoteQty?: number;
  onAdd: (part: IPart) => void;
}

export function ItemResultRow({ part, inQuoteQty = 0, onAdd }: IItemResultRowProps) {
  const stock = stockTone(part);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded bg-muted text-muted-foreground">
          {part.imageUrl ? (
            <img src={part.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon icon={getCategoryIcon(part.category)} size={18} />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{part.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            OEM {part.oemCodes[0] ?? "—"} · SKU {part.sku} · {part.brand} ·{" "}
            <span className={stock.className}>{stock.label}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {moneyFormatter.format(part.unitPrice)}
          </p>
          {inQuoteQty > 0 && (
            <p className="text-[10px] text-primary">
              <Icon icon="mdi:check" size={11} className="mr-0.5 inline" />
              no orçamento ({inQuoteQty})
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onAdd(part)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-primary hover:bg-primary/10"
          aria-label={`Adicionar ${part.name}`}
        >
          <Icon icon="mdi:plus" size={18} />
        </button>
      </div>
    </div>
  );
}
