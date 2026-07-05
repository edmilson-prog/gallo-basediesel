import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversation } from "@/shared/types";
import { recordAuditLog, useConversationParticipantsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { canManageCollaborators, canRemoveCollaborator } from "../engine/assignmentGate";

export interface IUseConversationCollaborators {
  /** Whether the current user may open the invite dialog. */
  canManage: boolean;
  /** Whether the current user may remove a SPECIFIC collaborator (includes self-removal). */
  canRemove: (collaboratorSellerId: ID) => boolean;
  addCollaborator: (sellerId: ID) => Promise<void>;
  removeCollaborator: (sellerId: ID) => Promise<void>;
  isMutating: boolean;
}

/**
 * Add/remove collaborators on a conversation. Mirrors `useConversationNotes`'s
 * shape (mutation + toast on error, caller-provided `onChanged` refetches the
 * conversation detail — no local cache of its own).
 */
export function useConversationCollaborators(
  conversation: Pick<IConversation, "id" | "storeId" | "assignedSellerId">,
  onChanged: () => void,
): IUseConversationCollaborators {
  const provider = useConversationParticipantsProvider();
  const { currentUser, hasRole } = useAuth();
  const isStaff = hasRole(["Owner", "Gestor"]);
  const sellerId = currentUser?.sellerId;

  // Granting/revoking a collaborator IS an access grant (Portão A), so audit it
  // like assignSeller — otherwise "who gave seller X access to this
  // conversation?" is unanswerable (the close trigger later wipes the rows).
  // Fire-and-forget: recordAuditLog swallows failures, never blocks the action.
  const audit = (action: string, targetSellerId: ID) => {
    if (!sellerId) return;
    void recordAuditLog({
      actorId: sellerId,
      storeId: conversation.storeId,
      action,
      resource: "conversation",
      resourceId: conversation.id,
      after: { sellerId: targetSellerId },
    });
  };

  const addMutation = useMutation({
    mutationFn: (targetSellerId: ID) => provider.add(conversation.id, targetSellerId, "manual"),
    onSuccess: (_data, targetSellerId) => {
      audit("conversation.participant_add", targetSellerId);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar o colaborador."),
  });

  const removeMutation = useMutation({
    mutationFn: (targetSellerId: ID) => provider.remove(conversation.id, targetSellerId),
    onSuccess: (_data, targetSellerId) => {
      audit("conversation.participant_remove", targetSellerId);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível remover o colaborador."),
  });

  return {
    canManage: canManageCollaborators(conversation, { isStaff, sellerId }),
    canRemove: (collaboratorSellerId) =>
      canRemoveCollaborator(conversation, collaboratorSellerId, { isStaff, sellerId }),
    addCollaborator: async (targetSellerId) => {
      await addMutation.mutateAsync(targetSellerId);
    },
    removeCollaborator: (targetSellerId) => removeMutation.mutateAsync(targetSellerId),
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}
