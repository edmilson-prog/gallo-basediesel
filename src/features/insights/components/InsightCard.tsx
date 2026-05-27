import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IInsight } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { CATEGORY_LABEL, INSIGHTS_STRINGS as S, PRIORITY_LABEL } from "../i18n/pt-BR";
import { InsightContextBlock } from "./InsightContextBlock";

const PRIORITY_ICON: Record<string, string> = {
  critico: "mdi:alert-octagon",
  medio: "mdi:alert",
  oportunidade: "mdi:rocket-launch",
  info: "mdi:information-outline",
};

const PRIORITY_BORDER: Record<string, string> = {
  critico: "border-l-4 border-l-destructive",
  medio: "border-l-4 border-l-amber-500",
  oportunidade: "border-l-4 border-l-emerald-500",
  info: "border-l-4 border-l-muted-foreground",
};

const PRIORITY_BADGE: Record<string, string> = {
  critico: "bg-destructive/15 text-destructive border-destructive/30",
  medio: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  oportunidade: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

export interface IInsightCardProps {
  insight: IInsight;
  /** When omitted, dismiss button is hidden (e.g. for the "Dispensados" view). */
  onDismiss?: (insight: IInsight) => void;
  /** True when this card represents an already-dismissed insight (read-only). */
  dismissed?: boolean;
}

export function InsightCard({ insight, onDismiss, dismissed = false }: IInsightCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const detectedDate = formatRelative(insight.detectedAt);
  const action = insight.suggestedAction;

  const handleDrillDown = () => {
    if (!action) return;
    void navigate({ to: action.drillDownUrl });
  };

  return (
    <Card className={`p-4 sm:p-5 ${PRIORITY_BORDER[insight.priority] ?? ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="hidden sm:block">
          <div
            className={`grid h-10 w-10 place-items-center rounded-md ${
              insight.priority === "critico"
                ? "bg-destructive/10 text-destructive"
                : insight.priority === "medio"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : insight.priority === "oportunidade"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
            }`}
          >
            <Icon icon={PRIORITY_ICON[insight.priority]} size={20} />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={PRIORITY_BADGE[insight.priority]}>
              <Icon
                icon={PRIORITY_ICON[insight.priority]}
                size={12}
                className="sm:hidden"
                aria-hidden
              />
              {PRIORITY_LABEL[insight.priority] ?? insight.priority}
            </Badge>
            <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
              {CATEGORY_LABEL[insight.category] ?? insight.category}
            </Badge>
            <span className="text-xs text-muted-foreground">• {detectedDate}</span>
          </div>

          <h3 className="text-base font-semibold leading-tight text-foreground">{insight.title}</h3>
          <p className="text-sm leading-snug text-muted-foreground">{insight.description}</p>

          {dismissed && insight.dismissReason && (
            <div className="rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs">
              <p className="font-medium text-muted-foreground">
                {S.cardDismissedReason}:{" "}
                <span className="text-foreground">{insight.dismissReason}</span>
              </p>
              {insight.dismissedAt && (
                <p className="text-muted-foreground">
                  {S.cardDismissedAt}: {formatRelative(insight.dismissedAt)}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs"
              aria-expanded={expanded}
            >
              <Icon
                icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"}
                size={14}
                className="mr-1"
              />
              {expanded ? S.cardHideContext : S.cardSeeContext}
            </Button>
            {action && !dismissed && (
              <Button variant="outline" size="sm" onClick={handleDrillDown} className="text-xs">
                <Icon icon="mdi:arrow-right-bold-circle-outline" size={14} className="mr-1" />
                {action.label}
              </Button>
            )}
            {onDismiss && !dismissed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDismiss(insight)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                <Icon icon="mdi:close-circle-outline" size={14} className="mr-1" />
                {S.cardDismiss}
              </Button>
            )}
          </div>

          {expanded && (
            <div className="mt-3 border-t border-border pt-3">
              <InsightContextBlock data={insight.context} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `há ${weeks} sem.`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} m.`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
