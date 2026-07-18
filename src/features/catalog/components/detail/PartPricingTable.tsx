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
}

export function PartPricingTable({
  part,
  editing = false,
  draft,
  onDraftChange,
  priceLocked = false,
  errors,
}: IPartPricingTableProps) {
  const tables = editing && draft ? draft.priceTables : resolvePriceTables(part);
  const baseCost = editing && draft ? draft.unitCost : part.unitCost;

  if (tables.length === 0) {
    return (
      <Card>
        <Header />
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      </Card>
    );
  }

  const maxMarkup = Math.max(...tables.map((t) => t.markupPercent));
  const disabled = editing && priceLocked;

  const updateRow = (index: number, updated: IPriceTable) => {
    if (!draft || !onDraftChange) return;
    const next = draft.priceTables.slice();
    next[index] = updated;
    onDraftChange({ priceTables: next });
  };

  return (
    <Card>
      <Header />
      {editing ? (
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {COPY.baseCost}:{" "}
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={draft?.unitCost || ""}
              disabled={disabled}
              onChange={(e) => onDraftChange?.({ unitCost: Number(e.target.value) || 0 })}
              className="mt-1 h-7 w-28 font-mono"
            />
          </span>
        </div>
      ) : (
        <p className="mb-3 text-xs text-muted-foreground">
          {COPY.baseCost}:{" "}
          <span className="font-mono font-medium text-foreground">{formatBRL(baseCost)}</span>
        </p>
      )}
      {errors?.standardPrice && <p className="mb-2 text-xs text-destructive">{errors.standardPrice}</p>}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {COPY.table}
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {COPY.markup}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {COPY.price}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {COPY.margin}
              </th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table, index) => {
              const isPadrao = table.id === "padrao";
              const intensity = maxMarkup > 0 ? table.markupPercent / maxMarkup : 0;
              const marginShare = marginOnPrice(table.price, baseCost);
              return (
                <tr
                  key={table.id}
                  className={cn("border-b border-border last:border-b-0", isPadrao && "bg-primary/5")}
                >
                  <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {isPadrao && <Icon icon="mdi:star" size={12} className="text-primary" />}
                      {table.label}
                    </span>
                  </th>
                  <td className="px-3 py-2">
                    {editing ? (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        disabled={disabled}
                        value={Math.round(table.markupPercent * 1000) / 10}
                        onChange={(e) =>
                          updateRow(index, updateTableMarkup(table, Number(e.target.value) / 100 || 0, baseCost))
                        }
                        className="h-8 w-24"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(intensity * 100)}%` }}
                          />
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatPercent(table.markupPercent)}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                    {editing ? (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        disabled={disabled}
                        value={table.price || ""}
                        onChange={(e) => updateRow(index, updateTablePrice(table, Number(e.target.value) || 0, baseCost))}
                        className="h-8 w-28 text-right"
                      />
                    ) : (
                      formatBRL(table.price)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={cn("block font-semibold tabular-nums", HEALTH_TEXT[marginHealth(marginShare)])}
                    >
                      {formatPercent(marginShare)}
                    </span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {formatBRL(tableMargin(baseCost, table.price))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!editing && (
        <div className="mt-3">
          <PartPriceHistory part={part} />
        </div>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-4">{children}</div>;
}

function Header() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon icon="mdi:cash-multiple" size={18} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
    </div>
  );
}
