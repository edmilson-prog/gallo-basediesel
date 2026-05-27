import type { ID } from "@/shared/types";
import { useGoalsWithProgress, type IUseGoalsWithProgressResult } from "./useGoalsWithProgress";

/** Convenience wrapper — active goals for the given store. */
export function useStoreGoals(storeId: ID | undefined): IUseGoalsWithProgressResult {
  return useGoalsWithProgress({
    storeId,
    statuses: ["ativa"],
  });
}
