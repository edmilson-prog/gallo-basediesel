import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL,
  formatPlate,
  iconForBrand,
} from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.fleet;

export interface IOwnerFleetCardProps {
  customerId: ID;
  currentVehicleId: ID;
  className?: string;
}

export function OwnerFleetCard({ customerId, currentVehicleId, className }: IOwnerFleetCardProps) {
  const provider = useVehiclesProvider();
  const query = useQuery({
    queryKey: ["vehicle-owner-fleet", customerId] as const,
    queryFn: () => provider.listByCustomer(customerId),
    staleTime: 60_000,
  });

  const others = (query.data ?? []).filter((v) => v.id !== currentVehicleId);

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:truck-multiple-outline" size={16} className="text-muted-foreground" />
        {COPY.title}
      </h2>
      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : query.isError ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{COPY.loadError}</p>
      ) : others.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{COPY.empty}</p>
      ) : (
        <ul className="space-y-2">
          {others.map((v) => (
            <li key={v.id}>
              <Link
                to="/app/veiculos/$id"
                params={{ id: v.id }}
                className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 transition-colors hover:border-primary/30"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon icon={iconForBrand(v.brand)} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {v.brand} {v.model} · {v.year}
                  </p>
                  <p className="truncate font-mono text-[11px] uppercase text-muted-foreground">
                    {formatPlate(v.plate)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", STATUS_BADGE_CLASSES[v.cadastroStatus])}
                >
                  {STATUS_LABEL[v.cadastroStatus]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
