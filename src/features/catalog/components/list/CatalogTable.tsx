import { Fragment } from "react";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel } from "../../utils/categories";
import { type CatalogOrderBy, type ICatalogListSort } from "../../utils/listFilters";
import { PartImage } from "../PartImage";
import { StockBadge } from "../StockBadge";

export interface ICatalogTableProps {
  parts: IPart[];
  isLoading: boolean;
  sort: ICatalogListSort;
  onSortChange: (sort: ICatalogListSort) => void;
  onRowClick: (id: string) => void;
}

interface ISortableHeaderProps {
  label: string;
  field: CatalogOrderBy;
  sort: ICatalogListSort;
  onSortChange: ICatalogTableProps["onSortChange"];
  align?: "left" | "right";
}

function SortableHeader({
  label,
  field,
  sort,
  onSortChange,
  align = "left",
}: ISortableHeaderProps) {
  const active = sort.orderBy === field;
  const dir = active ? sort.orderDir : undefined;
  const icon = active
    ? dir === "asc"
      ? "mdi:arrow-up"
      : "mdi:arrow-down"
    : "mdi:unfold-more-horizontal";
  return (
    <button
      type="button"
      onClick={() =>
        onSortChange({
          orderBy: field,
          orderDir: !active ? "asc" : dir === "asc" ? "desc" : "asc",
        })
      }
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground",
        align === "right" && "ml-auto",
      )}
    >
      {label}
      <Icon icon={icon} size={12} />
    </button>
  );
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function applicationsLabel(part: IPart): string {
  const first = part.applications[0];
  if (!first) return "—";
  const head = `${first.vehicleBrand} ${first.vehicleModel}`;
  if (part.applications.length === 1) return head;
  return `${head} +${part.applications.length - 1}`;
}

export function CatalogTable({
  parts,
  isLoading,
  sort,
  onSortChange,
  onRowClick,
}: ICatalogTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <tr className="text-left">
            <th className="w-14 px-4 py-2"></th>
            <th className="px-2 py-2">
              <SortableHeader
                label={CATALOG_STRINGS.columns.name}
                field="name"
                sort={sort}
                onSortChange={onSortChange}
              />
            </th>
            <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {CATALOG_STRINGS.columns.oem}
            </th>
            <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {CATALOG_STRINGS.columns.category}
            </th>
            <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {CATALOG_STRINGS.columns.manufacturer}
            </th>
            <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {CATALOG_STRINGS.columns.applications}
            </th>
            <th className="px-2 py-2 text-right">
              <SortableHeader
                label={CATALOG_STRINGS.columns.price}
                field="unitPrice"
                sort={sort}
                onSortChange={onSortChange}
                align="right"
              />
            </th>
            <th className="px-2 py-2 text-right">
              <SortableHeader
                label={CATALOG_STRINGS.columns.stock}
                field="stockAvailable"
                sort={sort}
                onSortChange={onSortChange}
                align="right"
              />
            </th>
            <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {CATALOG_STRINGS.columns.status}
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading && parts.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border">
                  <td className="px-4 py-3">
                    <Skeleton className="h-10 w-10 rounded-md" />
                  </td>
                  <td className="px-2 py-3" colSpan={8}>
                    <Skeleton className="h-4 w-3/4" />
                  </td>
                </tr>
              ))
            : parts.map((part) => (
                <Fragment key={part.id}>
                  <tr
                    onClick={() => onRowClick(part.id)}
                    className={cn(
                      "cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                      !part.active && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-3">
                      <PartImage part={part} size="sm" />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{part.name}</span>
                        <span className="text-xs text-muted-foreground">{part.sku}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 font-mono text-xs text-foreground">
                      {part.oemCodes[0] ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-foreground">
                      <div className="flex flex-col">
                        <span className="text-xs">{getCategoryLabel(part.category)}</span>
                        {part.subcategory && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {part.subcategory}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground">{part.brand}</span>
                        {part.isOriginal && (
                          <span className="inline-flex items-center rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                            {CATALOG_STRINGS.badges.original}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-xs text-muted-foreground">
                      {applicationsLabel(part)}
                    </td>
                    <td className="px-2 py-3 text-right font-medium text-foreground">
                      {formatPrice(part.unitPrice)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <StockBadge part={part} variant="compact" />
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs",
                          part.active
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            part.active ? "bg-emerald-500" : "bg-muted-foreground",
                          )}
                          aria-hidden="true"
                        />
                        {part.active
                          ? CATALOG_STRINGS.status.active
                          : CATALOG_STRINGS.status.inactive}
                      </span>
                    </td>
                  </tr>
                </Fragment>
              ))}
        </tbody>
      </table>
    </div>
  );
}
