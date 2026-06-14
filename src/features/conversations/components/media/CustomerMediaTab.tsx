import type { ID } from "@/shared/types";
import { useCustomerMessageMedia } from "../../hooks/useCustomerMessageMedia";
import { MessageMediaGallery } from "./MessageMediaGallery";

/**
 * The customer fiche "Mídias" tab — media across ALL of the customer's
 * conversations, derived from messages (not the Vault `media_assets`). Renders
 * inline (the fiche tab owns the scroll), reusing the conversation panel's
 * gallery so both stay visually identical.
 */
export function CustomerMediaTab({ customerId }: { customerId: ID }) {
  const media = useCustomerMessageMedia(customerId);
  return <MessageMediaGallery {...media} scrollable={false} />;
}
