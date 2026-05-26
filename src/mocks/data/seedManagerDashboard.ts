import type { IManagerDashboardSettings } from "@/shared/types";

/**
 * Default settings for the manager dashboard alert subsystem (PRD-014).
 * Owners can tune these per-store via the AlertSettingsModal.
 */
export const DEFAULT_MANAGER_DASHBOARD_SETTINGS: IManagerDashboardSettings = {
  conversationWaitingHoursThreshold: 4,
  sellerOverloadThreshold: 15,
  alertClienteADormenteEnabled: true,
  alertVendedorSobrecarregadoEnabled: true,
  alertConversaSemRespostaEnabled: true,
  alertPollingSeconds: 30,
};
