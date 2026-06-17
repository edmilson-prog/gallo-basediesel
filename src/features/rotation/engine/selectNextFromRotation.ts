import type {
  ID,
  IRotationCandidate,
  IRotationParticipant,
  IRotationSelectionInput,
  IRotationSelectionResult,
  ISeller,
} from "@/shared/types";
import { isSellerEligible } from "./eligibility";

/** Orders participants by `order` then walks starting AFTER the pointer (wrap-around). */
function rotatedOrder<T extends { refId: ID; order: number }>(items: T[], pointer?: ID | null): T[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  if (!pointer) return sorted;
  const idx = sorted.findIndex((p) => p.refId === pointer);
  if (idx === -1) return sorted; // stale pointer → from head
  // The slice intentionally keeps the pointer's own element at the tail: after a
  // full circle a single-eligible (or last-remaining) participant must still be
  // selectable. This is correct wrap-around, not a double-selection bug.
  return [...sorted.slice(idx + 1), ...sorted.slice(0, idx + 1)];
}

/** Picks the first eligible seller participant; records every evaluation. */
function pickSeller(
  participants: IRotationParticipant[],
  sellersById: Record<ID, ISeller>,
  pointer: ID | null | undefined,
  now: Date,
): { selectedId: ID | null; candidates: IRotationCandidate[] } {
  const candidates: IRotationCandidate[] = [];
  for (const p of rotatedOrder(participants, pointer)) {
    const seller = sellersById[p.refId];
    if (!seller) {
      candidates.push({ refId: p.refId, refType: "seller", reason: "skipped_inactive", selected: false });
      continue;
    }
    const e = isSellerEligible(seller, { enabled: p.enabled }, now);
    if (e.eligible) {
      candidates.push({ refId: p.refId, refType: "seller", reason: "selected", selected: true });
      return { selectedId: p.refId, candidates };
    }
    candidates.push({ refId: p.refId, refType: "seller", reason: e.reason, selected: false });
  }
  return { selectedId: null, candidates };
}

/**
 * Pure rotation selection (PRD-213). No side effects, no Math.random(). Returns
 * the chosen seller, the evaluated candidates (trace), and the advanced pointers
 * (the caller persists them). Empty result → caller keeps the PRD-013 fallback.
 */
export function selectNextFromRotation(input: IRotationSelectionInput): IRotationSelectionResult {
  const { queue, participants, membersByDepartment, sellersById, now } = input;

  if (queue.targetMode === "direct") {
    const { selectedId, candidates } = pickSeller(participants, sellersById, queue.lastAssignedRefId, now);
    return {
      selectedSellerId: selectedId,
      selectedDepartmentId: null,
      candidates,
      nextTopPointer: selectedId,
      nextMemberPointerByDept: {},
    };
  }

  // department mode — two independent pointers.
  const candidates: IRotationCandidate[] = [];
  const nextMemberPointerByDept: Record<ID, ID> = {};
  const deptParticipants = participants.filter((p) => p.refType === "department");

  for (const dep of rotatedOrder(deptParticipants, queue.lastAssignedRefId)) {
    if (!dep.enabled) {
      candidates.push({ refId: dep.refId, refType: "department", reason: "skipped_disabled", selected: false });
      continue;
    }
    const members = membersByDepartment[dep.refId] ?? [];
    const inner = pickSeller(members, sellersById, dep.lastAssignedMemberId, now);
    if (inner.selectedId) {
      candidates.push({ refId: dep.refId, refType: "department", reason: "selected", selected: true });
      candidates.push(...inner.candidates);
      nextMemberPointerByDept[dep.refId] = inner.selectedId;
      return {
        selectedSellerId: inner.selectedId,
        selectedDepartmentId: dep.refId,
        candidates,
        nextTopPointer: dep.refId,
        nextMemberPointerByDept,
      };
    }
    // department had no eligible member → skip it (offline-equivalent at dept level).
    candidates.push({ refId: dep.refId, refType: "department", reason: "skipped_offline", selected: false });
    candidates.push(...inner.candidates);
  }

  return {
    selectedSellerId: null,
    selectedDepartmentId: null,
    candidates,
    nextTopPointer: null,
    nextMemberPointerByDept: {},
  };
}
