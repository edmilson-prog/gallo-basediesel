// src/features/quotes/components/new/items/ContinuousAdder.tsx
import { useEffect, useRef, useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { useItemSearch } from "../../../hooks/useItemSearch";
import { ItemResultRow } from "./ItemResultRow";
import { SuggestionRails } from "./SuggestionRails";

export interface IAdderProps {
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  /** Adds `quantity` units (default 1) of the part to the quote. */
  onAddPart: (part: IPart, quantity?: number) => void;
  /** Opens the off-catalog draft row, seeded with the typed term when there is one. */
  onAddFreeItemClick: (name?: string) => void;
}

export interface IContinuousAdderProps extends IAdderProps {
  /** Owned by the items panel so the ghost "Adicionar item" row can focus it. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * Inline search that sits next to the mode switcher, where the action starts.
 * Results (or, with an empty query, the suggestion rails) drop below as a
 * popover so the items table never loses its height.
 */
export function ContinuousAdder({
  vehicles,
  orders,
  inQuoteQtyByPart,
  onAddPart,
  onAddFreeItemClick,
  inputRef,
}: IContinuousAdderProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const { results, allParts, isLoading } = useItemSearch({ enabled: true, query });

  const hasQuery = query.trim().length > 0;

  // Reset the active row whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Global "/" focuses the search unless the user is already typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      ref.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (hasQuery) setQuery("");
      else e.currentTarget.blur();
      return;
    }
    if (!hasQuery || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const part = results[activeIndex];
      if (part) onAddPart(part);
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div className="relative">
        <Icon
          icon="mdi:barcode-scan"
          size={16}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-primary"
        />
        <input
          ref={ref}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onInputKeyDown}
          placeholder="Buscar peça por nome, OEM ou SKU — ou bipe o código de barras"
          role="combobox"
          aria-expanded={open}
          aria-controls="continuous-adder-results"
          className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 motion-reduce:transition-none"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:block">
          /
        </kbd>
      </div>

      {open && (
        <div
          id="continuous-adder-results"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[26rem] overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
        >
          {hasQuery ? (
            results.length === 0 ? (
              <div className="flex items-center gap-2 p-3">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {isLoading ? "Carregando catálogo…" : `Nenhuma peça para “${query.trim()}”.`}
                </p>
                {!isLoading && (
                  <button
                    type="button"
                    onMouseDown={() => {
                      // The term that found nothing becomes the description.
                      onAddFreeItemClick(query.trim());
                      setQuery("");
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                  >
                    <Icon icon="mdi:plus" size={14} />
                    Criar item avulso
                  </button>
                )}
              </div>
            ) : (
              <div role="listbox" aria-label="Peças encontradas">
                {results.map((p, i) => (
                  <div
                    key={p.id}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={i === activeIndex ? "bg-muted/60" : ""}
                  >
                    <ItemResultRow
                      part={p}
                      inQuoteQty={inQuoteQtyByPart.get(p.id) ?? 0}
                      onAdd={onAddPart}
                    />
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="p-2">
              <SuggestionRails
                allParts={allParts}
                vehicles={vehicles}
                orders={orders}
                inQuoteQtyByPart={inQuoteQtyByPart}
                onAdd={onAddPart}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
