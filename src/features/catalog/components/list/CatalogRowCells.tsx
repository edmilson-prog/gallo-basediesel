/**
 * Row cells for the catalog list, rebuilt from the `catalog/lista` design kit.
 *
 * Each cell carries two lines: the fact on top, the context that qualifies it
 * underneath. The kit's premise is that the catalog is a worklist, so a cell
 * never just shows a blank — it says *what is missing* and, where possible,
 * offers the action that fixes it.
 */

import type { IPart, PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryDescriptor, getCategoryLabel } from "../../utils/categories";
import { useCategoryDescriptors } from "../../hooks/useCategoryDescriptors";
import {
  isDeadStockCandidate,
  isReadyToSell,
  MISSING_FIELD_LABELS,
  missingFields,
  needsRestock,
} from "../../utils/completeness";
import { marginHealth, marginOnPrice } from "../../utils/pricing";
import { suggestedRestockQuantity } from "../../utils/restock";
import type { IPartTurnover } from "../../utils/turnover";
import { PartChip } from "../detail/PartChip";

const COPY = CATALOG_STRINGS.cells;

/** Muted, italic "this field was never filled in" marker. */
function Absent({ children }: { children: React.ReactNode }) {
  return <span className="italic text-muted-foreground/70">{children}</span>;
}

/** Second line of every two-line cell — small, muted, never wrapping. */
function SubLine({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn("mt-0.5 truncate text-[10.5px] text-muted-foreground", className)}
      title={title}
    >
      {children}
    </div>
  );
}

/* ── Category tile ───────────────────────────────────────────────────────── */

/**
 * Square category tile that opens every row. Uncategorised parts get a neutral
 * outline instead of a colour — the gap has to read as a gap.
 */
export function CategoryTile({ category, size = 36 }: { category?: PartCategory; size?: number }) {
  const { descriptors } = useCategoryDescriptors();
  const descriptor = getCategoryDescriptor(category, descriptors);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border",
        descriptor
          ? cn(descriptor.tone, "border-current/25")
          : "border-dashed border-border bg-muted/40 text-muted-foreground/70",
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon icon={descriptor?.icon ?? "mdi:cube-outline"} size={Math.round(size * 0.48)} />
    </span>
  );
}

/* ── Peça ────────────────────────────────────────────────────────────────── */

/**
 * Identity cell: name plus the badges that qualify it, then SKU + manufacturer.
 * Manufacturer and status live here rather than in columns of their own — the
 * kit folds them into the identity so the table can afford the analysis columns.
 */
export function PartIdentityCell({ part }: { part: IPart }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-semibold text-foreground" title={part.name}>
          {part.name}
        </span>
        {part.isOriginal && (
          <PartChip tone="warning" size="sm" className="shrink-0">
            {CATALOG_STRINGS.badges.original}
          </PartChip>
        )}
        {!part.active && (
          <PartChip variant="ghost" size="sm" className="shrink-0">
            {CATALOG_STRINGS.status.inactive}
          </PartChip>
        )}
      </div>
      <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px]">
        <span className="shrink-0 font-display font-bold tracking-[0.02em] text-foreground/70">
          {part.sku}
        </span>
        {part.brand.trim() ? (
          <span className="truncate text-muted-foreground" title={part.brand}>
            {part.brand}
          </span>
        ) : (
          <Absent>{COPY.noManufacturer}</Absent>
        )}
      </div>
    </div>
  );
}

/* ── Códigos ─────────────────────────────────────────────────────────────── */

/** Primary OEM code with an overflow counter, then how many cross-references exist. */
export function PartCodesCell({ part }: { part: IPart }) {
  const extra = part.oemCodes.length - 1;
  const crossRefs = part.crossReferences ?? [];
  return (
    <div className="min-w-0">
      {part.oemCodes.length > 0 ? (
        <div
          className="truncate font-mono text-xs font-semibold text-foreground"
          title={part.oemCodes.join(" · ")}
        >
          {part.oemCodes[0]}
          {extra > 0 && <span className="text-muted-foreground"> {COPY.moreCodes(extra)}</span>}
        </div>
      ) : (
        <div className="truncate text-xs">
          <Absent>{COPY.noOem}</Absent>
        </div>
      )}
      <SubLine title={crossRefs.map((ref) => `${ref.brand} ${ref.code}`).join(" · ")}>
        {crossRefs.length > 0 ? COPY.crossRefs(crossRefs.length) : "—"}
      </SubLine>
    </div>
  );
}

