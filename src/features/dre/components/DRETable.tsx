import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { IDREComparativeBlock, IDREComparison, IDREPeriod } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { DRE_STRINGS as S } from "../i18n/pt-BR";

type Field = keyof IDREComparativeBlock["values"];

interface IDRELineSpec {
  field: Field;
  label: string;
  /** Visual style — controls indentation, weight, and subtotal vibe. */
  emphasis: "section" | "subtotal" | "detail" | "final";
  /** Optional secondary % (rendered next to the number). */
  pctField?: Field;
  /** Click navigates to this internal path (drill-down). */
  navigateTo?: string;
  /** Render the value as a percentage instead of currency. */
  isPercentage?: boolean;
  /** When true the line is rendered only when "Despesas operacionais" is expanded. */
  expandableChild?: boolean;
}

const LINES: IDRELineSpec[] = [
  {
    field: "grossRevenue",
    label: S.lineGrossRevenue,
    emphasis: "section",
    navigateTo: "/app/gestao/vendas",
  },
  { field: "taxOnSales", label: S.lineTaxOnSales, emphasis: "detail" },
  {
    field: "returns",
    label: S.lineReturns,
    emphasis: "detail",
    navigateTo: "/app/pedidos?status=devolvido",
  },
  { field: "netRevenue", label: S.lineNetRevenue, emphasis: "subtotal" },
  { field: "cmv", label: S.lineCmv, emphasis: "detail", navigateTo: "/app/gestao/rentabilidade" },
  {
    field: "grossMargin",
    label: S.lineGrossMargin,
    emphasis: "subtotal",
    pctField: "grossMarginPct",
  },
  { field: "totalOperatingExpenses", label: S.lineOperatingExpenses, emphasis: "section" },
  {
    field: "commissions",
    label: S.lineCommissions,
    emphasis: "detail",
    navigateTo: "/app/gestao/comissoes",
    expandableChild: true,
  },
  { field: "payroll", label: S.linePayroll, emphasis: "detail", expandableChild: true },
  { field: "rentInfra", label: S.lineRentInfra, emphasis: "detail", expandableChild: true },
  { field: "otherExpenses", label: S.lineOtherExpenses, emphasis: "detail", expandableChild: true },
  {
    field: "operatingResult",
    label: S.lineOperatingResult,
    emphasis: "subtotal",
    pctField: "operatingResultPct",
  },
  { field: "taxOnProfit", label: S.lineTaxOnProfit, emphasis: "detail" },
  {
    field: "netResult",
    label: S.lineNetResult,
    emphasis: "final",
    pctField: "netResultPct",
  },
];

const EMPHASIS_CLASSES: Record<IDRELineSpec["emphasis"], string> = {
  section: "bg-muted/40 font-semibold text-foreground",
  subtotal: "bg-muted/20 font-semibold text-foreground",
  detail: "text-foreground",
  final: "bg-primary/10 font-bold text-foreground text-base",
};

const EMPHASIS_PADDING: Record<IDRELineSpec["emphasis"], string> = {
  section: "py-2.5",
  subtotal: "py-2.5",
  detail: "py-1.5 pl-7",
  final: "py-3",
};

function renderValue(field: Field, value: number, isPct?: boolean): string {
  if (isPct) return formatPercent(value);
  return formatBRL(value);
}

function pickValue(period: IDREPeriod, field: Field): number {
  return period[field as keyof IDREPeriod] as number;
}

function DeltaPill({ delta }: { delta: IDREComparison }) {
  const isPositive = delta.direction === "up";
  const isNegative = delta.direction === "down";
  return (
    <span
      className={cn(
        "ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums",
        isPositive && "text-success",
        isNegative && "text-destructive",
        delta.direction === "flat" && "text-muted-foreground",
      )}
    >
      <Icon
        icon={
          isPositive
            ? "mdi:arrow-top-right"
            : isNegative
              ? "mdi:arrow-bottom-right"
              : "mdi:arrow-right"
        }
        size={10}
      />
      {delta.deltaPct == null
        ? S.comparativeNoBaseline
        : `${delta.deltaPct > 0 ? "+" : ""}${(delta.deltaPct * 100).toFixed(1)}%`}
    </span>
  );
}

