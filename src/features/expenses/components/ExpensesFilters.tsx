import type { ExpenseCategory, ExpensePaymentMethod, ExpenseStatus } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_STATUS_LABELS,
  EXPENSES_STRINGS as S,
} from "../i18n/pt-BR";
import { monthLabel, type ExpensePeriodKind } from "../utils/period";
import type { IUseExpensesFiltersResult } from "../hooks/useExpensesFilters";

const ALL_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
const ALL_STATUSES = Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[];
const ALL_METHODS = Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];
const KIND_LABELS: Record<ExpensePeriodKind, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

interface IExpensesFiltersProps {
  ctl: IUseExpensesFiltersResult;
  monthOptions: string[];
  canCreate: boolean;
  onNew: () => void;
}

export function ExpensesFilters({ ctl, monthOptions, canCreate, onNew }: IExpensesFiltersProps) {
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
            {S.newExpense}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.monthKey} onValueChange={ctl.setMonth}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder={S.filterPeriod} />
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {S.filterCategory}
              {filters.categories.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-xs text-primary">
                  {filters.categories.length}
                </span>
              )}
              <Icon icon="mdi:chevron-down" size={14} className="ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{S.filterCategory}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_CATEGORIES.map((cat) => (
              <DropdownMenuCheckboxItem
                key={cat}
                checked={filters.categories.includes(cat)}
                onCheckedChange={() => ctl.toggleCategory(cat)}
                onSelect={(e) => e.preventDefault()}
              >
                {EXPENSE_CATEGORY_LABELS[cat]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              {S.filterStatus}
              {filters.statuses.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-xs text-primary">
                  {filters.statuses.length}
                </span>
              )}
              <Icon icon="mdi:chevron-down" size={14} className="ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>{S.filterStatus}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_STATUSES.map((st) => (
              <DropdownMenuCheckboxItem
                key={st}
                checked={filters.statuses.includes(st)}
                onCheckedChange={() => ctl.toggleStatus(st)}
                onSelect={(e) => e.preventDefault()}
              >
                {EXPENSE_STATUS_LABELS[st]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          value={filters.supplier}
          onChange={(e) => ctl.setSupplier(e.target.value)}
          placeholder={S.filterSupplier}
          className="h-9 w-40"
        />

        <Select
          value={filters.paymentMethod ?? "all"}
          onValueChange={(v) =>
            ctl.setPaymentMethod(v === "all" ? undefined : (v as ExpensePaymentMethod))
          }
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder={S.filterPaymentMethod} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{S.filterPaymentMethod}</SelectItem>
            {ALL_METHODS.map((pm) => (
              <SelectItem key={pm} value={pm}>
                {EXPENSE_PAYMENT_METHOD_LABELS[pm]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
