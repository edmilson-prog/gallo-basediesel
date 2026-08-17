import { useId } from "react";
import type { ID, IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import type { IBrandGroup as IBrandGroupData } from "../engine";
import { BrandAvatar } from "./BrandAvatar";
import { VehicleModelRow, type ISiblingKitOffer } from "./VehicleModelRow";

/** The catalog-wide data and handlers every row in the group reads. */
export interface IModelRowContext {
  partsById: Map<ID, IPart>;
  kitsByModel: Map<ID, IVehicleModelKit[]>;
  compatibleCountByModel: Map<ID, number>;
  applicationCounts: Record<ID, number>;
  applicationsReady: boolean;
  /** The sibling kit this model could copy, when it has none of its own. */
  siblingOfferFor: (model: IVehicleModel) => ISiblingKitOffer | undefined;
  canManage: boolean;
  canBuildKit: boolean;
  onOpen: (m: IVehicleModel) => void;
  onBuild: (m: IVehicleModel) => void;
  onCopy: (offer: ISiblingKitOffer, target: IVehicleModel) => void;
  onEdit: (m: IVehicleModel) => void;
  onToggleStatus: (m: IVehicleModel) => void;
  onDelete: (m: IVehicleModel) => void;
}

export interface IBrandGroupProps {
  group: IBrandGroupData<IVehicleModel>;
  context: IModelRowContext;
}

/**
 * One brand, with the engines of a designation kept together. A single-engine
 * designation is a plain row; two or more get a block header, because
 * `FH 460 D13K460` and `FH 460 D13K500` are the same truck at the counter and
 * reading them twenty rows apart is what hid the copy opportunity.
 */
export function BrandGroup({ group, context }: IBrandGroupProps) {
  const headingId = useId();

  function row(model: IVehicleModel, indent?: boolean) {
    return (
      <VehicleModelRow
        key={model.id}
        model={model}
        indent={indent}
        kits={context.kitsByModel.get(model.id) ?? []}
        partsById={context.partsById}
        compatibleCount={context.compatibleCountByModel.get(model.id) ?? 0}
        applicationCounts={context.applicationCounts}
        applicationsReady={context.applicationsReady}
        siblingOffer={context.siblingOfferFor(model)}
        canManage={context.canManage}
        canBuildKit={context.canBuildKit}
        onOpen={context.onOpen}
        onBuild={context.onBuild}
        onCopy={context.onCopy}
        onEdit={context.onEdit}
        onToggleStatus={context.onToggleStatus}
        onDelete={context.onDelete}
      />
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <BrandAvatar brand={group.brand} className="size-6" />
        <h2 id={headingId} className="flex-1 text-sm font-semibold text-foreground">
          {group.brand}
        </h2>
        <span className="text-xs text-muted-foreground">
          {group.count} {group.count === 1 ? "modelo" : "modelos"}
        </span>
      </header>

      {group.blocks.map((block) => {
        const onlyEngine = block.engines.length === 1 ? block.engines[0] : undefined;
        if (onlyEngine) return row(onlyEngine);

        return (
          <div key={`${group.brand}-${block.model}`} className="border-t border-border">
            <div className="flex items-center gap-2.5 px-3 pb-0.5 pt-2">
              <BrandAvatar brand={group.brand} className="size-7" />
              <span className="text-sm font-semibold text-foreground">{block.model}</span>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {block.engines.length} motores
              </Badge>
            </div>
            {block.engines.map((engine) => row(engine, true))}
          </div>
        );
      })}
    </section>
  );
}
