import type { ID, IStore } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RankingPeriodType } from "../utils/periods";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

interface IRankingHeaderProps {
  period: RankingPeriodType;
  store: ID | "all";
  stores: IStore[];
  storeLocked: boolean;
  activeFilterCount: number;
  onPeriodChange: (p: RankingPeriodType) => void;
  onStoreChange: (s: ID | "all") => void;
  onReset: () => void;
}

const PERIOD_OPTIONS: { value: RankingPeriodType; label: string }[] = [
  { value: "mensal", label: S.periodMonthly },
  { value: "trimestral", label: S.periodQuarterly },
  { value: "anual", label: S.periodYearly },
];

export function RankingHeader({
  period,
  store,
  stores,
  storeLocked,
  activeFilterCount,
  onPeriodChange,
  onStoreChange,
  onReset,
}: IRankingHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{S.pageSubtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{S.filterPeriod}</label>
          <Select value={period} onValueChange={(v) => onPeriodChange(v as RankingPeriodType)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!storeLocked && stores.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">{S.filterStore}</label>
            <Select
              value={store === "all" ? "all" : store}
              onValueChange={(v) => onStoreChange(v === "all" ? "all" : (v as ID))}
            >
              <SelectTrigger className="h-9 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{S.filterAllStores}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-9 self-end"
          >
            <Icon icon="mdi:filter-off-outline" size={16} />
            <span className="ml-1.5">{S.reset}</span>
          </Button>
        )}
      </div>
    </header>
  );
}
