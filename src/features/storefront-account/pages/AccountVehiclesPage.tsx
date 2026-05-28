import { useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { IVehicle } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { NewVehicleModal } from "@/features/vehicles/components/NewVehicleModal";
import { EditVehicleModal } from "@/features/vehicles/components/EditVehicleModal";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL,
  formatKm,
  formatPlate,
  iconForBrand,
} from "@/features/vehicles/utils/vehicleDisplay";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export function AccountVehiclesPage() {
  const { customer } = useCustomerAuth();
  const provider = useVehiclesProvider();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<IVehicle | undefined>();

  useSeoMeta({ title: "Veículos · GALLO PARTS" });

  const vehiclesQuery = useQuery({
    queryKey: ["customer-account", "vehicles", customer?.id] as const,
    enabled: Boolean(customer),
    staleTime: 60_000,
    queryFn: () => (customer ? provider.listByCustomer(customer.id) : Promise.resolve([])),
  });

  if (!customer) return null;
  // B2C customers don't have a fleet area.
  if (customer.type === "B2C") {
    return <Navigate to="/loja/conta" />;
  }

  const vehicles = vehiclesQuery.data ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {S.vehiclesTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{S.vehiclesSubtitle}</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Icon icon="mdi:plus" size={16} className="mr-1" aria-hidden />
          Adicionar veículo
        </Button>
      </header>

      {vehiclesQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Icon icon="mdi:truck-remove-outline" size={36} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>
          <Button variant="default" onClick={() => setAddOpen(true)}>
            Cadastrar primeiro veículo
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Icon icon={iconForBrand(vehicle.brand)} size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {vehicle.brand} {vehicle.model}{" "}
                    <span className="font-normal text-muted-foreground">· {vehicle.year}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{vehicle.engine || "—"}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    <span>
                      Placa{" "}
                      <span className="font-mono uppercase text-foreground">
                        {formatPlate(vehicle.plate)}
                      </span>
                    </span>
                    <span>
                      Km <span className="text-foreground">{formatKm(vehicle.currentKm)}</span>
                    </span>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
                >
                  {STATUS_LABEL[vehicle.cadastroStatus]}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(vehicle)}>
                <Icon icon="mdi:pencil-outline" size={14} className="mr-1" aria-hidden />
                Editar
              </Button>
            </Card>
          ))}
        </div>
      )}

      <NewVehicleModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        cadastroMode="aprovacao_obrigatoria"
        presetCustomer={customer}
        onCreated={() => void vehiclesQuery.refetch()}
      />
      {editing && (
        <EditVehicleModal
          open={Boolean(editing)}
          vehicle={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void vehiclesQuery.refetch();
          }}
        />
      )}
    </div>
  );
}
