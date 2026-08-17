import type { ID, ISupplier, ISupplierStats } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.kpis;

interface ISuppliersKpiStripProps {
  suppliers: ISupplier[];
  statsIndex: Map<ID, ISupplierStats> | null;
  /** Clicking "Com CNPJ" filters the list down to the ones still missing it. */
  onFilterMissingDocument: () => void;
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SuppliersKpiStrip({
  suppliers,
  statsIndex,
  onFilterMissingDocument,
}: ISuppliersKpiStripProps) {
  const active = suppliers.length;
  const withDocument = suppliers.filter((s) => Boolean(s.document)).length;
  const linkedParts = statsIndex
    ? Array.from(statsIndex.values()).reduce((sum, s) => sum + s.linkedParts, 0)
    : null;
  const purchases = statsIndex
    ? Array.from(statsIndex.values()).reduce((sum, s) => sum + s.purchasesLast12Months, 0)
    : null;
  const leadTimes = suppliers
    .map((s) => s.leadTimeDays)
    .filter((d): d is number => typeof d === "number");
  const avgLead = leadTimes.length
    ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
    : null;

  const cells: Array<{
    label: string;
    value: string;
    sub?: string;
    icon: string;
    accent?: boolean;
    onClick?: () => void;
  }> = [
    { label: COPY.active, value: String(active), icon: "mdi:domain" },
    {
      label: COPY.withDocument,
      value: `${withDocument}/${active}`,
      sub: withDocument < active ? COPY.withDocumentHint : undefined,
      icon: "mdi:card-account-details-outline",
      accent: withDocument < active,
      onClick: withDocument < active ? onFilterMissingDocument : undefined,
    },
    {
      label: COPY.linkedParts,
      value: linkedParts === null ? "—" : String(linkedParts),
      icon: "mdi:cog",
    },
    {
      label: COPY.purchases,
      value: purchases === null ? "—" : brl(purchases),
      icon: "mdi:package-variant",
    },
    {
      label: COPY.leadTime,
      value: avgLead === null ? "—" : `${avgLead} ${COPY.leadTimeUnit}`,
      icon: "mdi:timer-sand",
    },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-5">
      {cells.map((cell) => {
        const Tag = cell.onClick ? "button" : "div";
        return (
          <Tag
            key={cell.label}
            {...(cell.onClick ? { type: "button" as const, onClick: cell.onClick } : {})}
            className={cn(
              "bg-card px-4 py-3 text-left",
              cell.onClick && "transition-colors hover:bg-accent",
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon icon={cell.icon} size={13} />
              {cell.label}
            </span>
            <span
              className={cn(
                "mt-1 block text-2xl font-bold leading-none",
                cell.accent ? "text-severity-warning" : "text-foreground",
              )}
            >
              {cell.value}
            </span>
            {cell.sub && (
              <span className="mt-1.5 block text-[11px] text-muted-foreground">{cell.sub}</span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}
