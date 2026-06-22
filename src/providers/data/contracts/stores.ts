import type { Division, ID, IPlatformSettings, IStore, StoreType } from "@/shared/types";

/** Input for creating a new store (filial/parceira). Matriz is seed-only. */
export interface IStoreCreateInput {
  name: string;
  type: Extract<StoreType, "filial" | "parceira">;
  cnpj: string;
  address: string;
  managerId?: ID;
  activeDivisions: Division[];
  /** When omitted, the provider fills it with buildDefaultSettings(new id). */
  settings?: IPlatformSettings;
}

/** Patch for editing an existing store. `id`/`type`/`isActive` are not editable here. */
export interface IStoreUpdateInput {
  name?: string;
  cnpj?: string;
  address?: string;
  managerId?: ID;
  activeDivisions?: Division[];
}

/** Per-store member counts (sellers/customers) for the stores listing. */
export interface IStoreMemberCounts {
  storeId: ID;
  sellersCount: number;
  customersCount: number;
}

/**
 * Contract for store (loja) access. The multi-store substrate of the platform.
 *
 * Write operations (create/update/setActive) land with Bloco A1 (gestão
 * multi-loja Fase 2) and are Owner-only — enforced server-side by the
 * `create_store`/`update_store`/`set_store_active` RPCs (SECURITY DEFINER).
 *
 * @see ../../../mocks/api/stores.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IStoresProvider {
  list(): Promise<IStore[]>;
  get(id: ID): Promise<IStore>;
  create(input: IStoreCreateInput): Promise<IStore>;
  update(id: ID, patch: IStoreUpdateInput): Promise<IStore>;
  setActive(id: ID, active: boolean): Promise<IStore>;
  /**
   * Per-store seller/customer counts. Owner sees all stores; other staff see
   * only their own store. Backed by the owner-aware `store_member_counts` RPC
   * (the per-store RLS would otherwise zero out counts for non-active stores).
   */
  getMemberCounts(): Promise<IStoreMemberCounts[]>;
}
