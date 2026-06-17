import type { IRotationQueuesProvider } from "../contracts/rotationQueues";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useRotationQueuesProvider(): IRotationQueuesProvider {
  return useDataProviderSlice("rotationQueues", "useRotationQueuesProvider");
}
