import type { IRotationParticipantsProvider } from "../contracts/rotationParticipants";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useRotationParticipantsProvider(): IRotationParticipantsProvider {
  return useDataProviderSlice("rotationParticipants", "useRotationParticipantsProvider");
}
