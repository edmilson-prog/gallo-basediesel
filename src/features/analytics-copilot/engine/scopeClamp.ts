import type { ID } from "@/shared/types/common";
import type { RoleName } from "@/shared/types";
import type { IMetricQuery, IMetricQueryScope } from "@/shared/types/analytics-copilot";

export interface IClampContext {
  role: RoleName;
  storeId?: ID;
  sellerId?: ID;
}

export interface IClampResult {
  query: IMetricQuery;
  refusedByScope: boolean;
}

/**
 * Pure RBAC clamp (RF-012). Restricts a query to the user's scope BEFORE execution.
 * Vendedor → own seller only (cross-seller filters/dimensions are refused, RF-013).
 * Gestor → store. Owner → cross-store. Financeiro → as provided.
 */
export function scopeClamp(query: IMetricQuery, ctx: IClampContext): IClampResult {
  const scope: IMetricQueryScope = { role: ctx.role, storeId: ctx.storeId, sellerId: ctx.sellerId };
  let refusedByScope = false;

  if (ctx.role === "Vendedor") {
    scope.sellerId = ctx.sellerId;
    if (query.filters.vendedor && query.filters.vendedor !== ctx.sellerId) {
      refusedByScope = true;
    }
    if (query.dimensions.includes("vendedor")) {
      refusedByScope = true;
    }
  } else if (ctx.role === "Gestor") {
    scope.storeId = ctx.storeId;
  }
  // Owner / Financeiro / others: keep the provided scope (Owner is cross-store).

  return { query: { ...query, scope }, refusedByScope };
}
