import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import type { InstanceLockReason } from "../engine/instanceLock";

export interface IInstanceLockedBannerProps {
  reason: InstanceLockReason;
  /** WhatsApp account label, when resolvable — feeds the description copy. */
  accountLabel?: string;
  /** Toggle the internal-note composer (notes stay allowed while locked). */
  onToggleNote: () => void;
}

/**
 * Instance-down gate: replaces the composer while the conversation's WhatsApp
 * account is disconnected/pending. Sending to the customer is impossible either
 * way (the channel itself is down); internal notes remain available, mirroring
 * the pool gate (`AssignToReplyBanner`). Independent of `alertsMuted` — see
 * `deriveInstanceLock`.
 */
export function InstanceLockedBanner({ reason, accountLabel, onToggleNote }: IInstanceLockedBannerProps) {
  const t = CONVERSATION_STRINGS.instanceLocked;
  const title = reason === "pending" ? t.titlePending : t.titleDisconnected;
  const description =
    reason === "pending"
      ? (accountLabel ? t.descriptionPending(accountLabel) : t.descriptionPendingGeneric)
      : accountLabel
        ? t.descriptionDisconnected(accountLabel)
        : t.descriptionDisconnectedGeneric;

  return (
    <div className="border-t border-severity-critical/30 bg-severity-critical/10 px-4 py-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 text-sm font-medium text-severity-critical">
          <Icon icon="mdi:wifi-off" size={16} />
          {title}
        </div>
        <p className="text-xs text-severity-critical/80">{description}</p>
        <div className="flex items-center gap-2">
          <Button
            asChild
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-severity-critical/40 text-severity-critical hover:bg-severity-critical/10"
          >
            <Link to="/app/configuracoes/whatsapp">
              <Icon icon="mdi:cog-outline" size={14} />
              {t.manageCta}
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onToggleNote}
          >
            <Icon icon="mdi:note-edit-outline" size={14} />
            {t.note}
          </Button>
        </div>
      </div>
    </div>
  );
}
