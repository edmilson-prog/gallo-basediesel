import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ILead, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export interface IMoveLeadStageInput {
  lead: ILead;
  entry: ILeadFunnelEntry;
  target: ILeadFunnelStage;
}

export interface IUseMoveLeadStageOptions {
  funnelId: ID;
  /** A terminal stage is a decision, not a move — the host opens the modal. */
  onRequestClose: (lead: ILead) => void;
  onMoved?: (lead: ILead, stage: ILeadFunnelStage) => void;
}

/**
 * Moving a lead between stages of the open funnel.
 *
 * Shared by the board (drag, keyboard, the card's ⋮ menu) and by the list's
 * triage actions, because they are the same operation and were drifting into
 * two: the same audit action, the same invalidations, and the same rule that
 * dropping onto a won/lost stage opens the decision modal instead of writing
 * silently.
 *
 * `moveEntry`, never `leads.update`: with N:N this alters ONLY this funnel's
 * participation, and the lead's other funnels are untouched.
 */
export function useMoveLeadStage({
  funnelId,
  onRequestClose,
  onMoved,
}: IUseMoveLeadStageOptions) {
  const provider = useLeadFunnelsProvider();
  const queryClient = useQueryClient();

  return useCallback(
    async ({ lead, entry, target }: IMoveLeadStageInput) => {
      if (entry.stageId === target.id) return;

      // Not a comparison against CLOSING_STAGE_ID, a constant in the code: the
      // stage's own `kind` carries the meaning, and every funnel has one.
      if (target.kind === "ganho" || target.kind === "perda") {
        onRequestClose(lead);
        return;
      }

      try {
        await provider.moveEntry(entry.id, target.id);
        auditLog({
          action: "lead_funnel_entry.stage_changed",
          resource: "lead",
          resourceId: lead.id,
          before: { stageId: entry.stageId },
          after: { stageId: target.id },
        });
        toast.success(LEADS_STRINGS.toasts.moved(target.name));
        onMoved?.(lead, target);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["lead-funnel-entries", funnelId] }),
          queryClient.invalidateQueries({ queryKey: ["lead-funnel-board-summary", funnelId] }),
        ]);
      } catch {
        toast.error(LEADS_STRINGS.toasts.moveError);
      }
    },
    [provider, queryClient, funnelId, onRequestClose, onMoved],
  );
}
