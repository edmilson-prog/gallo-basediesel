import { useState } from "react";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
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

export interface IModelCompatiblePartsCardProps {
  parts: IPart[];
  /** Absent when the viewer cannot curate — the card stays informational. */
  onAdd?: (part: IPart) => void;
}

/**
 * Catalog drift for the whole ficha: parts that serve this model but sit outside
 * every kit it has. Collapsed by default — it is a nudge, not the main subject.
 */
export function ModelCompatiblePartsCard({ parts, onAdd }: IModelCompatiblePartsCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (parts.length === 0) return null;

  const label =
    parts.length === 1
      ? "1 peça compatível com este modelo está fora dos kits."
      : `${parts.length} peças compatíveis com este modelo estão fora dos kits.`;

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon icon="mdi:information-outline" size={16} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="h-auto px-2 py-1 text-xs font-semibold"
        >
          {expanded ? "Ocultar" : "Ver peças"}
        </Button>
      </div>

      {expanded && (
        <ul className="mt-2">
          {parts.map((part) => {
            const family = resolvePartFamily(part);
            const stock = getStockState(part);

            return (
              <li
                key={part.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-2"
              >
                <Icon
                  icon={family ? KIT_FAMILIES[family].icon : "mdi:package-variant"}
                  size={15}
                  className="shrink-0 text-muted-foreground"
                  ariaLabel={family ? KIT_FAMILIES[family].label : undefined}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {part.name} <span className="text-xs text-muted-foreground">{part.sku}</span>
                </span>
                <span
                  className={cn("inline-flex items-center gap-1 text-xs", STOCK_TEXT[stock.tone])}
                >
                  <span className={cn("size-1.5 rounded-full", STOCK_DOT[stock.tone])} />
                  {stock.label}
                </span>
                <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">
                  {formatBRL(part.unitPrice)}
                </span>
                {onAdd && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1 px-2 text-xs"
                    onClick={() => onAdd(part)}
                  >
                    <Icon icon="mdi:plus" size={14} />
                    Incluir no kit
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
