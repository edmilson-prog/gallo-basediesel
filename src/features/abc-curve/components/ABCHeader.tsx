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
import type { ID, ISeller, IStore } from "@/shared/types";
import { useSellersProvider, useStoresProvider } from "@/providers/data";
import { ABC_STRINGS as S } from "../i18n/pt-BR";
import type { ABCPeriodPreset, IABCFiltersState } from "../hooks/useABCFilters";

export interface IABCHeaderProps {
  filters: IABCFiltersState;
  storeLocked: boolean;
  sellerLocked: boolean;
  activeFilterCount: number;
  onPeriod: (p: ABCPeriodPreset) => void;
  onStore: (s: ID | "all") => void;
  onSeller: (s: ID | "all") => void;
  onReset: () => void;
}

const PERIODS: { value: ABCPeriodPreset; label: string }[] = [
  { value: "3m", label: S.period3m },
  { value: "6m", label: S.period6m },
  { value: "12m", label: S.period12m },
  { value: "24m", label: S.period24m },
];

export function ABCHeader({
  filters,
  storeLocked,
  sellerLocked,
  activeFilterCount,
  onPeriod,
  onStore,
  onSeller,
  onReset,
}: IABCHeaderProps) {
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

  const periodLabel = PERIODS.find((p) => p.value === filters.period)?.label ?? S.periodCustom;
  const storeLabel =
    filters.store === "all"
      ? S.filterAllStores
      : (stores.find((s) => s.id === filters.store)?.name ?? filters.store);
  const sellerLabel =
    filters.seller === "all"
      ? S.filterAllSellers
      : (sellers.find((s) => s.id === filters.seller)?.fullName ?? filters.seller);

  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:chart-arc" size={26} className="text-primary" />
          {S.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.pageSubtitle}</p>
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
              onValueChange={(v) => onPeriod(v as ABCPeriodPreset)}
            >
              {PERIODS.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                  {opt.label}
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

        {!sellerLocked && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
                <Icon icon="mdi:account-tie-outline" size={14} />
                <span className="font-medium">{sellerLabel}</span>
                <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel>{S.filterSeller}</DropdownMenuLabel>
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
        )}

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
              {S.reset}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
