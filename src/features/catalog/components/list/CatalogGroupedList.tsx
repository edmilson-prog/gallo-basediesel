/**
 * Grouped-by-category reading of the catalog list (the kit's Direção B).
 *
 * Same rows, different question. The flat table asks "what is this part?"; this
 * view asks "how complete is each family, and what is still unclassified?" —
 * so every group header carries its own coverage, and the uncategorised block
 * becomes a triage queue keyed by the raw ERP groups the import left behind.
 */

import { useMemo } from "react";
import type { ID, IPart, PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel, type IPartCategoryDescriptor } from "../../utils/categories";
import { useCategoryDescriptors } from "../../hooks/useCategoryDescriptors";
import { isReadyToSell, MISSING_FIELD_LABELS, missingFields } from "../../utils/completeness";
import { turnoverFor, type IPartTurnover } from "../../utils/turnover";
import { PartChip } from "../detail/PartChip";
import {
  CategoryTile,
  PartApplicationsCell,
  PartCodesCell,
  PartIdentityCell,
  PartMarginCell,
  PartPriceCell,
  PartStockCell,
  PartTurnoverCell,
} from "./CatalogRowCells";

const COPY = CATALOG_STRINGS.groups;

const BASE_TEMPLATE = "38px 44px minmax(240px,1.6fr) 165px 180px 110px";
const MARGIN_TEMPLATE = "118px 118px";
const STOCK_TEMPLATE = "140px";

/** Margin and turnover only occupy a column when the role may read them. */
function gridTemplate(canSeeMargin: boolean): string {
  return [BASE_TEMPLATE, canSeeMargin ? MARGIN_TEMPLATE : "", STOCK_TEMPLATE]
    .filter(Boolean)
    .join(" ");
}

export interface ICatalogGroupedListProps {
  parts: IPart[];
  isLoading: boolean;
  onRowClick: (id: ID) => void;
  scrollRef?: (el: HTMLDivElement | null) => void;
  selectedIds: Set<ID>;
  onToggleRow: (id: ID) => void;
  /** Adds every given part to the selection (never removes). */
  onSelectMany: (parts: IPart[]) => void;
  /** Gates the commercial columns behind the profitability permission. */
  canSeeMargin: boolean;
  turnoverIndex: Map<ID, IPartTurnover> | null;
  isTurnoverLoading: boolean;
  onRestock: (part: IPart) => void;
  onSuggestDeactivate: (part: IPart) => void;
}

interface IGroup {
  category: PartCategory | null;
  items: IPart[];
}

function buildGroups(parts: IPart[], order: readonly IPartCategoryDescriptor[]): IGroup[] {
  const groups: IGroup[] = [];
  for (const { value: category } of order) {
    const items = parts.filter((part) => part.category === category);
    if (items.length > 0) groups.push({ category, items });
  }
  const loose = parts.filter((part) => !part.category);
  if (loose.length > 0) groups.push({ category: null, items: loose });
  return groups;
}

/** Raw ERP groups inside the uncategorised block, with how many parts each holds. */
function erpGroupsOf(items: IPart[]): Array<[string, IPart[]]> {
  const buckets = new Map<string, IPart[]>();
  for (const part of items) {
    if (!part.group) continue;
    const bucket = buckets.get(part.group) ?? [];
    bucket.push(part);
    buckets.set(part.group, bucket);
  }
  return Array.from(buckets.entries()).sort((a, b) => b[1].length - a[1].length);
}

