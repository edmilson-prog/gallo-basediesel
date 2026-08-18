import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID, IVehicleModel } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { useModelKitMutations } from "@/features/model-kits/hooks/useModelKitMutations";
import {
  KitCoverageBar,
  type CoverageFilter,
} from "@/features/model-kits/components/KitCoverageBar";
import { getModelCoverageStatus, pickRepresentativeKit } from "@/features/model-kits/engine";
import { useVehicleModelMutations } from "../hooks/useVehicleModelMutations";
import { useModelCatalogOverview } from "../hooks/useModelCatalogOverview";
import { getSiblingModels, groupModelsByBrand } from "../engine";
import { BrandFilterChips } from "../components/BrandFilterChips";
import { BrandGroup, type IModelRowContext } from "../components/BrandGroup";
import type { ISiblingKitOffer } from "../components/VehicleModelRow";
import { DeleteVehicleModelDialog } from "../components/DeleteVehicleModelDialog";
import { KNOWN_BRANDS } from "../utils/brandIcon";

const FILTER_HINT: Record<Exclude<CoverageFilter, "todos">, string> = {
  oficial: "Mostrando modelos com kit oficial.",
  rascunho: "Mostrando rascunhos à espera de revisão.",
  sem: "Mostrando só modelos sem kit — a fila de trabalho.",
};

export function VehicleModelsListPage() {
  const { currentUser } = useAuth();
  const canManage = hasPermission(currentUser, "vehicleModel", "create");
  const canBuildKit = hasPermission(currentUser, "modelKit", "create");
  const navigate = useNavigate();
  const modelMutations = useVehicleModelMutations();
  const kitMutations = useModelKitMutations();

  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("todos");
  const [showInactive, setShowInactive] = useState(false);
  const [toDelete, setToDelete] = useState<IVehicleModel | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const overview = useModelCatalogOverview({ includeInactive: showInactive });
  const { models, kitsByModel } = overview;

  // "/" focuses the search from anywhere on the page; Escape clears and releases it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return models.filter((model) => {
      if (brand && model.brand !== brand) return false;
      if (needle && !`${model.brand} ${model.model} ${model.engine}`.toLowerCase().includes(needle))
        return false;
      if (coverageFilter === "todos") return true;
      return getModelCoverageStatus(kitsByModel.get(model.id) ?? []) === coverageFilter;
    });
  }, [models, brand, search, coverageFilter, kitsByModel]);

  const groups = useMemo(() => groupModelsByBrand(filtered, KNOWN_BRANDS), [filtered]);

  /** A model with no kit borrows the sibling engine's — the case that repeats here. */
  const siblingOfferFor = useMemo(() => {
    return (model: IVehicleModel): ISiblingKitOffer | undefined => {
      if ((kitsByModel.get(model.id) ?? []).length > 0) return undefined;
      for (const sibling of getSiblingModels(model, models)) {
        const kit = pickRepresentativeKit(kitsByModel.get(sibling.id) ?? []);
        if (kit) return { kit, source: sibling };
      }
      return undefined;
    };
  }, [models, kitsByModel]);

  const hasActiveFilters =
    search.trim() !== "" || brand !== null || showInactive || coverageFilter !== "todos";
  const isCatalogEmpty = models.length === 0 && !hasActiveFilters;

  function openModel(model: IVehicleModel) {
    void navigate({ to: "/app/kits/$modelId", params: { modelId: model.id } });
  }

  function buildKit(model: IVehicleModel) {
    void navigate({ to: "/app/kits/$modelId/kit/novo", params: { modelId: model.id } });
  }

  function editModel(model: IVehicleModel) {
    void navigate({ to: "/app/kits/$modelId/editar", params: { modelId: model.id } });
  }

  function toggleStatus(model: IVehicleModel) {
    void modelMutations.update(model.id, {
      status: model.status === "ativo" ? "inativo" : "ativo",
    });
  }

  function copyKit(offer: ISiblingKitOffer, target: IVehicleModel) {
    void kitMutations.copyToModel(offer.kit, offer.source, target);
  }

  const rowContext: IModelRowContext = {
    partsById: overview.partsById,
    kitsByModel,
    compatibleCountByModel: overview.compatibleCountByModel,
    applicationCounts: overview.applicationCounts,
    applicationsReady: overview.applicationsReady,
    siblingOfferFor,
    canManage,
    canBuildKit,
    onOpen: openModel,
    onBuild: buildKit,
    onCopy: copyKit,
    onEdit: editModel,
    onToggleStatus: toggleStatus,
    onDelete: setToDelete,
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3.5 p-4 pb-12">
      {/* Header — "Novo modelo" is deliberately secondary: the catalog changes
          rarely, the kit is what gets curated every week. */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">
            Kits por modelo
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {overview.coverage.total} modelos no catálogo. O kit é o que o balcão aplica no
            orçamento — a lista mostra quem já tem.
          </p>
        </div>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => void navigate({ to: "/app/kits/novo" })}
          >
            <Icon icon="mdi:plus" size={16} />
            Novo modelo
          </Button>
        )}
      </div>

      <KitCoverageBar
        coverage={overview.coverage}
        value={coverageFilter}
        onChange={setCoverageFilter}
      />

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-72">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            className="pl-8 pr-9"
            placeholder="Buscar por marca, modelo ou motor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              setSearch("");
              e.currentTarget.blur();
            }}
          />
          {search === "" && (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[10px] font-medium text-muted-foreground sm:block">
              /
            </kbd>
          )}
        </div>

        <BrandFilterChips brands={KNOWN_BRANDS} selected={brand} onSelect={setBrand} />

        <div className="ml-auto flex items-center gap-2">
          <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="show-inactive" className="cursor-pointer text-sm">
            Mostrar inativos
          </Label>
        </div>
      </div>

      {coverageFilter !== "todos" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon icon="mdi:filter-outline" size={14} className="text-severity-warning" />
          {FILTER_HINT[coverageFilter]}
          <button
            type="button"
            onClick={() => setCoverageFilter("todos")}
            className="font-semibold text-severity-warning underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            limpar
          </button>
        </div>
      )}

      {/* Content */}
      {overview.isLoading ? (
        <p className="py-8 text-sm text-muted-foreground">Carregando modelos…</p>
      ) : isCatalogEmpty ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground">
          <Icon icon="mdi:truck-outline" size={44} className="opacity-40" />
          <div>
            <p className="font-medium text-foreground">Catálogo vazio</p>
            <p className="text-sm">Nenhum modelo de veículo cadastrado ainda.</p>
          </div>
          {canManage && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => void navigate({ to: "/app/kits/novo" })}
            >
              <Icon icon="mdi:plus" size={18} />
              Cadastrar primeiro modelo
            </Button>
          )}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 py-16 text-center text-muted-foreground">
          <Icon icon="mdi:magnify" size={36} className="opacity-40" />
          <p className="font-medium text-foreground">Nenhum resultado</p>
          <p className="text-sm">Ajuste os filtros ou o termo de busca.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {groups.map((group) => (
            <BrandGroup key={group.brand} group={group} context={rowContext} />
          ))}
        </div>
      )}

      <DeleteVehicleModelDialog
        model={toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void modelMutations.remove(toDelete.id as ID);
          setToDelete(null);
        }}
      />
    </div>
  );
}
