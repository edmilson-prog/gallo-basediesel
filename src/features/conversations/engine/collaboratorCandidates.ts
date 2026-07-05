import type { ID, ISeller } from "@/shared/types";
import {
  resolveAccessRecipients,
  type IAccessRuleLike,
} from "@/features/admin-settings/utils/accessRecipients";

export interface IResolveInviteCandidatesOptions {
  assignedSellerId: ID | undefined;
  existingCollaboratorIds: ID[];
  /** Null = pool/lead-anônimo conversation (no instance gate at all). */
  whatsappAccountId: ID | null;
  /** `IPlatformSettings.participantCrossInstance` for the conversation's store. */
  crossInstanceAllowed: boolean;
  /** Access rules for `whatsappAccountId` (empty when `whatsappAccountId` is null). */
  accessRules: IAccessRuleLike[];
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
    ...opts.existingCollaboratorIds,
  ]);
  const eligible = sellers.filter((s) => !excluded.has(s.id));

  if (opts.whatsappAccountId === null || opts.crossInstanceAllowed) {
    return eligible;
  }

  const accessible = resolveAccessRecipients(
    opts.accessRules,
    eligible.map((s) => ({ id: s.id, role: "", storeId: s.storeId })),
  );
  return eligible.filter((s) => accessible.has(s.id));
}
