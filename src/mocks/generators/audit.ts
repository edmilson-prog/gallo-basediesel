import type { IAuditLog } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, randomISO, type ISeededContext } from "./utils";

const AUDIT_ACTIONS: { action: string; resource: string }[] = [
  { action: "customer.create", resource: "customer" },
  { action: "customer.update", resource: "customer" },
  { action: "order.create", resource: "order" },
  { action: "order.update_status", resource: "order" },
  { action: "quote.send", resource: "quote" },
  { action: "quote.approve", resource: "quote" },
  { action: "carteira.transfer", resource: "carteira_transfer" },
  { action: "lead.convert", resource: "lead" },
  { action: "settings.update", resource: "settings" },
  { action: "role.assign", resource: "role" },
];

/**
 * Generate audit log entries spanning the last 30 days. Actor and resource IDs
 * are picked from the live store ids supplied at bootstrap time.
 */
export function generateAudit(
  ctx: ISeededContext,
  options: { sequence: number; actorIds: string[]; resourceIds: string[] },
): IAuditLog {
  const template = ctx.pick(AUDIT_ACTIONS);
  return {
    id: `audit-${String(options.sequence + 1).padStart(4, "0")}`,
    actorId: ctx.pick(options.actorIds),
    action: template.action,
    resource: template.resource,
    resourceId: ctx.pick(options.resourceIds),
    timestamp: randomISO(ctx, daysAgo(30), new Date()),
    storeId: SEED_STORE_ID,
  };
}
