// src/features/quotes/components/new/items/CatalogDrawer.tsx
import { useMemo, useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useItemSearch } from "../../../hooks/useItemSearch";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IAdderProps {
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}

export function CatalogDrawer({ inQuoteQtyByPart, onAddPart, onAddFreeItemClick }: IAdderProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { results } = useItemSearch({ enabled: open, query, limit: 100 });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = useMemo(() => results.filter((p) => selected.has(p.id)), [results, selected]);

  const addAll = () => {
    chosen.forEach((p) => onAddPart(p));
    setSelected(new Set());
    setOpen(false);
  };

  return (
    <div className="flex gap-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Icon icon="mdi:view-grid-plus-outline" size={16} />
            Abrir catálogo
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full max-w-md flex-col">
          <SheetHeader>
            <SheetTitle>Catálogo — selecione as peças</SheetTitle>
          </SheetHeader>
          <div className="relative mt-2">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              className="pl-8"
              placeholder="Buscar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="mt-2 flex-1 overflow-y-auto rounded-md border border-border">
            {results.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted"
              >
                <Checkbox
                  checked={selected.has(p.id)}
                  onCheckedChange={() => toggle(p.id)}
                  aria-label={`Selecionar ${p.name}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {p.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    SKU {p.sku} · {p.brand}
                    {(inQuoteQtyByPart.get(p.id) ?? 0) > 0 && (
                      <span className="text-primary"> · no orçamento</span>
                    )}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {moneyFormatter.format(p.unitPrice)}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={onAddFreeItemClick}>
              <Icon icon="mdi:plus-box-outline" size={16} />
              Item avulso
            </Button>
            <Button type="button" disabled={chosen.length === 0} onClick={addAll}>
              Adicionar {chosen.length > 0 ? `${chosen.length} ` : ""}itens
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
