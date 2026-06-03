// src/features/quotes/components/new/items/SuggestionRails.tsx
import { useMemo, useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { buildRepurchaseItems, buildVehicleSuggestions } from "../../../utils/suggestions";
import { ItemResultRow } from "./ItemResultRow";

export interface ISuggestionRailsProps {
  allParts: IPart[];
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAdd: (part: IPart) => void;
}

export function SuggestionRails({
  allParts,
  vehicles,
  orders,
  inQuoteQtyByPart,
  onAdd,
}: ISuggestionRailsProps) {
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(vehicles[0]?.id ?? null);
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId) ?? null;

  const vehicleParts = useMemo(
    () => (activeVehicle ? buildVehicleSuggestions(allParts, activeVehicle) : []),
    [allParts, activeVehicle],
  );
  const repurchase = useMemo(() => buildRepurchaseItems(allParts, orders), [allParts, orders]);

  if (vehicles.length === 0 && repurchase.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        Comece a digitar para buscar peças por nome, OEM ou SKU.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {vehicles.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-info/30 border-l-4 border-l-info bg-info/5">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2 pt-2.5">
            <Icon icon="mdi:truck-outline" size={16} className="shrink-0 text-info" />
            <span className="text-sm font-medium text-foreground">Sugestões por veículo</span>
            <span className="rounded bg-info/10 px-1.5 py-0 text-[10px] font-semibold text-info">
              Sugestão
            </span>
            <span className="w-full text-[11px] text-muted-foreground sm:w-auto sm:basis-full">
              Com base no modelo do caminhão do cliente
            </span>
            <div className="mt-1 flex w-full flex-wrap items-center gap-1">
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setActiveVehicleId(v.id)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    v.id === activeVehicleId
                      ? "border-info/40 bg-info/15 text-info"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v.brand} {v.model} '{String(v.year).slice(-2)}
                </button>
              ))}
            </div>
          </header>
          {vehicleParts.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nenhuma peça catalogada para este veículo.
            </p>
          ) : (
            <div className="border-t border-info/20 bg-background/40">
              {vehicleParts.map((p) => (
                <ItemResultRow
                  key={p.id}
                  part={p}
                  inQuoteQty={inQuoteQtyByPart.get(p.id) ?? 0}
                  onAdd={onAdd}
                  accent="info"
                />
              ))}
            </div>
          )}
        </section>
      )}

      {repurchase.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-success/30 border-l-4 border-l-success bg-success/5">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2 pt-2.5">
            <Icon icon="mdi:history" size={16} className="shrink-0 text-success" />
            <span className="text-sm font-medium text-foreground">Já comprou antes</span>
            <span className="rounded bg-success/10 px-1.5 py-0 text-[10px] font-semibold text-success">
              Recompra
            </span>
            <span className="w-full text-[11px] text-muted-foreground sm:w-auto sm:basis-full">
              Histórico de compras deste cliente
            </span>
          </header>
          <div className="border-t border-success/20 bg-background/40">
            {repurchase.map((r) => (
              <ItemResultRow
                key={r.part.id}
                part={r.part}
                inQuoteQty={inQuoteQtyByPart.get(r.part.id) ?? 0}
                onAdd={onAdd}
                accent="success"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
