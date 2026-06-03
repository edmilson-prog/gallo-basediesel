// src/features/model-kits/components/KitCatalogSearch.tsx
import { useState } from "react";
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { usePartsIndex } from "@/features/quotes/hooks/usePartsIndex";

export interface IKitCatalogSearchProps {
  onAdd: (part: IPart) => void;
  excludePartIds: Set<ID>;
}

export function KitCatalogSearch({ onAdd, excludePartIds }: IKitCatalogSearchProps) {
  const [query, setQuery] = useState("");
  const { allParts, isLoading } = usePartsIndex();

  const term = query.trim().toLowerCase();
  const results = allParts.filter((p) => {
    if (excludePartIds.has(p.id)) return false;
    if (!term) return true;
    return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
  });

  return (
    <Command shouldFilter={false} className="rounded-md border border-border">
      <div className="flex items-center px-3">
        <Icon icon="mdi:magnify" size={16} className="mr-2 shrink-0 text-muted-foreground" />
        <CommandInput
          placeholder="Buscar peça por nome ou SKU…"
          value={query}
          onValueChange={setQuery}
          className="flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
        />
      </div>
      <CommandList>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Carregando catálogo…</div>
        ) : results.length === 0 ? (
          <CommandEmpty>
            {term ? `Nenhuma peça encontrada para "${query}".` : "Nenhuma peça disponível."}
          </CommandEmpty>
        ) : (
          <CommandGroup>
            {results.slice(0, 50).map((part) => (
              <CommandItem
                key={part.id}
                value={part.id}
                onSelect={() => {
                  onAdd(part);
                  setQuery("");
                }}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {part.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">{part.sku}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 gap-1 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(part);
                    setQuery("");
                  }}
                >
                  <Icon icon="mdi:plus" size={14} />
                  Adicionar
                </Button>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
