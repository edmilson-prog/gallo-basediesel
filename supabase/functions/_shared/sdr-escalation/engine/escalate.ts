// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/sdr-escalation/engine/escalate.ts (sync: bun run scripts/sync-sdr-shared.ts)

import type {
  ID,
  ISdrEscalation,
  ISdrContextSummary,
  SdrEscalationMode,
  SdrEscalationReason,
} from "@/shared/types";
import {
  chooseHumanSeller,
  type IChooseSellerInput,
  type IChooseSellerOutcome,
} from "./choose-seller.ts";

export interface IEscalateToHumanInput {
  sessionId: ID;
  conversationId: ID;
  storeId: ID;
  customerId?: ID;
  leadId?: ID;
  reason: SdrEscalationReason;
  reasonDetails?: string;
  /** Caller may force a mode. When omitted the engine derives it from `reason`. */
  mode?: SdrEscalationMode;
  context: ISdrContextSummary;
  /** Brand identified by the SDR — drives the specialty match step. */
  identifiedBrand?: string;
  /** Resolution inputs passed to `chooseHumanSeller`. */
  selection: Omit<IChooseSellerInput, "mode" | "identifiedBrand"> & { now?: string };
  /** Wall-clock used when minting timestamps — defaults to `new Date()`. */
  now?: string;
}

export interface IEscalateToHumanResult {
  escalation: ISdrEscalation;
  selection: IChooseSellerOutcome;
}

/**
 * Derive the escalation mode from the reason when the caller didn't override
 * it. `customer_requested` is the only one that ramps to `urgent` — every
 * other reason produces a normal handoff unless the caller asks otherwise.
 */
export function defaultModeFor(reason: SdrEscalationReason): SdrEscalationMode {
  switch (reason) {
    case "customer_requested":
      return "urgent";
    case "negotiation_detected":
    case "complexity":
      return "normal";
    case "sdr_failed":
    case "out_of_scope":
    default:
      return "standard";
  }
}

/**
 * Pure escalation engine (PRD-023). Composes the persistent record and runs
 * the seller-selection cascade. The caller (`useSdrEscalation` hook on Fase 2)
 * is responsible for actually persisting the record, mutating the conversation
 * and emitting bubbles — the engine never touches providers.
 */
export function escalateToHuman(input: IEscalateToHumanInput): IEscalateToHumanResult {
  const now = input.now ?? new Date().toISOString();
  const mode = input.mode ?? defaultModeFor(input.reason);
  const selection = chooseHumanSeller({
    ...input.selection,
    mode,
    identifiedBrand: input.identifiedBrand,
  });

  const escalation: ISdrEscalation = {
    id: mintId(input.sessionId, now),
    sessionId: input.sessionId,
    conversationId: input.conversationId,
    storeId: input.storeId,
    customerId: input.customerId,
    leadId: input.leadId,
    reason: input.reason,
    reasonDetails: input.reasonDetails,
    mode,
    contextSummary: input.context,
    assignedSellerId: selection.selectedSellerId ?? undefined,
    assignedAt: selection.selectedSellerId ? now : undefined,
    status: selection.selectedSellerId ? "assigned" : "pending",
    specialtyMatched: selection.specialtyMatched,
    createdAt: now,
  };

  return { escalation, selection };
}

function mintId(sessionId: ID, now: string): ID {
  const stamp = now.replace(/[^0-9]/g, "").slice(0, 14);
  return `escalation-${sessionId}-${stamp}`;
}
