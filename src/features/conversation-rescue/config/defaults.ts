import type { IConversationRescueSettings } from "@/shared/types";

/** Off by default in every store — mirrors DEFAULT_IDLE_ALERTS_SETTINGS discipline. */
export const DEFAULT_CONVERSATION_RESCUE_SETTINGS: IConversationRescueSettings = {
  enabled: false,
  temporaryAbsenceGraceMinutes: 15,
  forceAssignTimeoutMinutes: 5,
  fallbackSellerIds: [],
  maxClientWaitHours: 24,
};
