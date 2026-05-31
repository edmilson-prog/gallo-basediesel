import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { DetailCard } from "./DetailCard";

export interface IDetailCustomerCardProps {
  customer: ICustomer | undefined;
  /** Display name resolved by the caller (B2B fantasia/razão vs B2C fullName). */
  name: string;
  deliveryAddress?: ICustomerAddress;
  onOpenFicha: () => void;
}

export function DetailCustomerCard({
  customer,
  name,
  deliveryAddress,
  onOpenFicha,
}: IDetailCustomerCardProps) {
  if (!customer) {
    return (
      <DetailCard icon="mdi:account-outline" title="Cliente">
        <p className="text-xs text-muted-foreground">Cliente não encontrado.</p>
      </DetailCard>
    );
  }
  return (
    <DetailCard
      icon="mdi:account-outline"
      title="Cliente"
      action={
        <Button size="sm" variant="outline" onClick={onOpenFicha}>
          <Icon icon="mdi:account-eye-outline" size={14} /> Abrir ficha
        </Button>
      }
    >
      <p className="text-sm font-semibold text-foreground">{name}</p>
      <p className="text-xs text-muted-foreground">
        {customer.type === "B2B" ? `CNPJ ${customer.cnpj}` : `CPF ${customer.cpf}`}
        {" · "}
        {customer.phone}
        {customer.email && <> · {customer.email}</>}
      </p>
      {deliveryAddress && (
        <p className="mt-2 text-xs text-muted-foreground">
          <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
          {deliveryAddress.street}, {deliveryAddress.number} — {deliveryAddress.district},{" "}
          {deliveryAddress.city}/{deliveryAddress.state}
        </p>
      )}
    </DetailCard>
  );
}
