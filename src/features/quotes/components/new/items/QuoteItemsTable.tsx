// src/features/quotes/components/new/items/QuoteItemsTable.tsx
import { Fragment, useEffect, useState } from "react";
import type { QuoteDensity } from "../../../types/editor";
import type { ID, IPart, IQuoteItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { getCategoryIcon } from "@/features/catalog";
import { stockBadge, lineMarginValue } from "../../../utils/quoteItemDisplay";
import { EquivalentsPanel } from "./EquivalentsPanel";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pctFormatter = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

export interface IQuoteItemsTableProps {
  items: IQuoteItem[];
  subtotal: number;
  onPatch: (id: ID, patch: Partial<IQuoteItem>) => void;
  onRemove: (id: ID) => void;
  /** Line to flash as recently added/updated. */
  highlightId?: ID | null;
  /** Resolves the IPart behind each item's partId (for the rich line). */
  partsById: Map<ID, IPart>;
  /** Full catalog, to resolve equivalents in the expand panel. */
  allParts: IPart[];
  /** Show per-line margin (Owner/Gestor only). */
  showMargin: boolean;
  /** Swap an existing line for one of its equivalents. */
  onSwapEquivalent: (itemId: ID, equivalent: IPart) => void;
  density: QuoteDensity;
}

export function QuoteItemsTable({
  items,
  subtotal,
  onPatch,
  onRemove,
  highlightId,
  partsById,
  allParts,
  showMargin,
  onSwapEquivalent,
  density,
}: IQuoteItemsTableProps) {
  const cellPadY = density === "compact" ? "py-1" : "py-2";
  const inputH = density === "compact" ? "h-7" : "h-8";
  const [flashId, setFlashId] = useState<ID | null>(null);
  const [expandedId, setExpandedId] = useState<ID | null>(null);
  useEffect(() => {
    if (!highlightId) return;
    setFlashId(highlightId);
    const t = setTimeout(() => setFlashId(null), 450);
    return () => clearTimeout(t);
  }, [highlightId]);

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center">
        <p className="text-xs text-muted-foreground">Nenhum item adicionado ainda.</p>
      </div>
    );
  }

  // Column span for the full-width expand row: Peça, Qtd, Unit, Desc, Subtotal, action = 6.
  const COLSPAN = 6;

  return (
    <div className="overflow-hidden rounded-lg border-2 border-primary/40 bg-card shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icon icon="mdi:receipt-text-outline" size={16} className="shrink-0 text-primary" />
        <span className="text-sm font-semibold text-foreground">Itens do orçamento</span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {items.length} {items.length === 1 ? "item" : "itens"}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Peça</th>
            <th className="w-20 px-3 py-2 text-right">Qtd.</th>
            <th className="w-28 px-3 py-2 text-right">Unit.</th>
            <th className="w-24 px-3 py-2 text-right">Desc.</th>
            <th className="w-28 px-3 py-2 text-right">Subtotal</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const part = partsById.get(it.partId);
            const stock = part ? stockBadge(part) : null;
            const hasEquivalents = (part?.equivalentPartIds.length ?? 0) > 0;
            const isExpanded = expandedId === it.id;
            const margin = showMargin ? lineMarginValue(it, part) : 0;
            return (
              <Fragment key={it.id}>
                <tr
                  className={`border-t border-border transition-colors duration-300 motion-reduce:transition-none ${
                    flashId === it.id ? "bg-primary/15" : ""
                  }`}
                >
                  <td className={`px-3 ${cellPadY}`}>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded bg-muted text-muted-foreground">
                        {part?.imageUrl ? (
                          <img src={part.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon icon={getCategoryIcon(part?.category)} size={16} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <span className="truncate">{it.partName}</span>
                          {part &&
                            (part.isOriginal ? (
                              <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                                Original
                              </span>
                            ) : (
                              <span className="shrink-0 rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                                Equivalente
                              </span>
                            ))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {part ? (
                            <>
                              OEM {part.oemCodes[0] ?? "—"} · {part.brand} · SKU {it.partSku}
                            </>
                          ) : (
                            <>SKU {it.partSku}</>
                          )}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {stock && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] ${stock.textClassName}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${stock.dotClassName}`} />
                              {stock.label}
                            </span>
                          )}
                          {showMargin && part && (
                            <span className="text-[10px] text-muted-foreground">
                              margem {moneyFormatter.format(margin)} (
                              {pctFormatter.format(part.marginPercent)})
                            </span>
                          )}
                          {hasEquivalents && (
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : it.id)}
                              className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                              aria-expanded={isExpanded}
                            >
                              <Icon
                                icon={isExpanded ? "mdi:chevron-up" : "mdi:chevron-down"}
                                size={12}
                              />
                              {isExpanded ? "ocultar equivalentes" : "ver equivalentes"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`px-3 ${cellPadY} text-right`}>
                    <Input
                      type="number"
                      min={1}
                      aria-label={`Quantidade de ${it.partName}`}
                      value={it.quantity}
                      onChange={(e) =>
                        onPatch(it.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className={`${inputH} text-right tabular-nums`}
                    />
                  </td>
                  <td className={`px-3 ${cellPadY} text-right`}>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      aria-label={`Preço unitário de ${it.partName}`}
                      value={it.unitPrice}
                      onChange={(e) =>
                        onPatch(it.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className={`${inputH} text-right tabular-nums`}
                    />
                  </td>
                  <td className={`px-3 ${cellPadY} text-right`}>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      aria-label={`Desconto de ${it.partName}`}
                      value={it.discount}
                      onChange={(e) =>
                        onPatch(it.id, { discount: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className={`${inputH} text-right tabular-nums`}
                    />
                  </td>
                  <td className={`px-3 ${cellPadY} text-right text-sm font-semibold tabular-nums`}>
                    {moneyFormatter.format(it.total)}
                  </td>
                  <td className={`px-3 ${cellPadY} text-right`}>
                    <button
                      type="button"
                      onClick={() => onRemove(it.id)}
                      className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-destructive"
                      aria-label={`Remover ${it.partName}`}
                    >
                      <Icon icon="mdi:trash-can-outline" size={16} />
                    </button>
                  </td>
                </tr>
                {isExpanded && part && (
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={COLSPAN} className="p-0">
                      <EquivalentsPanel
                        part={part}
                        allParts={allParts}
                        onSwap={(equivalent) => {
                          onSwapEquivalent(it.id, equivalent);
                          setExpandedId(null);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className="bg-muted/30 text-xs">
          <tr>
            <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">
              Subtotal
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
              {moneyFormatter.format(subtotal)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
