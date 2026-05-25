import type { IGoalsProvider } from "../contracts/goals";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useGoalsProvider(): IGoalsProvider {
  return useDataProviderSlice("goals", "useGoalsProvider");
}
