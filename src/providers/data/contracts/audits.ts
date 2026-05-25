import type { IAuditLog, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListAuditsParams extends IPaginationParams {
  actorId?: ID;
  actorIds?: ID[];
  resource?: string;
  resources?: string[];
  resourceId?: ID;
  action?: string;
  actions?: string[];
  /** Lower bound on ISO timestamp (inclusive). */
  since?: string;
  /** Upper bound on ISO timestamp (inclusive). */
  until?: string;
}

export interface ICreateAuditInput {
  actorId: ID;
  action: string;
  resource: string;
  resourceId: ID;
  storeId: ID;
  before?: unknown;
  after?: unknown;
}

/**
 * Contract for the append-only audit log surface (PRD-006).
 *
 * The MVP exposes both `list` and `create`; on Fase 2 (Supabase) the table is
 * write-protected by an `INSERT`-only role and the policies forbid DELETE.
 *
 * @see ../../../docs/rbac.md
 */
export interface IAuditsProvider {
  list(params?: IListAuditsParams): Promise<IPaginatedResult<IAuditLog>>;
  create(input: ICreateAuditInput): Promise<IAuditLog>;
}
