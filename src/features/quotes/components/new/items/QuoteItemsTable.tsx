// src/features/quotes/components/new/items/QuoteItemsTable.tsx
import { useEffect, useState } from "react";
import type { ID, IQuoteItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IQuoteItemsTableProps {
  items: IQuoteItem[];
  subtotal: number;
  onPatch: (id: ID, patch: Partial<IQuoteItem>) => void;
  onRemove: (id: ID) => void;
  /** Line to flash as recently added/updated. */
  highlightId?: ID | null;
}

export function QuoteItemsTable({
  items,
  subtotal,
  onPatch,
  onRemove,
  highlightId,
}: IQuoteItemsTableProps) {
  const [flashId, setFlashId] = useState<ID | null>(null);
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

  return (
    <div className="overflow-hidden rounded-md border border-border">
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
          {items.map((it) => (
            <tr
              key={it.id}
              className={`border-t border-border transition-colors duration-300 motion-reduce:transition-none ${
                flashId === it.id ? "bg-primary/15" : ""
              }`}
            >
              <td className="px-3 py-2">
                <p className="text-sm font-medium text-foreground">{it.partName}</p>
                <p className="text-[10px] text-muted-foreground">SKU {it.partSku}</p>
              </td>
              <td className="px-3 py-2 text-right">
                <Input
                  type="number"
                  min={1}
                  aria-label={`Quantidade de ${it.partName}`}
                  value={it.quantity}
                  onChange={(e) =>
                    onPatch(it.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="h-8 text-right tabular-nums"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  aria-label={`Preço unitário de ${it.partName}`}
                  value={it.unitPrice}
                  onChange={(e) =>
                    onPatch(it.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="h-8 text-right tabular-nums"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  aria-label={`Desconto de ${it.partName}`}
                  value={it.discount}
                  onChange={(e) =>
                    onPatch(it.id, { discount: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="h-8 text-right tabular-nums"
                />
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                {moneyFormatter.format(it.total)}
              </td>
              <td className="px-3 py-2 text-right">
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
          ))}
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
