import { describePeriodWindow } from "@/features/goals/engine/projection";
import type { IGoalPeriod } from "@/shared/types/bi";
import type { ForecastMetric, IForecastInput, IForecastScope } from "@/shared/types/forecast";
import type { ILead } from "@/shared/types/lead";

export interface IBuildForecastInputArgs {
  scope: IForecastScope;
  metric: ForecastMetric;
  period: IGoalPeriod;
  realizedValue: number;
  avgTicket?: number;
  /** Raw leads of the scope; open ones are filtered here. */
  leads: ILead[];
  target?: { value: number };
  now: Date;
}

/** A lead is "open" when it is neither converted nor lost (mirrors LeadsPage's activeCount). */
function isOpenLead(lead: ILead): boolean {
  return !lead.convertedToCustomerId && !lead.lossReason;
}

/** Pure assembler: turns raw provider data into the IForecastInput the engine consumes. */
export function buildForecastInput(args: IBuildForecastInputArgs): IForecastInput {
  const openLeads = args.leads.filter(isOpenLead);
  const window = describePeriodWindow(args.period, args.now);
  return {
    scope: args.scope,
    metric: args.metric,
    period: args.period,
    realizedValue: args.realizedValue,
    avgTicket: args.avgTicket,
    openLeads,
    target: args.target,
    calendar: {
      daysElapsed: window.daysPassed,
      daysRemaining: window.daysRemaining,
      totalDays: window.totalDays,
    },
    now: args.now.toISOString(),
  };
}
