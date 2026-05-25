import type { PermissionAction } from "@/shared/types";

/**
 * Canonical RBAC action verbs.
 *
 * `view` covers list + read; `create` / `edit` / `delete` are write verbs;
 * `approve` is a workflow-specific verb reserved for quotes and commissions.
 *
 * Re-exports `PermissionAction` from the shared domain so consumers only need
 * one import.
 */
export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
] as const satisfies readonly PermissionAction[];

export type { PermissionAction };
