import type { IAccessGrant, IWorkSchedule, IScheduleOverride, RoleName } from "@/shared/types";
import { getNextOpenAt, isWithinWorkSchedule } from "./workSchedule";

/** Roles whose login is gated by the work schedule (PRD-212 decision). */
export const OPERATIONAL_ROLES: readonly RoleName[] = [
  "Vendedor",
  "VendedorExterno",
  "SDR",
  "Financeiro",
];

export interface IAccessEvaluationInput {
  role: RoleName;
  /** false = suspended/inactive — prevails over schedule (RF-009). */
  active: boolean;
  workSchedule?: IWorkSchedule;
  scheduleOverrides?: IScheduleOverride[];
  accessGrant?: IAccessGrant | null;
  now: Date;
}

export interface IAccessDecision {
  allowed: boolean;
  reason: "ok" | "suspended" | "outside_hours";
  /** ISO instant of the next window start when reason === "outside_hours". */
  nextOpenAt: string | null;
}

/**
 * Pure access decision (PRD-212). Order matters:
 * 1) suspended/inactive is always blocked;
 * 2) Owner/Gestor (and any non-operational role, incl. Cliente) are exempt;
 * 3) no schedule = unrestricted;
 * 4) an active emergency grant unlocks;
 * 5) otherwise gate on the schedule.
 *
 * Never throws — callers fail OPEN for operationals on unexpected input.
 */
export function evaluateAccess(input: IAccessEvaluationInput): IAccessDecision {
  if (!input.active) return { allowed: false, reason: "suspended", nextOpenAt: null };

  if (!OPERATIONAL_ROLES.includes(input.role)) {
    return { allowed: true, reason: "ok", nextOpenAt: null };
  }

  const source = { workSchedule: input.workSchedule, scheduleOverrides: input.scheduleOverrides };
  if ((input.workSchedule?.length ?? 0) === 0 && (input.scheduleOverrides?.length ?? 0) === 0) {
    return { allowed: true, reason: "ok", nextOpenAt: null };
  }

  if (input.accessGrant && Date.parse(input.accessGrant.expiresAt) > input.now.getTime()) {
    return { allowed: true, reason: "ok", nextOpenAt: null };
  }

  if (isWithinWorkSchedule(source, input.now)) {
    return { allowed: true, reason: "ok", nextOpenAt: null };
  }

  return { allowed: false, reason: "outside_hours", nextOpenAt: getNextOpenAt(source, input.now) };
}

/** Who may grant a temporary emergency access (RF-013). */
export function canGrantAccess(
  actor: { role: RoleName; departmentId?: string | null },
  target: { departmentId?: string | null },
): boolean {
  if (actor.role === "Owner") return true;
  if (actor.role === "Gestor") {
    return Boolean(actor.departmentId) && actor.departmentId === target.departmentId;
  }
  return false;
}
