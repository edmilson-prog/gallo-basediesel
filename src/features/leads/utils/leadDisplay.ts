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
    tone: "bg-severity-info/15 text-severity-info",
    dot: "bg-severity-info",
  },
  morno: {
    label: LEADS_STRINGS.temperature.morno,
    icon: "mdi:weather-partly-cloudy",
    tone: "bg-severity-warning/15 text-severity-warning",
    dot: "bg-severity-warning",
  },
  quente: {
    label: LEADS_STRINGS.temperature.quente,
    icon: "mdi:fire",
    tone: "bg-severity-critical/15 text-severity-critical",
    dot: "bg-severity-critical",
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
    tone: "bg-funnel-3/12 text-foreground",
  },
  ecommerce: {
    label: LEADS_STRINGS.origin.ecommerce,
    icon: "mdi:cart-outline",
    tone: "bg-funnel-5/12 text-foreground",
  },
  indicacao: {
    label: LEADS_STRINGS.origin.indicacao,
    icon: "mdi:account-multiple-outline",
    tone: "bg-funnel-2/12 text-foreground",
  },
  google: {
    label: LEADS_STRINGS.origin.google,
    icon: "mdi:google",
    tone: "bg-funnel-6/12 text-foreground",
  },
  outro: {
    label: LEADS_STRINGS.origin.outro,
    icon: "mdi:dots-horizontal",
    tone: "bg-muted text-muted-foreground",
  },
  // Funnel Frente 3: leads materialized from historical conversations/imports
  // (origin written by the migration script and the import Edge Functions).
  import: {
    label: LEADS_STRINGS.origin.import,
    icon: "mdi:database-import-outline",
    tone: "bg-muted text-muted-foreground",
  },
};

/**
 * Null-safe ORIGIN_META lookup. Lead origins are written by server-side code
 * (webhook, imports, migration scripts) that the frontend type system cannot
 * see — an unknown value must degrade to the "outro" badge, never crash the
 * kanban (2026-07-18 incident: origin='import' predated its META entry and
 * took down /app/leads with `undefined.tone`).
 */
export function getOriginMeta(origin: string): IOriginMeta {
  return ORIGIN_META[origin as LeadOrigin] ?? ORIGIN_META.outro;
}

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
      tone: "bg-severity-critical/15 text-severity-critical",
      diffDays,
    };
  }
  if (diffDays === 0) {
    return {
      urgency: "today",
      label: LEADS_STRINGS.card.nextAction.today,
      tone: "bg-severity-warning/15 text-severity-warning",
      diffDays,
    };
  }
  if (diffDays === -1) {
    return {
      urgency: "tomorrow",
      label: LEADS_STRINGS.card.nextAction.tomorrow,
      tone: "bg-severity-success/15 text-severity-success",
      diffDays,
    };
  }
  return {
    urgency: "future",
    label: LEADS_STRINGS.card.nextAction.future(-diffDays),
    tone: "bg-severity-success/15 text-severity-success",
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
