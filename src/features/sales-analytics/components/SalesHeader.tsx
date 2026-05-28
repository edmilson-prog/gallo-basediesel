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
import type { PartCategory } from "@/shared/types/part-identification";
import { useStoresProvider, useSellersProvider } from "@/providers/data";
import { SALES_ANALYTICS_STRINGS as S } from "../i18n/pt-BR";
import type { ISalesFiltersState, SalesChannel, SalesPeriodPreset } from "../hooks/useSalesFilters";

export interface ISalesHeaderProps {
  filters: ISalesFiltersState;
  storeLocked: boolean;
  sellerLocked: boolean;
  availableBrands: string[];
  activeFilterCount: number;
  onPeriod: (period: SalesPeriodPreset) => void;
  onStore: (store: ID | "all") => void;
  onSeller: (seller: ID | "all") => void;
  onCategory: (category: PartCategory | "all") => void;
  onVehicleBrand: (brand: string | "all") => void;
  onChannel: (channel: SalesChannel | "all") => void;
  onReset: () => void;
}

const PERIOD_OPTIONS: { value: SalesPeriodPreset; label: string }[] = [
  { value: "today", label: S.periodToday },
  { value: "yesterday", label: S.periodYesterday },
  { value: "7d", label: S.period7d },
  { value: "30d", label: S.period30d },
  { value: "90d", label: S.period90d },
  { value: "ytd", label: S.periodYtd },
];

const CATEGORY_OPTIONS: { value: PartCategory; label: string }[] = [
  { value: "filtro", label: "Filtro" },
  { value: "freio", label: "Freio" },
  { value: "correia", label: "Correia" },
  { value: "motor", label: "Motor" },
  { value: "embreagem", label: "Embreagem" },
  { value: "eletrica", label: "Elétrica" },
  { value: "transmissao", label: "Transmissão" },
  { value: "suspensao", label: "Suspensão" },
  { value: "arrefecimento", label: "Arrefecimento" },
  { value: "lubrificante", label: "Lubrificante" },
];

const CHANNEL_OPTIONS: { value: SalesChannel; label: string }[] = [
  { value: "whatsapp", label: S.channelLabelWhatsapp },
  { value: "manual", label: S.channelLabelManual },
  { value: "portal", label: S.channelLabelPortal },
  { value: "ecommerce", label: S.channelLabelEcommerce },
];

export function SalesHeader({
  filters,
  storeLocked,
  sellerLocked,
  availableBrands,
  activeFilterCount,
  onPeriod,
  onStore,
  onSeller,
  onCategory,
  onVehicleBrand,
  onChannel,
  onReset,
}: ISalesHeaderProps) {
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

  const periodLabel =
    PERIOD_OPTIONS.find((o) => o.value === filters.period)?.label ?? S.periodCustom;
  const storeLabel =
    filters.store === "all"
      ? S.filterAllStores
      : (stores.find((s) => s.id === filters.store)?.name ?? filters.store);
  const sellerLabel =
    filters.seller === "all"
      ? S.filterAllSellers
      : (sellers.find((s) => s.id === filters.seller)?.fullName ?? filters.seller);
  const categoryLabel =
    filters.category === "all"
      ? S.filterAllCategories
      : (CATEGORY_OPTIONS.find((o) => o.value === filters.category)?.label ?? filters.category);
  const brandLabel = filters.vehicleBrand === "all" ? S.filterAllBrands : filters.vehicleBrand;
  const channelLabel =
    filters.channel === "all"
      ? S.filterAllChannels
      : (CHANNEL_OPTIONS.find((o) => o.value === filters.channel)?.label ?? filters.channel);

  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:chart-line" size={26} className="text-primary" />
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
              onValueChange={(v) => onPeriod(v as SalesPeriodPreset)}
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
              <Icon icon="mdi:shape-outline" size={14} />
              <span className="font-medium">{categoryLabel}</span>
              <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{S.filterCategory}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.category}
              onValueChange={(v) => onCategory(v as PartCategory | "all")}
            >
              <DropdownMenuRadioItem value="all">{S.filterAllCategories}</DropdownMenuRadioItem>
              {CATEGORY_OPTIONS.map((opt) => (
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
              <Icon icon="mdi:truck-outline" size={14} />
              <span className="font-medium">{brandLabel}</span>
              <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>{S.filterVehicleBrand}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.vehicleBrand}
              onValueChange={(v) => onVehicleBrand(v as string | "all")}
            >
              <DropdownMenuRadioItem value="all">{S.filterAllBrands}</DropdownMenuRadioItem>
              {availableBrands.map((brand) => (
                <DropdownMenuRadioItem key={brand} value={brand}>
                  {brand}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
              <Icon icon="mdi:swap-horizontal" size={14} />
              <span className="font-medium">{channelLabel}</span>
              <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{S.filterChannel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.channel}
              onValueChange={(v) => onChannel(v as SalesChannel | "all")}
            >
              <DropdownMenuRadioItem value="all">{S.filterAllChannels}</DropdownMenuRadioItem>
              {CHANNEL_OPTIONS.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                  {opt.label}
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
              {S.reset}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
