import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { avatarColors, hashHue, initialsFrom } from "@/shared/utils/avatar";
import { computeHealth } from "../../utils/vehicleHealth";
import { HEALTH_STATUS_META, formatPlate, iconForBrand } from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const SECTION_COPY = VEHICLE_STRINGS.detail.sections;
const FLEET_COPY = VEHICLE_STRINGS.detail.fleet;

export interface IVehicleOwnerFleetCardProps {
  customerId: ID;
  currentVehicleId: ID;
  className?: string;
}

/**
 * Owner and fleet in one card.
 *
 * They were two stacked cards asking the same question — "whose truck is this,
 * and what else do they run?" — with two headers and two borders between the
 * answer's halves. The fleet rows carry a health dot so the rail doubles as a
 * shortcut to whichever sibling vehicle needs attention.
 */
export function VehicleOwnerFleetCard({
  customerId,
  currentVehicleId,
  className,
}: IVehicleOwnerFleetCardProps) {
  const customersProvider = useCustomersProvider();
  const vehiclesProvider = useVehiclesProvider();

  const customerQuery = useQuery({
    queryKey: ["customer-detail", customerId] as const,
    queryFn: () => customersProvider.get(customerId),
    staleTime: 60_000,
  });

  const fleetQuery = useQuery({
    queryKey: ["vehicle-owner-fleet", customerId] as const,
    queryFn: () => vehiclesProvider.listByCustomer(customerId),
    staleTime: 60_000,
  });

  const customer = customerQuery.data;
  const others = (fleetQuery.data ?? []).filter((v) => v.id !== currentVehicleId);

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:account-outline" size={16} className="text-muted-foreground" />
        {SECTION_COPY.owner}
      </h2>

      {customerQuery.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : customer ? (
        <OwnerRow
          id={customer.id}
          name={customer.type === "B2B" ? customer.nomeFantasia : customer.fullName}
          subtitle={[
            customer.type === "B2B" ? "Empresa (B2B)" : "Pessoa física (B2C)",
            customer.address ? `${customer.address.city}/${customer.address.state}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {FLEET_COPY.title}
        </p>
        {fleetQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : fleetQuery.isError ? (
          <p className="py-2 text-xs text-muted-foreground">{FLEET_COPY.loadError}</p>
        ) : others.length === 0 ? (
          <p className="py-1 text-xs text-muted-foreground">{FLEET_COPY.empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {others.map((v) => {
              const meta = HEALTH_STATUS_META[computeHealth(v).status];
              return (
                <li key={v.id}>
                  <Link
                    to="/app/veiculos/$id"
                    params={{ id: v.id }}
                    className="flex items-center gap-2.5 rounded-md border border-border bg-background px-2.5 py-2 transition-colors hover:border-primary/30"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <Icon icon={iconForBrand(v.brand)} size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium uppercase text-foreground">
                        {v.brand} {v.model} · {v.year}
                      </p>
                      <p className="truncate font-mono text-[11px] uppercase text-muted-foreground">
                        {formatPlate(v.plate)}
                      </p>
                    </div>
                    <span
                      title={`${VEHICLE_STRINGS.detail.health.title}: ${meta.label}`}
                      className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function OwnerRow({ id, name, subtitle }: { id: ID; name: string; subtitle: string }) {
  const colors = avatarColors(hashHue(id));
  return (
    <Link
      to="/app/clientes/$id"
      params={{ id }}
      className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 transition-colors hover:border-primary/30"
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
        style={{ background: colors.bg, color: colors.fg }}
      >
        {initialsFrom(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Icon icon="mdi:arrow-right" size={16} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}
