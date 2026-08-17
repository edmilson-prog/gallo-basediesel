import { useMemo } from "react";
import type { ID, IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { usePartsIndex } from "@/features/quotes/hooks/usePartsIndex";
import { useModelKits } from "@/features/model-kits/hooks/useModelKits";
import { useKitApplicationCounts } from "@/features/model-kits/hooks/useKitApplicationCounts";
import { getCompatiblePartsForModel } from "@/features/model-kits/utils/modelKitDrift";
import {
  computeKitCoverage,
  groupKitsByModel,
  sortKitsByCuration,
  type IKitCoverage,
} from "@/features/model-kits/engine";
import { useVehicleModels } from "./useVehicleModels";

export interface IModelCatalogOverview {
  /** Catalog honouring the inactive toggle — what coverage is measured against. */
  models: IVehicleModel[];
  partsById: Map<ID, IPart>;
  /** Kits per model, official first. Absent from the map means no kit. */
  kitsByModel: Map<ID, IVehicleModelKit[]>;
  /** Catalog parts reaching each model — the pool a kit would be curated from. */
  compatibleCountByModel: Map<ID, number>;
  applicationCounts: Record<ID, number>;
  /** False while counts are in flight — a kit is not "ainda não aplicado" yet. */
  applicationsReady: boolean;
  coverage: IKitCoverage;
  isLoading: boolean;
  isError: boolean;
}

export interface IUseModelCatalogOverviewParams {
  includeInactive: boolean;
}

/**
 * Everything the model list reads: the catalog, the kits hanging off it, how
 * many catalog parts reach each model and how often each kit was applied.
 *
 * Kits are fetched unfiltered and grouped here rather than queried per model —
 * the coverage strip needs all of them at once, and one request beats twenty-one.
 */
export function useModelCatalogOverview({
  includeInactive,
}: IUseModelCatalogOverviewParams): IModelCatalogOverview {
  // Brand and search filter client-side; only the status filter reaches the provider.
  const modelsQuery = useVehicleModels(includeInactive ? {} : { status: "ativo" });
  const kitsQuery = useModelKits({});
  const { partsById, allParts, isLoading: partsLoading } = usePartsIndex();

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const kits = useMemo(() => kitsQuery.data ?? [], [kitsQuery.data]);

  const kitsByModel = useMemo(() => {
    const grouped = groupKitsByModel(kits);
    for (const [modelId, list] of grouped) grouped.set(modelId, sortKitsByCuration(list));
    return grouped;
  }, [kits]);

  const kitIds = useMemo(() => kits.map((k) => k.id), [kits]);
  const applicationsQuery = useKitApplicationCounts(kitIds);
  const applicationCounts = useMemo(() => applicationsQuery.data ?? {}, [applicationsQuery.data]);

  // Keyed on the catalog and the parts, never on the visible filters — the count
  // behind "N peças compatíveis" must not be recomputed while the user types.
  const compatibleCountByModel = useMemo(() => {
    const counts = new Map<ID, number>();
    for (const model of models) {
      counts.set(model.id, getCompatiblePartsForModel(model, allParts).length);
    }
    return counts;
  }, [models, allParts]);

  const coverage = useMemo(() => computeKitCoverage(models, kits), [models, kits]);

  return {
    models,
    partsById,
    kitsByModel,
    compatibleCountByModel,
    applicationCounts,
    applicationsReady: kitIds.length === 0 || applicationsQuery.isSuccess,
    coverage,
    isLoading: modelsQuery.isLoading || kitsQuery.isLoading || partsLoading,
    isError: modelsQuery.isError || kitsQuery.isError,
  };
}
