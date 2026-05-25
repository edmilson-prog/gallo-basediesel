import type { ID, IPlatformSettings } from "@/shared/types";

/**
 * Contract for per-store platform settings access.
 *
 * @see ../../../mocks/api/settings.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ISettingsProvider {
  get(storeId: ID): Promise<IPlatformSettings>;
  update(storeId: ID, patch: Partial<IPlatformSettings>): Promise<IPlatformSettings>;
}
