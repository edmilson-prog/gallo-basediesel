import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ILeadStage } from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.list.bulk;

export interface IBulkProgress {
  done: number;
  total: number;
}

export interface IUseBulkLeadActionsResult {
  addToFunnel: (ids: ID[], funnelId: ID, funnelName: string) => Promise<void>;
  assignSeller: (ids: ID[], sellerId: ID, sellerName: string) => Promise<void>;
  markLost: (ids: ID[], lossReason: string, stage: ILeadStage) => Promise<void>;
  progress: IBulkProgress | null;
}

/**
 * The three bulk operations of the list.
 *
 * There is no batch endpoint, so each of these is N sequential calls. That is
 * why the header checkbox selects the VISIBLE rows rather than all 903: the
 * shape of the write is the reason for the shape of the selection. If this ever
 * becomes painful, the answer is one RPC, not parallelism in the client.
 */
export function useBulkLeadActions(onDone?: () => void): IUseBulkLeadActionsResult {
  const leads = useLeadsProvider();
  const funnels = useLeadFunnelsProvider();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<IBulkProgress | null>(null);

  const invalidate = useCallback(async () => {
    // A batch touches two boards at once — the funnel it left and the one it
    // joined — plus the counts in the switcher.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["leads-list"] }),
      queryClient.invalidateQueries({ queryKey: ["lead-funnel-entries"] }),
      queryClient.invalidateQueries({ queryKey: ["lead-funnel-counts"] }),
      queryClient.invalidateQueries({ queryKey: ["lead-funnel-board-summary"] }),
    ]);
  }, [queryClient]);

  /**
   * Runs one operation per id and REPORTS BOTH TALLIES.
   *
   * A hundred sequential writes fail halfway sometimes. Swallowing the errors
   * would say "pronto" over a partial batch; aborting on the first would leave
   * half done and the other half unexplained. The partial report is the only
   * honest ending.
   */
  const run = useCallback(
    async (ids: ID[], op: (id: ID) => Promise<void>, successMessage: (ok: number) => string) => {
      let ok = 0;
      let fail = 0;
      setProgress({ done: 0, total: ids.length });

      for (const id of ids) {
        try {
          await op(id);
          ok += 1;
        } catch {
          fail += 1;
        }
        setProgress({ done: ok + fail, total: ids.length });
      }

      await invalidate();
      setProgress(null);

      if (fail === 0) toast.success(successMessage(ok));
      else if (ok === 0) toast.error(COPY.allFailed);
      else toast.warning(COPY.partial(ok, fail));

      onDone?.();
    },
    [invalidate, onDone],
  );

  const addToFunnel = useCallback(
    (ids: ID[], funnelId: ID, funnelName: string) =>
      run(
        ids,
        async (id) => {
          // Re-adding is a silent noop by contract, so a lead already in the
          // destination is not a failure — it is simply already there.
          await funnels.addEntry(id, funnelId);
          auditLog({
            action: "lead_funnel_entry.added",
            resource: "lead",
            resourceId: id,
            after: { funnelId },
          });
        },
        (n) => COPY.addedAll(n, funnelName),
      ),
    [run, funnels],
  );

  const assignSeller = useCallback(
    (ids: ID[], sellerId: ID, sellerName: string) =>
      run(
        ids,
        async (id) => {
          await leads.update(id, { sellerId });
          auditLog({
            action: "lead.seller_changed",
            resource: "lead",
            resourceId: id,
            after: { sellerId },
          });
        },
        (n) => COPY.assignedAll(n, sellerName),
      ),
    [run, leads],
  );

  const markLost = useCallback(
    (ids: ID[], lossReason: string, stage: ILeadStage) =>
      run(
        ids,
        async (id) => {
          // Mirrors MarkAsLostModal field for field, so a lead lost in bulk is
          // indistinguishable from one lost one at a time.
          await leads.update(id, { lossReason, stage });
          auditLog({
            action: "lead.marked_lost",
            resource: "lead",
            resourceId: id,
            after: { lossReason },
          });
        },
        (n) => COPY.lostAll(n),
      ),
    [run, leads],
  );

  return { addToFunnel, assignSeller, markLost, progress };
}
