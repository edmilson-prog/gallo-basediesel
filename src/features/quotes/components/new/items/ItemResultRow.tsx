// src/features/quotes/components/new/items/ItemResultRow.tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { getCategoryIcon } from "@/features/catalog";
import { stockBadge } from "../../../utils/quoteItemDisplay";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Accent of the row's add button, matching the grid it belongs to. */
export type ResultRowAccent = "default" | "info" | "success";

const ADD_BUTTON_ACCENT: Record<ResultRowAccent, string> = {
  default: "text-primary hover:bg-primary/10",
  info: "text-info hover:bg-info/10",
  success: "text-success hover:bg-success/10",
};

export interface IItemResultRowProps {
  part: IPart;
  /** Quantity already in the quote for this part (0 when absent). */
  inQuoteQty?: number;
  onAdd: (part: IPart) => void;
  /** Tints the add button to match the source grid (default keeps primary). */
  accent?: ResultRowAccent;
}

export function ItemResultRow({
  part,
  inQuoteQty = 0,
  onAdd,
  accent = "default",
}: IItemResultRowProps) {
  const stock = stockBadge(part);
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
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
            <span className="truncate">{part.name}</span>
            {part.isOriginal ? (
              <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 py-0 text-[10px] font-semibold text-primary">
                Original
              </span>
            ) : (
              <span className="shrink-0 rounded border border-border bg-muted px-1 py-0 text-[10px] font-medium text-muted-foreground">
                Equivalente
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            OEM {part.oemCodes[0] ?? "—"} · SKU {part.sku} · {part.brand} ·{" "}
            <span className={stock.textClassName}>{stock.label}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          {/* A catalogued part with no price still sells — it just cannot be
              priced yet, so say so instead of showing a convincing R$ 0,00. */}
          <p
            className={`text-sm font-semibold tabular-nums ${
              part.unitPrice > 0 ? "" : "text-muted-foreground"
            }`}
          >
            {part.unitPrice > 0 ? moneyFormatter.format(part.unitPrice) : "sem preço"}
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
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border ${ADD_BUTTON_ACCENT[accent]}`}
          aria-label={`Adicionar ${part.name}`}
        >
          <Icon icon="mdi:plus" size={18} />
        </button>
      </div>
    </div>
  );
}
