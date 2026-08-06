import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ILeadFunnelEntry } from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { COPY } from "../i18n/pt-BR";

/** Six seconds: long enough to notice the toast, short enough not to linger. */
const UNDO_MS = 6000;

export interface IUseEntryMutationsInput {
  conversationId: ID;
  storeId: ID | null | undefined;
}

export interface IUseEntryMutationsResult {
  moveStage: (entry: ILeadFunnelEntry, stageId: ID, funnelName: string, stageName: string) => void;
  addToFunnel: (leadId: ID, funnelId: ID, funnelName: string) => void;
  removeFrom: (entry: ILeadFunnelEntry, funnelName: string) => void;
  /** The participation with a write in flight — the row spins and disables. */
  pendingEntryId: ID | null;
}

/**
 * Writes on a lead's participations, from inside a conversation.
 *
 * Changing stage confirms with a toast carrying "Desfazer", never a dialog:
 * it is reversible and frequent, and a modal on every change is how you teach
 * someone to stop changing it. Removing a participation is destructive and
 * keeps its AlertDialog, which lives in the row.
 */
export function useEntryMutations({
  conversationId,
  storeId,
}: IUseEntryMutationsInput): IUseEntryMutationsResult {
  const provider = useLeadFunnelsProvider();
  const queryClient = useQueryClient();
  const [pendingEntryId, setPendingEntryId] = useState<ID | null>(null);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["lead-funnel-entries-via-conversation", conversationId],
      }),
      // The Leads page shares these — a lead added here must appear there.
      queryClient.invalidateQueries({ queryKey: ["lead-funnel-counts", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["lead-funnel-entries"] }),
      queryClient.invalidateQueries({ queryKey: ["lead-funnel-board-summary"] }),
    ]);
  }, [queryClient, conversationId, storeId]);

  const moveStage = useCallback(
    (entry: ILeadFunnelEntry, stageId: ID, funnelName: string, stageName: string) => {
      if (entry.stageId === stageId) return;
      const previousStageId = entry.stageId;

      setPendingEntryId(entry.id);
      void (async () => {
        try {
          await provider.moveEntry(entry.id, stageId);
          auditLog({
            action: "lead_funnel_entry.stage_changed",
            resource: "lead",
            resourceId: entry.leadId,
            before: { stageId: previousStageId },
            after: { stageId },
          });
          await invalidate();
          toast.success(COPY.fiche.moved(funnelName, stageName), {
            duration: UNDO_MS,
            action: {
              label: COPY.fiche.undo,
              onClick: () => {
                void (async () => {
                  try {
                    await provider.moveEntry(entry.id, previousStageId);
                    await invalidate();
                    toast.success(COPY.fiche.undone);
                  } catch {
                    toast.error(COPY.fiche.moveError);
                  }
                })();
              },
            },
          });
        } catch {
          toast.error(COPY.fiche.moveError);
        } finally {
          setPendingEntryId(null);
        }
      })();
    },
    [provider, invalidate],
  );

  const addToFunnel = useCallback(
    (leadId: ID, funnelId: ID, funnelName: string) => {
      void (async () => {
        try {
          // No stageId: the server picks the funnel's entry stage. Choosing one
          // while adding is a triage decision, and triage is phase 7.
          //
          // Re-adding is a silent noop by contract — `planAddToFunnel` guards
          // both implementations — so a double click does not surface a raw
          // unique-constraint error in a pt-BR interface.
          await provider.addEntry(leadId, funnelId);
          auditLog({
            action: "lead_funnel_entry.added",
            resource: "lead",
            resourceId: leadId,
            after: { funnelId },
          });
          await invalidate();
          toast.success(COPY.fiche.added(funnelName));
        } catch {
          toast.error(COPY.fiche.addError);
        }
      })();
    },
    [provider, invalidate],
  );

  const removeFrom = useCallback(
    (entry: ILeadFunnelEntry, funnelName: string) => {
      setPendingEntryId(entry.id);
      void (async () => {
        try {
          // The provider reports whether the lead fell back to the default
          // funnel. The user has to be told: "tirei do funil" and "tirei do
          // funil e devolvi para a triagem" are different outcomes, and only
          // one of them leaves the lead where they expect to find it.
          const { movedToDefault } = await provider.removeEntry(entry.id);
          auditLog({
            action: "lead_funnel_entry.removed",
            resource: "lead",
            resourceId: entry.leadId,
            before: { funnelId: entry.funnelId, stageId: entry.stageId },
          });
          await invalidate();
          toast.success(
            movedToDefault
              ? COPY.fiche.removedToDefault(funnelName)
              : COPY.fiche.removed(funnelName),
          );
        } catch {
          toast.error(COPY.fiche.removeError);
        } finally {
          setPendingEntryId(null);
        }
      })();
    },
    [provider, invalidate],
  );

  return { moveStage, addToFunnel, removeFrom, pendingEntryId };
}
