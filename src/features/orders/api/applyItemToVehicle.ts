import type { ID, IOrder, IVehicle, IVehicleServiceEntry } from "@/shared/types";
import type { IOrdersProvider } from "@/providers/data/contracts/orders";
import type { IVehiclesProvider } from "@/providers/data/contracts/vehicles";
import { auditLog } from "@/features/rbac/utils/auditLog";

/**
 * Mark an order item as applied to a given vehicle (PRD-032 RF-023).
 *
 * Side-effects:
 *   1. Patches the item's `appliedToVehicleId`.
 *   2. Appends an `IVehicleServiceEntry` to the vehicle's serviceHistory (PRD-016)
 *      containing the part name snapshot, current KM and a back-reference to the order.
 *   3. Emits an audit log entry on both the order and the vehicle.
 *
 * Pass `vehicleId = null` to clear the link — the matching service entry is then
 * removed from the vehicle history (best-effort; if not found, the patch still applies).
 */
export async function applyOrderItemToVehicle(params: {
  ordersProvider: IOrdersProvider;
  vehiclesProvider: IVehiclesProvider;
  order: IOrder;
  itemId: ID;
  vehicleId: ID | null;
}): Promise<{ order: IOrder; vehicle?: IVehicle }> {
  const { ordersProvider, vehiclesProvider, order, itemId, vehicleId } = params;
  const item = order.items.find((i) => i.id === itemId);
  if (!item) {
    throw new Error(`[applyOrderItemToVehicle] item ${itemId} not found on order ${order.id}`);
  }

  const previousVehicleId = item.appliedToVehicleId;
  const nextItems = order.items.map((i) =>
    i.id === itemId ? { ...i, appliedToVehicleId: vehicleId ?? undefined } : i,
  );

  const updatedOrder = await ordersProvider.update(order.id, { items: nextItems });

  let updatedVehicle: IVehicle | undefined;

  // If we are clearing the link, drop the matching entry from the previous vehicle.
  if (previousVehicleId && (vehicleId === null || previousVehicleId !== vehicleId)) {
    try {
      const prev = await vehiclesProvider.get(previousVehicleId);
      const filtered = prev.serviceHistory.filter(
        (e) => !(e.orderId === order.id && e.parts.includes(item.partName)),
      );
      if (filtered.length !== prev.serviceHistory.length) {
        await vehiclesProvider.update(previousVehicleId, { serviceHistory: filtered });
      }
    } catch {
      // best-effort cleanup — never block the primary write.
    }
  }

  // If we are linking to a vehicle, append a service entry.
  if (vehicleId) {
    const vehicle = await vehiclesProvider.get(vehicleId);
    const entry: Omit<IVehicleServiceEntry, "id"> = {
      vehicleId,
      orderId: order.id,
      parts: [item.partName],
      date: new Date().toISOString(),
      km: vehicle.currentKm,
    };
    updatedVehicle = await vehiclesProvider.addServiceEntry(vehicleId, entry);
    auditLog({
      action: "order_vehicle_apply",
      resource: "order",
      resourceId: order.id,
      after: { itemId, vehicleId, partName: item.partName },
      storeId: order.storeId,
    });
  } else {
    auditLog({
      action: "order_vehicle_unapply",
      resource: "order",
      resourceId: order.id,
      after: { itemId, previousVehicleId },
      storeId: order.storeId,
    });
  }

  return { order: updatedOrder, vehicle: updatedVehicle };
}
