import type { ISO8601, IScheduledSend, ScheduledMediaType } from "@/shared/types";
import { validateFuture } from "./scheduledSend";

/** A media attachment staged in the composer (already uploaded → path known). */
export interface IScheduledMediaDraft {
  mediaPath: string;
  mediaType: ScheduledMediaType;
  fileName: string;
  /** Local/signed URL for preview only — not persisted. */
  previewUrl: string;
}

/** The Scheduling Center composer form state (lives above the shells). */
export interface IScheduleFormState {
  text: string;
  media: IScheduledMediaDraft | null;
  scheduledFor: ISO8601 | null;
}

/** Why scheduling is blocked, or null when it can proceed. */
export type ScheduleBlock = "empty" | "no-time" | "past" | null;

function hasContent(form: IScheduleFormState): boolean {
  return form.text.trim() !== "" || form.media !== null;
}

export function scheduleBlock(form: IScheduleFormState, now: ISO8601): ScheduleBlock {
  if (!hasContent(form)) return "empty";
  if (!form.scheduledFor) return "no-time";
  if (!validateFuture(form.scheduledFor, now).ok) return "past";
  return null;
}

/** Drafts only require content (text or media), never a time. */
export function canSaveDraft(form: IScheduleFormState): boolean {
  return hasContent(form);
}

/** Maps the form to the persisted `scheduled_sends.payload` (media or snippet). */
export function buildSchedulePayload(form: IScheduleFormState): IScheduledSend["payload"] {
  const caption = form.text.trim();
  if (form.media) {
    return {
      type: "media",
      ...(caption ? { contextMessage: caption } : {}),
      mediaPath: form.media.mediaPath,
      mediaType: form.media.mediaType,
      fileName: form.media.fileName,
    };
  }
  return { type: "snippet", contextMessage: caption };
}
