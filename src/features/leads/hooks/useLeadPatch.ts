import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ILead } from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export interface ILeadPatchOptions {
  /** Identifies which control is in flight, so only that one shows a spinner. */
  field: string;
  /** Audit action, e.g. `lead.seller_changed`. */
  action: string;
  /** Confirmation copy. A silent write on a screen with no save button reads
   *  as a click that did nothing. */
  success: string;
}

export interface IUseLeadPatchResult {
  patch: (changes: Partial<ILead>, options: ILeadPatchOptions) => Promise<boolean>;
  /** The field currently being written, or null. */
  pendingField: string | null;
}

/**
 * One field of a lead, written where it is shown.
 *
 * The detail screen used to have a global "Editar" that swapped half the page
 * into inputs and parked a save bar at the bottom — a mode for changing a
 * temperature. Editing in place needs the opposite: a small write per control,
 * each with its own pending state, its own audit entry and its own confirmation,
 * because there is no save button left to imply that anything happened.
 */
export function useLeadPatch(lead: ILead | null): IUseLeadPatchResult {
  const provider = useLeadsProvider();
  const queryClient = useQueryClient();
  const [pendingField, setPendingField] = useState<string | null>(null);

  const patch = useCallback(
    async (changes: Partial<ILead>, { field, action, success }: ILeadPatchOptions) => {
      if (!lead) return false;
      setPendingField(field);
      try {
        const before: Record<string, unknown> = {};
        for (const key of Object.keys(changes) as (keyof ILead)[]) before[key] = lead[key];

        await provider.update(lead.id, changes);
        auditLog({ action, resource: "lead", resourceId: lead.id, before, after: changes });
        toast.success(success);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["lead", lead.id] }),
          queryClient.invalidateQueries({ queryKey: ["leads-list"] }),
          // The timeline reads the audit trail, so it has to see the entry the
          // write just produced.
          queryClient.invalidateQueries({ queryKey: ["lead-audits", lead.id] }),
        ]);
        return true;
      } catch {
        toast.error(LEADS_STRINGS.detail.inline.saveError);
        return false;
      } finally {
        setPendingField(null);
      }
    },
    [lead, provider, queryClient],
  );

  return { patch, pendingField };
}
