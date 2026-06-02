// src/features/quotes/components/new/items/QuickAddBar.tsx
import { useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Icon } from "@/components/Icon";
import { useItemSearch } from "../../../hooks/useItemSearch";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IAdderProps {
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}

export function QuickAddBar({ inQuoteQtyByPart, onAddPart }: IAdderProps) {
  const [query, setQuery] = useState("");
  const { results } = useItemSearch({ enabled: true, query });

  return (
    <Command shouldFilter={false} className="rounded-md border border-border">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Digite e pressione Enter para adicionar (OEM, SKU, nome)…"
      />
      <CommandList>
        <CommandEmpty>Nenhuma peça encontrada.</CommandEmpty>
        <CommandGroup>
          {results.map((p) => (
            <CommandItem
              key={p.id}
              value={p.id}
              onSelect={() => onAddPart(p)}
              className="flex justify-between gap-2"
            >
              <span className="truncate">
                {p.name} <span className="text-xs text-muted-foreground">· {p.sku}</span>
                {(inQuoteQtyByPart.get(p.id) ?? 0) > 0 && (
                  <Icon icon="mdi:check" size={12} className="ml-1 inline text-primary" />
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {moneyFormatter.format(p.unitPrice)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
