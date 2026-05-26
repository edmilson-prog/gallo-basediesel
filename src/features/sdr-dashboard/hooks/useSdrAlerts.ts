import { useMemo } from "react";
import type { IPlatformSettings, ISdrSession } from "@/shared/types";
import { DEFAULT_SDR_TEMPLATES } from "@/features/sdr";
import type { ISdrDashboardData } from "./useSdrDashboardData";

export type SdrAlertSeverity = "info" | "warning" | "danger";

export interface ISdrAlert {
  id: string;
  severity: SdrAlertSeverity;
  title: string;
  description: string;
  icon: string;
}

interface IUseSdrAlertsInput {
  data: Pick<
    ISdrDashboardData,
    "sessions" | "previousSessions" | "escalationRate"
  >;
  settings: IPlatformSettings | null;
  allSessions?: ISdrSession[];
}

const ESCALATION_INCREASE_THRESHOLD = 20;
const UNKNOWN_INTENT_THRESHOLD = 5;
const UNKNOWN_INTENT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Banner-level alerts surfaced at the top of the painel and (when configured)
 * mirrored on the manager dashboard (PRD-024 RF-030/031/032).
 */
export function useSdrAlerts({ data, settings, allSessions }: IUseSdrAlertsInput): ISdrAlert[] {
  return useMemo(() => {
    const alerts: ISdrAlert[] = [];

    // 1) Escalation rate trend — danger when up > 20%.
    if (
      data.escalationRate.changePct !== null &&
      data.escalationRate.changePct >= ESCALATION_INCREASE_THRESHOLD
    ) {
      alerts.push({
        id: "escalation-trend-up",
        severity: "danger",
        title: `Taxa de escalonamento subiu ${data.escalationRate.changePct}%`,
        description:
          "A comparação com o período anterior indica degradação. Revise motivos de escalação e templates.",
        icon: "mdi:trending-up",
      });
    }

    // 2) Templates never customised — informative.
    if (settings) {
      const allDefault = settings.sdrTemplates.every((t) => {
        const original = DEFAULT_SDR_TEMPLATES.find((d) => d.id === t.id || d.trigger === t.trigger);
        return original ? original.text === t.text : false;
      });
      if (allDefault) {
        alerts.push({
          id: "templates-not-personalised",
          severity: "info",
          title: "Templates ainda no padrão",
          description:
            "Personalize as mensagens do SDR para refletir a voz da GALLO BASE DIESEL.",
          icon: "mdi:pencil-outline",
        });
      }
    }

    // 3) Unknown intent volume — warning when 5+ in the last hour.
    if (allSessions && allSessions.length > 0) {
      const cutoff = Date.now() - UNKNOWN_INTENT_WINDOW_MS;
      const recent = allSessions.filter(
        (s) => new Date(s.lastActivityAt).getTime() >= cutoff,
      );
      const unknownCount = recent.filter((s) => {
        if (!s.collectedData.needs) return true;
        if (s.finishReason === "abandoned" || s.finishReason === "escalated") return false;
        return s.collectedData.needs.trim().length === 0;
      }).length;
      if (unknownCount >= UNKNOWN_INTENT_THRESHOLD) {
        alerts.push({
          id: "unknown-intent-burst",
          severity: "warning",
          title: `${unknownCount} sessões com intenção indefinida na última hora`,
          description:
            "Possível palavra-chave ou template fora de tom — revise keywords e qualificações.",
          icon: "mdi:help-rhombus-outline",
        });
      }
    }

    return alerts;
  }, [data, settings, allSessions]);
}
