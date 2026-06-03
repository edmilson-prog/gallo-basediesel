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
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import type { IndicatorMetric, IndicatorScopeLevel, IndicatorStatus } from "@/shared/types";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import type { IIndicatorFilters, SelectorKind } from "../hooks/useIndicatorFilters";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IIndicatorFiltersBarProps {
  filters: IIndicatorFilters;
  onSelectorKind: (v: SelectorKind | "all") => void;
  onMetric: (v: IndicatorMetric | "all") => void;
  onScopeLevel: (v: IndicatorScopeLevel | "all") => void;
  onStatus: (v: IndicatorStatus | "all") => void;
  onReset: () => void;
  activeCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IndicatorFiltersBar({
  filters,
  onSelectorKind,
  onMetric,
  onScopeLevel,
  onStatus,
  onReset,
  activeCount,
}: IIndicatorFiltersBarProps) {
  const selectorKindLabel =
    filters.selectorKind === "all" ? "Recorte" : S.selectorKind[filters.selectorKind];
  const metricLabel = filters.metric === "all" ? "Métrica" : S.metric[filters.metric];
  const scopeLabel = filters.scopeLevel === "all" ? "Escopo" : S.scope[filters.scopeLevel];
  const statusLabel = filters.status === "all" ? "Status" : S.status[filters.status];

  const selectorOptions: { value: SelectorKind; label: string }[] = [
    { value: "category", label: S.selectorKind.category },
    { value: "sku", label: S.selectorKind.sku },
    { value: "group", label: S.selectorKind.group },
  ];

  const metricOptions: { value: IndicatorMetric; label: string }[] = [
    { value: "faturamento", label: S.metric.faturamento },
    { value: "quantidade", label: S.metric.quantidade },
    { value: "margem", label: S.metric.margem },
    { value: "pedidos", label: S.metric.pedidos },
  ];

  const scopeOptions: { value: IndicatorScopeLevel; label: string }[] = [
    { value: "store", label: S.scope.store },
    { value: "individual", label: S.scope.individual },
    { value: "global", label: S.scope.global },
  ];

  const statusOptions: { value: IndicatorStatus; label: string }[] = [
    { value: "ativo", label: S.status.ativo },
    { value: "concluido", label: S.status.concluido },
    { value: "arquivado", label: S.status.arquivado },
    { value: "cancelado", label: S.status.cancelado },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Recorte */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:shape-outline" size={14} />
            <span className="font-medium">{selectorKindLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Recorte de produto</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.selectorKind}
            onValueChange={(v) => onSelectorKind(v as SelectorKind | "all")}
          >
            <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
            {selectorOptions.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Métrica */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:chart-bar" size={14} />
            <span className="font-medium">{metricLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Métrica</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.metric}
            onValueChange={(v) => onMetric(v as IndicatorMetric | "all")}
          >
            <DropdownMenuRadioItem value="all">Todas</DropdownMenuRadioItem>
            {metricOptions.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Escopo */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:layers-outline" size={14} />
            <span className="font-medium">{scopeLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Escopo</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.scopeLevel}
            onValueChange={(v) => onScopeLevel(v as IndicatorScopeLevel | "all")}
          >
            <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
            {scopeOptions.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            <Icon icon="mdi:flag-outline" size={14} />
            <span className="font-medium">{statusLabel}</span>
            <Icon icon="mdi:chevron-down" size={14} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Status do indicador</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.status}
            onValueChange={(v) => onStatus(v as IndicatorStatus | "all")}
          >
            <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
            {statusOptions.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
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
            Limpar
          </Button>
        </>
      )}
    </div>
  );
}
