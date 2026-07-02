// src/features/quick-send/hooks/useSendAsset.ts
import { useCallback } from "react";
import { toast } from "sonner";
import type {
  IAssetLibraryItem,
  IConversation,
  IWhatsAppAccount,
  MessageMediaType,
} from "@/shared/types";
import {
  useMediaStorageProvider,
  useAssetLibraryProvider,
  useTrackableLinkProvider,
} from "@/providers/data";
import { buildShortRef, buildUtm, encodeLinkMarker } from "../engine/trackableLink";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { useAuth } from "@/features/auth/useAuth";
import { pickSendableVersion } from "../engine/assetVersioning";
import { isSensitiveAsset, canSendSensitiveAsset } from "../engine/assetSensitivity";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

/** Map an AssetKind to the media message kind accepted by useMessageSend. */
function assetKindToMediaType(item: IAssetLibraryItem): MessageMediaType {
  switch (item.kind) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "document":
    default:
      return "document";
  }
}

export interface IUseSendAssetResult {
  sendAsset: (item: IAssetLibraryItem, contextMessage?: string) => Promise<void>;
}

/**
 * Materializes an asset send (D-4):
 *  1. version gate — only `published` (pickSendableVersion) is sendable;
 *  2. sensitivity gate — sensitive asset requires Owner/Gestor;
 *  3. upload bytes via PRD-026 (direction "out") → getSignedUrl;
 *  4. dispatch via PRD-011 useMessageSend (respects the 24h window upstream);
 *  5. recordSend for recents + usage stats.
 */
export function useSendAsset(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IUseSendAssetResult {
  const media = useMediaStorageProvider();
  const library = useAssetLibraryProvider();
  const trackableLinks = useTrackableLinkProvider();
  const { send } = useMessageSend(conversation, whatsappAccount);
  const { currentUser } = useAuth();

  const sendAsset = useCallback(
    async (item: IAssetLibraryItem, contextMessage?: string) => {
      const sendable = pickSendableVersion(item);
      if (!sendable) {
        toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
        return;
      }
      const viewer = currentUser ? { role: currentUser.role } : null;
      if (isSensitiveAsset(sendable) && !canSendSensitiveAsset(viewer)) {
        toast.error(QUICK_SEND_STRINGS.library.noPermission);
        return;
      }

      try {
        const text = (contextMessage ?? "").trim();

        if (sendable.kind === "link") {
          // PRODUCER (Plan C, Task 8.5): a real link send creates a trackable
          // link bound to this conversation + lead, then sends a `[link]<json>`
          // marker message. The created ITrackableLink (conversationId + leadId)
          // is what makes the open-simulation runner (useTrackableLinkSimulation)
          // pick it up and raise the lead temperature (RF-016/017/018, D-8/D-9).
          const targetUrl = sendable.url ?? "";
          const label = sendable.title;
          // Graceful degradation: if there is no URL or creation fails, fall back
          // to Plan B's exact plain-text behavior — never a broken message.
          let linkMarker: string | null = null;
          if (targetUrl) {
            try {
              const created = await trackableLinks.create({
                assetId: sendable.id,
                conversationId: conversation.id,
                leadId: conversation.leadId, // temperature target (undefined for customer-only convos)
                targetUrl,
                shortRef: buildShortRef(`${conversation.id}:${sendable.id}:${Date.now()}`),
                utm: buildUtm({
                  source: "whatsapp",
                  medium: "chat",
                  campaign: label,
                }),
                createdBy: currentUser?.id ?? "system",
              });
              linkMarker = encodeLinkMarker({
                linkId: created.id,
                label,
                shortRef: created.shortRef,
              });
            } catch {
              // Tracking creation failed — degrade to plain text below.
              linkMarker = null;
            }
          }

          if (linkMarker) {
            // Optional context note precedes the marker as a separate plain
            // message so the marker text stays parseable by decodeLinkMarker.
            if (text) await send({ text });
            await send({ text: linkMarker });
          } else {
            // Plan B fallback: plain-text link (no tracking).
            const linkText = [text, sendable.url].filter(Boolean).join("\n");
            await send({ text: linkText || (sendable.url ?? sendable.title) });
          }
        } else {
          // Materialize the file as an outbound media asset (PRD-026).
          const uploaded = await media.upload({
            kind:
              assetKindToMediaType(sendable) === "image"
                ? "image"
                : sendable.kind === "video"
                  ? "video"
                  : "document",
            mimeType:
              sendable.kind === "image"
                ? "image/jpeg"
                : sendable.kind === "video"
                  ? "video/mp4"
                  : "application/pdf",
            sizeBytes: 256_000,
            fileName: sendable.title,
            conversationId: conversation.id,
            authorType: "seller",
            direction: "out",
          });
          const mediaUrl = await media.getSignedUrl(uploaded.id);
          await send({
            text,
            mediaType: assetKindToMediaType(sendable),
            mediaUrl,
            fileName: sendable.title,
          });
        }

        if (currentUser?.sellerId) {
          await library.recordSend(currentUser.sellerId, sendable.id);
        }
      } catch {
        toast.error(QUICK_SEND_STRINGS.errors.sendFailed);
      }
    },
    [conversation.id, conversation.leadId, currentUser, library, media, send, trackableLinks],
  );

  return { sendAsset };
}
