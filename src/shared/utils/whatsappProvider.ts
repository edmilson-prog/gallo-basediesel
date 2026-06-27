import type { IWhatsAppAccount, WhatsAppProviderName } from "@/shared/types";

/**
 * True for the Evolution engine family (self-hosted WhatsApp Web sessions:
 * Evolution v2/Baileys and Evolution Go/whatsmeow). Both pair by QR through
 * the same `whatsapp-connect` Edge and share UI affordances (connect, test,
 * import, sync). Meta Cloud API is NOT in this family.
 */
export function isEvolutionFamily(provider: WhatsAppProviderName): boolean {
  return provider === "evolution" || provider === "evolution-go";
}

/**
 * True when an Evolution-family account carries enough non-secret config to be
 * polled/operated by the connect edge. Classic Evolution stores its host in
 * `providerConfig.baseUrl`; Evolution Go keeps the base URL in the server
 * registry (`whatsapp_go_servers`), so a paired Go account legitimately has NO
 * `baseUrl` here — its readiness signal is the server-minted `instanceId`.
 */
export function isEvolutionAccountConfigured(
  account: Pick<IWhatsAppAccount, "provider" | "providerConfig">,
): boolean {
  if (!isEvolutionFamily(account.provider)) return false;
  if (account.provider === "evolution-go") {
    return Boolean(account.providerConfig?.instanceId);
  }
  return Boolean(account.providerConfig?.baseUrl);
}
