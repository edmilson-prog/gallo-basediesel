import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { IVehicleModel } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { useVehicleModels } from "../hooks/useVehicleModels";
import { useVehicleModelMutations } from "../hooks/useVehicleModelMutations";
import { BrandFilterChips } from "../components/BrandFilterChips";
import { BrandGroup } from "../components/BrandGroup";
import { DeleteVehicleModelDialog } from "../components/DeleteVehicleModelDialog";
import { KNOWN_BRANDS } from "../utils/brandIcon";

export function VehicleModelsListPage() {
  const { currentUser } = useAuth();
  const canManage = hasPermission(currentUser, "vehicleModel", "create");
  const navigate = useNavigate();
  const mutations = useVehicleModelMutations();

  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [toDelete, setToDelete] = useState<IVehicleModel | null>(null);

  // Fetch with brand + status filters server-side; search is client-side for instant feedback
  const modelsQuery = useVehicleModels({
    brand: selectedBrand ?? undefined,
    status: showInactive ? undefined : "ativo",
  });

  const filteredModels = useMemo(() => {
    const all = modelsQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((m) => `${m.brand} ${m.model} ${m.engine}`.toLowerCase().includes(needle));
  }, [modelsQuery.data, search]);

  // Group by brand in KNOWN_BRANDS order, unknown brands appended at the end
  const groups = useMemo(() => {
    const byBrand = new Map<string, IVehicleModel[]>();
    for (const m of filteredModels) {
      const list = byBrand.get(m.brand) ?? [];
      list.push(m);
      byBrand.set(m.brand, list);
    }
    const ordered: Array<{ brand: string; models: IVehicleModel[] }> = [];
    for (const brand of KNOWN_BRANDS) {
      const models = byBrand.get(brand);
      if (models && models.length > 0) {
        ordered.push({ brand, models });
        byBrand.delete(brand);
      }
    }
    // Unknown brands appended at the end, in insertion order
    for (const [brand, models] of byBrand) {
      if (models.length > 0) ordered.push({ brand, models });
    }
    return ordered;
  }, [filteredModels]);

  const hasActiveFilters = search.trim() !== "" || selectedBrand !== null || showInactive;
  const isEmpty = groups.length === 0;
  const isCatalogEmpty = (modelsQuery.data ?? []).length === 0 && !hasActiveFilters;

  function handleEdit(m: IVehicleModel) {
    // Route /app/kits/$modelId/editar created in Task 11 — cast required until routeTree knows it
    void navigate({ to: "/app/kits/$modelId/editar" as never, params: { modelId: m.id } as never });
  }

  function handleToggleStatus(m: IVehicleModel) {
    void mutations.update(m.id, { status: m.status === "ativo" ? "inativo" : "ativo" });
  }

  function handleCreate() {
    // Route /app/kits/novo created in Task 11 — cast required until routeTree knows it
    void navigate({ to: "/app/kits/novo" as never });
  }

  return (
    // TooltipProvider elevated to page level so VehicleModelRow tooltips share a single instance
    <TooltipProvider>
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">
            Modelos
            {!modelsQuery.isLoading && (
              <span className="ml-1 font-normal text-muted-foreground" aria-live="polite">
                · {filteredModels.length}
              </span>
            )}
          </h1>
          {canManage && (
            <Button onClick={handleCreate} className="gap-1">
              <Icon icon="mdi:plus" size={18} />
              Novo modelo
            </Button>
          )}
        </div>

        {/* Search + filters */}
        <div className="space-y-2">
          <div className="relative max-w-sm">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              placeholder="Buscar por marca, modelo ou motor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <BrandFilterChips
            brands={KNOWN_BRANDS}
            selected={selectedBrand}
            onSelect={setSelectedBrand}
          />

          <div className="flex items-center gap-2">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="cursor-pointer text-sm">
              Mostrar inativos
            </Label>
          </div>
        </div>

        {/* Content */}
        {modelsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando modelos…</p>
        ) : isEmpty && isCatalogEmpty ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground">
            <Icon icon="mdi:truck-outline" size={48} className="opacity-40" />
            <div>
              <p className="font-medium text-foreground">Catálogo vazio</p>
              <p className="text-sm">Nenhum modelo de veículo cadastrado ainda.</p>
            </div>
            {canManage && (
              <Button onClick={handleCreate} variant="outline" className="gap-1">
                <Icon icon="mdi:plus" size={18} />
                Cadastrar primeiro modelo
              </Button>
            )}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Icon icon="mdi:magnify" size={40} className="opacity-40" />
            <div>
              <p className="font-medium text-foreground">Nenhum resultado</p>
              <p className="text-sm">Tente ajustar os filtros ou o termo de busca.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ brand, models }) => (
              <BrandGroup
                key={brand}
                brand={brand}
                models={models}
                canManage={canManage}
                onEdit={handleEdit}
                onToggleStatus={handleToggleStatus}
                onDelete={setToDelete}
              />
            ))}
          </div>
        )}

        <DeleteVehicleModelDialog
          model={toDelete}
          onOpenChange={(open) => !open && setToDelete(null)}
          onConfirm={() => {
            if (toDelete) void mutations.remove(toDelete.id);
            setToDelete(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
