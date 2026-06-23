import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

export interface IAssignToReplyBannerProps {
  /** Whether the user can self-assign (has a seller identity). */
  canAssign: boolean;
  /** In-flight state — disables the assign button. */
  assigning?: boolean;
  /** Assign the conversation to the current user and unlock sending. */
  onAssign: () => void;
  /** Toggle the internal-note composer (notes stay allowed in the pool). */
  onToggleNote: () => void;
}

/**
 * Pool gate (assign-before-reply): replaces the composer for non-staff users on
 * an unassigned conversation. Sending to the customer is blocked; internal notes
 * remain available. Pure presentation — assign orchestration lives in
 * useSelfAssign (wired by MessageInput).
 */
export function AssignToReplyBanner({
  canAssign,
  assigning = false,
  onAssign,
  onToggleNote,
}: IAssignToReplyBannerProps) {
  const t = CONVERSATION_STRINGS.assignGate;
  return (
    <div className="border-t border-border bg-muted/40 px-4 py-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon icon="mdi:lock-outline" size={16} />
          {t.title}
        </div>
        <p className="text-xs text-muted-foreground">
          {canAssign ? t.description : t.noSellerHint}
        </p>
        <div className="flex items-center gap-2">
          {canAssign && (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={onAssign}
              disabled={assigning}
            >
              <Icon icon="mdi:account-plus" size={14} />
              {t.assignCta}
            </Button>
          )}
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
