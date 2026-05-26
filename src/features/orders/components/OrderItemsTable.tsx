import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IOrder, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const UNAPPLIED = "__none__";

export interface IOrderItemsTableProps {
  order: IOrder;
  /**
   * When provided, each row exposes a "Aplicado a veículo" dropdown listing
   * the customer's vehicles. Called with `vehicleId = null` to clear.
   */
  onApplyVehicle?: (itemId: ID, vehicleId: ID | null) => void;
  readOnly?: boolean;
}

export function OrderItemsTable({ order, onApplyVehicle, readOnly }: IOrderItemsTableProps) {
  const vehiclesProvider = useVehiclesProvider();

  const vehiclesQuery = useQuery({
    queryKey: ["vehicles-for-order", order.customerId] as const,
    queryFn: () => vehiclesProvider.listByCustomer(order.customerId),
    enabled: Boolean(order.customerId) && !readOnly,
    staleTime: 60_000,
  });

  const vehicles = vehiclesQuery.data ?? [];

  const vehiclesById = useMemo<Map<ID, IVehicle>>(() => {
    const m = new Map<ID, IVehicle>();
    vehicles.forEach((v) => m.set(v.id, v));
    return m;
  }, [vehicles]);

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Peça</th>
            <th className="w-16 px-3 py-2 text-right">Qtd.</th>
            <th className="w-28 px-3 py-2 text-right">Unit.</th>
            <th className="w-24 px-3 py-2 text-right">Desc.</th>
            <th className="w-28 px-3 py-2 text-right">Subtotal</th>
            {!readOnly && <th className="w-56 px-3 py-2 text-left">Aplicado a veículo</th>}
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => {
            const vehicle = it.appliedToVehicleId
              ? vehiclesById.get(it.appliedToVehicleId)
              : undefined;
            return (
              <tr key={it.id} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{it.partName}</p>
                  <p className="text-[10px] text-muted-foreground">SKU {it.partSku}</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {moneyFormatter.format(it.unitPrice)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {it.discount > 0 ? `-${moneyFormatter.format(it.discount)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {moneyFormatter.format(it.total)}
                </td>
                {!readOnly && (
                  <td className="px-3 py-2">
                    {vehicles.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        <Icon icon="mdi:car-off" size={12} className="mr-1 inline" />
                        Cliente sem veículos cadastrados
                      </p>
                    ) : (
                      <Select
                        value={it.appliedToVehicleId ?? UNAPPLIED}
                        onValueChange={(value) =>
                          onApplyVehicle?.(it.id, value === UNAPPLIED ? null : value)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecionar veículo…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNAPPLIED}>— Nenhum —</SelectItem>
                          {vehicles.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {vehicleLabel(v)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {vehicle && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        <Icon icon="mdi:wrench-check-outline" size={11} className="mr-1 inline" />
                        Histórico de manutenção atualizado
                      </p>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function vehicleLabel(v: IVehicle): string {
  return [v.brand, v.model, v.year, v.plate].filter(Boolean).join(" · ");
}
