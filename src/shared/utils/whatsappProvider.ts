import type { WhatsAppProviderName } from "@/shared/types";

/**
 * True for the Evolution engine family (self-hosted WhatsApp Web sessions:
 * Evolution v2/Baileys and Evolution Go/whatsmeow). Both pair by QR through
 * the same `whatsapp-connect` Edge and share UI affordances (connect, test,
 * import, sync). Meta Cloud API is NOT in this family.
 */
export function isEvolutionFamily(provider: WhatsAppProviderName): boolean {
  return provider === "evolution" || provider === "evolution-go";
}
