import type { IWhatsAppAccount, WhatsAppProviderName } from "@/shared/types";

/**
 * True for the self-hosted QR-paired session engines: Evolution v2/Baileys,
 * Evolution Go/whatsmeow and OpenWA/whatsapp-web.js. All pair by QR through
 * the same `whatsapp-connect` Edge and share UI affordances (connect, verify,
 * reconnect banner, free-text outbound). Meta Cloud API is NOT in this family.
 * The name predates OpenWA — kept to avoid churning every call site.
 */
export function isEvolutionFamily(provider: WhatsAppProviderName): boolean {
  return provider === "evolution" || provider === "evolution-go" || provider === "openwa";
}

/**
 * True when an Evolution-family account carries enough non-secret config to be
 * polled/operated by the connect edge. Classic Evolution stores its host in
 * `providerConfig.baseUrl`; Evolution Go and OpenWA keep the base URL in a
 * server registry (`whatsapp_go_servers` / `whatsapp_openwa_servers`), so a
 * paired account legitimately has NO `baseUrl` here — its readiness signal is
 * the server-minted id (`instanceId` / `sessionId`).
 */
export function isEvolutionAccountConfigured(
  account: Pick<IWhatsAppAccount, "provider" | "providerConfig">,
): boolean {
  if (!isEvolutionFamily(account.provider)) return false;
  if (account.provider === "evolution-go") {
    return Boolean(account.providerConfig?.instanceId);
  }
  if (account.provider === "openwa") {
    return Boolean(account.providerConfig?.sessionId);
  }
  return Boolean(account.providerConfig?.baseUrl);
}
