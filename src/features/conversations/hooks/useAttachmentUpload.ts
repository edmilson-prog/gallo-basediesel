import { useCallback } from "react";
import { toast } from "sonner";
import type { IConversation, IMediaUploadInput } from "@/shared/types";
import { getActiveDataSource, useMediaStorageProvider } from "@/providers/data";
import type { ISendOptions } from "./useMessageSend";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

/** File kinds offered by the composer attach menu (PRD-119 RF-026). */
export type AttachmentKind = "image" | "audio" | "document";

/**
 * Per-kind size caps. Image/audio mirror the Meta Cloud API media limits;
 * document is a conservative cap below the Storage bucket default.
 */
const MAX_SIZE_BYTES: Record<AttachmentKind, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

/** File-picker `accept` per kind. */
export const ATTACHMENT_ACCEPT: Record<AttachmentKind, string> = {
  image: "image/*",
  audio: "audio/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.xml,.zip",
};

const FALLBACK_MIME: Record<AttachmentKind, string> = {
  image: "image/jpeg",
  audio: "audio/mpeg",
  document: "application/pdf",
};

export interface IUseAttachmentUploadResult {
  /**
   * Uploads the picked file as an outbound media asset (PRD-026) and returns
   * the ready-to-send payload, or `null` when the file is rejected (size cap —
   * already toasted). Upload failures throw.
   *
   * - `supabase`: real bytes go to the `whatsapp-media` bucket and the payload
   *   carries a signed URL — the send pipeline (PRD-115) passes absolute URLs
   *   straight to the provider engine.
   * - `mock`: metadata-only registration (gallery stays consistent) and a
   *   session-local object URL so the demo bubble renders the real file.
   */
  prepareAttachment(
    file: File,
    kind: AttachmentKind,
    caption: string,
  ): Promise<ISendOptions | null>;
}

/** Materializes an ad-hoc composer attachment (PRD-119 RF-026). */
export function useAttachmentUpload(conversation: IConversation): IUseAttachmentUploadResult {
  const media = useMediaStorageProvider();

  const prepareAttachment = useCallback(
    async (file: File, kind: AttachmentKind, caption: string): Promise<ISendOptions | null> => {
      const maxBytes = MAX_SIZE_BYTES[kind];
      if (file.size > maxBytes) {
        toast.error(CONVERSATION_STRINGS.attachTooLarge(Math.round(maxBytes / 1024 / 1024)));
        return null;
      }
      // The Supabase media provider requires the owning store (the mock injects
      // it via withCreateStoreId). A conversation's store always equals
      // current_store_id() under RLS, so it satisfies the Storage INSERT policy
      // (path = <storeId>/…). Without it, media.upload throws "missing storeId"
      // and the attachment silently never sends. Cast mirrors useMediaActions.
      const uploaded = await media.upload({
        kind,
        mimeType: file.type || FALLBACK_MIME[kind],
        sizeBytes: file.size,
        fileName: file.name,
        conversationId: conversation.id,
        customerId: conversation.customerId,
        authorType: "seller",
        direction: "out",
        file,
        storeId: conversation.storeId,
      } as IMediaUploadInput);
      const mediaUrl =
        getActiveDataSource() === "supabase"
          ? await media.getSignedUrl(uploaded.id)
          : URL.createObjectURL(file);
      // fileName lets the send pipeline label documents with the real name on
      // the recipient side (Meta/Evolution); ignored for image/audio/video.
      return { text: caption, mediaType: kind, mediaUrl, fileName: file.name };
    },
    [conversation.customerId, conversation.id, conversation.storeId, media],
  );

  return { prepareAttachment };
}
