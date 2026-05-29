import type { CashFlowSource } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";
import { monthLabel, type ExpensePeriodKind } from "@/features/expenses/utils/period";
import { CASHFLOW_SOURCE_LABELS, CASHFLOW_STRINGS as S } from "../i18n/pt-BR";
import type {
  CashFlowDirFilter,
  CashFlowStatusFilter,
  IUseCashFlowFiltersResult,
} from "../hooks/useCashFlowFilters";

const SOURCES = Object.keys(CASHFLOW_SOURCE_LABELS) as CashFlowSource[];
const KIND_LABELS: Record<ExpensePeriodKind, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

interface ICashFlowFiltersProps {
  ctl: IUseCashFlowFiltersResult;
  monthOptions: string[];
  canCreate: boolean;
  onNew: () => void;
}

export function CashFlowFilters({ ctl, monthOptions, canCreate, onNew }: ICashFlowFiltersProps) {
  const { filters } = ctl;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{S.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{S.subtitle}</p>
        </div>
        {canCreate && (
          <Button onClick={onNew}>
            <Icon icon="mdi:plus" size={16} className="mr-1.5" />
            {S.newManualEntry}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.monthKey} onValueChange={ctl.setMonth}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.kind} onValueChange={(v) => ctl.setKind(v as ExpensePeriodKind)}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as ExpensePeriodKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.direction}
          onValueChange={(v) => ctl.setDirection(v as CashFlowDirFilter)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ambos">{S.typeAll}</SelectItem>
            <SelectItem value="entrada">{S.typeIn}</SelectItem>
            <SelectItem value="saida">{S.typeOut}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(v) => ctl.setStatus(v as CashFlowStatusFilter)}
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ambos">{S.statusAll}</SelectItem>
            <SelectItem value="realizado">Realizado</SelectItem>
            <SelectItem value="previsto">Previsto</SelectItem>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {S.filterSource}
              {filters.sources.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-xs text-primary">
                  {filters.sources.length}
                </span>
              )}
              <Icon icon="mdi:chevron-down" size={14} className="ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>{S.filterSource}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SOURCES.map((src) => (
              <DropdownMenuCheckboxItem
                key={src}
                checked={filters.sources.includes(src)}
                onCheckedChange={() => ctl.toggleSource(src)}
                onSelect={(e) => e.preventDefault()}
              >
                {CASHFLOW_SOURCE_LABELS[src]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {ctl.activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-9" onClick={ctl.reset}>
            <Icon icon="mdi:filter-off-outline" size={15} className="mr-1" />
            {S.filterReset}
          </Button>
        )}
      </div>
    </div>
  );
}
