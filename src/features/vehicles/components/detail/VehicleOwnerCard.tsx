import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { initialsFrom, avatarColors, hashHue } from "@/shared/utils/avatar";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.sections;

export interface IVehicleOwnerCardProps {
  customerId: ID;
}

export function VehicleOwnerCard({ customerId }: IVehicleOwnerCardProps) {
  const provider = useCustomersProvider();
  const query = useQuery({
    queryKey: ["customer-detail", customerId] as const,
    staleTime: 60_000,
    queryFn: () => provider.get(customerId),
  });

  if (query.isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {COPY.owner}
        </h2>
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }
  const customer = query.data;
  if (!customer) return null;
  const name = customer.type === "B2B" ? customer.nomeFantasia : customer.fullName;
  const hue = hashHue(customer.id);
  const colors = avatarColors(hue);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {COPY.owner}
      </h2>
      <Link
        to="/app/clientes/$id"
        params={{ id: customer.id }}
        className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3 hover:border-primary/30"
      >
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
          style={{ background: colors.bg, color: colors.fg }}
        >
          {initialsFrom(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {customer.type === "B2B" ? "Empresa (B2B)" : "Pessoa física (B2C)"}
            {customer.address && ` · ${customer.address.city}/${customer.address.state}`}
          </p>
        </div>
        <Icon icon="mdi:arrow-right" size={16} className="text-muted-foreground" />
      </Link>
    </section>
  );
}
