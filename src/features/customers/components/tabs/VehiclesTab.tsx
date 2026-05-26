import type { ICustomer } from "@/shared/types";
import { CustomerVehiclesList } from "@/features/vehicles/components/CustomerVehiclesList";

export interface IVehiclesTabProps {
  customer: ICustomer;
}

export function VehiclesTab({ customer }: IVehiclesTabProps) {
  return <CustomerVehiclesList customer={customer} />;
}
