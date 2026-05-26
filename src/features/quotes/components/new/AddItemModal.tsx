import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart, IQuoteItem } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPartsByText, searchPartsByApplication } from "@/features/catalog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { round2 } from "../../utils/quoteTotals";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export interface IAddItemModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (item: IQuoteItem) => void;
  /** Optional hint to pre-filter parts by vehicle brand. */
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: number;
}

export function AddItemModal({
  open,
  onClose,
  onAdd,
  vehicleBrand,
  vehicleModel,
  vehicleYear,
}: IAddItemModalProps) {
  const partsProvider = usePartsProvider();
  const [searchQuery, setSearchQuery] = useState("");
  const [useVehicleFilter, setUseVehicleFilter] = useState(Boolean(vehicleBrand));
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedId(null);
      setQuantity(1);
      setUseVehicleFilter(Boolean(vehicleBrand));
    }
  }, [open, vehicleBrand]);

  const partsQuery = useQuery({
    queryKey: [
      "parts-for-quote",
      searchQuery,
      useVehicleFilter,
      vehicleBrand,
      vehicleModel,
      vehicleYear,
    ] as const,
    queryFn: async () => {
      const all = await partsProvider.list({ pageSize: 1000, active: true });
      return all.data;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const filteredParts = useMemo<IPart[]>(() => {
    const all = partsQuery.data ?? [];
    let candidates = all;
    if (useVehicleFilter && (vehicleBrand || vehicleModel || vehicleYear)) {
      candidates = searchPartsByApplication(all, {
        brand: vehicleBrand,
        model: vehicleModel,
        year: vehicleYear,
      });
    }
    if (searchQuery.trim()) {
      candidates = searchPartsByText(candidates, searchQuery);
    }
    return candidates.slice(0, 20);
  }, [partsQuery.data, useVehicleFilter, vehicleBrand, vehicleModel, vehicleYear, searchQuery]);

  const selectedPart = useMemo(
    () => filteredParts.find((p) => p.id === selectedId) ?? null,
    [filteredParts, selectedId],
  );

  const handleAdd = () => {
    if (!selectedPart) return;
    const qty = Math.max(1, quantity || 1);
    const item: IQuoteItem = {
      id: `qi-${crypto.randomUUID()}`,
      partId: selectedPart.id,
      partSku: selectedPart.sku,
      partName: selectedPart.name,
      quantity: qty,
      unitPrice: selectedPart.unitPrice,
      discount: 0,
      total: round2(qty * selectedPart.unitPrice),
    };
    onAdd(item);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar item ao orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {(vehicleBrand || vehicleModel) && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={useVehicleFilter}
                onChange={(e) => setUseVehicleFilter(e.target.checked)}
              />
              Filtrar por veículo do cliente
              {vehicleBrand && (
                <span className="rounded bg-muted px-2 py-0.5 text-foreground">
                  {vehicleBrand} {vehicleModel ?? ""} {vehicleYear ?? ""}
                </span>
              )}
            </label>
          )}

          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              type="search"
              className="pl-8"
              placeholder="Buscar por nome, OEM ou SKU…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {filteredParts.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {partsQuery.isLoading ? "Carregando catálogo…" : "Nenhuma peça encontrada."}
              </p>
            ) : (
              filteredParts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left hover:bg-muted ${
                    selectedId === p.id ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      OEM {p.oemCodes[0] ?? "—"} · SKU {p.sku} · {p.brand}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {moneyFormatter.format(p.unitPrice)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Estoque: {p.stockAvailable}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {selectedPart && (
            <div className="flex items-end gap-3 rounded-md border border-border bg-muted/30 px-3 py-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{selectedPart.name}</p>
                <p className="text-xs text-muted-foreground">
                  {moneyFormatter.format(selectedPart.unitPrice)} / un
                </p>
              </div>
              <div className="w-24">
                <Label htmlFor="qty" className="text-xs">
                  Quantidade
                </Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!selectedPart} onClick={handleAdd}>
            <Icon icon="mdi:plus" size={16} />
            Adicionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
