import { useId } from "react";
import type { IVehicleModel } from "@/shared/types";
import { BrandAvatar } from "./BrandAvatar";
import { VehicleModelRow } from "./VehicleModelRow";

export interface IBrandGroupProps {
  brand: string;
  models: IVehicleModel[];
  canManage: boolean;
  onEdit: (m: IVehicleModel) => void;
  onToggleStatus: (m: IVehicleModel) => void;
  onDelete: (m: IVehicleModel) => void;
}

export function BrandGroup({
  brand,
  models,
  canManage,
  onEdit,
  onToggleStatus,
  onDelete,
}: IBrandGroupProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-card px-4 py-3 shadow-sm">
          <BrandAvatar brand={brand} className="size-8" />
          <h2 id={headingId} className="flex-1 text-base font-semibold text-foreground">
            {brand}
          </h2>
          <span className="text-sm text-muted-foreground">
            {models.length} {models.length === 1 ? "modelo" : "modelos"}
          </span>
        </div>

        {/* Model rows */}
        <div className="px-4 pb-2">
          {models.map((model) => (
            <VehicleModelRow
              key={model.id}
              model={model}
              canManage={canManage}
              onEdit={onEdit}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
