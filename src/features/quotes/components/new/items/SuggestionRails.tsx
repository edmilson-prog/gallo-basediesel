// src/features/quotes/components/new/items/SuggestionRails.tsx
import { useMemo, useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
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
    <div className="space-y-4">
      {vehicles.length > 0 && (
        <section>
          <div className="mb-1 flex flex-wrap items-center gap-1 px-1">
            <span className="text-xs font-medium text-muted-foreground">
              Sugestões por veículo:
            </span>
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveVehicleId(v.id)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  v.id === activeVehicleId
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.brand} {v.model} '{String(v.year).slice(-2)}
              </button>
            ))}
          </div>
          {vehicleParts.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nenhuma peça catalogada para este veículo.
            </p>
          ) : (
            <div className="rounded-md border border-border">
              {vehicleParts.map((p) => (
                <ItemResultRow
                  key={p.id}
                  part={p}
                  inQuoteQty={inQuoteQtyByPart.get(p.id) ?? 0}
                  onAdd={onAdd}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {repurchase.length > 0 && (
        <section>
          <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">Já comprou antes:</p>
          <div className="rounded-md border border-border">
            {repurchase.map((r) => (
              <ItemResultRow
                key={r.part.id}
                part={r.part}
                inQuoteQty={inQuoteQtyByPart.get(r.part.id) ?? 0}
                onAdd={onAdd}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
