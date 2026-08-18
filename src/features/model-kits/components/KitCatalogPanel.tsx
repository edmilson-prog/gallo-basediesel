import { useMemo, useState } from "react";
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const MAX_RESULTS = 6;
const FALLBACK_ICON = "mdi:package-variant";

export interface IKitCatalogPanelProps {
  allParts: IPart[];
  /** Parts already in the composition — excluded from the results. */
  inKit: Set<ID>;
  /** Parts whose applications reach this engine; the rest are flagged. */
  compatiblePartIds: Set<ID>;
  onAdd: (partId: ID) => void;
}

/**
 * The escape hatch from the family slots: anything in the catalog can enter the
 * kit, including parts with no application registered for this engine. Those
 * are labelled rather than blocked — the counter often knows a fitment the
 * catalog has not caught up with, and the label keeps the guess visible.
 */
export function KitCatalogPanel({
  allParts,
  inKit,
  compatiblePartIds,
  onAdd,
}: IKitCatalogPanelProps) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!term) return [];
    const found: IPart[] = [];
    for (const part of allParts) {
      if (inKit.has(part.id)) continue;
      if (!part.name.toLowerCase().includes(term) && !part.sku.toLowerCase().includes(term))
        continue;
      found.push(part);
      if (found.length === MAX_RESULTS) break;
    }
    return found;
  }, [allParts, inKit, term]);

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[11rem] flex-1">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-9 pl-8"
            placeholder="Buscar no catálogo por nome ou SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar peça no catálogo"
          />
        </div>

        {/* Visible and disabled, exactly as the app carries it elsewhere. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-block">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="pointer-events-none h-9 gap-1.5 text-xs"
              >
                <Icon icon="mdi:auto-fix" size={14} />
                Sugerir composição
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Disponível na Fase 2</TooltipContent>
        </Tooltip>
      </div>

      {term && results.length === 0 && (
        <p className="mt-2.5 text-sm text-muted-foreground">
          Nenhuma peça encontrada para “{query}”.
        </p>
      )}

      {results.map((part) => {
        const stock = getStockState(part);
        const family = resolvePartFamily(part);
        const fits = compatiblePartIds.has(part.id);

        return (
          <div
            key={part.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border py-2"
          >
            <Icon
              icon={family ? KIT_FAMILIES[family].icon : FALLBACK_ICON}
              size={15}
              className="text-muted-foreground"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{part.name}</span>
                <span className="text-xs text-muted-foreground">{part.sku}</span>
                {!fits && (
                  <Badge
                    variant="outline"
                    className="border-severity-warning/40 text-[10px] text-severity-warning"
                  >
                    não listada para este motor
                  </Badge>
                )}
              </div>
              <span
                className={cn(
                  "mt-0.5 inline-flex items-center gap-1 text-xs",
                  STOCK_TEXT[stock.tone],
                )}
              >
                <span className={cn("size-1.5 rounded-full", STOCK_DOT[stock.tone])} />
                {stock.label}
              </span>
            </div>

            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {formatBRL(part.unitPrice)}
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1 text-xs"
              onClick={() => {
                onAdd(part.id);
                setQuery("");
              }}
            >
              <Icon icon="mdi:plus" size={13} />
              Incluir
            </Button>
          </div>
        );
      })}
    </section>
  );
}
