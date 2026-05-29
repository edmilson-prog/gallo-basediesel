import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useExpensesProvider } from "@/providers/data";

/** Run the overdue sweep at most once per app session. */
let sweptThisSession = false;

/**
 * Daily-ish timer (PRD-054 RF-017): flags `pendente` expenses past their
 * `dueDate` as `atrasado`. In the mock SPA there is no cron, so we sweep once
 * per session when the page mounts and invalidate the expense caches if any
 * record transitioned.
 */
export function useExpenseStatusTimer(enabled = true): void {
  const provider = useExpensesProvider();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || sweptThisSession) return;
    sweptThisSession = true;
    let cancelled = false;
    void provider
      .markOverdue()
      .then((changed) => {
        if (!cancelled && changed.length > 0) {
          void queryClient.invalidateQueries({ queryKey: ["expenses"] });
          void queryClient.invalidateQueries({ queryKey: ["dre"] });
          void queryClient.invalidateQueries({ queryKey: ["cashflow"] });
        }
      })
      .catch(() => {
        // Non-fatal — the sweep is opportunistic.
        sweptThisSession = false;
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, provider, queryClient]);
}
