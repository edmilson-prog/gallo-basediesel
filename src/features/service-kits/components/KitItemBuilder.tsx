import { useMemo, useState } from "react";
import type { ID, IPart, IServiceKitItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { getCategoryIcon } from "@/features/catalog";
import { useItemSearch } from "@/features/quotes/hooks/useItemSearch";

export interface IKitItemBuilderProps {
  items: IServiceKitItem[];
  onChange: (items: IServiceKitItem[]) => void;
}

/** Two-pane builder: catalog search on the left, selected kit items on the right. */
export function KitItemBuilder({ items, onChange }: IKitItemBuilderProps) {
  const [query, setQuery] = useState("");
  const { results, allParts, isLoading } = useItemSearch({ enabled: true, query });

  const partsById = useMemo(() => {
    const map = new Map<ID, IPart>();
    for (const p of allParts) map.set(p.id, p);
    return map;
  }, [allParts]);

  function addPart(part: IPart) {
    const existing = items.find((it) => it.partId === part.id);
    if (existing) {
      onChange(
        items.map((it) => (it.partId === part.id ? { ...it, quantity: it.quantity + 1 } : it)),
      );
    } else {
      onChange([...items, { partId: part.id, quantity: 1 }]);
    }
  }
  function setQty(partId: ID, quantity: number) {
    onChange(
      items.map((it) =>
        it.partId === partId ? { ...it, quantity: Math.max(1, Math.floor(quantity) || 1) } : it,
      ),
    );
  }
  function removeItem(partId: ID) {
    onChange(items.filter((it) => it.partId !== partId));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Busca de peça */}
      <div className="rounded-lg border border-border">
        <div className="relative border-b border-border p-2">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-8"
            placeholder="Buscar peça, OEM ou SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Carregando catálogo…</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {query ? "Nenhuma peça encontrada." : "Digite para buscar peças."}
            </p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addPart(p)}
                className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
              >
                <Icon
                  icon={getCategoryIcon(p.category)}
                  size={16}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <Icon icon="mdi:plus" size={16} className="shrink-0 text-primary" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Itens do kit */}
      <div className="rounded-lg border border-border">
        <p className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
          Itens do kit ({items.length})
        </p>
        <div className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhuma peça adicionada.
            </p>
          ) : (
            items.map((it) => {
              const part = partsById.get(it.partId);
              return (
                <div
                  key={it.partId}
                  className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {part ? (
                      part.name
                    ) : (
                      <span className="text-muted-foreground">Peça indisponível ({it.partId})</span>
                    )}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => setQty(it.partId, Number(e.target.value))}
                    aria-label={`Quantidade de ${part?.name ?? it.partId}`}
                    className="h-8 w-16 text-right tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it.partId)}
                    aria-label="Remover peça"
                    className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-destructive"
                  >
                    <Icon icon="mdi:trash-can-outline" size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
