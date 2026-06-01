import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { resolvePriceTables, tableMargin } from "../../utils/pricing";
import { PartPriceHistory } from "./PartPriceHistory";

const COPY = CATALOG_STRINGS.detail.pricing;

export interface IPartPricingTableProps {
  part: IPart;
}

export function PartPricingTable({ part }: IPartPricingTableProps) {
  const tables = resolvePriceTables(part);
  const baseCost = part.unitCost;

  if (tables.length === 0) {
    return (
      <Card>
        <Header />
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      </Card>
    );
  }

  const maxMarkup = Math.max(...tables.map((t) => t.markupPercent));

  return (
    <Card>
      <Header />
      <p className="mb-3 text-xs text-muted-foreground">
        {COPY.baseCost}:{" "}
        <span className="font-mono font-medium text-foreground">{formatBRL(baseCost)}</span>
      </p>

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
            {tables.map((table) => {
              const isPadrao = table.id === "padrao";
              const intensity = maxMarkup > 0 ? table.markupPercent / maxMarkup : 0;
              return (
                <tr
                  key={table.id}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    isPadrao && "bg-primary/5",
                  )}
                >
                  <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {isPadrao && <Icon icon="mdi:star" size={12} className="text-primary" />}
                      {table.label}
                    </span>
                  </th>
                  <td className="px-3 py-2">
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
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                    {formatBRL(table.price)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatBRL(tableMargin(baseCost, table.price))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <PartPriceHistory part={part} />
      </div>
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
