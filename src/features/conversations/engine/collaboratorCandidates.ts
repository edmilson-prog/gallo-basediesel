import type { ID, ISeller } from "@/shared/types";
import {
  resolveAccessRecipients,
  type IAccessRuleLike,
} from "@/features/admin-settings/utils/accessRecipients";

export interface IInstanceGateOptions {
  /** Null = pool/lead-anônimo conversation (no instance gate at all). */
  whatsappAccountId: ID | null;
  /** `IPlatformSettings.participantCrossInstance` for the conversation's store. */
  crossInstanceAllowed: boolean;
  /** Access rules for `whatsappAccountId` (empty when `whatsappAccountId` is null). */
  accessRules: IAccessRuleLike[];
}

export interface IResolveInviteCandidatesOptions extends IInstanceGateOptions {
  assignedSellerId: ID | undefined;
  existingCollaboratorIds: ID[];
  /** Logged-in seller — excluded so nobody invites themselves. */
  currentSellerId?: ID;
}

export interface IInstanceGateSubject {
  id: ID;
  storeId: ID;
}

/**
 * Sellers allowed to become participants of a conversation bound to
 * `whatsappAccountId`. With the store flag OFF, a participant only passes
 * `can_access_conversation` if they also access the instance — letting anyone
 * else through would create a participant who cannot see the conversation.
 * Shared by the manual invite (dialog) and the @mention auto-add paths.
 */
export function passesInstanceGate<T extends IInstanceGateSubject>(
  subjects: T[],
  opts: IInstanceGateOptions,
): T[] {
  if (opts.whatsappAccountId === null || opts.crossInstanceAllowed) {
    return subjects;
  }
  const accessible = resolveAccessRecipients(
    opts.accessRules,
    subjects.map((s) => ({ id: s.id, role: "", storeId: s.storeId })),
  );
  return subjects.filter((s) => accessible.has(s.id));
}

/**
 * Who can be invited as a collaborator on this conversation. Excludes the
 * current assignee and anyone already collaborating; when the conversation is
 * bound to a WhatsApp instance and cross-instance invites are OFF
 * (`IPlatformSettings.participantCrossInstance`), further narrows to sellers
 * who already have instance access — inviting someone outside that set would
 * add them as a participant who still can't see the conversation (the access
 * model ANDs `is_conversation_participant` with instance access unless the
 * flag is on; see `can_access_conversation`,
 * `supabase/migrations/20260620120000_access_model_two_gates.sql:96-104`).
 *
 * Known limitation, inherited from `resolveAccessRecipients`'s only existing
 * caller (`InstanceAccessSheet.tsx`): `ISeller` carries no `role` field today,
 * so a `role`-kind access rule never resolves any candidate from here (same
 * gap the account-access-count UI already accepts, deferred to PRD-211's
 * follow-up). `seller`- and `store`-kind rules resolve correctly.
 */
export function resolveInviteCandidates(
  sellers: ISeller[],
  opts: IResolveInviteCandidatesOptions,
): ISeller[] {
  const excluded = new Set<ID>([
    ...(opts.assignedSellerId ? [opts.assignedSellerId] : []),
    ...(opts.currentSellerId ? [opts.currentSellerId] : []),
    ...opts.existingCollaboratorIds,
  ]);
  const eligible = sellers.filter((s) => !excluded.has(s.id));
  return passesInstanceGate(eligible, opts);
}
