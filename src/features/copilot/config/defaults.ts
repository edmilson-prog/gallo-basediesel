import type { ICopilotAssistantSettings } from "@/shared/types";

/**
 * Defaults for the conversation assistant. Chosen to PRESERVE current behaviour
 * where it is not a defect, and to CORRECT it where it is:
 *
 * - `reach: "all"` fixes the gap that left 85% of conversations (lead-anchored)
 *   without a panel.
 * - `messageWindow: 40` replaces reading every message of a conversation.
 * - `autoExpandOnAlert: true` attacks the adoption problem: the panel used to
 *   start collapsed, hiding the AI button inside it.
 * - `engine: "rules"` keeps the deterministic engine: sub-project A turns on NO
 *   new AI cost. Sub-project B unlocks "ai".
 * - `trigger`/`cacheMinutes`/`minNewMessages` are persisted but inert until "ai".
 */
export const DEFAULT_COPILOT_ASSISTANT_SETTINGS: ICopilotAssistantSettings = {
  enabled: true,
  reach: "all",
  accountIds: [],
  roles: ["Owner", "Gestor", "Vendedor", "SDR"],
  trigger: "on_demand",
  cacheMinutes: 30,
  minNewMessages: 3,
  messageWindow: 40,
  showSummary: true,
  showSuggestions: true,
  showReplyButton: true,
  autoExpandOnAlert: true,
  engine: "rules",
  monthlyCapBRL: 0,
  alertThresholdPct: 80,
};
