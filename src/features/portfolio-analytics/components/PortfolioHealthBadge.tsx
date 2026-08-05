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
  excelente: "bg-severity-success/10 text-severity-success",
  bom: "bg-severity-info/10 text-severity-info",
  atencao: "bg-severity-warning/10 text-severity-warning",
  critico: "bg-severity-critical/10 text-severity-critical",
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
