import type { IPart, IPriceTable } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import {
  marginHealth,
  marginOnPrice,
  resolvePriceTables,
  tableMargin,
  updateTableMarkup,
  updateTablePrice,
} from "../../utils/pricing";
import type { IPartDraft, IPartDraftErrors } from "../../utils/draft";
import { PartChip } from "./PartChip";
import { PartPriceHistory } from "./PartPriceHistory";

const COPY = CATALOG_STRINGS.detail.pricing;

const HEALTH_TEXT: Record<ReturnType<typeof marginHealth>, string> = {
  success: "text-severity-success",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
};

export interface IPartPricingTableProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
  priceLocked?: boolean;
  errors?: IPartDraftErrors;
  /** Drop the card chrome — the counter layout already wraps the tab body. */
  headless?: boolean;
  /** Hide the inline history (the counter layout shows it as its own panel). */
  showHistory?: boolean;
  /** Enables the per-row edit affordance from the design kit. */
  onRequestEdit?: () => void;
}

export function PartPricingTable({
  part,
  editing = false,
  draft,
  onDraftChange,
  priceLocked = false,
  errors,
  headless = false,
  showHistory = true,
  onRequestEdit,
}: IPartPricingTableProps) {
  const tables = editing && draft ? draft.priceTables : resolvePriceTables(part);
  const baseCost = editing && draft ? draft.unitCost : part.unitCost;
  const disabled = editing && priceLocked;

  if (tables.length === 0) {
    return (
      <Shell headless={headless}>
        <Header
          baseCost={baseCost}
          editing={editing}
          draft={draft}
          onDraftChange={onDraftChange}
          disabled={disabled}
        />
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      </Shell>
    );
  }

  const maxMarkup = Math.max(...tables.map((t) => t.markupPercent));
  const showActions = !editing && Boolean(onRequestEdit);

  const updateRow = (index: number, updated: IPriceTable) => {
    if (!draft || !onDraftChange) return;
    const next = draft.priceTables.slice();
    next[index] = updated;
    onDraftChange({ priceTables: next });
  };

  return (
    <Shell headless={headless}>
      <Header
        baseCost={baseCost}
        editing={editing}
        draft={draft}
        onDraftChange={onDraftChange}
        disabled={disabled}
      />
      {errors?.standardPrice && (
        <p className="mb-2 text-xs text-destructive">{errors.standardPrice}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              <th scope="col" className="px-1 pb-2 text-left font-bold">
                {COPY.table}
              </th>
              <th scope="col" className="px-1 pb-2 text-left font-bold">
                {COPY.markup}
              </th>
              <th scope="col" className="px-1 pb-2 text-right font-bold">
                {COPY.price}
              </th>
              <th scope="col" className="px-1 pb-2 text-right font-bold">
                {COPY.margin}
              </th>
              {showActions && <th scope="col" className="w-10 px-1 pb-2" />}
            </tr>
          </thead>
          <tbody>
            {tables.map((table, index) => {
              const isPadrao = table.id === "padrao";
              const intensity = maxMarkup > 0 ? table.markupPercent / maxMarkup : 0;
              const marginShare = marginOnPrice(table.price, baseCost);
              return (
                <tr key={table.id} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-1 py-3 text-left">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[14.5px] font-bold text-foreground">{table.label}</span>
                      {isPadrao && (
                        <PartChip tone="warning" size="sm">
                          {COPY.standardBadge}
                        </PartChip>
                      )}
                    </span>
                  </th>
                  <td className="py-3 pl-1 pr-5">
                    {editing ? (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        disabled={disabled}
                        value={Math.round(table.markupPercent * 1000) / 10}
                        onChange={(e) =>
                          updateRow(
                            index,
                            updateTableMarkup(table, Number(e.target.value) / 100 || 0, baseCost),
                          )
                        }
                        className="h-8 w-24"
                      />
                    ) : (
                      <span className="flex items-center gap-2.5">
                        <span className="h-[7px] min-w-8 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(intensity * 100)}%` }}
                          />
                        </span>
                        <span className="min-w-[46px] text-right text-[13px] font-semibold tabular-nums text-muted-foreground">
                          {formatPercent(table.markupPercent)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-3 text-right">
                    {editing ? (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        disabled={disabled}
                        value={table.price || ""}
                        onChange={(e) =>
                          updateRow(
                            index,
                            updateTablePrice(table, Number(e.target.value) || 0, baseCost),
                          )
                        }
                        className="h-8 w-28 text-right"
                      />
                    ) : (
                      <span className="font-display text-[17px] font-bold tabular-nums text-foreground">
                        {formatBRL(table.price)}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-3 text-right">
                    <span
                      className={cn(
                        "block text-[13.5px] font-bold tabular-nums",
                        HEALTH_TEXT[marginHealth(marginShare)],
                      )}
                    >
                      {formatPercent(marginShare)}
                    </span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {formatBRL(tableMargin(baseCost, table.price))}
                    </span>
                  </td>
                  {showActions && (
                    <td className="px-1 py-3 text-right">
                      <button
                        type="button"
                        onClick={onRequestEdit}
                        title={COPY.editTable(table.label)}
                        aria-label={COPY.editTable(table.label)}
                        className="grid size-[30px] cursor-pointer place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Icon icon="mdi:pencil-outline" size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!editing && showHistory && (
        <div className="mt-3">
          <PartPriceHistory part={part} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ headless, children }: { headless: boolean; children: React.ReactNode }) {
  if (headless) return <div>{children}</div>;
  return <div className="rounded-lg border border-border bg-card p-4">{children}</div>;
}

function Header({
  baseCost,
  editing,
  draft,
  onDraftChange,
  disabled = false,
}: {
  baseCost: number;
  editing: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Icon icon="mdi:receipt-text-outline" size={15} className="text-muted-foreground" />
      <h2 className="text-[13.5px] font-bold tracking-[0.02em] text-foreground">{COPY.title}</h2>
      <span className="ml-auto text-[12.5px] text-muted-foreground">
        {COPY.baseCost}{" "}
        {editing ? (
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={draft?.unitCost || ""}
            disabled={disabled}
            onChange={(e) => onDraftChange?.({ unitCost: Number(e.target.value) || 0 })}
            className="ml-1 inline-block h-7 w-28 font-mono"
          />
        ) : (
          <span className="font-mono font-bold text-foreground">{formatBRL(baseCost)}</span>
        )}
      </span>
    </div>
  );
}
