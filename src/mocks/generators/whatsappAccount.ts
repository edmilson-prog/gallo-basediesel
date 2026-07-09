import type { IWhatsAppAccount } from "@/shared/types";
import { SEED_STORE_ID } from "../data";

/**
 * Three WhatsApp accounts: one Meta Cloud (official, HSM templates), one
 * Evolution (campaign-friendly, no HSM) and one OpenWA (redundant/primary
 * engine for new stores/numbers). IDs match the references kept inside
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
    alertsMuted: false,
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
    alertsMuted: false,
  },
  {
    id: "wa-openwa-filial",
    storeId: SEED_STORE_ID,
    label: "GALLO Filial (OpenWA)",
    phoneNumber: "(55) 99800-3000",
    provider: "openwa",
    credentialsRef: "vault://gallo/wa-openwa-filial",
    status: "connected",
    currentState: "healthy",
    // Canonical openwa shape: ONLY the server-minted sessionId (the base URL
    // lives in the whatsapp_openwa_servers registry, mirroring the real DB
    // CHECK `provider_config ? 'sessionId'`). Fixed fake uuid = deterministic.
    providerConfig: {
      sessionId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    },
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
    createdAt: "2026-07-06T10:00:00.000Z",
    purpose: "atendimento",
    alertsMuted: false,
  },
];

export function generateWhatsAppAccounts(): IWhatsAppAccount[] {
  return SEED_WHATSAPP_ACCOUNTS.map((a) => ({ ...a, capabilities: { ...a.capabilities } }));
}
