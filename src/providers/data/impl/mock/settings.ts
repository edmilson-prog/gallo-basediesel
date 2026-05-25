import { settingsApi } from "@/mocks";
import type { ISettingsProvider } from "../../contracts/settings";

export const mockSettingsProvider: ISettingsProvider = {
  get: (storeId) => settingsApi.get(storeId),
  update: (storeId, patch) => settingsApi.update(storeId, patch),
};
