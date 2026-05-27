import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { describeHealthScore } from "../engine/calculatePortfolioMetrics";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";

export interface IPortfolioHealthBadgeProps {
  score: number;
  className?: string;
  withIcon?: boolean;
}

const QUALITATIVE_LABEL = {
  excelente: S.healthExcellent,
  bom: S.healthGood,
  atencao: S.healthAttention,
  critico: S.healthCritical,
} as const;

const QUALITATIVE_STYLE = {
  excelente: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  bom: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  atencao: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  critico: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
} as const;

const QUALITATIVE_ICON = {
  excelente: "mdi:shield-check",
  bom: "mdi:shield-half-full",
  atencao: "mdi:shield-alert-outline",
  critico: "mdi:shield-off-outline",
} as const;

export function PortfolioHealthBadge({
  score,
  className,
  withIcon = true,
}: IPortfolioHealthBadgeProps) {
  const qualitative = describeHealthScore(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        QUALITATIVE_STYLE[qualitative],
        className,
      )}
      title={`Score ${score} — ${QUALITATIVE_LABEL[qualitative]}`}
    >
      {withIcon && <Icon icon={QUALITATIVE_ICON[qualitative]} size={12} />}
      {score} · {QUALITATIVE_LABEL[qualitative]}
    </span>
  );
}
