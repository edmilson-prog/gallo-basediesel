import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { KIT_FAMILIES, getStockState, resolvePartFamily, type StockTone } from "../engine";

const STOCK_TEXT: Record<StockTone, string> = {
  ok: "text-muted-foreground",
  low: "text-severity-warning",
  out: "text-severity-critical",
};

const STOCK_DOT: Record<StockTone, string> = {
  ok: "bg-severity-success",
  low: "bg-severity-warning",
  out: "bg-severity-critical",
};

const FALLBACK_ICON = "mdi:package-variant";

export interface IKitPartLineProps {
  part: IPart;
  quantity: number;
  isOptional: boolean;
  /** Curation note, e.g. "trocar a cada 30.000 km". */
  note?: string;
  /** Drops the note to keep tight lists readable. */
  dense?: boolean;
}

/**
 * One curated line of a kit: which family it fills, what it costs at the given
 * quantity, and whether the balcony actually has it on the shelf.
 */
export function KitPartLine({ part, quantity, isOptional, note, dense }: IKitPartLineProps) {
  const family = resolvePartFamily(part);
  const stock = getStockState(part);

  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-x-3 border-t border-border py-2">
      <Icon
        icon={family ? KIT_FAMILIES[family].icon : FALLBACK_ICON}
        size={16}
        className={isOptional ? "text-muted-foreground/60" : "text-muted-foreground"}
        ariaLabel={family ? KIT_FAMILIES[family].label : undefined}
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-sm font-medium",
              isOptional ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {part.name}
          </span>
          <span className="text-xs text-muted-foreground">{part.sku}</span>
          {isOptional && (
            <span className="rounded border border-border px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Opcional
            </span>
          )}
          <span className={cn("inline-flex items-center gap-1 text-xs", STOCK_TEXT[stock.tone])}>
            <span className={cn("size-1.5 rounded-full", STOCK_DOT[stock.tone])} />
            {stock.label}
          </span>
        </div>
        {!dense && note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>

      <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
        {quantity}×
      </span>

      <span
        className={cn(
          "w-24 text-right text-sm font-medium tabular-nums",
          isOptional ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {formatBRL(part.unitPrice * quantity)}
      </span>
    </div>
  );
}
