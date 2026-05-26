import type { LeadOrigin, LeadTemperature, ILead, ILeadStage } from "@/shared/types";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export interface ITemperatureMeta {
  label: string;
  icon: string;
  tone: string;
  dot: string;
}

export const TEMPERATURE_META: Record<LeadTemperature, ITemperatureMeta> = {
  frio: {
    label: LEADS_STRINGS.temperature.frio,
    icon: "mdi:snowflake",
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  morno: {
    label: LEADS_STRINGS.temperature.morno,
    icon: "mdi:weather-partly-cloudy",
    tone: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  quente: {
    label: LEADS_STRINGS.temperature.quente,
    icon: "mdi:fire",
    tone: "bg-red-500/15 text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
};

export interface IOriginMeta {
  label: string;
  icon: string;
  tone: string;
}

export const ORIGIN_META: Record<LeadOrigin, IOriginMeta> = {
  whatsapp: {
    label: LEADS_STRINGS.origin.whatsapp,
    icon: "mdi:whatsapp",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  ecommerce: {
    label: LEADS_STRINGS.origin.ecommerce,
    icon: "mdi:cart-outline",
    tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  indicacao: {
    label: LEADS_STRINGS.origin.indicacao,
    icon: "mdi:account-multiple-outline",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  google: {
    label: LEADS_STRINGS.origin.google,
    icon: "mdi:google",
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  outro: {
    label: LEADS_STRINGS.origin.outro,
    icon: "mdi:dots-horizontal",
    tone: "bg-muted text-muted-foreground",
  },
};

export type NextActionUrgency = "overdue" | "today" | "tomorrow" | "future" | "none";

export interface INextActionInfo {
  urgency: NextActionUrgency;
  label: string;
  /** Tailwind classes for the badge tone. */
  tone: string;
  /** Positive when overdue, negative for future, 0 when today. */
  diffDays: number;
}

export function getNextActionInfo(
  iso: string | null | undefined,
  now: Date = new Date(),
): INextActionInfo {
  if (!iso) {
    return {
      urgency: "none",
      label: LEADS_STRINGS.card.nextAction.none,
      tone: "bg-muted text-muted-foreground",
      diffDays: 0,
    };
  }
  const target = startOfDay(new Date(iso));
  const today = startOfDay(now);
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays > 0) {
    return {
      urgency: "overdue",
      label: LEADS_STRINGS.card.nextAction.overdue(diffDays),
      tone: "bg-red-500/15 text-red-700 dark:text-red-300",
      diffDays,
    };
  }
  if (diffDays === 0) {
    return {
      urgency: "today",
      label: LEADS_STRINGS.card.nextAction.today,
      tone: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
      diffDays,
    };
  }
  if (diffDays === -1) {
    return {
      urgency: "tomorrow",
      label: LEADS_STRINGS.card.nextAction.tomorrow,
      tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      diffDays,
    };
  }
  return {
    urgency: "future",
    label: LEADS_STRINGS.card.nextAction.future(-diffDays),
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    diffDays,
  };
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Closing stage id (Convertido / Perdido). Hardcoded to seed for now (PRD-019 will surface this). */
export const CLOSING_STAGE_ID = "stage-fechado";

export function isClosedLead(lead: ILead): boolean {
  return (
    lead.stage.id === CLOSING_STAGE_ID ||
    lead.convertedToCustomerId !== undefined ||
    lead.lossReason !== undefined
  );
}

export function isConverted(lead: ILead): boolean {
  return lead.convertedToCustomerId !== undefined;
}

export function isLost(lead: ILead): boolean {
  return lead.lossReason !== undefined && lead.convertedToCustomerId === undefined;
}

/** Sort stages by `order`. */
export function sortStages(stages: ILeadStage[]): ILeadStage[] {
  return [...stages].sort((a, b) => a.order - b.order);
}

/** Days since `updatedAt` (proxy for "days in stage" in absence of audit). */
export function daysInStage(lead: ILead, now: Date = new Date()): number {
  const since = new Date(lead.updatedAt).getTime();
  if (Number.isNaN(since)) return 0;
  return Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
}
