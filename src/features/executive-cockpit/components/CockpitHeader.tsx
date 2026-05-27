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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import type { ID, IStore } from "@/shared/types";
import { useStoresProvider } from "@/providers/data";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../i18n/pt-BR";
import type {
  CockpitCompareBase,
  CockpitPeriodPreset,
  ICockpitFiltersState,
} from "../hooks/useCockpitFilters";

export interface ICockpitHeaderProps {
  filters: ICockpitFiltersState;
  storeLocked: boolean;
  activeFilterCount: number;
  onPeriod: (period: CockpitPeriodPreset) => void;
  onStore: (store: ID | "all") => void;
  onCompare: (compare: CockpitCompareBase) => void;
  onReset: () => void;
}

const PERIOD_OPTIONS: { value: CockpitPeriodPreset; label: string }[] = [
  { value: "month", label: S.periodMonth },
  { value: "quarter", label: S.periodQuarter },
  { value: "ytd", label: S.periodYear },
];

const COMPARE_OPTIONS: { value: CockpitCompareBase; label: string }[] = [
  { value: "previous", label: S.filterComparePrev },
  { value: "yoy", label: S.filterCompareYoY },
];

export function CockpitHeader({
  filters,
  storeLocked,
  activeFilterCount,
  onPeriod,
  onStore,
  onCompare,
  onReset,
}: ICockpitHeaderProps) {
  const storesProvider = useStoresProvider();
  const [stores, setStores] = useState<IStore[]>([]);

  useEffect(() => {
    let cancelled = false;
    void storesProvider.list().then((list) => {
      if (!cancelled) setStores(list);
    });
    return () => {
      cancelled = true;
    };
  }, [storesProvider]);

  const periodLabel =
    PERIOD_OPTIONS.find((o) => o.value === filters.period)?.label ?? S.periodCustom;
  const storeLabel =
    filters.store === "all"
      ? S.filterAllStores
      : (stores.find((s) => s.id === filters.store)?.name ?? filters.store);
  const compareLabel =
    COMPARE_OPTIONS.find((o) => o.value === filters.compare)?.label ?? S.filterComparePrev;

  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:view-dashboard-variant" size={26} className="text-primary" />
            {S.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{S.pageSubtitle}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="h-9 gap-1 text-xs"
              >
                <Icon icon="mdi:tune-variant" size={14} />
                {S.personalizeBtn}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="text-xs">{S.personalizeTooltip}</span>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
              <Icon icon="mdi:calendar-range" size={14} />
              <span className="font-medium">{periodLabel}</span>
              <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{S.filterPeriod}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.period}
              onValueChange={(v) => onPeriod(v as CockpitPeriodPreset)}
            >
              {PERIOD_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
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
              <DropdownMenuLabel>{S.filterStore}</DropdownMenuLabel>
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
              <Icon icon="mdi:swap-vertical" size={14} />
              <span className="font-medium">{compareLabel}</span>
              <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{S.filterCompareLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.compare}
              onValueChange={(v) => onCompare(v as CockpitCompareBase)}
            >
              {COMPARE_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {activeFilterCount > 0 && (
          <>
            <Badge variant="secondary" className="px-2 py-1 text-xs">
              {activeFilterCount} {activeFilterCount === 1 ? "filtro ativo" : "filtros ativos"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1 text-xs"
              onClick={onReset}
            >
              <Icon icon="mdi:filter-off-outline" size={14} />
              Limpar
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
