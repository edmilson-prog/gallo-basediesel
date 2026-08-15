import { useMemo } from "react";
import type { ID, IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { usePartsIndex } from "@/features/quotes/hooks/usePartsIndex";
import { getCompatiblePartsForModel, getPartsOutsideKits } from "../utils/modelKitDrift";
import { useModelKits } from "./useModelKits";
import { useKitApplicationCounts } from "./useKitApplicationCounts";

export interface IModelKitsOverview {
  kits: IVehicleModelKit[];
  partsById: Map<ID, IPart>;
  /** Catalog parts that reach this model — the pool a kit is curated from. */
  compatibleParts: IPart[];
  /** Compatible parts no kit of this model carries yet. */
  partsOutsideKits: IPart[];
  applicationCounts: Record<ID, number>;
  /** False while the counts are in flight — a kit is not "ainda não aplicado" yet. */
  applicationsReady: boolean;
  appliedTotal: number;
  draftCount: number;
  /** Most recent kit curation for this model. */
  lastCuratedAt?: string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Official kits first, then alphabetical — curation order, not insertion order. */
function sortKits(kits: IVehicleModelKit[]): IVehicleModelKit[] {
  return [...kits].sort((a, b) =>
    a.status !== b.status
      ? a.status === "oficial"
        ? -1
        : 1
      : a.name.localeCompare(b.name, "pt-BR"),
  );
}

/**
 * Everything the model ficha reads about its kits, in one place: the kits
 * themselves, the compatible catalog behind them, what is still outside a kit
 * and how often each kit reached a quote.
 */
export function useModelKitsOverview(model: IVehicleModel | undefined): IModelKitsOverview {
  const kitsQuery = useModelKits({ modelId: model?.id }, { enabled: Boolean(model) });
  const { partsById, allParts, isLoading: partsLoading } = usePartsIndex(Boolean(model));

  const kits = useMemo(() => sortKits(kitsQuery.data ?? []), [kitsQuery.data]);
  const kitIds = useMemo(() => kits.map((k) => k.id), [kits]);
  const applicationsQuery = useKitApplicationCounts(kitIds);
  // Stable identity: `?? {}` inline would be a new object on every render and
  // would defeat the memos below.
  const applicationCounts = useMemo(() => applicationsQuery.data ?? {}, [applicationsQuery.data]);

  const compatibleParts = useMemo(
    () => getCompatiblePartsForModel(model, allParts),
    [model, allParts],
  );
  const partsOutsideKits = useMemo(
    () => getPartsOutsideKits(kits, model, allParts),
    [kits, model, allParts],
  );

  const appliedTotal = useMemo(
    () => kitIds.reduce((sum, id) => sum + (applicationCounts[id] ?? 0), 0),
    [kitIds, applicationCounts],
  );

  const lastCuratedAt = useMemo(() => {
    const stamps = kits.map((k) => k.updatedAt).filter(Boolean);
    return stamps.length > 0 ? stamps.sort().at(-1) : undefined;
  }, [kits]);

  return {
    kits,
    partsById,
    compatibleParts,
    partsOutsideKits,
    applicationCounts,
    applicationsReady: kitIds.length === 0 || applicationsQuery.isSuccess,
    appliedTotal,
    draftCount: kits.filter((k) => k.status === "rascunho").length,
    lastCuratedAt,
    isLoading: kitsQuery.isLoading || partsLoading,
    isError: kitsQuery.isError,
    refetch: () => void kitsQuery.refetch(),
  };
}