/* ── Categoria ───────────────────────────────────────────────────────────── */

/**
 * Category, or the gap made explicit. When a part has no category, its raw ERP
 * group is surfaced instead — that string is the lead for classifying it.
 */
export function PartCategoryCell({ part }: { part: IPart }) {
  const { descriptors } = useCategoryDescriptors();
  if (!part.category) {
    return (
      <div className="min-w-0">
        <PartChip tone="critical" size="sm">
          {COPY.noCategory}
        </PartChip>
        {part.group && (
          <SubLine className="uppercase tracking-[0.06em]" title={part.group}>
            {COPY.erpGroup(part.group)}
          </SubLine>
        )}
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <div className="truncate text-xs font-medium text-foreground">
        {getCategoryLabel(part.category, descriptors)}
      </div>
      {part.subcategory && (
        <SubLine className="uppercase tracking-[0.06em]">{part.subcategory}</SubLine>
      )}
    </div>
  );
}

/* ── Ficha ───────────────────────────────────────────────────────────────── */

/** What the record is still missing — the enrichment queue, one row at a time. */
export function PartFichaCell({ part }: { part: IPart }) {
  if (isReadyToSell(part)) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-severity-success"
        title={COPY.readyTitle}
      >
        <Icon icon="mdi:check-circle-outline" size={14} />
        {COPY.ready}
      </span>
    );
  }
  const missing = missingFields(part);
  const shown = missing.slice(0, 2);
  const hidden = missing.length - shown.length;
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      title={COPY.missingTitle(missing.map((field) => MISSING_FIELD_LABELS[field]).join(", "))}
    >
      {shown.map((field) => (
        <PartChip key={field} variant="ghost" size="sm">
          {MISSING_FIELD_LABELS[field]}
        </PartChip>
      ))}
      {hidden > 0 && (
        <span className="text-[10.5px] font-bold text-muted-foreground">
          {COPY.moreMissing(hidden)}
        </span>
      )}
    </div>
  );
}

/* ── Preço & margem ──────────────────────────────────────────────────────── */

export function PartPriceCell({ part }: { part: IPart }) {
  return (
    <div className="truncate font-display text-[15px] font-bold tabular-nums text-foreground">
      {formatBRL(part.unitPrice)}
    </div>
  );
}

const MARGIN_TONE = {
  success: "text-severity-success",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
} as const;

/** Margin on the sale price, coloured by health, with the cost it came from. */
export function PartMarginCell({ part }: { part: IPart }) {
  if (part.unitCost <= 0) {
    return (
      <div className="truncate text-xs">
        <Absent>{COPY.noCost}</Absent>
      </div>
    );
  }
  const share = marginOnPrice(part.unitPrice, part.unitCost);
  return (
    <div className="min-w-0">
      <span
        className={cn(
          "font-display text-[15px] font-bold tabular-nums",
          MARGIN_TONE[marginHealth(share)],
        )}
      >
        {Math.round(share * 100)}%
      </span>
      <SubLine>{COPY.costOf(formatBRL(part.unitCost))}</SubLine>
    </div>
  );
}

/* ── Giro ────────────────────────────────────────────────────────────────── */

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export interface IPartTurnoverCellProps {
  part: IPart;
  /** `null` while the column's orders window is still loading or disabled. */
  turnover: IPartTurnover | null;
  isLoading: boolean;
  onSuggestDeactivate: (part: IPart) => void;
}

/**
 * Units sold in the last 12 months. An unknown turnover renders as a dash, never
 * as "nunca vendida" — and the deactivation hint only appears on a real zero.
 */
