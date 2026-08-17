import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import type {
  ID,
  IKitItem,
  IPart,
  IVehicleModel,
  IVehicleModelKit,
  ModelKitStatus,
} from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/features/auth/useAuth";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { usePartsIndex } from "@/features/quotes/hooks/usePartsIndex";
import { useVehicleModel } from "@/features/vehicle-models/hooks/useVehicleModel";
import { useVehicleModels } from "@/features/vehicle-models/hooks/useVehicleModels";
import { getCompatiblePartsForModel } from "../utils/modelKitDrift";
import {
  CATEGORY_FAMILIES,
  computeKitTotals,
  findAlsoForCandidates,
  findStartFromCandidates,
  getFamilyCoverage,
  groupKitsByModel,
  renameKitForModel,
  resolvePartFamily,
  type KitFamily,
} from "../engine";
import { useModelKit } from "../hooks/useModelKit";
import { useModelKits } from "../hooks/useModelKits";
import { useModelKitMutations } from "../hooks/useModelKitMutations";
import { useKitApplicationCounts } from "../hooks/useKitApplicationCounts";
import { useKitDraft } from "../hooks/useKitDraft";
import { KitBuildHeader } from "../components/KitBuildHeader";
import { KitStartFromCard } from "../components/KitStartFromCard";
import { KitFamilySlot, type IKitSlotLine } from "../components/KitFamilySlot";
import { KitEditorPartLine } from "../components/KitEditorPartLine";
import { KitCatalogPanel } from "../components/KitCatalogPanel";
import { KitAlsoForCard } from "../components/KitAlsoForCard";
import { KitSaveBar } from "../components/KitSaveBar";

const FALLBACK_STORE_ID = "00000000-0000-0000-0000-000000000001";

export function ModelKitFormPage() {
  const navigate = useNavigate();

  // strict: false — shared between create (/kit/novo) and edit (/kit/$kitId/editar)
  const { modelId, kitId } = useParams({ strict: false }) as { modelId?: string; kitId?: string };
  const { addPartId } = useSearch({ strict: false }) as { addPartId?: string };

  const modelQuery = useVehicleModel(modelId);
  const kitQuery = useModelKit(kitId);
  const modelsQuery = useVehicleModels({});
  const kitsQuery = useModelKits({});
  const parts = usePartsIndex();

  const model = modelQuery.data;
  const kit = kitId ? kitQuery.data : undefined;

  const loading =
    modelQuery.isLoading ||
    (Boolean(kitId) && kitQuery.isLoading) ||
    modelsQuery.isLoading ||
    kitsQuery.isLoading ||
    parts.isLoading;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-32 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Modelo não encontrado.</p>
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/app/kits" })}>
          Voltar ao catálogo
        </Button>
      </div>
    );
  }

  return (
    <KitBuildView
      // Remounting on the kit resets the draft — the editor holds no stale composition.
      key={kit?.id ?? "new"}
      model={model}
      kit={kit}
      models={modelsQuery.data ?? []}
      kits={kitsQuery.data ?? []}
      partsById={parts.partsById}
      allParts={parts.allParts}
      seedPartId={addPartId}
    />
  );
}

interface IKitBuildViewProps {
  model: IVehicleModel;
  kit?: IVehicleModelKit;
  models: IVehicleModel[];
  kits: IVehicleModelKit[];
  partsById: Map<ID, IPart>;
  allParts: IPart[];
  seedPartId?: ID;
}

/**
 * Direction A: the kit is a template. One slot per family the category expects,
 * required ones marked, each empty slot listing the compatible parts that could
 * fill it. It teaches what is missing — which is the shape that fits a catalog
 * where every kit being curated is the first kit of its engine.
 */
