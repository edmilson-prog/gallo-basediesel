import type { IManagerDashboardSettings } from "@/shared/types";

/**
 * Defaults for the manager-dashboard alert subsystem (PRD-014) reused on the
 * feature side. Kept identical to the mock seed so unconfigured stores behave
 * predictably.
 */
export const DEFAULT_MANAGER_DASHBOARD_SETTINGS: IManagerDashboardSettings = {
  conversationWaitingHoursThreshold: 4,
  sellerOverloadThreshold: 15,
  alertClienteADormenteEnabled: true,
  alertVendedorSobrecarregadoEnabled: true,
  alertConversaSemRespostaEnabled: true,
  alertPollingSeconds: 30,
};
