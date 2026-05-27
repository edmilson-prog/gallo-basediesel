import { Link } from "@tanstack/react-router";
import type { InventoryCurve, InventoryStatus } from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";
import { Icon } from "@/components/Icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INVENTORY_STRINGS as S } from "../i18n/pt-BR";

const CATEGORY_OPTIONS: { value: PartCategory; label: string }[] = [
  { value: "filtro", label: "Filtros" },
  { value: "freio", label: "Freios" },
  { value: "correia", label: "Correias" },
  { value: "motor", label: "Motor" },
  { value: "embreagem", label: "Embreagem" },
  { value: "eletrica", label: "Elétrica" },
  { value: "transmissao", label: "Transmissão" },
  { value: "suspensao", label: "Suspensão" },
  { value: "arrefecimento", label: "Arrefecimento" },
  { value: "lubrificante", label: "Lubrificantes" },
];

const STATUS_OPTIONS: InventoryStatus[] = ["ok", "baixo", "critico", "excesso"];
const CURVE_OPTIONS: InventoryCurve[] = ["X", "Y", "Z"];

export interface IInventoryHeaderProps {
  brands: string[];
  category: PartCategory | "all";
  onCategoryChange: (value: PartCategory | "all") => void;
  brand: string | "all";
  onBrandChange: (value: string | "all") => void;
  status: InventoryStatus | "all";
  onStatusChange: (value: InventoryStatus | "all") => void;
  curve: InventoryCurve | "all";
  onCurveChange: (value: InventoryCurve | "all") => void;
}

export function InventoryHeader(props: IInventoryHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{S.pageTitle}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{S.pageSubtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            to="/app/gestao/estoque-movimentacao"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            title={S.viewMovementsHint}
          >
            <Icon icon="mdi:swap-vertical-variant" size={14} />
            {S.viewMovementsCta}
          </Link>
          <Icon icon="mdi:warehouse" size={24} className="text-muted-foreground" />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label={S.filtersCategory}>
          <Select
            value={props.category}
            onValueChange={(v) => props.onCategoryChange(v === "all" ? "all" : (v as PartCategory))}
          >
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filtersCategoryAll}</SelectItem>
              {CATEGORY_OPTIONS.map((opt) => (
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
              <SelectItem value="all">{S.filtersBrandAll}</SelectItem>
              {props.brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={S.filtersStatus}>
          <Select
            value={props.status}
            onValueChange={(v) =>
              props.onStatusChange(v === "all" ? "all" : (v as InventoryStatus))
            }
          >
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filtersStatusAll}</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ok"
                    ? S.statusOk
                    : s === "baixo"
                      ? S.statusBaixo
                      : s === "critico"
                        ? S.statusCritico
                        : S.statusExcesso}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={S.filtersCurve}>
          <Select
            value={props.curve}
            onValueChange={(v) => props.onCurveChange(v === "all" ? "all" : (v as InventoryCurve))}
          >
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.filtersCurveAll}</SelectItem>
              {CURVE_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
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
