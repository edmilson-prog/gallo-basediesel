import type { ID } from "@/shared/types";
import type { ICreateAuditInput } from "./contracts/audits";
import { getDataProviders } from "./factory";

export type { ICreateAuditInput };

/**
 * Singleton, non-React entry point for recording an audit log.
 *
 * Used by:
 *  - the RBAC `auditLog()` helper (fire-and-forget from anywhere)
 *  - mock provider implementations that need to log mutations
 *
 * Failures are swallowed and logged — auditing should never break the action
 * the user is performing. On Fase 2 the audit endpoint will be transactional
 * with the mutation it tracks, and failures will surface differently.
 */
export async function recordAuditLog(input: ICreateAuditInput): Promise<void> {
  try {
    await getDataProviders().audits.create(input);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[audit] failed to record audit log entry", err);
    }
  }
}

/** Fire-and-forget variant that exists so callers don't need to remember `void`. */
export function recordAuditLogSync(
  input: Omit<ICreateAuditInput, "storeId"> & { storeId?: ID },
): void {
  void recordAuditLog({ storeId: input.storeId ?? "00000000-0000-0000-0000-000000000001", ...input });
}
