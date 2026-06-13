import { useCallback } from "react";
import { toast } from "sonner";
import type { IConversation, IMediaUploadInput, ScheduledMediaType } from "@/shared/types";
import { getActiveDataSource, useMediaStorageProvider } from "@/providers/data";
import type { IScheduledMediaDraft } from "../engine/scheduleComposer";

/** Per-kind size caps for scheduled attachments (mirror useAttachmentUpload + video). */
const MAX_SIZE_BYTES: Record<ScheduledMediaType, number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

/** File-picker `accept` per kind. */
export const SCHEDULE_ATTACH_ACCEPT: Record<ScheduledMediaType, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.xml,.zip",
};

const FALLBACK_MIME: Record<ScheduledMediaType, string> = {
  image: "image/jpeg",
  video: "video/mp4",
  audio: "audio/mpeg",
  document: "application/pdf",
};

export interface IUseScheduleMediaUploadResult {
  /**
   * Uploads the picked file to the whatsapp-media bucket (PRD-026) and returns
   * the persisted `storageRef` as `mediaPath` (NOT a signed URL — that expires;
   * the worker signs the path at dispatch time). Returns null when rejected
   * (size cap — already toasted). Upload failures throw.
   */
  uploadForSchedule(file: File, kind: ScheduledMediaType): Promise<IScheduledMediaDraft | null>;
}

export function useScheduleMediaUpload(
  conversation: IConversation,
): IUseScheduleMediaUploadResult {
  const media = useMediaStorageProvider();

  const uploadForSchedule = useCallback(
    async (file: File, kind: ScheduledMediaType): Promise<IScheduledMediaDraft | null> => {
      const maxBytes = MAX_SIZE_BYTES[kind];
      if (file.size > maxBytes) {
        toast.error(`Arquivo acima do limite (${Math.round(maxBytes / 1024 / 1024)} MB).`);
        return null;
      }
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
      // mediaPath = persisted object path; preview = signed (supabase) or local blob (mock).
      const previewUrl =
        getActiveDataSource() === "supabase"
          ? await media.getSignedUrl(uploaded.id)
          : URL.createObjectURL(file);
      return { mediaPath: uploaded.storageRef, mediaType: kind, fileName: file.name, previewUrl };
    },
    [conversation.customerId, conversation.id, conversation.storeId, media],
  );

  return { uploadForSchedule };
}
