import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IPart, IVehicle } from "@/shared/types";
import { cn } from "@/lib/utils";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";
import { useCompatibleParts } from "../../../hooks/useCompatibleParts";
import { useCompatiblePartsView } from "../../../hooks/useCompatiblePartsView";
import { CURADORIA_TOP_N, CATALOGO_PAGE_SIZE } from "../../../config/compatibleParts";
import { CompatiblePartsModeToggle } from "./CompatiblePartsModeToggle";
import { KitCallout } from "./KitCallout";
import { CuradoriaView } from "./CuradoriaView";
import { CatalogoView } from "./CatalogoView";
import { KitOnlyView } from "./KitOnlyView";
import { CompatiblePartsEmpty } from "./CompatiblePartsEmpty";

const SECTION_COPY = VEHICLE_STRINGS.detail.sections;
const COMPATIBLE_COPY = VEHICLE_STRINGS.detail.compatibleV2;
const NOT_CATALOGUED_COPY = VEHICLE_STRINGS.detail.notCatalogued;

export interface ICompatiblePartsProps {
  vehicle: IVehicle;
  canEdit: boolean;
  onRequestLinkModel: () => void;
  className?: string;
}

export function CompatibleParts({
  vehicle,
  canEdit,
  onRequestLinkModel,
  className,
}: ICompatiblePartsProps) {
  const navigate = useNavigate();
  const data = useCompatibleParts(vehicle);
  const [view, setView] = useCompatiblePartsView();
  const [showingAll, setShowingAll] = useState(false);

  // Resolve names for the kit callout from the kit's own parts (not just the
  // application-matched slice), so every kit item shows its real name.
  const kitPartsById = useMemo(
    () => new Map(data.kitParts.map((p) => [p.id, p] as const)),
    [data.kitParts],
  );

  const kitPartIds = useMemo(
    () => new Set(data.applicableKit?.items.map((i) => i.partId) ?? []),
    [data.applicableKit],
  );

  const onAddToQuote = (_part: IPart) => {
    void navigate({ to: "/app/orcamentos/novo" });
  };

  // ── Orphan: no model linked ──────────────────────────────────────────────
  if (vehicle.modelId == null) {
    return (
      <section className={cn("space-y-3", className)}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {SECTION_COPY.compatible}
          </h2>
        </div>
        <CompatiblePartsEmpty
          icon="mdi:package-variant"
          title={NOT_CATALOGUED_COPY.orphanPartsTitle}
          description={NOT_CATALOGUED_COPY.orphanPartsDescription}
          action={
            canEdit
              ? { label: VEHICLE_STRINGS.detail.linkModel.trigger, onClick: onRequestLinkModel }
              : undefined
          }
        />
      </section>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (data.isLoading) {
    return (
      <section className={cn("space-y-3", className)}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {SECTION_COPY.compatible}
          </h2>
          <CompatiblePartsModeToggle value={view} onChange={setView} />
        </div>
        <div className="space-y-2">
          <div className="h-10 animate-pulse rounded bg-muted/40" />
          <div className="h-10 animate-pulse rounded bg-muted/40" />
          <div className="h-10 animate-pulse rounded bg-muted/40" />
          <div className="h-10 animate-pulse rounded bg-muted/40" />
        </div>
      </section>
    );
  }

  // ── Main render (model is linked, data is loaded) ────────────────────────
  return (
    <section className={cn("space-y-3", className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {SECTION_COPY.compatible}
        </h2>
        <CompatiblePartsModeToggle value={view} onChange={setView} />
      </div>

      {/* Kit callout — shown in all modes when an official kit exists */}
      {data.applicableKit && (
        <KitCallout
          kit={data.applicableKit}
          partsById={kitPartsById}
          onSeeKit={() =>
            void navigate({
              to: "/app/kits/$modelId/kit/$kitId/editar",
              params: {
                modelId: data.applicableKit!.modelId,
                kitId: data.applicableKit!.id,
              },
            })
          }
        />
      )}

      {/* Empty state — model linked but neither compatible parts nor a kit */}
      {data.parts.length === 0 && data.kitParts.length === 0 ? (
        <CompatiblePartsEmpty title={COMPATIBLE_COPY.emptyCatalogued} description="" />
      ) : (
        <>
          {view === "curadoria" && (
            <CuradoriaView
              inKit={data.kitParts}
              drift={data.drift}
              topN={CURADORIA_TOP_N}
              showingAll={showingAll}
              onSeeAll={() => setShowingAll(true)}
              onAddToQuote={onAddToQuote}
            />
          )}
          {view === "catalogo" && (
            <CatalogoView
              parts={data.parts}
              kitPartIds={kitPartIds}
              pageSize={CATALOGO_PAGE_SIZE}
              onAddToQuote={onAddToQuote}
            />
          )}
          {view === "kit" && <KitOnlyView inKit={data.kitParts} onAddToQuote={onAddToQuote} />}
        </>
      )}
    </section>
  );
}
