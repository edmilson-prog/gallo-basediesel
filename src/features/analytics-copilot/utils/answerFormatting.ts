// src/features/analytics-copilot/utils/answerFormatting.ts
import type { IGoalPeriod } from "@/shared/types/bi";
import type {
  ComparisonMode,
  IMetricQueryScope,
  MetricDimension,
} from "@/shared/types/analytics-copilot";

/** "mai/2026" from a period's start date (interpreted as UTC to avoid timezone drift). */
export function formatPeriodLabel(period: IGoalPeriod | undefined): string {
  if (!period?.start) return "—";
  const d = new Date(period.start);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
}

/** "Matriz · Owner" style scope label (text only — no numbers). */
export function scopeLabel(scope: IMetricQueryScope | undefined): string {
  if (!scope) return "—";
  const parts: string[] = [];
  if (scope.role === "Owner") parts.push("Todas as lojas");
  else if (scope.storeId) parts.push("Loja atual");
  parts.push(scope.role);
  return parts.join(" · ");
}

export function comparisonModeLabel(mode: ComparisonMode | undefined): string {
  if (mode === "previous_period") return "vs. período anterior";
  if (mode === "previous_year") return "vs. ano anterior";
  return "";
}

const DIMENSION_LABELS: Record<MetricDimension, string> = {
  vendedor: "Vendedor",
  canal: "Canal",
  categoria: "Categoria",
  marca: "Marca",
  cliente: "Cliente",
  loja: "Loja",
  tempo: "Tempo",
};

export interface IFilterEntry {
  label: string;
  value: string;
}

export function filterEntries(
  filters: Partial<Record<MetricDimension, string>> | undefined,
): IFilterEntry[] {
  if (!filters) return [];
  return (Object.entries(filters) as [MetricDimension, string][])
    .filter(([, v]) => v != null && v !== "")
    .map(([dim, value]) => ({ label: DIMENSION_LABELS[dim], value }));
}
