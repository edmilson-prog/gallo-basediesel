import type { ID, ISeller } from "@/shared/types";

export interface IListSellersParams {
  storeId?: ID;
  active?: boolean;
}

/** Input to register a brand-new seller (no platform access yet — PRD-107
 *  two-step flow: access is granted later via the invite Edge Functions). */
export interface ICreateSellerInput {
  storeId: ID;
  fullName: string;
  email: string;
  phone?: string;
  type: ISeller["type"];
  region?: string;
  /** Optional attendant display name signed onto outbound messages. */
  attendantName?: string;
  /** Department the seller belongs to (PRD-211 — at most one in MVP). */
  departmentId?: ID | null;
}

/**
 * Contract for seller (vendedor) access.
 *
 * @see ../../../mocks/api/sellers.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ISellersProvider {
  /** Lists live sellers only — soft-deleted rows (deletedAt set) are hidden. */
  list(params?: IListSellersParams): Promise<ISeller[]>;
  /** Resolves any seller, including soft-deleted ones (historical references). */
  get(id: ID): Promise<ISeller>;
  setAvailability(id: ID, availability: ISeller["availability"]): Promise<ISeller>;
  /**
   * Patch arbitrary seller fields (PRD-019 — user editing their own profile;
   * users CRUD — Owner editing team members).
   */
  update(id: ID, patch: Partial<ISeller>): Promise<ISeller>;
  /**
   * Uploads a profile photo and returns its public URL — the caller persists it
   * via `update(id, { avatarUrl })`. The bytes land in the public `avatars`
   * bucket under a per-user prefix; the mock backend returns a local data URL.
   */
  uploadAvatar(id: ID, file: File): Promise<string>;
  /** Creates a new seller with defaults (offline, parts, active). */
  create(input: ICreateSellerInput): Promise<ISeller>;
  /** Soft delete — sets deletedAt, deactivates and revokes login (if any). */
  remove(id: ID): Promise<void>;
}
