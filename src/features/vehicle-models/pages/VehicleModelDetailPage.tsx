import { useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { ID, IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/shared/utils/format";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { ModelKitsSection } from "@/features/model-kits/components/ModelKitsSection";
import { ModelCompatiblePartsCard } from "@/features/model-kits/components/ModelCompatiblePartsCard";
import { useModelKits } from "@/features/model-kits/hooks/useModelKits";
import { useModelKitsOverview } from "@/features/model-kits/hooks/useModelKitsOverview";
import { useModelKitMutations } from "@/features/model-kits/hooks/useModelKitMutations";
import { useVehicleModel } from "../hooks/useVehicleModel";
import { useVehicleModels } from "../hooks/useVehicleModels";
import { useVehicleModelMutations } from "../hooks/useVehicleModelMutations";
import { BrandAvatar } from "../components/BrandAvatar";
import { EngineVariantsCard } from "../components/EngineVariantsCard";
import { formatYearRange } from "../utils/formatYearRange";

interface IModelFactProps {
  icon: string;
  label: string;
  value: string;
  muted?: boolean;
}

/** One fact of the model header — the numbers that decide whether this ficha
 *  still needs work. */
function ModelFact({ icon, label, value, muted }: IModelFactProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon icon={icon} size={12} />
        {label}
      </span>
      <span
        className={cn(
          "truncate text-sm font-semibold tabular-nums",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function VehicleModelDetailPage() {
  const { currentUser } = useAuth();
  const canManageModel = hasPermission(currentUser, "vehicleModel", "create");
  const canCreateKit = hasPermission(currentUser, "modelKit", "create");
  const canCurateKit = hasPermission(currentUser, "modelKit", "edit");
  const navigate = useNavigate();
  const mutations = useVehicleModelMutations();
  const kitMutations = useModelKitMutations();

  // modelId provided by /app/kits/$modelId; strict: false for flexibility.
  const { modelId } = useParams({ strict: false }) as { modelId?: string };

  const modelQuery = useVehicleModel(modelId);
  const model = modelQuery.data;

  const overview = useModelKitsOverview(model);

  // Sibling engines of the same brand + model, and who among them already has a kit.
  const modelsQuery = useVehicleModels({});
  const allKitsQuery = useModelKits({});

  const siblings = useMemo(() => {
    if (!model) return [];
    return (modelsQuery.data ?? [])
      .filter((m) => m.brand === model.brand && m.model === model.model && m.id !== model.id)
      .sort((a, b) => a.engine.localeCompare(b.engine, "pt-BR"));
  }, [model, modelsQuery.data]);

  const kitsBySibling = useMemo(() => {
    const map = new Map<ID, IVehicleModelKit[]>();
    for (const kit of allKitsQuery.data ?? []) {
      const list = map.get(kit.modelId);
      if (list) list.push(kit);
      else map.set(kit.modelId, [kit]);
    }
    return map;
  }, [allKitsQuery.data]);

  /** Active siblings with no kit — where a copy actually lands. */
  const copyTargets = useMemo(
    () =>
      siblings.filter((s) => s.status === "ativo" && (kitsBySibling.get(s.id) ?? []).length === 0),
    [siblings, kitsBySibling],
  );

  function goBack() {
    void navigate({ to: "/app/kits" });
  }

  function handleEdit() {
    if (!model) return;
    void navigate({
      to: "/app/kits/$modelId/editar",
      params: { modelId: model.id },
    });
  }

  function handleToggleStatus() {
    if (!model) return;
    void mutations.update(model.id, {
      status: model.status === "ativo" ? "inativo" : "ativo",
    });
  }

  function handleBuildFor(target: IVehicleModel) {
    void navigate({ to: "/app/kits/$modelId/kit/novo", params: { modelId: target.id } });
  }

  function handleOpenSibling(target: IVehicleModel) {
    void navigate({ to: "/app/kits/$modelId", params: { modelId: target.id } });
  }

  function handleCopy(kit: IVehicleModelKit, target: IVehicleModel) {
    if (!model) return;
    void kitMutations.copyToModel(kit, model, target);
  }

  /** Drift → curation: carry the part into the kit editor instead of making the
   *  user search for it again. */
  function handleAddPart(part: IPart) {
    if (!model) return;
    const target = overview.kits[0];
    if (target) {
      void navigate({
        to: "/app/kits/$modelId/kit/$kitId/editar",
        params: { modelId: model.id, kitId: target.id },
        search: { addPartId: part.id },
      });
      return;
    }
    void navigate({
      to: "/app/kits/$modelId/kit/novo",
      params: { modelId: model.id },
      search: { addPartId: part.id },
    });
  }

  const yearRange = model ? formatYearRange(model.yearStart, model.yearEnd) : null;
  const breadcrumbName = model ? `${model.brand} ${model.model} · ${model.engine}` : "…";

  const kitsFact = (() => {
    if (overview.kits.length === 0) return "nenhum";
    const drafts = overview.draftCount;
    return `${overview.kits.length}${drafts > 0 ? ` (${drafts} rascunho)` : ""}`;
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 pb-16">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={goBack} className="gap-1 px-1">
          <Icon icon="mdi:chevron-left" size={16} />
          Kits por modelo
        </Button>
        <Icon icon="mdi:chevron-right" size={14} className="opacity-50" />
        <span className="max-w-xs truncate text-foreground">{breadcrumbName}</span>
      </div>

      {modelQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-36 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : !model ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground">
          <Icon icon="mdi:alert-circle-outline" size={40} className="opacity-40" />
          <div>
            <p className="font-medium text-foreground">Modelo não encontrado</p>
            <p className="text-sm">O modelo solicitado não existe ou foi removido.</p>
          </div>
          <Button variant="outline" onClick={goBack}>
            Voltar ao catálogo
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Identity + the facts that say whether this model is covered */}
          <header className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start gap-4">
              <BrandAvatar brand={model.brand} className="size-11" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold uppercase tracking-wide text-foreground">
                    {model.brand} {model.model}
                  </h1>
                  {model.status === "ativo" ? (
                    <Badge className="border border-severity-success/30 bg-severity-success/15 text-severity-success hover:bg-severity-success/20">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inativo
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground/70">{model.engine}</span>
                  {yearRange && (
                    <span className="text-xs tabular-nums text-muted-foreground">{yearRange}</span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {canManageModel && (
                  <>
                    <Button variant="ghost" size="sm" onClick={handleEdit} className="gap-1.5">
                      <Icon icon="mdi:pencil-outline" size={16} />
                      Editar modelo
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleToggleStatus}
                      disabled={mutations.saving}
                      className="gap-1.5"
                    >
                      <Icon
                        icon={model.status === "ativo" ? "mdi:archive-outline" : "mdi:restore"}
                        size={16}
                      />
                      {model.status === "ativo" ? "Inativar" : "Reativar"}
                    </Button>
                  </>
                )}
                {canCreateKit && (
                  <Button size="sm" onClick={() => handleBuildFor(model)} className="gap-1.5">
                    <Icon icon="mdi:plus" size={16} />
                    Montar kit
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
              <ModelFact
                icon="mdi:package-variant-closed"
                label="Peças compatíveis"
                value={String(overview.compatibleParts.length)}
                muted={overview.compatibleParts.length === 0}
              />
              <ModelFact
                icon="mdi:toolbox-outline"
                label="Kits"
                value={kitsFact}
                muted={overview.kits.length === 0}
              />
              <ModelFact
                icon="mdi:history"
                label="Aplicado em orçamentos"
                value={overview.appliedTotal > 0 ? `${overview.appliedTotal}×` : "—"}
                muted={overview.appliedTotal === 0}
              />
              <ModelFact
                icon="mdi:clock-outline"
                label="Última curadoria"
                value={overview.lastCuratedAt ? formatDateBR(overview.lastCuratedAt) : "—"}
                muted={!overview.lastCuratedAt}
              />
            </div>
          </header>

          <EngineVariantsCard
            model={model}
            siblings={siblings}
            kitsBySibling={kitsBySibling}
            currentKits={overview.kits}
            canManage={canCreateKit}
            onOpen={handleOpenSibling}
            onBuild={handleBuildFor}
            onCopy={handleCopy}
          />

          <ModelKitsSection
            model={model}
            kits={overview.kits}
            partsById={overview.partsById}
            compatiblePartsCount={overview.compatibleParts.length}
            applicationCounts={overview.applicationCounts}
            applicationsReady={overview.applicationsReady}
            copyTargets={copyTargets}
            isLoading={overview.isLoading}
            isError={overview.isError}
            onRetry={overview.refetch}
            onCopyTo={handleCopy}
          />

          <ModelCompatiblePartsCard
            parts={overview.partsOutsideKits}
            onAdd={canCurateKit ? handleAddPart : undefined}
          />
        </div>
      )}
    </div>
  );
}
