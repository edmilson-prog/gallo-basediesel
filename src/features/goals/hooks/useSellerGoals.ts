import type { ID } from "@/shared/types";
import { useGoalsWithProgress, type IUseGoalsWithProgressResult } from "./useGoalsWithProgress";

/** Convenience wrapper — active + concluded goals for the given seller. */
export function useSellerGoals(sellerId: ID | undefined): IUseGoalsWithProgressResult {
  return useGoalsWithProgress({
    sellerId,
    statuses: ["ativa", "concluida"],
  });
}
