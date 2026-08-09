import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ID, IStore } from "@/shared/types";
import { useStoresProvider } from "@/providers/data";
import type { ISdrDashboardFiltersState, SdrPeriodPreset } from "../hooks/useSdrDashboardFilters";
import { PERIOD_LABEL } from "../config/labels";

export interface ISdrDashboardHeaderProps {
  filters: ISdrDashboardFiltersState;
  storeLocked: boolean;
  sdrEnabled: boolean;
  onPeriod: (period: SdrPeriodPreset) => void;
  onStore: (store: ID | "all") => void;
}

const PERIOD_OPTIONS: { value: SdrPeriodPreset; label: string }[] = [
  { value: "today", label: PERIOD_LABEL.today },
  { value: "7d", label: PERIOD_LABEL["7d"] },
  { value: "30d", label: PERIOD_LABEL["30d"] },
];

export function SdrDashboardHeader({
  filters,
  storeLocked,
  sdrEnabled,
  onPeriod,
  onStore,
}: ISdrDashboardHeaderProps) {
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
    PERIOD_OPTIONS.find((o) => o.value === filters.period)?.label ?? PERIOD_LABEL.custom;
  const storeLabel =
    filters.store === "all"
      ? "Todas as lojas"
      : (stores.find((s) => s.id === filters.store)?.name ?? filters.store);

  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:robot-outline" size={26} className="text-primary" />
          Agente SDR
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão completa do atendimento automático 24/7, métricas e configuração de templates.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={sdrEnabled ? "default" : "secondary"} className="gap-1 px-2 py-1 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${sdrEnabled ? "bg-severity-success animate-pulse" : "bg-muted-foreground/50"}`}
            aria-hidden="true"
          />
          {sdrEnabled ? "SDR Ativo" : "SDR Pausado"}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
              <Icon icon="mdi:calendar-range" size={14} />
              <span className="font-medium">{periodLabel}</span>
              <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Período</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.period}
              onValueChange={(v) => onPeriod(v as SdrPeriodPreset)}
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
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Loja</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={filters.store}
                onValueChange={(v) => onStore(v as ID | "all")}
              >
                <DropdownMenuRadioItem value="all">Todas as lojas</DropdownMenuRadioItem>
                {stores.map((store) => (
                  <DropdownMenuRadioItem key={store.id} value={store.id}>
                    {store.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button asChild type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
          <Link to="/app/configuracoes/sdr/simulador">
            <Icon icon="mdi:play-circle-outline" size={14} />
            <span>Abrir simulador</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
