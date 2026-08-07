import type { ContactSource } from "@/shared/types";

/**
 * Human labels for a contact's origin.
 *
 * Shared on purpose: the card, the filters bar and the drawer all surface the
 * source, and a raw `whatsapp`/`portal_b2b` leaking into the UI is exactly the
 * kind of drift that happens when each one keeps its own copy.
 */
export const CONTACT_SOURCE_LABELS: Record<ContactSource, string> = {
  whatsapp: "WhatsApp",
  dintec: "DINTEC",
  manual: "Manual",
  csv: "CSV",
  balcao: "Balcão",
  portal_b2b: "Portal B2B",
  storefront: "Loja online",
};
