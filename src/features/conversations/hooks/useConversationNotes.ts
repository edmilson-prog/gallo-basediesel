import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversationNote } from "@/shared/types";
import { useConversationNotesProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";

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
 */
export function useConversationNotes(
  conversationId: ID,
  storeId: ID,
  enabled = true,
): IUseConversationNotes {
  const provider = useConversationNotesProvider();
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
    mutationFn: ({ content, mentions }: { content: string; mentions: ID[] }) => {
      if (!currentSellerId) {
        throw new Error("Sua sessão não tem um vendedor associado.");
      }
      return provider.create({
        conversationId,
        storeId,
        authorId: currentSellerId,
        content,
        mentions,
      });
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
