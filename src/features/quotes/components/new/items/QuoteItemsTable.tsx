// src/features/quotes/components/new/items/QuoteItemsTable.tsx
import { Fragment, useEffect, useState } from "react";
import type { QuoteDensity } from "../../../types/editor";
import type { ID, IPart, IQuoteItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { stockBadge, lineMarginValue } from "../../../utils/quoteItemDisplay";
import { formatDecimalBR, parseDecimalBR } from "../../../utils/numberInput";
import { FREE_ITEM_PART_ID } from "../../../utils/quoteItemOps";
import { InlineCell } from "./InlineCell";
import { EquivalentsPanel } from "./EquivalentsPanel";
import { FreeItemDraftRow, type IFreeItemDraft } from "./FreeItemDraftRow";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Peça | Qtd | Unitário | Desconto | Subtotal | remover */
export const QUOTE_ITEM_COLS = "grid-cols-[minmax(12rem,1fr)_5.75rem_7rem_6.5rem_7.5rem_2rem]";

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
  /** Ids of lines that came from a kit — they carry the `kit` tag. */
  kitItemIds: Set<ID>;
  density: QuoteDensity;
  /** Focus the continuous search — the ghost row at the end of the table. */
  onFocusSearch: () => void;
  /** When true the table owns the remaining height and scrolls internally. */
  grow: boolean;
  /** Off-catalog line being drafted at the foot of the table, if any. */
  freeDraft: IFreeItemDraft | null;
  onFreeDraft: (draft: IFreeItemDraft) => void;
  onCommitFreeDraft: () => void;
  onCancelFreeDraft: () => void;
  /** Opens a blank draft row. */
  onStartFreeDraft: () => void;
}

