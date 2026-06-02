// src/features/quotes/components/new/items/ContinuousAdder.tsx
import { useState } from "react";
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
  const { results, allParts, isLoading } = useItemSearch({ enabled: true, query });

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
            type="search"
            className="pl-8"
            placeholder="Buscar peça, OEM ou SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddFreeItemClick}>
          <Icon icon="mdi:plus-box-outline" size={16} />
          Item avulso
        </Button>
      </div>

      {query.trim() ? (
        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          {results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {isLoading ? "Carregando catálogo…" : "Nenhuma peça encontrada."}
            </p>
          ) : (
            results.map((p) => (
              <ItemResultRow
                key={p.id}
                part={p}
                inQuoteQty={inQuoteQtyByPart.get(p.id) ?? 0}
                onAdd={onAddPart}
              />
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