function GroupHeader({
  group,
  onSelectMany,
}: {
  group: IGroup;
  onSelectMany: (parts: IPart[]) => void;
}) {
  const { category, items } = group;
  const { descriptors } = useCategoryDescriptors();
  const ready = items.filter(isReadyToSell).length;
  const percent = items.length > 0 ? Math.round((ready / items.length) * 100) : 0;
  const erpGroups = category == null ? erpGroupsOf(items) : [];

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-y border-border bg-muted/60 px-4 py-2.5 backdrop-blur md:px-6">
      <CategoryTile category={category ?? undefined} size={30} />
      <span
        className={cn(
          "font-display text-[15px] font-bold uppercase tracking-[0.04em]",
          category ? "text-foreground" : "text-severity-critical",
        )}
      >
        {category ? getCategoryLabel(category, descriptors) : COPY.uncategorised}
      </span>
      <span className="text-[11px] font-semibold text-muted-foreground">
        {COPY.sampleCount(items.length)}
      </span>

      {category ? (
        <span className="ml-1 inline-flex items-center gap-2">
          <span
            className="inline-block h-1 w-[76px] overflow-hidden rounded-full bg-foreground/10"
            role="presentation"
          >
            <span
              className="block h-full rounded-full bg-severity-success"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="text-[10.5px] text-muted-foreground">{COPY.readyCount(ready)}</span>
        </span>
      ) : (
        erpGroups.length > 0 && (
          <span className="ml-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] text-muted-foreground/70">{COPY.erpGroups}</span>
            {erpGroups.map(([name, groupParts]) => (
              <button
                key={name}
                type="button"
                onClick={() => onSelectMany(groupParts)}
                title={COPY.mapErpGroup(name, groupParts.length)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {name} {groupParts.length}
                <Icon icon="mdi:arrow-right" size={10} className="text-primary" />
              </button>
            ))}
          </span>
        )
      )}

      <Button
        variant="secondary"
        size="sm"
        className="ml-auto shrink-0"
        onClick={() => onSelectMany(items)}
        title={
          category ? COPY.selectGroup(getCategoryLabel(category, descriptors)) : COPY.triageTitle
        }
      >
        <Icon icon="mdi:format-list-checks" size={15} />
        {COPY.triage}
      </Button>
    </div>
  );
}

export function CatalogGroupedList({
  parts,
  isLoading,
  onRowClick,
  scrollRef,
  selectedIds,
  onToggleRow,
  onSelectMany,
  canSeeMargin,
  turnoverIndex,
  isTurnoverLoading,
  onRestock,
  onSuggestDeactivate,
}: ICatalogGroupedListProps) {
  const { descriptors } = useCategoryDescriptors();
  const groups = useMemo(() => buildGroups(parts, descriptors), [parts, descriptors]);
  const template = gridTemplate(canSeeMargin);

  if (isLoading && parts.length === 0) {
    return (
      <div ref={scrollRef} className="h-full space-y-2 overflow-auto px-4 py-3 md:px-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={`grouped-skeleton-${i}`} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="min-w-[1120px]">
        <div
          className="grid gap-3 border-b border-border px-4 py-2 md:px-6"
          style={{ gridTemplateColumns: template }}
        >
          {[
            "",
            "",
            CATALOG_STRINGS.columns.name,
            CATALOG_STRINGS.columns.oem,
            CATALOG_STRINGS.columns.applications,
            CATALOG_STRINGS.columns.price,
            ...(canSeeMargin
              ? [CATALOG_STRINGS.columns.margin, CATALOG_STRINGS.columns.turnover]
              : []),
            CATALOG_STRINGS.columns.stock,
          ].map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="truncate text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>

        {groups.map((group) => (
          <div key={group.category ?? "__uncategorised"}>
            <GroupHeader group={group} onSelectMany={onSelectMany} />
            {group.items.map((part) => {
              const isSelected = selectedIds.has(part.id);
              const missing = missingFields(part);
              return (
                <div
                  key={part.id}
                  onClick={() => onRowClick(part.id)}
                  className={cn(
                    "grid cursor-pointer items-center gap-3 border-b border-border px-4 py-2.5 transition-colors md:px-6",
                    isSelected ? "bg-primary/5" : "hover:bg-muted/50",
                    !part.active && "opacity-60",
                  )}
                  style={{ gridTemplateColumns: template }}
                >
                  <span onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleRow(part.id)}
                      aria-label={`Selecionar ${part.name}`}
                    />
                  </span>
                  <CategoryTile category={part.category} size={30} />
                  <div className="min-w-0">
                    <PartIdentityCell part={part} />
                    {missing.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {missing.map((field) => (
                          <PartChip key={field} variant="ghost" size="sm">
                            {MISSING_FIELD_LABELS[field]}
                          </PartChip>
                        ))}
                      </div>
                    )}
                  </div>
                  <PartCodesCell part={part} />
                  <PartApplicationsCell part={part} />
                  <PartPriceCell part={part} />
                  {canSeeMargin && (
                    <>
                      <PartMarginCell part={part} />
                      <PartTurnoverCell
                        part={part}
                        turnover={turnoverFor(turnoverIndex, part.id)}
                        isLoading={isTurnoverLoading}
                        onSuggestDeactivate={onSuggestDeactivate}
                      />
                    </>
                  )}
                  <PartStockCell part={part} onRestock={onRestock} />
                </div>
              );
            })}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="px-6 py-14 text-center text-sm text-muted-foreground">{COPY.empty}</div>
        )}
      </div>
    </div>
  );
}