/**
 * The work table: a sticky header, a scrolling body of editable lines, a ghost
 * "add item" row and the running subtotal at the foot.
 */
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
  kitItemIds,
  density,
  onFocusSearch,
  grow,
  freeDraft,
  onFreeDraft,
  onCommitFreeDraft,
  onCancelFreeDraft,
  onStartFreeDraft,
}: IQuoteItemsTableProps) {
  const compact = density === "compact";
  const rowPadY = compact ? "py-1" : "py-2";
  const [flashId, setFlashId] = useState<ID | null>(null);
  const [expandedId, setExpandedId] = useState<ID | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    setFlashId(highlightId);
    const t = setTimeout(() => setFlashId(null), 450);
    return () => clearTimeout(t);
  }, [highlightId]);

  return (
    <div
      className={`flex flex-col border-t border-border ${grow ? "lg:min-h-0 lg:flex-1" : ""}`}
      aria-label="Itens do orçamento"
    >
      <div
        className={`grid ${QUOTE_ITEM_COLS} gap-2.5 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
      >
        <span>Peça</span>
        <span className="text-right">Qtd</span>
        <span className="text-right">Unitário</span>
        <span className="text-right">Desconto</span>
        <span className="text-right">Subtotal</span>
        <span className="sr-only">Ações</span>
      </div>

      <div className={grow ? "lg:min-h-0 lg:flex-1 lg:overflow-y-auto" : ""}>
        {items.length === 0 && !freeDraft ? (
          <div className="m-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-4">
            <Icon icon="mdi:barcode-scan" size={20} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Nenhum item adicionado ainda</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Busque acima, tecle <b className="font-semibold text-foreground">/</b>, aplique um
                kit ou lance um item avulso.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onStartFreeDraft}>
              <Icon icon="mdi:plus-box-outline" size={15} />
              Item avulso
            </Button>
          </div>
        ) : (
          <>
            {items.map((it) => {
              const isFree = it.partId === FREE_ITEM_PART_ID;
              const part = isFree ? undefined : partsById.get(it.partId);
              const stock = part ? stockBadge(part) : null;
              const hasEquivalents = (part?.equivalentPartIds.length ?? 0) > 0;
              const isExpanded = expandedId === it.id;
              const fromKit = kitItemIds.has(it.id);
              const gross = it.quantity * it.unitPrice;
              return (
                <Fragment key={it.id}>
                  <div
                    className={`grid ${QUOTE_ITEM_COLS} items-center gap-2.5 border-b border-border px-3 ${rowPadY} transition-colors duration-300 motion-reduce:transition-none ${
                      flashId === it.id ? "bg-primary/15" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                        <span className="truncate">{it.partName}</span>
                        {isFree && (
                          <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 text-[10px] font-semibold uppercase text-primary">
                            Avulso
                          </span>
                        )}
                        {part &&
                          (part.isOriginal ? (
                            <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                              Original
                            </span>
                          ) : (
                            <span className="shrink-0 rounded border border-border px-1 text-[10px] font-medium text-muted-foreground">
                              Equivalente
                            </span>
                          ))}
                        {fromKit && (
                          <span className="shrink-0 rounded border border-info/40 bg-info/10 px-1 text-[10px] font-semibold uppercase text-info">
                            kit
                          </span>
                        )}
                      </p>
                      <p className="truncate font-semicond text-[11.5px] text-muted-foreground">
                        {isFree ? (
                          <>sem cadastro</>
                        ) : part ? (
                          <>
                            OEM {part.oemCodes[0] ?? "—"} · {part.brand} · SKU {it.partSku}
                          </>
                        ) : (
                          <>SKU {it.partSku}</>
                        )}
                      </p>
                      {!compact && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          {stock && (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] ${stock.textClassName}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${stock.dotClassName}`} />
                              {stock.label}
                            </span>
                          )}
                          {showMargin &&
                            (isFree ? (
                              <span className="text-[11px] text-muted-foreground">
                                margem — sem custo cadastrado
                              </span>
                            ) : (
                              part && (
                                <span className="text-[11px] text-muted-foreground">
                                  margem {moneyFormatter.format(lineMarginValue(it, part))}
                                </span>
                              )
                            ))}
                          {hasEquivalents && (
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : it.id)}
                              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-info hover:underline"
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
                      )}
                    </div>

                    <div className="flex items-center justify-self-end overflow-hidden rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => onPatch(it.id, { quantity: Math.max(1, it.quantity - 1) })}
                        disabled={it.quantity <= 1}
                        aria-label={`Diminuir quantidade de ${it.partName}`}
                        className={`grid w-6 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 ${
                          compact ? "h-6" : "h-7"
                        }`}
                      >
                        <Icon icon="mdi:minus" size={13} />
                      </button>
                      <span className="min-w-6 text-center text-[13px] font-semibold tabular-nums text-foreground">
                        {it.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onPatch(it.id, { quantity: it.quantity + 1 })}
                        aria-label={`Aumentar quantidade de ${it.partName}`}
                        className={`grid w-6 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground ${
                          compact ? "h-6" : "h-7"
                        }`}
                      >
                        <Icon icon="mdi:plus" size={13} />
                      </button>
                    </div>

                    <div>
                      <InlineCell
                        value={formatDecimalBR(it.unitPrice)}
                        onCommit={(raw) => onPatch(it.id, { unitPrice: parseDecimalBR(raw) })}
                        prefix="R$"
                        ariaLabel={`Preço unitário de ${it.partName}`}
                      />
                    </div>

                    <div>
                      <InlineCell
                        value={formatDecimalBR(it.discount)}
                        onCommit={(raw) =>
                          onPatch(it.id, { discount: Math.min(parseDecimalBR(raw), gross) })
                        }
                        prefix="R$"
                        inputClassName={
                          it.discount > 0 ? "text-severity-warning" : "text-foreground"
                        }
                        ariaLabel={`Desconto de ${it.partName}`}
                      />
                    </div>

                    <div className="text-right">
                      <p className="font-display text-base font-extrabold leading-tight tabular-nums text-foreground">
                        {moneyFormatter.format(it.total)}
                      </p>
                      {it.discount > 0 && (
                        <p className="font-semicond text-[11px] tabular-nums text-muted-foreground line-through">
                          {moneyFormatter.format(gross)}
                        </p>
                      )}
                    </div>

                    <div className="justify-self-end">
                      <button
                        type="button"
                        onClick={() => onRemove(it.id)}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remover ${it.partName}`}
                      >
                        <Icon icon="mdi:trash-can-outline" size={16} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && part && (
                    <div className="border-b border-border bg-muted/20">
                      <EquivalentsPanel
                        part={part}
                        allParts={allParts}
                        onSwap={(equivalent) => {
                          onSwapEquivalent(it.id, equivalent);
                          setExpandedId(null);
                        }}
                      />
                    </div>
                  )}
                </Fragment>
              );
            })}

            {freeDraft && (
              <FreeItemDraftRow
                draft={freeDraft}
                onDraft={onFreeDraft}
                onCommit={onCommitFreeDraft}
                onCancel={onCancelFreeDraft}
                density={density}
                colsClassName={QUOTE_ITEM_COLS}
              />
            )}

            {!freeDraft && (
              <div className="flex items-stretch border-b border-border">
                <button
                  type="button"
                  onClick={onFocusSearch}
                  className="flex flex-1 items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground motion-reduce:transition-none"
                >
                  <Icon icon="mdi:plus" size={14} />
                  Adicionar item
                  <kbd className="rounded border border-border px-1.5 font-semicond text-[11px]">
                    /
                  </kbd>
                </button>
                <button
                  type="button"
                  onClick={onStartFreeDraft}
                  className="flex items-center gap-1.5 border-l border-border px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground motion-reduce:transition-none"
                >
                  <Icon icon="mdi:plus-box-outline" size={14} />
                  avulso
                </button>
              </div>
            )}

            <div className={`grid ${QUOTE_ITEM_COLS} gap-2.5 bg-muted/30 px-3 py-2`}>
              <span className="col-span-4 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Subtotal dos itens
              </span>
              <span className="text-right font-display text-[17px] font-extrabold tabular-nums text-foreground">
                {moneyFormatter.format(subtotal)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