function KitBuildView({
  model,
  kit,
  models,
  kits,
  partsById,
  allParts,
  seedPartId,
}: IKitBuildViewProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const canPublish = hasPermission(currentUser, "modelKit", "edit");
  const mutations = useModelKitMutations();

  const draft = useKitDraft({ model, kit, seedPartId });
  const [alsoFor, setAlsoFor] = useState<ID[]>([]);

  const applicationCounts = useKitApplicationCounts(kit ? [kit.id] : []);

  const inKit = useMemo(() => new Set(draft.items.map((i) => i.partId)), [draft.items]);

  const compatibleParts = useMemo(
    () => getCompatiblePartsForModel(model, allParts),
    [model, allParts],
  );
  const compatiblePartIds = useMemo(
    () => new Set(compatibleParts.map((p) => p.id)),
    [compatibleParts],
  );

  /** Composition split into the category's slots, with anything else as extras. */
  const { linesByFamily, extras, slots } = useMemo(() => {
    const configured = CATEGORY_FAMILIES[draft.category].slots;
    const byFamily = new Map<KitFamily, IKitSlotLine[]>();
    const rest: Array<{ item: IKitItem; part: IPart | undefined }> = [];

    for (const item of draft.items) {
      const part = partsById.get(item.partId);
      const family = part ? resolvePartFamily(part) : null;
      if (part && family && configured.includes(family)) {
        const list = byFamily.get(family);
        if (list) list.push({ item, part });
        else byFamily.set(family, [{ item, part }]);
        continue;
      }
      rest.push({ item, part });
    }

    return { linesByFamily: byFamily, extras: rest, slots: configured };
  }, [draft.items, draft.category, partsById]);

  const candidatesByFamily = useMemo(() => {
    const byFamily = new Map<KitFamily, IPart[]>();
    for (const part of compatibleParts) {
      if (inKit.has(part.id)) continue;
      const family = resolvePartFamily(part);
      if (!family || !slots.includes(family)) continue;
      const list = byFamily.get(family);
      if (list) list.push(part);
      else byFamily.set(family, [part]);
    }
    return byFamily;
  }, [compatibleParts, inKit, slots]);

  const totals = useMemo(() => {
    const lines = draft.items.flatMap((item) => {
      const part = partsById.get(item.partId);
      return part
        ? [{ part, defaultQuantity: item.defaultQuantity, isOptional: item.isOptional }]
        : [];
    });
    return computeKitTotals(lines);
  }, [draft.items, partsById]);

  const missingRequired = useMemo(() => {
    const entries = draft.items.flatMap((item) => {
      const part = partsById.get(item.partId);
      return part
        ? [{ subcategory: part.subcategory, name: part.name, isOptional: item.isOptional }]
        : [];
    });
    return getFamilyCoverage(draft.category, entries).missingRequired;
  }, [draft.items, draft.category, partsById]);

  const kitsByModel = useMemo(() => groupKitsByModel(kits), [kits]);
  const modelsById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const startFrom = useMemo(() => {
    if (kit || draft.items.length > 0) return [];
    return findStartFromCandidates({ target: model, kits, modelsById, compatiblePartIds });
  }, [kit, draft.items.length, model, kits, modelsById, compatiblePartIds]);

  const alsoForCandidates = useMemo(() => {
    const basePartIds = draft.items.filter((i) => !i.isOptional).map((i) => i.partId);
    const compatibleCache = new Map<ID, Set<ID>>();
    return findAlsoForCandidates({
      source: model,
      models,
      modelsWithKits: new Set(kitsByModel.keys()),
      basePartIds,
      compatiblePartIdsFor: (id) => {
        const cached = compatibleCache.get(id);
        if (cached) return cached;
        const target = modelsById.get(id);
        const ids = new Set(getCompatiblePartsForModel(target, allParts).map((p) => p.id));
        compatibleCache.set(id, ids);
        return ids;
      },
    });
  }, [draft.items, model, models, kitsByModel, modelsById, allParts]);

  // Picks whose model stopped qualifying (a part was removed) must not be saved.
  const validAlsoFor = useMemo(
    () => alsoFor.filter((id) => alsoForCandidates.some((c) => c.model.id === id)),
    [alsoFor, alsoForCandidates],
  );

  const error =
    draft.items.length === 0
      ? "Adicione ao menos uma peça ao kit."
      : draft.name.trim() === ""
        ? "Informe o nome do kit."
        : null;

  function backToModel() {
    void navigate({ to: "/app/kits/$modelId", params: { modelId: model.id } });
  }

  async function save(status: ModelKitStatus) {
    const storeId = kit?.storeId ?? currentUser?.storeId ?? FALLBACK_STORE_ID;
    const name = draft.name.trim();
    const items = draft.items.map((item) => ({ ...item }));

    try {
      await mutations.saveKit({
        existingKitId: kit?.id,
        primary: { modelId: model.id, storeId, name, category: draft.category, status, items },
        copies: validAlsoFor.flatMap((id) => {
          const target = modelsById.get(id);
          if (!target) return [];
          return [
            {
              modelId: id,
              storeId,
              name: renameKitForModel(name, model, target),
              category: draft.category,
              status,
              items: items.map((item) => ({ ...item })),
            },
          ];
        }),
      });
      backToModel();
    } catch {
      // useModelKitMutations already surfaced the error; stay on the page.
    }
  }

  return (
    <TooltipProvider>
      <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4 pb-2">
        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 px-1"
            onClick={() => void navigate({ to: "/app/kits" })}
          >
            <Icon icon="mdi:chevron-left" size={16} />
            Kits por modelo
          </Button>
          <Icon icon="mdi:chevron-right" size={14} className="opacity-50" />
          <button
            type="button"
            onClick={backToModel}
            className="rounded font-medium underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {model.model} · {model.engine}
          </button>
          <Icon icon="mdi:chevron-right" size={14} className="opacity-50" />
          <span className="text-foreground">{kit ? "Editar kit" : "Novo kit"}</span>
        </div>

        <KitBuildHeader
          model={model}
          kit={kit}
          appliedCount={kit ? (applicationCounts.data?.[kit.id] ?? 0) : undefined}
          name={draft.name}
          onNameChange={draft.setName}
          category={draft.category}
          onCategoryChange={draft.setCategory}
        />

        {startFrom.length > 0 && <KitStartFromCard candidates={startFrom} onUse={draft.adopt} />}

        {slots.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {slots.map((family) => (
              <KitFamilySlot
                key={family}
                family={family}
                required={CATEGORY_FAMILIES[draft.category].required.includes(family)}
                lines={linesByFamily.get(family) ?? []}
                candidates={candidatesByFamily.get(family) ?? []}
                engineLabel={model.engine}
                onAdd={draft.add}
                onPatch={draft.patch}
                onRemove={draft.remove}
              />
            ))}
          </div>
        )}

        {(extras.length > 0 || slots.length === 0) && (
          <section className="rounded-xl border border-border bg-card px-4 py-3">
            <header className="flex items-center gap-2">
              <Icon icon="mdi:package-variant" size={15} className="text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {slots.length > 0 ? "Outras peças" : "Peças do kit"}
              </span>
            </header>

            {extras.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Categoria sem famílias definidas — monte a lista livremente pela busca.
              </p>
            ) : (
              extras.map(({ item, part }) => (
                <KitEditorPartLine
                  key={item.partId}
                  item={item}
                  part={part}
                  onPatch={(patch) => draft.patch(item.partId, patch)}
                  onRemove={() => draft.remove(item.partId)}
                />
              ))
            )}
          </section>
        )}

        <KitCatalogPanel
          allParts={allParts}
          inKit={inKit}
          compatiblePartIds={compatiblePartIds}
          onAdd={(partId) => draft.add(partId)}
        />

        <KitAlsoForCard
          candidates={alsoForCandidates}
          selected={validAlsoFor}
          onChange={setAlsoFor}
        />

        <KitSaveBar
          totals={totals}
          missingRequired={missingRequired}
          error={error}
          copyCount={1 + validAlsoFor.length}
          canPublish={canPublish}
          saving={mutations.saving}
          onCancel={backToModel}
          onSave={(status) => void save(status)}
        />
      </div>
    </TooltipProvider>
  );
}
