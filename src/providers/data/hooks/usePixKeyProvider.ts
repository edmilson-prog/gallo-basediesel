import type { IPixKeyProvider } from "../contracts/pixKey";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function usePixKeyProvider(): IPixKeyProvider {
  return useDataProviderSlice("pixKey", "usePixKeyProvider");
}
