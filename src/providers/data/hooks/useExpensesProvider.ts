import type { IExpensesProvider } from "../contracts/expenses";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useExpensesProvider(): IExpensesProvider {
  return useDataProviderSlice("expenses", "useExpensesProvider");
}
