import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import type { AnalysisKind, AnalysisSeverity, IAnalysisCard } from "../../engine/analysis";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

const SEVERITY: Record<AnalysisSeverity, { tone: string; ring: string }> = {
  danger: { tone: "text-severity-critical", ring: "border-severity-critical/40" },
  warning: { tone: "text-severity-warning", ring: "border-severity-warning/40" },
  success: { tone: "text-severity-success", ring: "border-severity-success/40" },
  info: { tone: "text-severity-info", ring: "border-severity-info/40" },
};

const ICON: Record<AnalysisKind, string> = {
  price: "mdi:trending-up",
  saving: "mdi:piggy-bank-outline",
  fiscal: "mdi:file-alert-outline",
  registry: "mdi:office-building-outline",
  fractioning: "mdi:division",
  duplicate: "mdi:shield-check-outline",
};

export interface IAnalysisCardProps {
  card: IAnalysisCard;
  children?: React.ReactNode;
}

export function AnalysisCard({ card, children }: IAnalysisCardProps) {
  const severity = SEVERITY[card.severity];
  const s = FISCAL_NOTES_STRINGS.analysis;

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg bg-muted ${severity.tone}`}
          aria-hidden
        >
          <Icon icon={ICON[card.kind]} size={15} />
        </span>
        <Badge variant="outline" className={`${severity.ring} ${severity.tone}`}>
          {s.severity[card.severity]}
        </Badge>
      </div>
      <h3 className="text-sm font-bold leading-snug text-foreground">{card.title}</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {card.description}
      </p>
      {children}
    </article>
  );
}
