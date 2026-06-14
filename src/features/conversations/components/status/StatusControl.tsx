import type { ConversationStatus, IConversation } from "@/shared/types";
import { Button } from "@/components/ui/button";
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
import { STATUS_META } from "../../utils/conversationDisplay";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { useConversationStatusActions } from "../../hooks/useConversationStatusActions";
import type { StatusControlMode } from "../../engine/statusControlMode";

const LIFECYCLE: ConversationStatus[] = ["aguardando", "em_andamento", "aguardando_cliente"];

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
  const { setStatus, isPending } = useConversationStatusActions(conversation, onChanged);
  const status = conversation.status;
  const isResolved = status === "resolvida";

  // No permission → static pill only (no interaction).
  if (!canEdit) return <StatusPill status={status} />;

  const resolveButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 border-severity-success/40 text-severity-success"
      disabled={isPending}
      onClick={() => void setStatus(isResolved ? "em_andamento" : "resolvida", "conversation.resolve")}
    >
      <Icon icon={isResolved ? "mdi:restore" : "mdi:check"} size={14} />
      <span className="hidden md:inline">
        {isResolved ? CONVERSATION_STRINGS.statusControl.reopen : CONVERSATION_STRINGS.statusControl.resolve}
      </span>
    </Button>
  );

  if (mode === "segmented") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group">
          {LIFECYCLE.map((s) => {
            const active = s === status;
            return (
              <button
                key={s}
                type="button"
                disabled={isPending}
                aria-pressed={active}
                onClick={() => void setStatus(s)}
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
        {resolveButton}
      </div>
    );
  }

  // mode === "menu": single dropdown including Resolver/Reabrir.
  if (mode === "menu") {
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
            value={LIFECYCLE.includes(status) ? status : ""}
            onValueChange={(v) => void setStatus(v as ConversationStatus)}
          >
            {LIFECYCLE.map((s) => (
              <DropdownMenuRadioItem key={s} value={s} className="gap-2">
                <Icon icon={STATUS_META[s].icon} size={14} />
                {CONVERSATION_STRINGS.statusLabel[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => void setStatus(isResolved ? "em_andamento" : "resolvida", "conversation.resolve")}
          >
            <Icon icon={isResolved ? "mdi:restore" : "mdi:check-circle-outline"} size={14} />
            {isResolved ? CONVERSATION_STRINGS.statusControl.reopen : CONVERSATION_STRINGS.statusControl.resolve}
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // mode === "pill" (default): pill-as-trigger (cycle states) + Resolver button.
  return (
    <div className="flex items-center gap-1.5">
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
            value={LIFECYCLE.includes(status) ? status : ""}
            onValueChange={(v) => void setStatus(v as ConversationStatus)}
          >
            {LIFECYCLE.map((s) => (
              <DropdownMenuRadioItem key={s} value={s} className="gap-2">
                <Icon icon={STATUS_META[s].icon} size={14} />
                {CONVERSATION_STRINGS.statusLabel[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {resolveButton}
    </div>
  );
}
