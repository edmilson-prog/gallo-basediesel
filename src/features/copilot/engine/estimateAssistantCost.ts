import type { ICopilotAssistantSettings } from "@/shared/types";

/** Days used to turn a per-day figure into a monthly one. */
const DAYS_PER_MONTH = 30;

/** Share of active conversations whose seller presses "analisar" on a given day. */
const ON_DEMAND_RATE = 0.25;

/** Hours of a working day used to convert the cache window into a hit rate. */
const WORKING_HOURS_PER_DAY = 10;

export interface IEstimateAssistantCostInput {
  settings: ICopilotAssistantSettings;
  /** Conversations with activity on a typical day (measured: 194). */
  activeConversationsPerDay: number;
  /** BRL per LLM call (measured: 0,025 with claude-sonnet-5). */
  costPerCallBRL: number;
  /**
   * How many times a seller reopens the same conversation in a day. This is the
   * WEAKEST input of the projection — it is estimated, not measured, and the UI
   * must label it as an assumption.
   */
  opensPerConversationPerDay: number;
}

export interface IAssistantCostEstimate {
  callsPerDay: number;
  monthlyBRL: number;
  /** Percentage of the assistant's own cap. 0 when there is no own cap. */
  pctOfCap: number;
}

/**
 * Projects the assistant's monthly LLM spend from its parameters. Pure — the
 * settings screen calls it on every control change so the price of a decision
 * is visible before the decision costs anything.
 */
export function estimateAssistantCost({
  settings,
  activeConversationsPerDay,
  costPerCallBRL,
  opensPerConversationPerDay,
}: IEstimateAssistantCostInput): IAssistantCostEstimate {
  const conversations = Math.max(0, activeConversationsPerDay);

  let callsPerDay = 0;
  if (settings.engine === "ai" && conversations > 0) {
    if (settings.trigger === "on_demand") {
      callsPerDay = conversations * ON_DEMAND_RATE;
    } else if (settings.trigger === "on_open") {
      const opensPerConv = Math.max(1, opensPerConversationPerDay);
      let callsPerConv: number;
      if (settings.cacheMinutes > 0) {
        const windowsPerDay = Math.max(1, (WORKING_HOURS_PER_DAY * 60) / settings.cacheMinutes);
        // The cache collapses repeat opens inside the same window into one call.
        // Model the opens as landing uniformly at random across the day's cache
        // windows and take the expected number of DISTINCT windows touched
        // (birthday-paradox occupancy) — always < opensPerConv once there is
        // more than one open, and it shrinks further as the cache window grows
        // (fewer, larger windows to collide into).
        callsPerConv = windowsPerDay * (1 - Math.pow(1 - 1 / windowsPerDay, opensPerConv));
      } else {
        callsPerConv = opensPerConv;
      }
      callsPerDay = conversations * callsPerConv;
    } else {
      // on_new_message: one analysis per inbound burst, floored by minNewMessages.
      const burstsPerConversation = Math.max(1, 6 / Math.max(1, settings.minNewMessages));
      callsPerDay = conversations * burstsPerConversation;
    }
  }

  callsPerDay = Math.round(callsPerDay);
  const monthlyBRL = callsPerDay * costPerCallBRL * DAYS_PER_MONTH;
  const pctOfCap =
    settings.monthlyCapBRL > 0 ? (monthlyBRL / settings.monthlyCapBRL) * 100 : 0;

  return { callsPerDay, monthlyBRL, pctOfCap };
}
