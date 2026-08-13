import type { ICustomer } from "@/shared/types";
import { CustomerVehiclesList } from "@/features/vehicles/components/CustomerVehiclesList";

export interface IVehiclesTabProps {
  customer: ICustomer;
  /** Drops the internal title — the detail page's `CustomerPanel` owns it. */
  headless?: boolean;
}

export function VehiclesTab({ customer, headless }: IVehiclesTabProps) {
  return <CustomerVehiclesList customer={customer} headless={headless} />;
}
