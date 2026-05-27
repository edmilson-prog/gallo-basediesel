import type { ID, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CSA_STRINGS as S } from "../i18n/pt-BR";

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

export interface ICsaHeaderProps {
  monthKey: string;
  monthOptions: string[];
  onMonthKeyChange: (key: string) => void;
  sellers: ISeller[];
  sellerId: ID | "all";
  onSellerChange: (id: ID | "all") => void;
}

export function CsaHeader(props: ICsaHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{S.pageTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{S.pageSubtitle}</p>
        </div>
        <Icon icon="mdi:headset" size={24} className="text-muted-foreground" />
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
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filtersSellerAll}</SelectItem>
              {props.sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.fullName}
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