export function PartTurnoverCell({
  part,
  turnover,
  isLoading,
  onSuggestDeactivate,
}: IPartTurnoverCellProps) {
  if (turnover == null) {
    return (
      <div className="truncate text-xs text-muted-foreground/70">
        {isLoading ? COPY.turnoverLoading : COPY.turnoverUnknown}
      </div>
    );
  }

  if (turnover.units === 0) {
    return (
      <div className="min-w-0">
        <div className="truncate text-xs">
          <Absent>{COPY.neverSold}</Absent>
        </div>
        {isDeadStockCandidate(part, turnover.units) && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSuggestDeactivate(part);
            }}
            title={COPY.suggestDeactivateTitle}
            className="mt-0.5 text-[10.5px] font-bold text-severity-critical hover:underline"
          >
            {COPY.suggestDeactivate}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <span className="font-display text-sm font-bold tabular-nums text-foreground">
        {COPY.turnoverUnits(turnover.units)}
      </span>{" "}
      <span className="text-[10.5px] text-muted-foreground">{COPY.turnoverWindow}</span>
      {turnover.lastSaleAt && (
        <SubLine>{COPY.lastSale(formatShortDate(turnover.lastSaleAt))}</SubLine>
      )}
    </div>
  );
}

/* ── Estoque ─────────────────────────────────────────────────────────────── */

function StockDot({ className }: { className: string }) {
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", className)} aria-hidden="true" />;
}

export interface IPartStockCellProps {
  part: IPart;
  onRestock: (part: IPart) => void;
}

/**
 * Stock level, and — when the part is zeroed against a configured minimum — the
 * reorder quantity as a one-click action rather than a number to work out.
 */
export function PartStockCell({ part, onRestock }: IPartStockCellProps) {
  if (needsRestock(part)) {
    const quantity = suggestedRestockQuantity(part.stockAvailable, part.stockMinimum);
    return (
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-severity-critical">
          <StockDot className="bg-severity-critical" />
          {COPY.stockZero}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRestock(part);
          }}
          title={COPY.restockTitle}
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
        >
          {COPY.restock(quantity)}
          <Icon icon="mdi:arrow-right" size={11} />
        </button>
      </div>
    );
  }

  if (part.stockAvailable <= 0) {
    return (
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <StockDot className="bg-muted-foreground/50" />
          {COPY.stockZero}
        </span>
        <SubLine>{COPY.stockNoMinimum}</SubLine>
      </div>
    );
  }

  const low = part.stockAvailable <= part.stockMinimum;
  return (
    <div className="min-w-0">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-bold tabular-nums",
          low ? "text-severity-warning" : "text-severity-success",
        )}
      >
        <StockDot className={low ? "bg-severity-warning" : "bg-severity-success"} />
        {COPY.stockUnits(part.stockAvailable)}
      </span>
      {part.stockMinimum > 0 && <SubLine>{COPY.stockMinimum(part.stockMinimum)}</SubLine>}
    </div>
  );
}

/* ── Colunas herdadas ────────────────────────────────────────────────────── */

export function PartManufacturerCell({ part }: { part: IPart }) {
  if (!part.brand.trim()) {
    return (
      <div className="truncate text-xs">
        <Absent>{COPY.noManufacturer}</Absent>
      </div>
    );
  }
  return (
    <div className="truncate text-foreground" title={part.brand}>
      {part.brand}
    </div>
  );
}

export function PartApplicationsCell({ part }: { part: IPart }) {
  const [first] = part.applications;
  if (!first) {
    return (
      <div className="truncate text-xs">
        <Absent>{COPY.noApplication}</Absent>
      </div>
    );
  }
  const extra = part.applications.length - 1;
  return (
    <div
      className="truncate text-xs text-muted-foreground"
      title={part.applications.map((app) => `${app.vehicleBrand} ${app.vehicleModel}`).join(" · ")}
    >
      {first.vehicleBrand} {first.vehicleModel}
      {extra > 0 && ` +${extra}`}
    </div>
  );
}

export function PartStatusCell({ part }: { part: IPart }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        part.active ? "text-severity-success" : "text-muted-foreground",
      )}
    >
      <StockDot className={part.active ? "bg-severity-success" : "bg-muted-foreground"} />
      {part.active ? CATALOG_STRINGS.status.active : CATALOG_STRINGS.status.inactive}
    </span>
  );
}
