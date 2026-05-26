import type { CarteiraTransferStatus, CarteiraTransferType, ID, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";
import type { ITransfersListFilters } from "../hooks/useTransfersList";
import { dateInputToISO, dateInputValue } from "../utils/formatters";

const ALL_VALUE = "__all__";

export interface ITransferFiltersBarProps {
  filters: ITransfersListFilters;
  sellers: ISeller[];
  showStatusFilter: boolean;
  onChange: (patch: Partial<ITransfersListFilters>) => void;
  onClear: () => void;
}

const TYPES: { value: CarteiraTransferType; label: string }[] = [
  { value: "temporary", label: CARTEIRA_STRINGS.type.temporary },
  { value: "permanent_individual", label: CARTEIRA_STRINGS.type.permanent_individual },
  { value: "permanent_batch", label: CARTEIRA_STRINGS.type.permanent_batch },
];

const STATUSES: { value: CarteiraTransferStatus; label: string }[] = [
  { value: "reverted", label: CARTEIRA_STRINGS.status.reverted },
  { value: "expired", label: CARTEIRA_STRINGS.status.expired },
];

export function TransferFiltersBar({
  filters,
  sellers,
  showStatusFilter,
  onChange,
  onClear,
}: ITransferFiltersBarProps) {
  function setType(value: string) {
    if (value === ALL_VALUE) {
      onChange({ types: undefined });
      return;
    }
    onChange({ types: [value as CarteiraTransferType] });
  }

  function setSeller(field: "fromSellerId" | "toSellerId", value: string) {
    onChange({ [field]: value === ALL_VALUE ? undefined : (value as ID) });
  }

  function setStatus(value: string) {
    if (value === ALL_VALUE) {
      onChange({ statuses: undefined });
      return;
    }
    onChange({ statuses: [value as CarteiraTransferStatus] });
  }

  const activeType = filters.types?.[0] ?? ALL_VALUE;
  const activeStatus = filters.statuses?.[0] ?? ALL_VALUE;
  const fromValue = filters.fromSellerId ?? ALL_VALUE;
  const toValue = filters.toSellerId ?? ALL_VALUE;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {CARTEIRA_STRINGS.filters.type}
        </label>
        <Select value={activeType} onValueChange={setType}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder={CARTEIRA_STRINGS.filters.allTypes} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{CARTEIRA_STRINGS.filters.allTypes}</SelectItem>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {CARTEIRA_STRINGS.filters.from}
        </label>
        <Select value={fromValue} onValueChange={(v) => setSeller("fromSellerId", v)}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder={CARTEIRA_STRINGS.filters.allSellers} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{CARTEIRA_STRINGS.filters.allSellers}</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {CARTEIRA_STRINGS.filters.to}
        </label>
        <Select value={toValue} onValueChange={(v) => setSeller("toSellerId", v)}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder={CARTEIRA_STRINGS.filters.allSellers} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{CARTEIRA_STRINGS.filters.allSellers}</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showStatusFilter && (
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {CARTEIRA_STRINGS.filters.status}
          </label>
          <Select value={activeStatus} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{CARTEIRA_STRINGS.filters.allTypes}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {CARTEIRA_STRINGS.filters.period}
        </label>
        <div className="flex gap-1.5">
          <Input
            type="date"
            value={dateInputValue(filters.since)}
            onChange={(e) => onChange({ since: dateInputToISO(e.target.value) })}
            className="h-9 w-36"
          />
          <Input
            type="date"
            value={dateInputValue(filters.until)}
            onChange={(e) => onChange({ until: dateInputToISO(e.target.value, true) })}
            className="h-9 w-36"
          />
        </div>
      </div>

      <Button type="button" variant="ghost" size="sm" onClick={onClear} className="gap-1">
        <Icon icon="mdi:filter-remove-outline" size={14} />
        {CARTEIRA_STRINGS.filters.clear}
      </Button>
    </div>
  );
}
