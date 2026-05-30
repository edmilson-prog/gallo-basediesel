import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.compatible;
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;

// Mocks visuais coerentes — substituir quando PRD-030 estiver implementado.
const MOCK_PARTS = [
  { code: "FLT-OIL-DC13", name: "Filtro de óleo motor DC13" },
  { code: "FLT-AIR-DC13", name: "Filtro de ar primário" },
  { code: "FLT-FUEL-DC13", name: "Filtro separador de combustível" },
  { code: "BRK-DISC-FRONT", name: "Disco de freio dianteiro" },
  { code: "BLT-TIMING-DC13", name: "Correia dentada motor DC13" },
];

export interface ICompatiblePartsPlaceholderProps {
  vehicle: IVehicle;
}

export function CompatiblePartsPlaceholder({ vehicle }: ICompatiblePartsPlaceholderProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {SECTION_COPY.compatible}
        </h2>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          PRD-030 (placeholder)
        </Badge>
      </div>
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-4">
        <div className="flex items-start gap-3">
          <Icon icon="mdi:cog-outline" size={20} className="mt-0.5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{COPY.placeholderTitle}</p>
            <p className="text-xs text-muted-foreground">{COPY.placeholderDescription}</p>
          </div>
        </div>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {MOCK_PARTS.map((p) => (
            <li
              key={p.code}
              className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1.5"
            >
              <Icon icon="mdi:wrench" size={12} className="text-muted-foreground" />
              <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
              <span className="truncate text-xs text-foreground">{p.name}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" disabled>
            <Icon icon="mdi:arrow-right" size={12} />
            {COPY.seeAll}
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Aplicações casarão com {vehicle.brand} {vehicle.model} ({vehicle.year})
          {vehicle.engine && ` · ${vehicle.engine}`}.
        </p>
      </div>
    </section>
  );
}
