import { useState } from "react";
import type { IKitItem, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { getStockState, type StockTone } from "../engine";

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

export interface IKitEditorPartLineProps {
  item: IKitItem;
  /** Undefined when the part left the catalog after the kit was curated. */
  part: IPart | undefined;
  onPatch: (patch: Partial<IKitItem>) => void;
  onRemove: () => void;
}

/**
 * One editable line of the composition. `Base / Opcional` is a two-state
 * segment rather than a switch: a switch labelled "Base / Opcional" never says
 * which side is on, and the difference decides whether the part is pre-checked
 * when the kit reaches a quote.
 */
export function KitEditorPartLine({ item, part, onPatch, onRemove }: IKitEditorPartLineProps) {
  const [noteOpen, setNoteOpen] = useState(Boolean(item.note));

  if (!part) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-border py-2.5">
        <Icon icon="mdi:alert-outline" size={16} className="text-severity-critical" />
        <span className="flex-1 text-sm text-muted-foreground">
          Peça fora do catálogo — não entra no orçamento.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          aria-label="Remover peça"
          onClick={onRemove}
        >
          <Icon icon="mdi:trash-can-outline" size={16} />
        </Button>
      </div>
    );
  }

  const stock = getStockState(part);
  const quantity = Math.max(1, Math.floor(item.defaultQuantity) || 1);

  return (
    <div className="flex flex-col gap-1.5 border-t border-border py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[9rem] flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">{part.name}</span>
            <span className="text-xs text-muted-foreground">{part.sku}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <span className={cn("inline-flex items-center gap-1 text-xs", STOCK_TEXT[stock.tone])}>
              <span className={cn("size-1.5 rounded-full", STOCK_DOT[stock.tone])} />
              {stock.label}
            </span>
            <span className="text-xs text-muted-foreground">{formatBRL(part.unitPrice)} un.</span>
            {!noteOpen && (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                + nota
              </button>
            )}
          </div>
        </div>

        {/* Base / Opcional — two states, both visible */}
        <div
          role="group"
          aria-label="Papel da peça no kit"
          className="inline-flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5"
        >
          {(
            [
              { optional: false, label: "Base" },
              { optional: true, label: "Opcional" },
            ] as const
          ).map((option) => {
            const active = item.isOptional === option.optional;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() => onPatch({ isOptional: option.optional })}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="inline-flex shrink-0 items-center rounded-lg border border-border">
          <button
            type="button"
            aria-label="Diminuir quantidade"
            className="grid size-7 place-items-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onPatch({ defaultQuantity: Math.max(1, quantity - 1) })}
          >
            <Icon icon="mdi:minus" size={14} />
          </button>
          <span
            aria-live="polite"
            aria-label={`Quantidade: ${quantity}`}
            className="w-7 text-center text-sm font-semibold tabular-nums text-foreground"
          >
            {quantity}
          </span>
          <button
            type="button"
            aria-label="Aumentar quantidade"
            className="grid size-7 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onPatch({ defaultQuantity: quantity + 1 })}
          >
            <Icon icon="mdi:plus" size={14} />
          </button>
        </div>

        <span
          className={cn(
            "w-[5.5rem] shrink-0 text-right text-sm font-semibold tabular-nums",
            item.isOptional ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {formatBRL(part.unitPrice * quantity)}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={`Remover ${part.name}`}
          onClick={onRemove}
        >
          <Icon icon="mdi:trash-can-outline" size={16} />
        </Button>
      </div>

      {noteOpen && (
        <div className="flex items-center gap-2 pl-1">
          <Icon icon="mdi:subdirectory-arrow-right" size={14} className="text-muted-foreground" />
          <Input
            value={item.note ?? ""}
            maxLength={140}
            aria-label={`Nota de curadoria de ${part.name}`}
            placeholder="Nota da curadoria — ex.: vem em par, trocar a cada 30.000 km"
            onChange={(e) => onPatch({ note: e.target.value })}
            className="h-8 text-sm"
          />
          {!item.note && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground"
              aria-label="Fechar nota"
              onClick={() => setNoteOpen(false)}
            >
              <Icon icon="mdi:close" size={14} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