export interface IDRETableProps {
  dre: IDREPeriod;
}

export function DRETable({ dre }: IDRETableProps) {
  const navigate = useNavigate();
  const [opExpanded, setOpExpanded] = useState(true);

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">{S.tableHeaderLine}</th>
              <th className="px-4 py-3 text-right font-medium">{S.tableHeaderCurrent}</th>
              <th className="hidden px-4 py-3 text-right font-medium md:table-cell">
                {S.tableHeaderPrevious}
              </th>
              <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">
                {S.tableHeaderYearAgo}
              </th>
            </tr>
          </thead>
          <tbody>
            {LINES.map((line) => {
              if (line.expandableChild && !opExpanded) return null;
              const current = pickValue(dre, line.field);
              const currentPct = line.pctField ? pickValue(dre, line.pctField) : null;
              const prev = dre.vsPreviousPeriod?.values[line.field];
              const prevDelta = dre.vsPreviousPeriod?.deltas[line.field];
              const yearAgo = dre.vsYearAgo?.values[line.field];
              const yearDelta = dre.vsYearAgo?.deltas[line.field];
              const clickable = Boolean(line.navigateTo);
              const isExpanderRow = line.field === "totalOperatingExpenses";
              return (
                <tr
                  key={line.field}
                  className={cn(
                    "border-b border-border/60 last:border-b-0",
                    EMPHASIS_CLASSES[line.emphasis],
                    clickable &&
                      "cursor-pointer transition-colors hover:bg-accent/40 focus-within:bg-accent/40",
                  )}
                  onClick={
                    clickable ? () => navigate({ to: line.navigateTo as string }) : undefined
                  }
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate({ to: line.navigateTo as string });
                          }
                        }
                      : undefined
                  }
                >
                  <td className={cn("px-4 align-middle", EMPHASIS_PADDING[line.emphasis])}>
                    <div className="flex items-center gap-2">
                      {isExpanderRow && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={opExpanded ? "Recolher despesas" : "Expandir despesas"}
                          className="h-5 w-5 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpExpanded((v) => !v);
                          }}
                        >
                          <Icon
                            icon={opExpanded ? "mdi:chevron-down" : "mdi:chevron-right"}
                            size={14}
                          />
                        </Button>
                      )}
                      <span className="truncate">{line.label}</span>
                      {clickable && (
                        <Icon
                          icon="mdi:open-in-new"
                          size={11}
                          className="ml-1 shrink-0 text-muted-foreground"
                        />
                      )}
                    </div>
                  </td>
                  <td
                    className={cn("px-4 text-right tabular-nums", EMPHASIS_PADDING[line.emphasis])}
                  >
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span>{renderValue(line.field, current, line.isPercentage)}</span>
                      {currentPct != null && (
                        <span className="text-xs font-normal text-muted-foreground">
                          ({(currentPct * 100).toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "hidden px-4 text-right tabular-nums md:table-cell",
                      EMPHASIS_PADDING[line.emphasis],
                    )}
                  >
                    {prev != null ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-muted-foreground">
                          {renderValue(line.field, prev, line.isPercentage)}
                        </span>
                        {prevDelta && <DeltaPill delta={prevDelta} />}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "hidden px-4 text-right tabular-nums lg:table-cell",
                      EMPHASIS_PADDING[line.emphasis],
                    )}
                  >
                    {yearAgo != null ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-muted-foreground">
                          {renderValue(line.field, yearAgo, line.isPercentage)}
                        </span>
                        {yearDelta && <DeltaPill delta={yearDelta} />}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <Icon icon="mdi:information-outline" size={13} className="mr-1 inline align-text-bottom" />
        Linhas com ↗ navegam para o relatório de origem. Comparativos exibidos em pílulas coloridas
        (verde = alta, vermelho = baixa) abaixo dos valores.
      </footer>
    </Card>
  );
}
