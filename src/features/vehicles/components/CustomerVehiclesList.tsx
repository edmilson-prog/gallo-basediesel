import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ICustomer, IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { formatDateBR } from "@/shared/utils/format";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL,
  formatKm,
  formatPlate,
  iconForBrand,
} from "../utils/vehicleDisplay";
import { lastServiceAt } from "../utils/listFilters";
import { useCadastroMode } from "../hooks/useCadastroMode";
import { NewVehicleModal } from "./NewVehicleModal";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.customerList;
const MAX_VISIBLE = 5;

export interface ICustomerVehiclesListProps {
  customer: ICustomer;
  className?: string;
}

export function CustomerVehiclesList({ customer, className }: ICustomerVehiclesListProps) {
  const provider = useVehiclesProvider();
  const canCreate = usePermission("vehicle", "create");
  const role = useCurrentRole();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const { mode: cadastroMode } = useCadastroMode(customer.storeId);
  const [addOpen, setAddOpen] = useState(false);

  const showAdd = canCreate && (isManagerOrOwner || cadastroMode !== "manual_apenas_gestor");

  const vehiclesQuery = useQuery({
    queryKey: ["customer-vehicles", customer.id] as const,
    staleTime: 60_000,
    queryFn: () => provider.listByCustomer(customer.id),
  });

  const vehicles = vehiclesQuery.data ?? [];
  const visible = vehicles.slice(0, MAX_VISIBLE);
  const hidden = vehicles.length - visible.length;

  return (
    <div className={cn("space-y-3", className)}>
      <header className="flex items-center gap-2">
        <Icon icon="mdi:truck-outline" size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{COPY.title}</h3>
        {showAdd && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1"
            onClick={() => setAddOpen(true)}
          >
            <Icon icon="mdi:plus" size={14} />
            {COPY.addButton}
          </Button>
        )}
      </header>

      {vehiclesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-md border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
          <Icon icon="mdi:truck-remove-outline" size={20} className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{COPY.empty}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <Link
          to="/app/veiculos"
          search={{ customer: customer.id }}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Icon icon="mdi:arrow-right" size={12} />
          {COPY.seeAll(vehicles.length)}
        </Link>
      )}

      <NewVehicleModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        cadastroMode={cadastroMode}
        presetCustomer={customer}
        onCreated={() => {
          void vehiclesQuery.refetch();
        }}
      />
    </div>
  );
}

function VehicleCard({ vehicle }: { vehicle: IVehicle }) {
  const last = lastServiceAt(vehicle);
  return (
    <li className="rounded-md border border-border bg-background p-3 hover:border-primary/30">
      <div className="flex items-start gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Icon icon={iconForBrand(vehicle.brand)} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            to="/app/veiculos/$id"
            params={{ id: vehicle.id }}
            className="block truncate text-sm font-semibold text-foreground hover:underline"
          >
            {vehicle.brand} {vehicle.model}{" "}
            <span className="font-normal text-muted-foreground">· {vehicle.year}</span>
          </Link>
          <p className="text-[11px] text-muted-foreground">{vehicle.engine || "—"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>
              <strong className="font-semibold">Placa:</strong>{" "}
              <span className="font-mono uppercase text-foreground">
                {formatPlate(vehicle.plate)}
              </span>
            </span>
            <span>
              <strong className="font-semibold">Km:</strong>{" "}
              <span className="text-foreground">{formatKm(vehicle.currentKm)}</span>
            </span>
            {last && (
              <span>
                <strong className="font-semibold">Última manutenção:</strong>{" "}
                <span className="text-foreground">{formatDateBR(last)}</span>
              </span>
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn("text-[10px]", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
        >
          {STATUS_LABEL[vehicle.cadastroStatus]}
        </Badge>
      </div>
    </li>
  );
}
