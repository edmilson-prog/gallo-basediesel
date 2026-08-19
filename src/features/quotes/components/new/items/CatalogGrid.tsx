// src/features/quotes/components/new/items/CatalogGrid.tsx
import { useMemo, useState } from "react";
import type { IPart, PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { getCategoryLabel } from "@/features/catalog";
import { useItemSearch } from "../../../hooks/useItemSearch";
import { stockBadge } from "../../../utils/quoteItemDisplay";
import type { IAdderProps } from "./ContinuousAdder";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const ALL = "__all__";

/**
 * Catalog browsing as an inline grid filtered by category — a card per part,
 * one click to add. Replaces the side drawer: the browsing happens where the
 * quote is being built, not in a sheet over it.
 */
export function CatalogGrid({ inQuoteQtyByPart, onAddPart }: IAdderProps) {
  const [category, setCategory] = useState<PartCategory | typeof ALL>(ALL);
  const { allParts, isLoading } = useItemSearch({ enabled: true, query: "" });

  const categories = useMemo(() => {
    const present = new Set<PartCategory>();
    for (const p of allParts) if (p.category) present.add(p.category);
    return Array.from(present);
  }, [allParts]);

  // Cap the rendered cards: the catalog runs to thousands of rows and the grid
  // is a browsing surface, not a list screen (the search covers exact lookups).
  const list = useMemo(
    () =>
      (category === ALL ? allParts : allParts.filter((p) => p.category === category)).slice(0, 120),
    [allParts, category],
  );

  if (isLoading && allParts.length === 0) {
    return <p className="px-1 py-3 text-xs text-muted-foreground">Carregando catálogo…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip active={category === ALL} onClick={() => setCategory(ALL)}>
          Todos
        </CategoryChip>
        {categories.map((c) => (
          <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {getCategoryLabel(c)}
          </CategoryChip>
        ))}
      </div>

      <div className="grid max-h-[22rem] grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 overflow-y-auto">
        {list.map((p) => (
          <CatalogCard
            key={p.id}
            part={p}
            inQuoteQty={inQuoteQtyByPart.get(p.id) ?? 0}
            onAdd={onAddPart}
          />
        ))}
        {list.length === 0 && (
          <p className="col-span-full py-3 text-center text-xs text-muted-foreground">
            Nenhuma peça nesta categoria.
          </p>
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function CatalogCard({
  part,
  inQuoteQty,
  onAdd,
}: {
  part: IPart;
  inQuoteQty: number;
  onAdd: (part: IPart) => void;
}) {
  const stock = stockBadge(part);
  return (
    <button
      type="button"
      onClick={() => onAdd(part)}
      aria-label={`Adicionar ${part.name}`}
      className={`flex flex-col gap-2 rounded-lg border bg-background/40 p-2.5 text-left transition-colors hover:border-primary/40 motion-reduce:transition-none ${
        inQuoteQty > 0 ? "border-severity-success/40" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-semicond text-[10.5px] uppercase tracking-wider text-muted-foreground">
          {getCategoryLabel(part.category)}
        </span>
        <span
          className={`ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold ${stock.textClassName}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${stock.dotClassName}`} />
          {stock.label}
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{part.name}</p>
      <div className="flex items-end gap-2">
        <span className="min-w-0 truncate font-semicond text-[11px] text-muted-foreground">
          {part.sku}
          {inQuoteQty > 0 && (
            <span className="text-severity-success">
              {" "}
              · <Icon icon="mdi:check" size={11} className="inline" />
              {inQuoteQty} no orçamento
            </span>
          )}
        </span>
        <span
          className={`ml-auto shrink-0 font-display text-base font-extrabold tabular-nums ${
            part.unitPrice > 0 ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {part.unitPrice > 0 ? moneyFormatter.format(part.unitPrice) : "sem preço"}
        </span>
      </div>
    </button>
  );
}
