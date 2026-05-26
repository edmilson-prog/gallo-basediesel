import type { ICustomer } from "@/shared/types";
import { CustomerOrdersList } from "@/features/orders/components/CustomerOrdersList";

export interface IOrdersTabProps {
  customer: ICustomer;
}

/**
 * Customer profile (PRD-012) → Pedidos tab.
 *
 * Thin wrapper around the canonical {@link CustomerOrdersList} component
 * provided by the orders feature (PRD-032 RF-036) — keeps the tab in sync
 * with the order lifecycle (aggregate status, origin badges, deep link to
 * `/app/pedidos/:id`).
 */
export function OrdersTab({ customer }: IOrdersTabProps) {
  return <CustomerOrdersList customerId={customer.id} />;
}
