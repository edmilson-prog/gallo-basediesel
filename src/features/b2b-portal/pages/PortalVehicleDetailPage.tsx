import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateBR } from "@/shared/utils/format";
import { useVehiclesProvider } from "@/providers/data";
import { PortalBanner } from "../components/PortalBanner";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export function PortalVehicleDetailPage() {
  const { id } = useParams({ from: "/portal/frota/$id" });
  const provider = useVehiclesProvider();
  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["portal", "vehicle", id] as const,
    queryFn: () => provider.get(id),
  });

  if (isLoading || !vehicle) {
    return <Skeleton className="h-48 w-full" />;
  }

  // Simple maintenance heuristic placeholder (Fase 2 = real schedule).
  const nextMaintenanceKm = (vehicle.currentKm ?? 0) + 10_000;

  return (
    <div className="space-y-4">
      <Link to="/portal/frota" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Icon icon="mdi:chevron-left" size={14} aria-hidden />
        {S.fleetTitle}
      </Link>

      <Card className="space-y-2 p-5">
        <h1 className="font-display text-xl font-semibold text-foreground">
          {vehicle.brand} {vehicle.model} {vehicle.year}
        </h1>
        <p className="text-sm text-muted-foreground">
          {vehicle.plate ?? "sem placa"} · {vehicle.engine}
          {vehicle.currentKm != null && ` · ${vehicle.currentKm.toLocaleString("pt-BR")} km`}
        </p>
        <Button asChild size="sm" className="mt-2 w-fit">
          <Link to="/portal/solicitacoes/nova" search={{ vehicleId: vehicle.id }}>
            <Icon icon="mdi:clipboard-plus-outline" size={16} className="mr-1" aria-hidden />
            {S.fleetRequestParts}
          </Link>
        </Button>
      </Card>

      <Tabs defaultValue="general">
        <TabsList className="w-full">
          <TabsTrigger value="general" className="flex-1">
            {S.tabGeneral}
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex-1">
            {S.tabMaintenance}
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex-1">
            {S.tabDocs}
          </TabsTrigger>
          <TabsTrigger value="drivers" className="flex-1">
            {S.tabDrivers}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-3">
          <Card className="p-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Marca / Modelo</dt>
                <dd className="text-foreground">
                  {vehicle.brand} {vehicle.model}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ano</dt>
                <dd className="text-foreground">{vehicle.year}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Motor</dt>
                <dd className="text-foreground">{vehicle.engine}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Placa</dt>
                <dd className="text-foreground">{vehicle.plate ?? "—"}</dd>
              </div>
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-3">
          <Card className="flex items-center gap-3 border-amber-500/40 bg-amber-500/5 p-4">
            <Icon icon="mdi:wrench-clock" size={20} className="text-amber-600 dark:text-amber-400" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">{S.fleetNextMaintenance}</p>
              <p className="text-xs text-muted-foreground">
                ~ {nextMaintenanceKm.toLocaleString("pt-BR")} km (estimativa)
              </p>
            </div>
          </Card>
          {vehicle.serviceHistory.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sem histórico de manutenção.
            </p>
          ) : (
            vehicle.serviceHistory.map((entry) => (
              <Card key={entry.id} className="p-3">
                <p className="text-sm font-medium text-foreground">{formatDateBR(entry.date)}</p>
                <p className="text-xs text-muted-foreground">{entry.parts.join(", ")}</p>
                {entry.km != null && (
                  <p className="text-[11px] text-muted-foreground">
                    {entry.km.toLocaleString("pt-BR")} km
                  </p>
                )}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="docs">
          <PortalBanner text="Documentação do veículo disponível na Fase 2." />
        </TabsContent>
        <TabsContent value="drivers">
          <PortalBanner text="Controle de motoristas disponível na Fase 2." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
