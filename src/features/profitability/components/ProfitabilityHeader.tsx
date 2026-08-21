import type { ID, ISeller } from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROFITABILITY_STRINGS as S } from "../i18n/pt-BR";
import { useCategoryDescriptors } from "@/features/catalog/hooks/useCategoryDescriptors";

export interface IProfitabilityHeaderProps {
  monthKey: string;
  monthOptions: string[];
  onMonthKeyChange: (key: string) => void;
  sellers: ISeller[];
  sellerId: ID | "all";
  onSellerChange: (id: ID | "all") => void;
  category: PartCategory | "all";
  onCategoryChange: (category: PartCategory | "all") => void;
  brands: string[];
  brand: string | "all";
  onBrandChange: (brand: string | "all") => void;
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

export function ProfitabilityHeader(props: IProfitabilityHeaderProps) {
  // The taxonomy is data: a family created in the catalog has to be
  // offered here too, otherwise the URL filter applies with a blank control.
  const { active: categoryOptions } = useCategoryDescriptors();
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{S.pageTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{S.pageSubtitle}</p>
        </div>
        <Icon icon="mdi:scale-balance" size={24} className="text-muted-foreground" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label={S.filtersAnchor}>
          <Select value={props.monthKey} onValueChange={props.onMonthKeyChange}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.monthOptions.map((key) => (
                <SelectItem key={key} value={key}>
                  {labelForMonth(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={S.filtersSeller}>
          <Select
            value={props.sellerId}
            onValueChange={(v) => props.onSellerChange(v === "all" ? "all" : (v as ID))}
          >
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filterSellerAll}</SelectItem>
              {props.sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={S.filtersCategory}>
          <Select
            value={props.category}
            onValueChange={(v) => props.onCategoryChange(v === "all" ? "all" : (v as PartCategory))}
          >
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filterCategoryAll}</SelectItem>
              {categoryOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={S.filtersBrand}>
          <Select value={props.brand} onValueChange={props.onBrandChange}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filterBrandAll}</SelectItem>
              {props.brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
