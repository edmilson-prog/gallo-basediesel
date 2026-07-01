import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import type { InstanceLockReason } from "../engine/instanceLock";

export interface IInstanceLockedBannerProps {
  reason: InstanceLockReason;
  /** WhatsApp account label, when resolvable — feeds the description copy. */
  accountLabel?: string;
  /** Owner-only: `/app/configuracoes/whatsapp` is Owner-gated, so non-Owner
   * staff get a hint instead of a dead-end link. */
  canManage: boolean;
  /** Toggle the internal-note composer (notes stay allowed while locked). */
  onToggleNote: () => void;
}

/**
 * Mirrors the app-wide account-status palette (WhatsAppAccountsPage
 * STATUS_META): disconnected = critical, pending (still pairing) = warning.
 * Classes are kept as complete literal strings (not composed via template
 * interpolation) so Tailwind's static scanner can find them.
 */
const SEVERITY_TONE: Record<
  InstanceLockReason,
  { container: string; title: string; description: string; cta: string }
> = {
  disconnected: {
    container: "border-severity-critical/30 bg-severity-critical/10",
    title: "text-severity-critical",
    description: "text-severity-critical/80",
    cta: "border-severity-critical/40 text-severity-critical hover:bg-severity-critical/10",
  },
  pending: {
    container: "border-severity-warning/30 bg-severity-warning/10",
    title: "text-severity-warning",
    description: "text-severity-warning/80",
    cta: "border-severity-warning/40 text-severity-warning hover:bg-severity-warning/10",
  },
};

/**
 * Instance-down gate: replaces the composer while the conversation's WhatsApp
 * account is disconnected/pending. Sending to the customer is impossible either
 * way (the channel itself is down); internal notes remain available, mirroring
 * the pool gate (`AssignToReplyBanner`). Independent of `alertsMuted` — see
 * `deriveInstanceLock`.
 */
export function InstanceLockedBanner({
  reason,
  accountLabel,
  canManage,
  onToggleNote,
}: IInstanceLockedBannerProps) {
  const t = CONVERSATION_STRINGS.instanceLocked;
  const tone = SEVERITY_TONE[reason];
  const title = reason === "pending" ? t.titlePending : t.titleDisconnected;
  const description =
    reason === "pending"
      ? (accountLabel ? t.descriptionPending(accountLabel) : t.descriptionPendingGeneric)
      : accountLabel
        ? t.descriptionDisconnected(accountLabel)
        : t.descriptionDisconnectedGeneric;

  return (
    <div className={`border-t px-4 py-3 ${tone.container}`}>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className={`flex items-center gap-2 text-sm font-medium ${tone.title}`}>
          <Icon icon="mdi:wifi-off" size={16} />
          {title}
        </div>
        <p className={`text-xs ${tone.description}`}>{description}</p>
        <div className="flex items-center gap-2">
          {canManage ? (
            <Button
              asChild
              type="button"
              variant="outline"
              size="sm"
              className={`gap-1.5 ${tone.cta}`}
            >
              <Link to="/app/configuracoes/whatsapp">
                <Icon icon="mdi:cog-outline" size={14} />
                {t.manageCta}
              </Link>
            </Button>
          ) : (
            <p className={`text-xs ${tone.description}`}>{t.manageHintNonOwner}</p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onToggleNote}
          >
            <Icon icon="mdi:note-edit-outline" size={14} />
            {CONVERSATION_STRINGS.assignGate.note}
          </Button>
        </div>
      </div>
    </div>
  );
}
