import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { marginHealth, marginOnPrice, resolvePriceTables } from "../../utils/pricing";

const COPY = CATALOG_STRINGS.detail.statStrip;

const HEALTH_TEXT: Record<ReturnType<typeof marginHealth>, string> = {
  success: "text-severity-success",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
};

interface IStatCell {
  icon: string;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub: React.ReactNode;
  subClass?: string;
  subIcon?: string;
}

export interface IPartStatStripProps {
  part: IPart;
}

/** Full-width KPI strip with display-size values (design kit `CatKpiStrip`). */
export function PartStatStrip({ part }: IPartStatStripProps) {
  const tables = resolvePriceTables(part);
  const padrao = tables.find((t) => t.id === "padrao");
  const standardPrice = padrao?.price ?? part.unitPrice;
  const referenceCost = part.averageCost ?? part.unitCost;
  const margin = marginOnPrice(standardPrice, referenceCost);
  const isZero = part.stockAvailable <= 0;
  const isLow = !isZero && part.stockAvailable <= part.stockMinimum;

  const cells: IStatCell[] = [
    {
      icon: "mdi:tag-outline",
      label: COPY.standardPrice,
      value: formatBRL(standardPrice),
      sub: padrao ? COPY.standardTable(padrao.label) : COPY.empty,
    },
    {
      icon: "mdi:scale-balance",
      label: COPY.avgCost,
      value: formatBRL(referenceCost),
      sub: COPY.baseCost(formatBRL(part.unitCost || null)),
    },
    {
      icon: "mdi:warehouse",
      label: COPY.stock,
      value: String(part.stockAvailable),
      valueClass: isZero ? "text-severity-critical" : isLow ? "text-severity-warning" : undefined,
      sub:
        isZero || isLow
          ? COPY.belowMin(part.stockMinimum)
          : part.storageLocation
            ? COPY.atLocation(part.storageLocation)
            : COPY.empty,
      subClass: isZero || isLow ? "text-severity-critical" : undefined,
      subIcon: isZero || isLow ? "mdi:alert" : undefined,
    },
    {
      icon: "mdi:map-marker-outline",
      label: COPY.location,
      value: part.storageLocation ?? COPY.empty,
      sub: part.storageLocation ? COPY.locationDefined : COPY.locationUndefined,
    },
    {
      icon: "mdi:percent-outline",
      label: COPY.margin,
      value: formatPercent(margin),
      valueClass: HEALTH_TEXT[marginHealth(margin)],
      sub: COPY.onStandardPrice,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-4 py-3.5">
          <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon={cell.icon} size={12} />
            {cell.label}
          </dt>
          <dd className="mt-2">
            <span
              className={cn(
                "block truncate text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground",
                cell.valueClass,
              )}
            >
              {cell.value}
            </span>
            <span
              className={cn(
                "mt-1.5 flex items-center gap-1 text-xs text-muted-foreground",
                cell.subClass,
              )}
            >
              {cell.subIcon && <Icon icon={cell.subIcon} size={12} />}
              {cell.sub}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
