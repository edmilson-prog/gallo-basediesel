import type { ReactNode } from "react";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";
import { labelForPeriod } from "../utils/periods";

export interface ISellerOption {
  id: ID;
  name: string;
}

interface ICommissionsHeaderProps {
  period: string;
  sellerId: ID | "all";
  sellers: ISellerOption[];
  sellerLocked: boolean;
  activeFilterCount: number;
  subtitle: string;
  actions?: ReactNode;
  onPeriodChange: (p: string) => void;
  onSellerChange: (s: ID | "all") => void;
  onReset: () => void;
}

export function CommissionsHeader({
  period,
  sellerId,
  sellers,
  sellerLocked,
  activeFilterCount,
  subtitle,
  actions,
  onPeriodChange,
  onSellerChange,
  onReset,
}: ICommissionsHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          <Icon icon="mdi:calendar-month" size={12} className="mr-1 inline align-text-bottom" />
          {labelForPeriod(period)}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{S.filterPeriod}</label>
          <Input
            type="month"
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="h-9 w-40"
          />
        </div>

        {!sellerLocked && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">{S.filterSeller}</label>
            <Select
              value={sellerId === "all" ? "all" : (sellerId as string)}
              onValueChange={(v) => onSellerChange(v === "all" ? "all" : (v as ID))}
            >
              <SelectTrigger className="h-9 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{S.filterAllSellers}</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <Icon icon="mdi:close-circle-outline" size={14} className="mr-1" />
            Limpar filtros
          </Button>
        )}

        {actions}
      </div>
    </header>
  );
}
