import type { ConversationStatus, IConversation } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAuth } from "@/features/auth/useAuth";
import { STATUS_META } from "../../utils/conversationDisplay";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { useConversationStatusActions } from "../../hooks/useConversationStatusActions";
import { isOwnConversation } from "../../engine/assignmentGate";
import type { StatusControlMode } from "../../engine/statusControlMode";

const LIFECYCLE: ConversationStatus[] = ["aguardando", "em_andamento", "aguardando_cliente"];

/**
 * Audit action name for a status transition — mirrors ConversationMenu's
 * resolve/archive audit actions so picking these from the unified control
 * logs the same semantic action as the kebab shortcuts, not a generic
 * status_change, regardless of transition direction.
 */
function actionForTransition(from: ConversationStatus, to: ConversationStatus): string | undefined {
  if (from === "resolvida" || to === "resolvida") return "conversation.resolve";
  if (from === "arquivada" || to === "arquivada") return "conversation.archive";
  return undefined;
}

/** A status dot honoring the shape (filled ● / outline ○ / check ✓). */
function StatusDot({ status }: { status: ConversationStatus }) {
  const meta = STATUS_META[status];
  if (meta.shape === "check") return <Icon icon="mdi:check" size={12} aria-hidden />;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        meta.dotClass,
      )}
    />
  );
}

function StatusPill({ status, withChevron }: { status: ConversationStatus; withChevron?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        meta.pillClass,
      )}
    >
      <StatusDot status={status} />
      {CONVERSATION_STRINGS.statusLabel[status]}
      {withChevron && <Icon icon="mdi:chevron-down" size={12} aria-hidden />}
    </span>
  );
}

export function StatusControl({
  conversation,
  mode,
  onChanged,
}: {
  conversation: IConversation;
  mode: StatusControlMode;
  onChanged?: () => void;
}) {
  const canEdit = usePermission("conversation", "edit", "own");
  const canEditStore = usePermission("conversation", "edit", "store");
  const { currentUser } = useAuth();
  const { setStatus, isPending } = useConversationStatusActions(conversation, onChanged);
  const status = conversation.status;

  // No permission → static pill only (no interaction).
  if (!canEdit) return <StatusPill status={status} />;

  // Archiving hides the conversation from the default inbox view — same
  // ownership gate as the kebab's Archive action (mirrors the RLS write
  // policy: staff manage any conversation, a seller only their own).
  const canArchive = canEditStore || isOwnConversation(conversation, currentUser?.sellerId);
  const items: ConversationStatus[] = canArchive
    ? [...LIFECYCLE, "resolvida", "arquivada"]
    : [...LIFECYCLE, "resolvida"];

  const selectStatus = (next: ConversationStatus) => {
    void setStatus(next, actionForTransition(status, next));
  };

  if (mode === "segmented") {
    return (
      <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group">
        {items.map((s) => {
          const active = s === status;
          return (
            <button
              key={s}
              type="button"
              disabled={isPending}
              aria-pressed={active}
              onClick={() => selectStatus(s)}
              className={cn(
                "inline-flex items-center gap-1.5 border-r border-border px-2.5 py-1 text-[11px] font-medium last:border-r-0",
                active ? STATUS_META[s].pillClass : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <StatusDot status={s} />
              <span className="hidden lg:inline">{CONVERSATION_STRINGS.statusLabel[s]}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // mode === "menu" | "pill": pill-as-trigger opening a single dropdown that
  // lists every status this user may set — resolvida/arquivada included
  // alongside the 3 active-work states, so the control matches the same 5
  // options the inbox Status filter offers (unification requested by the
  // owner: the header no longer hides Resolvida/Arquivada behind a separate
  // button or the kebab menu).
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              aria-label={CONVERSATION_STRINGS.statusControl.triggerLabel}
            >
              <StatusPill status={status} withChevron />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{CONVERSATION_STRINGS.statusControl.triggerLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuRadioGroup
          value={items.includes(status) ? status : ""}
          onValueChange={(v) => selectStatus(v as ConversationStatus)}
        >
          {items.map((s) => (
            <DropdownMenuRadioItem key={s} value={s} className="gap-2">
              <Icon icon={STATUS_META[s].icon} size={14} />
              {CONVERSATION_STRINGS.statusLabel[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
