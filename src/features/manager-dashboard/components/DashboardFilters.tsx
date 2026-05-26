import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import type { ConversationChannel, ID, ISeller, IStore } from "@/shared/types";
import { useSellersProvider, useStoresProvider } from "@/providers/data";
import { MANAGER_DASHBOARD_STRINGS } from "../i18n/pt-BR";
import type { IDashboardFiltersState, PeriodPreset } from "../hooks/useDashboardFilters";

export interface IDashboardFiltersProps {
  state: IDashboardFiltersState;
  storeLocked: boolean;
  onPeriod: (period: PeriodPreset) => void;
  onSeller: (seller: ID | "all") => void;
  onStore: (store: ID | "all") => void;
  onChannel: (channel: ConversationChannel | "all") => void;
  onReset: () => void;
  activeCount: number;
  /** Owner-only — opens the alert configuration modal. */
  onOpenSettings?: () => void;
}

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: MANAGER_DASHBOARD_STRINGS.periodToday,
  yesterday: MANAGER_DASHBOARD_STRINGS.periodYesterday,
  "7d": MANAGER_DASHBOARD_STRINGS.period7d,
  "30d": MANAGER_DASHBOARD_STRINGS.period30d,
  custom: MANAGER_DASHBOARD_STRINGS.periodCustom,
};

const CHANNEL_LABELS: Record<ConversationChannel | "all", string> = {
  all: MANAGER_DASHBOARD_STRINGS.allChannelsOption,
  whatsapp: "WhatsApp",
  ecommerce: "E-commerce",
  phone: "Telefone",
  site: "Site",
};

function FilterTrigger({
  label,
  value,
  active,
  disabled,
}: {
  label: string;
  value: string;
  active: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size="sm"
      disabled={disabled}
      className="h-9 gap-1 text-xs"
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
      {!disabled && <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />}
    </Button>
  );
}

export function DashboardFilters({
  state,
  storeLocked,
  onPeriod,
  onSeller,
  onStore,
  onChannel,
  onReset,
  activeCount,
  onOpenSettings,
}: IDashboardFiltersProps) {
  const sellersProvider = useSellersProvider();
  const storesProvider = useStoresProvider();
  const [sellers, setSellers] = useState<ISeller[]>([]);
  const [stores, setStores] = useState<IStore[]>([]);

  useEffect(() => {
    let cancelled = false;
    void sellersProvider.list({ active: true }).then((list) => {
      if (!cancelled) setSellers(list);
    });
    void storesProvider.list().then((list) => {
      if (!cancelled) setStores(list);
    });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, storesProvider]);

  const sellerLabel =
    state.seller === "all"
      ? MANAGER_DASHBOARD_STRINGS.allSellersOption
      : (sellers.find((s) => s.id === state.seller)?.fullName ?? state.seller);
  const storeLabel =
    state.store === "all"
      ? MANAGER_DASHBOARD_STRINGS.allStoresOption
      : (stores.find((s) => s.id === state.store)?.name ?? state.store);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div>
            <FilterTrigger
              label={MANAGER_DASHBOARD_STRINGS.filterPeriod}
              value={PERIOD_LABELS[state.period]}
              active={state.period !== "today"}
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{MANAGER_DASHBOARD_STRINGS.filterPeriod}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={state.period}
            onValueChange={(v) => onPeriod(v as PeriodPreset)}
          >
            <DropdownMenuRadioItem value="today">
              {MANAGER_DASHBOARD_STRINGS.periodToday}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="yesterday">
              {MANAGER_DASHBOARD_STRINGS.periodYesterday}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="7d">
              {MANAGER_DASHBOARD_STRINGS.period7d}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="30d">
              {MANAGER_DASHBOARD_STRINGS.period30d}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div>
            <FilterTrigger
              label={MANAGER_DASHBOARD_STRINGS.filterSeller}
              value={sellerLabel}
              active={state.seller !== "all"}
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>{MANAGER_DASHBOARD_STRINGS.filterSeller}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={state.seller}
            onValueChange={(v) => onSeller(v as ID | "all")}
          >
            <DropdownMenuRadioItem value="all">
              {MANAGER_DASHBOARD_STRINGS.allSellersOption}
            </DropdownMenuRadioItem>
            {sellers.map((seller) => (
              <DropdownMenuRadioItem key={seller.id} value={seller.id}>
                {seller.fullName}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {storeLocked ? (
        <FilterTrigger
          label={MANAGER_DASHBOARD_STRINGS.filterStore}
          value={storeLabel}
          active={false}
          disabled
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div>
              <FilterTrigger
                label={MANAGER_DASHBOARD_STRINGS.filterStore}
                value={storeLabel}
                active={state.store !== "all"}
              />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{MANAGER_DASHBOARD_STRINGS.filterStore}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={state.store}
              onValueChange={(v) => onStore(v as ID | "all")}
            >
              <DropdownMenuRadioItem value="all">
                {MANAGER_DASHBOARD_STRINGS.allStoresOption}
              </DropdownMenuRadioItem>
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
          <div>
            <FilterTrigger
              label={MANAGER_DASHBOARD_STRINGS.filterChannel}
              value={CHANNEL_LABELS[state.channel]}
              active={state.channel !== "all"}
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{MANAGER_DASHBOARD_STRINGS.filterChannel}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={state.channel}
            onValueChange={(v) => onChannel(v as ConversationChannel | "all")}
          >
            <DropdownMenuRadioItem value="all">
              {MANAGER_DASHBOARD_STRINGS.allChannelsOption}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="whatsapp">WhatsApp</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="ecommerce">E-commerce</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="phone">Telefone</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="site">Site</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-9 gap-1 text-xs"
        >
          <Icon icon="mdi:close-circle-outline" size={14} />
          {MANAGER_DASHBOARD_STRINGS.resetFilters}
          <Badge variant="secondary" className="ml-1 h-5 px-1.5">
            {activeCount}
          </Badge>
        </Button>
      )}

      {onOpenSettings && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="ml-auto h-9 gap-1"
          aria-label={MANAGER_DASHBOARD_STRINGS.openSettings}
        >
          <Icon icon="mdi:cog-outline" size={16} />
          <span className="hidden sm:inline">{MANAGER_DASHBOARD_STRINGS.openSettings}</span>
        </Button>
      )}
    </div>
  );
}
