import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversationNote } from "@/shared/types";
import { useConversationNotesProvider, useConversationParticipantsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { resolveMentionParticipants } from "../engine/mentions";

export interface IUseConversationNotes {
  notes: IConversationNote[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** Logged-in seller id (note author); undefined when the session has none. */
  currentSellerId: ID | undefined;
  /** Owner/Gestor — may delete/pin any note. */
  isStaff: boolean;
  createNote: (content: string, mentions: ID[]) => Promise<IConversationNote>;
  updateNote: (
    id: ID,
    patch: Partial<Pick<IConversationNote, "content" | "mentions" | "pinned">>,
  ) => Promise<IConversationNote>;
  removeNote: (id: ID) => Promise<void>;
  isMutating: boolean;
}

/**
 * Conversation notes for the internal attendant board: a cached list plus
 * create/update/delete mutations that invalidate it. The author is the logged
 * seller; `storeId` is threaded from the conversation so the supabase RLS
 * WITH CHECK (store_id = current_store_id()) passes.
 *
 * `assignedSellerId` (optional — omit when the caller doesn't know it, e.g.
 * `NotesButton`/`MessageList`, which never create notes) feeds
 * `resolveMentionParticipants`: mentioning a colleague who isn't already the
 * assignee or a collaborator auto-adds them as one (source='mention'), but
 * ONLY when the note's author is staff or the conversation's own assignee —
 * mirrors the `cp_insert` RLS gate from the author's perspective.
 */
export function useConversationNotes(
  conversationId: ID,
  storeId: ID,
  assignedSellerId?: ID,
  enabled = true,
): IUseConversationNotes {
  const provider = useConversationNotesProvider();
  const participantsProvider = useConversationParticipantsProvider();
  const { currentUser, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const currentSellerId = currentUser?.sellerId;
  const isStaff = hasRole(["Owner", "Gestor"]);

  const queryKey = ["conversation-notes", conversationId];

  const query = useQuery({
    queryKey,
    queryFn: () => provider.list(conversationId),
    enabled: enabled && Boolean(conversationId),
    staleTime: 30_000,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: async ({ content, mentions }: { content: string; mentions: ID[] }) => {
      if (!currentSellerId) {
        throw new Error("Sua sessão não tem um vendedor associado.");
      }
      const note = await provider.create({
        conversationId,
        storeId,
        authorId: currentSellerId,
        content,
        mentions,
      });

      if (mentions.length > 0) {
        const existing = await participantsProvider.list(conversationId).catch(() => []);
        const toAdd = resolveMentionParticipants(mentions, {
          assignedSellerId,
          authorId: currentSellerId,
          isAuthorStaff: isStaff,
          existingParticipantIds: existing.map((p) => p.sellerId),
        });
        await Promise.all(
          toAdd.map((sellerId) =>
            participantsProvider.add(conversationId, sellerId, "mention").catch(() => {
              // Best-effort: the note itself already saved successfully — a
              // failed auto-add just means that colleague doesn't gain access,
              // not that note creation should appear to have failed.
            }),
          ),
        );
      }

      return note;
    },
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a anotação."),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: ID;
      patch: Partial<Pick<IConversationNote, "content" | "mentions" | "pinned">>;
    }) => provider.update(id, patch),
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar a anotação."),
  });

  const removeMutation = useMutation({
    mutationFn: (id: ID) => provider.remove(id),
    onSuccess: invalidate,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a anotação."),
  });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    currentSellerId,
    isStaff,
    createNote: (content, mentions) => createMutation.mutateAsync({ content, mentions }),
    updateNote: (id, patch) => updateMutation.mutateAsync({ id, patch }),
    removeNote: (id) => removeMutation.mutateAsync(id),
    isMutating: createMutation.isPending || updateMutation.isPending || removeMutation.isPending,
  };
}
