// src/features/quotes/components/new/items/ContinuousAdder.tsx
import { useEffect, useRef, useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useItemSearch } from "../../../hooks/useItemSearch";
import { ItemResultRow } from "./ItemResultRow";
import { SuggestionRails } from "./SuggestionRails";

export interface IAdderProps {
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}

export function ContinuousAdder({
  vehicles,
  orders,
  inQuoteQtyByPart,
  onAddPart,
  onAddFreeItemClick,
}: IAdderProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, allParts, isLoading } = useItemSearch({ enabled: true, query });

  const hasQuery = query.trim().length > 0;

  // Reset the active row whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Global "/" focuses the search unless the user is already typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hasQuery || results.length === 0) {
      if (e.key === "Escape") setQuery("");
      return;
    }
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
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            type="search"
            className="pl-8"
            placeholder="Buscar peça, OEM ou SKU…  ( / para focar )"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded={hasQuery && results.length > 0}
            aria-controls="continuous-adder-results"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddFreeItemClick}>
          <Icon icon="mdi:plus-box-outline" size={16} />
          Item avulso
        </Button>
      </div>

      {hasQuery ? (
        <div
          id="continuous-adder-results"
          role="listbox"
          className="max-h-80 overflow-y-auto rounded-md border border-border"
        >
          {results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {isLoading ? "Carregando catálogo…" : "Nenhuma peça encontrada."}
            </p>
          ) : (
            results.map((p, i) => (
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
            ))
          )}
        </div>
      ) : (
        <SuggestionRails
          allParts={allParts}
          vehicles={vehicles}
          orders={orders}
          inQuoteQtyByPart={inQuoteQtyByPart}
          onAdd={onAddPart}
        />
      )}
    </div>
  );
}
