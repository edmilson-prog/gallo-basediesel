import type { InsightCategory, InsightPriority } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INSIGHTS_STRINGS as S } from "../i18n/pt-BR";
import type { InsightPeriod, InsightTab } from "../hooks/useInsightsFilters";

export interface IInsightFiltersProps {
  category: InsightCategory | "all";
  onCategoryChange: (c: InsightCategory | "all") => void;
  priority: InsightPriority | "all";
  onPriorityChange: (p: InsightPriority | "all") => void;
  period: InsightPeriod;
  onPeriodChange: (p: InsightPeriod) => void;
  status: InsightTab;
  onStatusChange: (s: InsightTab) => void;
  activeCount: number;
  onClear: () => void;
}

export function InsightFilters({
  category,
  onCategoryChange,
  priority,
  onPriorityChange,
  period,
  onPeriodChange,
  status,
  onStatusChange,
  activeCount,
  onClear,
}: IInsightFiltersProps) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
      <div
        className="inline-flex w-fit items-center rounded-md border border-border bg-muted/40 p-1"
        role="tablist"
        aria-label="Estado dos insights"
      >
        <TabButton active={status === "ativos"} onClick={() => onStatusChange("ativos")}>
          {S.tabActive}
        </TabButton>
        <TabButton active={status === "dispensados"} onClick={() => onStatusChange("dispensados")}>
          {S.tabDismissed}
        </TabButton>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label
            htmlFor="insight-filter-category"
            className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            {S.filterCategoryLabel}
          </label>
          <Select value={category} onValueChange={(v) => onCategoryChange(v as never)}>
            <SelectTrigger id="insight-filter-category" className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filterCategoryAll}</SelectItem>
              <SelectItem value="financeiro">{S.filterCategoryFinancial}</SelectItem>
              <SelectItem value="comercial">{S.filterCategoryCommercial}</SelectItem>
              <SelectItem value="operacional">{S.filterCategoryOperational}</SelectItem>
              <SelectItem value="cliente">{S.filterCategoryCustomer}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[180px] flex-1">
          <label
            htmlFor="insight-filter-priority"
            className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            {S.filterPriorityLabel}
          </label>
          <Select value={priority} onValueChange={(v) => onPriorityChange(v as never)}>
            <SelectTrigger id="insight-filter-priority" className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filterPriorityAll}</SelectItem>
              <SelectItem value="critico">{S.filterPriorityCritical}</SelectItem>
              <SelectItem value="medio">{S.filterPriorityMedium}</SelectItem>
              <SelectItem value="oportunidade">{S.filterPriorityOpportunity}</SelectItem>
              <SelectItem value="info">{S.filterPriorityInfo}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[180px] flex-1">
          <label
            htmlFor="insight-filter-period"
            className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            {S.filterPeriodLabel}
          </label>
          <Select value={period} onValueChange={(v) => onPeriodChange(v as InsightPeriod)}>
            <SelectTrigger id="insight-filter-period" className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filterPeriodAll}</SelectItem>
              <SelectItem value="7d">{S.filterPeriod7d}</SelectItem>
              <SelectItem value="30d">{S.filterPeriod30d}</SelectItem>
              <SelectItem value="90d">{S.filterPeriod90d}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {activeCount > 0 && (
          <Button variant="outline" size="sm" onClick={onClear}>
            {S.filterClear} ({activeCount})
          </Button>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "rounded-sm bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm"
          : "rounded-sm px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}
