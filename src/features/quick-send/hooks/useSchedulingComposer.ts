import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IConversation, ISO8601, IScheduledSend } from "@/shared/types";
import { useScheduledSendProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentAttendantName } from "@/features/conversations/hooks/useCurrentAttendantName";
import {
  buildSchedulePayload,
  canSaveDraft as canSaveDraftFn,
  scheduleBlock,
  type IScheduleFormState,
  type IScheduledMediaDraft,
} from "../engine/scheduleComposer";
import { scheduledSendsQueryKey } from "./useConversationScheduled";
import { globalScheduledQueryKey } from "./useGlobalScheduled";

const EMPTY_FORM: IScheduleFormState = { text: "", media: null, scheduledFor: null };

export interface IUseSchedulingComposerResult {
  form: IScheduleFormState;
  /** Id of the item being edited (draft or pending), or null when composing new. */
  editingId: ID | null;
  setText(text: string): void;
  setMedia(media: IScheduledMediaDraft | null): void;
  setScheduledFor(iso: ISO8601 | null): void;
  reset(): void;
  loadForEdit(item: IScheduledSend): void;
  /** null when it can be scheduled; otherwise the block reason. */
  block: ReturnType<typeof scheduleBlock>;
  canSaveDraft: boolean;
  /** Persists a pending (or updates the edited) send. Returns the saved row. */
  schedule(): Promise<IScheduledSend>;
  /** Persists/updates as a draft (no time). */
  saveDraft(): Promise<IScheduledSend>;
}

/**
 * Composer state for the Scheduling Center. The state lives HERE (above the
 * shells) so switching display modes never loses the in-progress message.
 * Pure validation/payload logic is delegated to engine/scheduleComposer.
 */
export function useSchedulingComposer(conversation: IConversation): IUseSchedulingComposerResult {
  const provider = useScheduledSendProvider();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const attendantName = useCurrentAttendantName();
  const [form, setForm] = useState<IScheduleFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<ID | null>(null);

  const now = new Date().toISOString();
  const block = scheduleBlock(form, now);
  const canSaveDraft = canSaveDraftFn(form);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: scheduledSendsQueryKey(conversation.id) });
    void queryClient.invalidateQueries({ queryKey: globalScheduledQueryKey });
  }, [queryClient, conversation.id]);

  const setText = useCallback((text: string) => setForm((f) => ({ ...f, text })), []);
  const setMedia = useCallback(
    (media: IScheduledMediaDraft | null) => setForm((f) => ({ ...f, media })),
    [],
  );
  const setScheduledFor = useCallback(
    (scheduledFor: ISO8601 | null) => setForm((f) => ({ ...f, scheduledFor })),
    [],
  );
  const reset = useCallback(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }, []);

  const loadForEdit = useCallback((item: IScheduledSend) => {
    setEditingId(item.id);
    setForm({
      text: item.payload.contextMessage ?? "",
      media:
        item.payload.type === "media" && item.payload.mediaPath
          ? {
              mediaPath: item.payload.mediaPath,
              mediaType: item.payload.mediaType ?? "document",
              fileName: item.payload.fileName ?? "arquivo",
              previewUrl: "",
            }
          : null,
      scheduledFor: item.scheduledFor,
    });
  }, []);

  // sellerId is optional on IUserProfile (staff profiles carry it; clients do not).
  // Fall back to the conversation's assigned seller, then "system" as a last resort.
  const createdBy = currentUser?.sellerId ?? conversation.assignedSellerId ?? "system";

  const persist = useCallback(
    async (status: "pending" | "draft", scheduledFor: ISO8601 | null) => {
      const payload = buildSchedulePayload(form, attendantName);
      const saved = editingId
        ? await provider.update(editingId, { payload, scheduledFor, status })
        : await provider.create({
            conversationId: conversation.id,
            scheduledFor,
            payload,
            createdBy,
            status,
            // Supabase RLS requires store_id = current_store_id(); the conversation's
            // store is the active store, so thread it explicitly (the mock's
            // withCreateStoreId would inject it, but the supabase impl does not).
            storeId: conversation.storeId,
          });
      invalidate();
      reset();
      return saved;
    },
    [
      form,
      editingId,
      provider,
      conversation.id,
      conversation.storeId,
      createdBy,
      attendantName,
      invalidate,
      reset,
    ],
  );

  const schedule = useCallback(
    () => persist("pending", form.scheduledFor),
    [persist, form.scheduledFor],
  );
  const saveDraft = useCallback(() => persist("draft", null), [persist]);

  return useMemo(
    () => ({
      form,
      editingId,
      setText,
      setMedia,
      setScheduledFor,
      reset,
      loadForEdit,
      block,
      canSaveDraft,
      schedule,
      saveDraft,
    }),
    [
      form,
      editingId,
      setText,
      setMedia,
      setScheduledFor,
      reset,
      loadForEdit,
      block,
      canSaveDraft,
      schedule,
      saveDraft,
    ],
  );
}
