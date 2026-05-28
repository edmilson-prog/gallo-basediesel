import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";
import type {
  GoalLevel,
  GoalMetric,
  GoalPeriodType,
  GoalStatus,
  ID,
  ISeller,
  IStore,
} from "@/shared/types";
import { useSellersProvider, useStoresProvider } from "@/providers/data";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import {
  GOAL_LEVEL_LABEL,
  GOAL_METRIC_SHORT_LABEL,
  GOAL_STATUS_LABEL,
  PRIMARY_GOAL_METRICS,
  SECONDARY_GOAL_METRICS,
} from "../utils/labels";
import type { IGoalsFiltersState } from "../hooks/useGoalsFilters";

const PERIOD_OPTIONS: { value: GoalPeriodType; label: string }[] = [
  { value: "daily", label: "Diário" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
];

const LEVEL_OPTIONS: { value: GoalLevel; label: string }[] = [
  { value: "individual", label: GOAL_LEVEL_LABEL.individual },
  { value: "store", label: GOAL_LEVEL_LABEL.store },
];

const STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: "ativa", label: GOAL_STATUS_LABEL.ativa },
  { value: "concluida", label: GOAL_STATUS_LABEL.concluida },
  { value: "arquivada", label: GOAL_STATUS_LABEL.arquivada },
  { value: "cancelada", label: GOAL_STATUS_LABEL.cancelada },
];

export interface IGoalsFiltersBarProps {
  filters: IGoalsFiltersState;
  storeLocked: boolean;
  activeCount: number;
  onType: (type: GoalMetric | "all") => void;
  onScope: (scope: GoalLevel | "all") => void;
  onStatus: (status: GoalStatus | "all") => void;
  onSeller: (seller: ID | "all") => void;
  onStore: (store: ID | "all") => void;
  onPeriod: (period: GoalPeriodType | "all") => void;
  onReset: () => void;
}

export function GoalsFiltersBar({
  filters,
  storeLocked,
  activeCount,
  onType,
  onScope,
  onStatus,
  onSeller,
  onStore,
  onPeriod,
  onReset,
}: IGoalsFiltersBarProps) {
  const storesProvider = useStoresProvider();
  const sellersProvider = useSellersProvider();
  const [stores, setStores] = useState<IStore[]>([]);
  const [sellers, setSellers] = useState<ISeller[]>([]);

  useEffect(() => {
    let cancelled = false;
    void storesProvider.list().then((list) => {
      if (!cancelled) setStores(list);
    });
    return () => {
      cancelled = true;
    };
  }, [storesProvider]);

  useEffect(() => {
    let cancelled = false;
    const storeId = filters.store === "all" ? undefined : filters.store;
    void sellersProvider.list({ storeId, active: true }).then((list) => {
      if (!cancelled) setSellers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, filters.store]);

  const typeLabel =
    filters.type === "all" ? S.filterAllTypes : GOAL_METRIC_SHORT_LABEL[filters.type];
  const scopeLabel = filters.scope === "all" ? S.filterAllScopes : GOAL_LEVEL_LABEL[filters.scope];
  const statusLabel =
    filters.status === "all" ? S.filterAllStatuses : GOAL_STATUS_LABEL[filters.status];
  const sellerLabel =
    filters.seller === "all"
      ? S.filterAllSellers
      : (sellers.find((s) => s.id === filters.seller)?.fullName ?? filters.seller);
  const storeLabel =
    filters.store === "all"
      ? S.filterAllStores
      : (stores.find((s) => s.id === filters.store)?.name ?? filters.store);
  const periodLabel =
    filters.period === "all"
      ? S.filterAllPeriods
      : (PERIOD_OPTIONS.find((o) => o.value === filters.period)?.label ?? filters.period);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:shape-outline" size={14} />
            <span className="font-medium">{typeLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>{S.filterTypeLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.type}
            onValueChange={(v) => onType(v as GoalMetric | "all")}
          >
            <DropdownMenuRadioItem value="all">{S.filterAllTypes}</DropdownMenuRadioItem>
            {PRIMARY_GOAL_METRICS.map((m) => (
              <DropdownMenuRadioItem key={m} value={m}>
                {GOAL_METRIC_SHORT_LABEL[m]}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuSeparator />
            {SECONDARY_GOAL_METRICS.map((m) => (
              <DropdownMenuRadioItem key={m} value={m}>
                {GOAL_METRIC_SHORT_LABEL[m]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:layers-outline" size={14} />
            <span className="font-medium">{scopeLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{S.filterScopeLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.scope}
            onValueChange={(v) => onScope(v as GoalLevel | "all")}
          >
            <DropdownMenuRadioItem value="all">{S.filterAllScopes}</DropdownMenuRadioItem>
            {LEVEL_OPTIONS.map((opt) => (
              <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                {opt.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:flag-outline" size={14} />
            <span className="font-medium">{statusLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{S.filterStatusLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.status}
            onValueChange={(v) => onStatus(v as GoalStatus | "all")}
          >
            <DropdownMenuRadioItem value="all">{S.filterAllStatuses}</DropdownMenuRadioItem>
            {STATUS_OPTIONS.map((opt) => (
              <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                {opt.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:account-tie-outline" size={14} />
            <span className="font-medium">{sellerLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>{S.filterSellerLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.seller}
            onValueChange={(v) => onSeller(v as ID | "all")}
          >
            <DropdownMenuRadioItem value="all">{S.filterAllSellers}</DropdownMenuRadioItem>
            {sellers.map((seller) => (
              <DropdownMenuRadioItem key={seller.id} value={seller.id}>
                {seller.fullName}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {!storeLocked && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
              <Icon icon="mdi:store-outline" size={14} />
              <span className="font-medium">{storeLabel}</span>
              <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{S.filterStoreLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.store}
              onValueChange={(v) => onStore(v as ID | "all")}
            >
              <DropdownMenuRadioItem value="all">{S.filterAllStores}</DropdownMenuRadioItem>
              {stores.map((store) => (
                <DropdownMenuRadioItem key={store.id} value={store.id}>
                  {store.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:calendar-range" size={14} />
            <span className="font-medium">{periodLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{S.filterPeriodLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.period}
            onValueChange={(v) => onPeriod(v as GoalPeriodType | "all")}
          >
            <DropdownMenuRadioItem value="all">{S.filterAllPeriods}</DropdownMenuRadioItem>
            {PERIOD_OPTIONS.map((opt) => (
              <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                {opt.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeCount > 0 && (
        <>
          <Badge variant="secondary" className="px-2 py-1 text-xs">
            {activeCount} {activeCount === 1 ? "filtro ativo" : "filtros ativos"}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1 text-xs"
            onClick={onReset}
          >
            <Icon icon="mdi:filter-off-outline" size={14} />
            {S.filterReset}
          </Button>
        </>
      )}
    </div>
  );
}
