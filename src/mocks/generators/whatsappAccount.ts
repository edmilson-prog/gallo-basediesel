import type { IWhatsAppAccount } from "@/shared/types";
import { SEED_STORE_ID } from "../data";

/**
 * Two WhatsApp accounts: one Meta Cloud (official, HSM templates) and one
 * Evolution (campaign-friendly, no HSM). IDs match the references kept inside
 * `IPlatformSettings.whatsappAccounts`.
 */
export const SEED_WHATSAPP_ACCOUNTS: IWhatsAppAccount[] = [
  {
    id: "wa-meta-matriz",
    storeId: SEED_STORE_ID,
    label: "GALLO Matriz (Oficial)",
    phoneNumber: "(55) 99800-1000",
    provider: "meta",
    credentialsRef: "vault://gallo/wa-meta-matriz",
    status: "connected",
    currentState: "healthy",
    failoverPolicy: "manual",
    failoverAccountId: "wa-evo-campanhas",
    isFailoverActive: false,
    capabilities: {
      supportsTemplatesHsm: true,
      supportsInteractiveButtons: true,
      supportsLists: true,
      supportsReactions: true,
      supportsProactiveMessaging: false,
      supportsReadStatusInGroups: false,
    },
    createdAt: "2026-02-01T10:00:00.000Z",
    purpose: "ambos",
  },
  {
    id: "wa-evo-campanhas",
    storeId: SEED_STORE_ID,
    label: "GALLO Campanhas",
    phoneNumber: "(55) 99800-2000",
    provider: "evolution",
    credentialsRef: "vault://gallo/wa-evo-campanhas",
    status: "connected",
    currentState: "healthy",
    failoverPolicy: "disabled",
    isFailoverActive: false,
    capabilities: {
      supportsTemplatesHsm: false,
      supportsInteractiveButtons: false,
      supportsLists: false,
      supportsReactions: true,
      supportsProactiveMessaging: true,
      supportsReadStatusInGroups: true,
    },
    createdAt: "2026-02-15T10:00:00.000Z",
    purpose: "campanha",
  },
];

export function generateWhatsAppAccounts(): IWhatsAppAccount[] {
  return SEED_WHATSAPP_ACCOUNTS.map((a) => ({ ...a, capabilities: { ...a.capabilities } }));
}
