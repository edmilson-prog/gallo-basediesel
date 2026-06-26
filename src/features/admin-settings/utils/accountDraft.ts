import type {
  IWhatsAppAccount,
  IWhatsAppProviderConfig,
  WhatsAppFailoverPolicy,
} from "@/shared/types";

/** Editable shape backing the per-account edit form on the accounts screen. */
export interface IAccountDraft {
  label: string;
  credentialsRef: string;
  phoneNumberId: string;
  businessAccountId: string;
  baseUrl: string;
  instanceName: string;
  /** Evolution Go — server-managed; read-only in the form, preserved on save. */
  instanceId: string;
  failoverPolicy: WhatsAppFailoverPolicy;
  /** Empty string = no backup account selected. */
  failoverAccountId: string;
}

export function draftFromAccount(account: IWhatsAppAccount): IAccountDraft {
  return {
    label: account.label,
    credentialsRef: account.credentialsRef,
    phoneNumberId: account.providerConfig?.phoneNumberId ?? "",
    businessAccountId: account.providerConfig?.businessAccountId ?? "",
    baseUrl: account.providerConfig?.baseUrl ?? "",
    instanceName: account.providerConfig?.instanceName ?? "",
    instanceId: account.providerConfig?.instanceId ?? "",
    failoverPolicy: account.failoverPolicy,
    failoverAccountId: account.failoverAccountId ?? "",
  };
}

/**
 * Builds the providerConfig patch from the draft, honoring the DB shape guard
 * (PRD-111 RF-032): the engine's minimum keys must be present.
 * - meta: phoneNumberId + businessAccountId (both, or both empty = clear).
 * - evolution: baseUrl + instanceName (both, or both empty = clear).
 * - evolution-go: baseUrl required; instanceId is server-managed and preserved
 *   (may be "" before the first pairing — the CHECK only tests key presence).
 */
export function configFromDraft(
  provider: IWhatsAppAccount["provider"],
  draft: IAccountDraft,
): { ok: true; config: IWhatsAppProviderConfig | null } | { ok: false } {
  if (provider === "evolution-go") {
    const baseUrl = draft.baseUrl.trim();
    if (!baseUrl) return { ok: false };
    return { ok: true, config: { baseUrl, instanceId: draft.instanceId } };
  }
  const a = (provider === "meta" ? draft.phoneNumberId : draft.baseUrl).trim();
  const b = (provider === "meta" ? draft.businessAccountId : draft.instanceName).trim();
  if (!a && !b) return { ok: true, config: null };
  if (!a || !b) return { ok: false };
  return {
    ok: true,
    config:
      provider === "meta"
        ? { phoneNumberId: a, businessAccountId: b }
        : { baseUrl: a, instanceName: b },
  };
}
