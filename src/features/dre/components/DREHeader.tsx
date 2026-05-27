import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DRE_STRINGS as S } from "../i18n/pt-BR";
import type { DREPeriodKind } from "../hooks/useDREData";

export interface IDREHeaderProps {
  kind: DREPeriodKind;
  onKindChange: (kind: DREPeriodKind) => void;
  monthKey: string;
  onMonthKeyChange: (key: string) => void;
  monthOptions: string[];
  /** Optional refresh handle exposed for the action button. */
  onRefresh?: () => void;
}

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function labelForMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTHS_PT[m - 1]} ${y}`;
}

export function DREHeader({
  kind,
  onKindChange,
  monthKey,
  onMonthKeyChange,
  monthOptions,
  onRefresh,
}: IDREHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{S.pageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{S.pageSubtitle}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {S.filtersPeriod}
          </span>
          <Select value={kind} onValueChange={(v) => onKindChange(v as DREPeriodKind)}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">{S.filtersPeriodMonthly}</SelectItem>
              <SelectItem value="quarterly">{S.filtersPeriodQuarterly}</SelectItem>
              <SelectItem value="yearly">{S.filtersPeriodYearly}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {S.filtersAnchor}
          </span>
          <Select value={monthKey} onValueChange={onMonthKeyChange}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((key) => (
                <SelectItem key={key} value={key}>
                  {labelForMonth(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} className="h-9 gap-1.5">
            <Icon icon="mdi:refresh" size={14} />
            Atualizar
          </Button>
        )}
      </div>
    </header>
  );
}
