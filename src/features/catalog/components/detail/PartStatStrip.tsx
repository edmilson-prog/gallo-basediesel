import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { resolvePriceTables } from "../../utils/pricing";

const COPY = CATALOG_STRINGS.detail.statStrip;

interface IStatCell {
  icon: string;
  label: string;
  value: React.ReactNode;
  accent?: "warn" | "danger";
}

export interface IPartStatStripProps {
  part: IPart;
}

/** Full-width KPI strip mirroring the vehicle/customer detail pattern. */
export function PartStatStrip({ part }: IPartStatStripProps) {
  const tables = resolvePriceTables(part);
  const padrao = tables.find((t) => t.id === "padrao");
  const isZero = part.stockAvailable <= 0;
  const isLow = !isZero && part.stockAvailable <= part.stockMinimum;

  const cells: IStatCell[] = [
    {
      icon: "mdi:tag-outline",
      label: COPY.standardPrice,
      value: padrao ? formatBRL(padrao.price) : formatBRL(part.unitPrice),
    },
    {
      icon: "mdi:scale-balance",
      label: COPY.avgCost,
      value:
        part.averageCost != null ? formatBRL(part.averageCost) : formatBRL(part.unitCost || null),
    },
    {
      icon: "mdi:warehouse",
      label: COPY.stock,
      value:
        isLow || isZero ? `${part.stockAvailable} (${COPY.belowMin})` : String(part.stockAvailable),
      accent: isZero ? "danger" : isLow ? "warn" : undefined,
    },
    {
      icon: "mdi:map-marker-outline",
      label: COPY.location,
      value: part.storageLocation ?? COPY.empty,
    },
    {
      icon: "mdi:percent-outline",
      label: COPY.margin,
      value: formatPercent(part.marginPercent),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon={cell.icon} size={11} />
            {cell.label}
          </dt>
          <dd
            className={cn(
              "mt-1 text-sm font-semibold tabular-nums text-foreground",
              cell.accent === "warn" && "text-amber-600 dark:text-amber-300",
              cell.accent === "danger" && "text-destructive",
            )}
          >
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
