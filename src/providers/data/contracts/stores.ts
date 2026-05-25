import type { ID, IStore } from "@/shared/types";

/**
 * Contract for store (loja) access. The multi-store substrate of the platform.
 *
 * @see ../../../mocks/api/stores.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IStoresProvider {
  list(): Promise<IStore[]>;
  get(id: ID): Promise<IStore>;
}
